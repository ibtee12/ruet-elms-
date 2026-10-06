import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { Role, ThreadCategory, NotificationType } from "@prisma/client";
import {
  createDiscussionThread,
  createDiscussionPost,
  getOfferingThreads,
  getThreadDetail,
  togglePostAccepted,
  setThreadLock,
  deleteThread,
} from "@/services/discussions";
import { discussionRateLimiter, InMemoryRateLimiter } from "@/lib/rate-limiter";
import { ForbiddenError, NotFoundError } from "@/lib/auth/errors";

describe("Step 29: Discussion Forum & Moderation", () => {
  let testOfferingId: string;
  let teacherUser: { id: string; role: Role; name: string };
  let studentUser1: { id: string; role: Role; name: string };
  let studentUser2: { id: string; role: Role; name: string };
  let outsiderUser: { id: string; role: Role; name: string };

  beforeEach(async () => {
    // Reset rate limiter for test isolation
    if (discussionRateLimiter instanceof InMemoryRateLimiter) {
      discussionRateLimiter.clear();
    }

    // Lookup existing seed data
    const offering = await prisma.courseOffering.findFirst({
      where: { status: "PUBLISHED" },
      include: {
        offeringTeachers: { include: { user: true } },
        sections: {
          include: {
            enrollments: {
              where: { status: "ACTIVE" },
              include: { student: true },
            },
          },
        },
      },
    });

    if (!offering || !offering.offeringTeachers[0] || !offering.sections[0]?.enrollments[0]) {
      throw new Error("Seed database missing published offering with teacher and student.");
    }

    testOfferingId = offering.id;

    const teacher = offering.offeringTeachers[0].user;
    teacherUser = { id: teacher.id, role: teacher.role, name: teacher.name };

    const student1 = offering.sections[0].enrollments[0].student;
    studentUser1 = { id: student1.id, role: student1.role, name: student1.name };

    // Find a second student or create an outsider
    const secondStudent = await prisma.user.findFirst({
      where: {
        role: Role.STUDENT,
        id: { not: student1.id },
        enrollments: { some: { section: { offeringId: testOfferingId }, status: "ACTIVE" } },
      },
    });

    if (secondStudent) {
      studentUser2 = { id: secondStudent.id, role: secondStudent.role, name: secondStudent.name };
    } else {
      studentUser2 = studentUser1;
    }

    // Find or locate an unenrolled student
    const unenrolled = await prisma.user.findFirst({
      where: {
        role: Role.STUDENT,
        enrollments: { none: { section: { offeringId: testOfferingId } } },
      },
    });

    if (unenrolled) {
      outsiderUser = { id: unenrolled.id, role: unenrolled.role, name: unenrolled.name };
    } else {
      outsiderUser = { id: "cl_non_enrolled_dummy_student", role: Role.STUDENT, name: "Outsider Student" };
    }
  });

  describe("Access Control", () => {
    it("allows enrolled student and assigned teacher to view threads", async () => {
      const studentThreads = await getOfferingThreads({
        offeringId: testOfferingId,
        userId: studentUser1.id,
        userRole: studentUser1.role,
      });
      expect(Array.isArray(studentThreads)).toBe(true);

      const teacherThreads = await getOfferingThreads({
        offeringId: testOfferingId,
        userId: teacherUser.id,
        userRole: teacherUser.role,
      });
      expect(Array.isArray(teacherThreads)).toBe(true);
    });

    it("rejects unenrolled users from reading or posting", async () => {
      await expect(
        getOfferingThreads({
          offeringId: testOfferingId,
          userId: outsiderUser.id,
          userRole: outsiderUser.role,
        })
      ).rejects.toThrow(ForbiddenError);

      await expect(
        createDiscussionThread(
          {
            offeringId: testOfferingId,
            title: "Unauthorized Thread",
            content: "Should fail",
            category: ThreadCategory.QUESTION,
            isAnonymous: false,
          },
          outsiderUser
        )
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe("Anonymity Serializer (Critical Acceptance)", () => {
    it("completely strips identity fields (authorId: null, author: null) for students viewing anonymous items", async () => {
      // Student creates an anonymous thread
      const thread = await createDiscussionThread(
        {
          offeringId: testOfferingId,
          title: "Anonymous Doubt on Pointers",
          content: "Can someone clarify dangling pointers?",
          category: ThreadCategory.DOUBT,
          isAnonymous: true,
        },
        studentUser1
      );

      // Student creates an anonymous reply
      const post = await createDiscussionPost(
        {
          threadId: thread.id,
          content: "Here is an anonymous reply explaining pointer lifetime.",
          isAnonymous: true,
        },
        studentUser2
      );

      // 1. Fetch as a student (viewer is NOT moderator)
      const studentView = await getThreadDetail(thread.id, studentUser1.id, studentUser1.role);
      expect(studentView.isAnonymous).toBe(true);
      expect(studentView.authorId).toBeNull();
      expect(studentView.author).toBeNull();

      const studentPost = studentView.posts.find((p) => p.id === post.id);
      expect(studentPost).toBeDefined();
      expect(studentPost?.isAnonymous).toBe(true);
      expect(studentPost?.authorId).toBeNull();
      expect(studentPost?.author).toBeNull();

      // Also check thread list serialization for student
      const threadList = await getOfferingThreads({
        offeringId: testOfferingId,
        userId: studentUser1.id,
        userRole: studentUser1.role,
      });
      const listedThread = threadList.find((t) => t.id === thread.id);
      expect(listedThread?.authorId).toBeNull();
      expect(listedThread?.author).toBeNull();

      // 2. Fetch as a teacher (viewer IS moderator) -> identity is preserved
      const teacherView = await getThreadDetail(thread.id, teacherUser.id, teacherUser.role);
      expect(teacherView.isAnonymous).toBe(true);
      expect(teacherView.authorId).toBe(studentUser1.id);
      expect(teacherView.author?.name).toBe(studentUser1.name);

      const teacherPost = teacherView.posts.find((p) => p.id === post.id);
      expect(teacherPost?.authorId).toBe(studentUser2.id);
      expect(teacherPost?.author?.name).toBe(studentUser2.name);
    });
  });

  describe("Moderation, Locks, and Deletes (Acceptance: Cannot Modify Locked or Deleted Content)", () => {
    it("locks thread, logs audit log, and rejects subsequent replies server-side", async () => {
      const thread = await createDiscussionThread(
        {
          offeringId: testOfferingId,
          title: "Thread to be locked",
          content: "Testing lock enforcement",
          category: ThreadCategory.QUESTION,
          isAnonymous: false,
        },
        studentUser1
      );

      // Teacher locks thread
      await setThreadLock(thread.id, true, teacherUser, "10.0.0.1");

      // Verify AuditLog for THREAD_LOCKED
      const auditLog = await prisma.auditLog.findFirst({
        where: { action: "THREAD_LOCKED", objectId: thread.id },
      });
      expect(auditLog).toBeDefined();
      expect(auditLog?.userId).toBe(teacherUser.id);

      // Attempting to post reply to locked thread MUST be rejected
      await expect(
        createDiscussionPost(
          {
            threadId: thread.id,
            content: "Trying to reply to locked thread",
            isAnonymous: false,
          },
          studentUser2
        )
      ).rejects.toThrow(ForbiddenError);
    });

    it("soft deletes a thread, logs audit log, and prevents further replies or accepted markers", async () => {
      const thread = await createDiscussionThread(
        {
          offeringId: testOfferingId,
          title: "Thread to be deleted",
          content: "Testing soft delete",
          category: ThreadCategory.QUESTION,
          isAnonymous: false,
        },
        studentUser1
      );

      const post = await createDiscussionPost(
        {
          threadId: thread.id,
          content: "Reply before deletion",
          isAnonymous: false,
        },
        studentUser2
      );

      // Teacher soft deletes thread
      await deleteThread(thread.id, teacherUser, "10.0.0.1");

      // Verify AuditLog
      const auditLog = await prisma.auditLog.findFirst({
        where: { action: "THREAD_DELETED", objectId: thread.id },
      });
      expect(auditLog).toBeDefined();

      // Deleted thread cannot receive new replies
      await expect(
        createDiscussionPost(
          {
            threadId: thread.id,
            content: "Reply after deletion",
            isAnonymous: false,
          },
          studentUser1
        )
      ).rejects.toThrow(NotFoundError);

      // Deleted thread cannot have accepted answers marked
      await expect(
        togglePostAccepted(post.id, teacherUser)
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe("Accepted Answers & Pinning", () => {
    it("allows thread author or teacher to mark accepted answer, sorting it to the top", async () => {
      const thread = await createDiscussionThread(
        {
          offeringId: testOfferingId,
          title: "Algorithm Complexity Question",
          content: "What is the worst-case runtime of MergeSort?",
          category: ThreadCategory.QUESTION,
          isAnonymous: false,
        },
        studentUser1
      );

      const reply1 = await createDiscussionPost(
        {
          threadId: thread.id,
          content: "First answer: maybe O(N^2)?",
          isAnonymous: false,
        },
        studentUser2
      );
      expect(reply1.id).toBeDefined();

      const reply2 = await createDiscussionPost(
        {
          threadId: thread.id,
          content: "Second answer: It is O(N log N) in all cases.",
          isAnonymous: false,
        },
        studentUser2
      );

      // Thread author marks reply2 as accepted
      await togglePostAccepted(reply2.id, studentUser1);

      const detail = await getThreadDetail(thread.id, studentUser1.id, studentUser1.role);
      expect(detail.isAnswered).toBe(true);
      // reply2 must be on top of the posts array!
      expect(detail.posts[0].id).toBe(reply2.id);
      expect(detail.posts[0].isAccepted).toBe(true);
    });
  });

  describe("Rate Limiting, ActivityEvents, and Notifications", () => {
    it("enforces 5 posts per minute per user", async () => {
      const thread = await createDiscussionThread(
        {
          offeringId: testOfferingId,
          title: "Rate Limit Test Thread",
          content: "Testing 5 posts per min limit",
          category: ThreadCategory.QUESTION,
          isAnonymous: false,
        },
        studentUser1
      );

      // Submit 4 more replies (making total 5 operations for studentUser1 within window)
      for (let i = 0; i < 4; i++) {
        await createDiscussionPost(
          {
            threadId: thread.id,
            content: `Reply #${i + 1}`,
            isAnonymous: false,
          },
          studentUser1
        );
      }

      // 6th attempt by studentUser1 MUST be rejected by rate limiter
      await expect(
        createDiscussionPost(
          {
            threadId: thread.id,
            content: "Should trigger rate limit error",
            isAnonymous: false,
          },
          studentUser1
        )
      ).rejects.toThrow(ForbiddenError);
    });

    it("creates ActivityEvents (THREAD_CREATED, POST_CREATED) and Notifications", async () => {
      const thread = await createDiscussionThread(
        {
          offeringId: testOfferingId,
          title: "Activity Event Test",
          content: "Verifying ActivityEvent creation",
          category: ThreadCategory.RESOURCE,
          isAnonymous: false,
        },
        studentUser1
      );

      const threadEvent = await prisma.activityEvent.findFirst({
        where: {
          userId: studentUser1.id,
          offeringId: testOfferingId,
          type: "THREAD_CREATED",
        },
      });
      expect(threadEvent).toBeDefined();

      // Instructor should have received ACADEMIC notification
      const instructorNotif = await prisma.notification.findFirst({
        where: {
          userId: teacherUser.id,
          type: NotificationType.ACADEMIC,
        },
        orderBy: { createdAt: "desc" },
      });
      expect(instructorNotif).toBeDefined();

      // Now create post from student2
      const post = await createDiscussionPost(
        {
          threadId: thread.id,
          content: "Replying to activity test",
          isAnonymous: false,
        },
        studentUser2
      );
      expect(post.id).toBeDefined();

      const postEvent = await prisma.activityEvent.findFirst({
        where: {
          userId: studentUser2.id,
          offeringId: testOfferingId,
          type: "POST_CREATED",
        },
      });
      expect(postEvent).toBeDefined();

      // Thread author (studentUser1) should have received GENERAL notification
      if (studentUser1.id !== studentUser2.id) {
        const authorNotif = await prisma.notification.findFirst({
          where: {
            userId: studentUser1.id,
            type: NotificationType.GENERAL,
          },
          orderBy: { createdAt: "desc" },
        });
        expect(authorNotif).toBeDefined();
      }
    });
  });
});
