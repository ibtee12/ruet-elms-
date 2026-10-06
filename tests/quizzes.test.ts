/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { Role, QuestionType, QuestionDifficulty, CourseOfferingStatus } from "@prisma/client";
import {
  createQuiz,
  updateQuiz,
  deleteQuiz,
  getTeacherQuizzesList,
  getTeacherQuizDetail,
  getStudentQuizQuestions,
  computeQuizStatus,
} from "@/services/quizzes";
import { ValidationError, ForbiddenError } from "@/lib/auth/errors";

describe("Step 26: Teacher Quiz Builder and Assessments", () => {
  let teacherUserA: any;
  let teacherUserB: any;
  let studentUser: any;
  let publishedOffering: any;
  let archivedOffering: any;

  beforeEach(async () => {
    // 1. Teacher A (assigned to offering)
    teacherUserA = await prisma.user.findFirstOrThrow({
      where: { email: "arahman@cse.ruet.ac.bd" },
    });

    // 2. Teacher B (not assigned to this offering)
    teacherUserB = await prisma.user.findFirstOrThrow({
      where: { email: "bkarim@cse.ruet.ac.bd" },
    });

    // 3. Student user enrolled in offering
    studentUser = await prisma.user.findFirstOrThrow({
      where: { email: "2203001@student.ruet.ac.bd" },
    });

    // 4. Published offering where Teacher A is instructor
    publishedOffering = await prisma.courseOffering.findFirstOrThrow({
      where: {
        status: CourseOfferingStatus.PUBLISHED,
        offeringTeachers: { some: { userId: teacherUserA.id } },
        sections: {
          some: {
            enrollments: { some: { studentId: studentUser.id, status: "ACTIVE" } },
          },
        },
      },
      include: { course: true },
    });

    // 5. Ensure an archived offering exists for testing
    let archived = await prisma.courseOffering.findFirst({
      where: { status: CourseOfferingStatus.ARCHIVED },
      include: { course: true },
    });

    if (!archived) {
      archived = await prisma.courseOffering.create({
        data: {
          courseId: publishedOffering.courseId,
          term: "Old Term",
          academicYear: "2024-2025",
          status: CourseOfferingStatus.ARCHIVED,
          offeringTeachers: {
            create: {
              userId: teacherUserA.id,
              role: "INSTRUCTOR",
            },
          },
        },
        include: { course: true },
      });
    }

    archivedOffering = archived;
  });

  describe("Quiz Status Logic", () => {
    it("computes status correctly based on publish state and start/end time window", () => {
      const now = new Date("2026-10-15T12:00:00Z");
      const pastStart = new Date("2026-10-15T10:00:00Z");
      const futureStart = new Date("2026-10-15T14:00:00Z");
      const pastEnd = new Date("2026-10-15T11:00:00Z");
      const futureEnd = new Date("2026-10-15T16:00:00Z");

      // Draft when not published
      expect(computeQuizStatus(false, pastStart, futureEnd, now)).toBe("DRAFT");

      // Scheduled when published but now < startAt
      expect(computeQuizStatus(true, futureStart, futureEnd, now)).toBe("SCHEDULED");

      // Open when published and startAt <= now <= endAt
      expect(computeQuizStatus(true, pastStart, futureEnd, now)).toBe("OPEN");

      // Closed when published and now > endAt
      expect(computeQuizStatus(true, pastStart, pastEnd, now)).toBe("CLOSED");
    });
  });

  describe("Server Validation Rules", () => {
    it("ACCEPTANCE: Enforces endAt > startAt", async () => {
      const now = new Date();
      const startAt = new Date(now.getTime() + 2 * 60 * 60 * 1000);
      const endAt = new Date(now.getTime() + 1 * 60 * 60 * 1000); // end is BEFORE start

      await expect(
        createQuiz(publishedOffering.id, teacherUserA.id, Role.TEACHER, {
          title: "Invalid Window Quiz",
          durationMin: 30,
          startAt,
          endAt,
          published: false,
        })
      ).rejects.toThrowError(/end time must be strictly after the start time/i);
    });

    it("ACCEPTANCE: Rejects when window is shorter than duration", async () => {
      const now = new Date();
      const startAt = new Date(now.getTime() + 2 * 60 * 60 * 1000);
      const endAt = new Date(startAt.getTime() + 15 * 60 * 1000); // 15 mins window, but 30 min duration!

      await expect(
        createQuiz(publishedOffering.id, teacherUserA.id, Role.TEACHER, {
          title: "Too Short Window Quiz",
          durationMin: 30,
          startAt,
          endAt,
          published: false,
        })
      ).rejects.toThrowError(/cannot be shorter than the quiz duration/i);
    });

    it("ACCEPTANCE: Cannot publish with zero questions", async () => {
      const now = new Date();
      const startAt = new Date(now.getTime() + 2 * 60 * 60 * 1000);
      const endAt = new Date(startAt.getTime() + 120 * 60 * 1000);

      await expect(
        createQuiz(publishedOffering.id, teacherUserA.id, Role.TEACHER, {
          title: "Empty Questions Published Quiz",
          durationMin: 30,
          startAt,
          endAt,
          published: true, // Attempt to publish with 0 questions
          questions: [],
        })
      ).rejects.toThrowError(/zero questions/i);
    });

    it("ACCEPTANCE: Validates Question types and correct options (SINGLE, MULTIPLE, TRUE_FALSE)", async () => {
      const now = new Date();
      const startAt = new Date(now.getTime() + 2 * 60 * 60 * 1000);
      const endAt = new Date(startAt.getTime() + 120 * 60 * 1000);

      // 1. SINGLE with 0 correct options
      await expect(
        createQuiz(publishedOffering.id, teacherUserA.id, Role.TEACHER, {
          title: "Bad Single Quiz",
          durationMin: 30,
          startAt,
          endAt,
          published: false,
          questions: [
            {
              text: "What is IPv4 length?",
              type: QuestionType.SINGLE,
              marks: 1,
              order: 0,
              options: [
                { text: "32 bits", isCorrect: false, order: 0 },
                { text: "64 bits", isCorrect: false, order: 1 },
              ],
            },
          ],
        })
      ).rejects.toThrowError(/at least one option must be marked as correct/i);

      // 2. SINGLE with 2 correct options (must have exactly 1)
      await expect(
        createQuiz(publishedOffering.id, teacherUserA.id, Role.TEACHER, {
          title: "Bad Single Quiz 2",
          durationMin: 30,
          startAt,
          endAt,
          published: false,
          questions: [
            {
              text: "What is IPv4 length?",
              type: QuestionType.SINGLE,
              marks: 1,
              order: 0,
              options: [
                { text: "32 bits", isCorrect: true, order: 0 },
                { text: "4 bytes", isCorrect: true, order: 1 },
              ],
            },
          ],
        })
      ).rejects.toThrowError(/must have exactly one correct option/i);

      // 3. TRUE_FALSE with 3 options (must have exactly 2)
      await expect(
        createQuiz(publishedOffering.id, teacherUserA.id, Role.TEACHER, {
          title: "Bad TF Quiz",
          durationMin: 30,
          startAt,
          endAt,
          published: false,
          questions: [
            {
              text: "TCP is connection oriented.",
              type: QuestionType.TRUE_FALSE,
              marks: 1,
              order: 0,
              options: [
                { text: "True", isCorrect: true, order: 0 },
                { text: "False", isCorrect: false, order: 1 },
                { text: "Maybe", isCorrect: false, order: 2 },
              ],
            },
          ],
        })
      ).rejects.toThrowError(/must have exactly 2 options/i);
    });
  });

  describe("Quiz Creation, Publishing & Notifications", () => {
    it("creates a quiz with questions, options, topic tag, and writes AuditLog QUIZ_CREATED", async () => {
      const now = new Date();
      const startAt = new Date(now.getTime() + 2 * 60 * 60 * 1000);
      const endAt = new Date(startAt.getTime() + 120 * 60 * 1000);

      const quiz = await createQuiz(
        publishedOffering.id,
        teacherUserA.id,
        Role.TEACHER,
        {
          title: `Midterm Practice Quiz ${Date.now()}`,
          description: "Practice questions covering framing and parity checks.",
          durationMin: 45,
          startAt,
          endAt,
          maxAttempts: 2,
          shuffleQuestions: true,
          shuffleOptions: true,
          negativeMarkPerWrong: 0.25,
          showAnswersAfterClose: true,
          published: false,
          questions: [
            {
              text: "Which layer handles CRC checksums?",
              type: QuestionType.SINGLE,
              marks: 2,
              difficulty: QuestionDifficulty.EASY,
              newTopicName: "Data Link Layer",
              order: 0,
              options: [
                { text: "Data Link Layer", isCorrect: true, order: 0 },
                { text: "Network Layer", isCorrect: false, order: 1 },
                { text: "Application Layer", isCorrect: false, order: 2 },
              ],
            },
            {
              text: "Select all valid transport protocols:",
              type: QuestionType.MULTIPLE,
              marks: 3,
              difficulty: QuestionDifficulty.MEDIUM,
              order: 1,
              options: [
                { text: "TCP", isCorrect: true, order: 0 },
                { text: "UDP", isCorrect: true, order: 1 },
                { text: "HTTP", isCorrect: false, order: 2 },
              ],
            },
            {
              text: "IP provides reliable end-to-end packet delivery.",
              type: QuestionType.TRUE_FALSE,
              marks: 1,
              difficulty: QuestionDifficulty.EASY,
              order: 2,
              options: [
                { text: "True", isCorrect: false, order: 0 },
                { text: "False", isCorrect: true, order: 1 },
              ],
            },
          ],
        },
        "127.0.0.1"
      );

      expect(quiz).toBeDefined();
      expect(quiz.title).toContain("Midterm Practice Quiz");
      expect(quiz.durationMin).toBe(45);
      expect(quiz.questions).toHaveLength(3);
      expect(quiz.totalMarks).toBe(6);
      expect(quiz.status).toBe("DRAFT");

      // Verify audit log
      const log = await prisma.auditLog.findFirst({
        where: {
          action: "QUIZ_CREATED",
          objectId: quiz.id,
        },
      });
      expect(log).not.toBeNull();
      expect(log?.userId).toBe(teacherUserA.id);

      // Clean up
      await deleteQuiz(quiz.id, publishedOffering.id, teacherUserA.id, Role.TEACHER);
    });

    it("publishing notifies enrolled students (ACADEMIC) and writes AuditLog QUIZ_PUBLISHED", async () => {
      const now = new Date();
      const startAt = new Date(now.getTime() + 2 * 60 * 60 * 1000);
      const endAt = new Date(startAt.getTime() + 120 * 60 * 1000);

      const quiz = await createQuiz(
        publishedOffering.id,
        teacherUserA.id,
        Role.TEACHER,
        {
          title: `Published Quiz Test ${Date.now()}`,
          durationMin: 30,
          startAt,
          endAt,
          published: false,
          questions: [
            {
              text: "Sample Question 1",
              type: QuestionType.SINGLE,
              marks: 2,
              order: 0,
              options: [
                { text: "Choice A", isCorrect: true, order: 0 },
                { text: "Choice B", isCorrect: false, order: 1 },
              ],
            },
          ],
        }
      );

      // Transition from draft -> published
      const updated = await updateQuiz(
        quiz.id,
        publishedOffering.id,
        teacherUserA.id,
        Role.TEACHER,
        { published: true }
      );

      expect(updated.published).toBe(true);
      expect(updated.status).toBe("SCHEDULED");

      // Check AuditLog QUIZ_PUBLISHED
      const pubLog = await prisma.auditLog.findFirst({
        where: {
          action: "QUIZ_PUBLISHED",
          objectId: quiz.id,
        },
      });
      expect(pubLog).not.toBeNull();

      // Check notification sent to enrolled student
      const notification = await prisma.notification.findFirst({
        where: {
          userId: studentUser.id,
          type: "ACADEMIC",
          title: { contains: "Quiz Published" },
        },
      });
      expect(notification).not.toBeNull();

      // Clean up
      await deleteQuiz(quiz.id, publishedOffering.id, teacherUserA.id, Role.TEACHER);
    });
  });

  describe("Attempt Locking & Immutability", () => {
    it("ACCEPTANCE: Cannot edit questions once an attempt exists (allows title/window changes only)", async () => {
      const now = new Date();
      const startAt = new Date(now.getTime() + 1 * 60 * 60 * 1000);
      const endAt = new Date(startAt.getTime() + 120 * 60 * 1000);

      const quiz = await createQuiz(
        publishedOffering.id,
        teacherUserA.id,
        Role.TEACHER,
        {
          title: `Locked Quiz Test ${Date.now()}`,
          durationMin: 30,
          startAt,
          endAt,
          published: true,
          questions: [
            {
              text: "Original Question?",
              type: QuestionType.SINGLE,
              marks: 5,
              order: 0,
              options: [
                { text: "Correct", isCorrect: true, order: 0 },
                { text: "Wrong", isCorrect: false, order: 1 },
              ],
            },
          ],
        }
      );

      // Simulate a student attempt
      const attempt = await prisma.quizAttempt.create({
        data: {
          quizId: quiz.id,
          studentId: studentUser.id,
          score: 5,
        },
      });

      try {
        // Attempting to modify questions should be REJECTED
        await expect(
          updateQuiz(quiz.id, publishedOffering.id, teacherUserA.id, Role.TEACHER, {
            questions: [
              {
                text: "Modified Question Attempt",
                type: QuestionType.SINGLE,
                marks: 5,
                order: 0,
                options: [
                  { text: "New Correct", isCorrect: true, order: 0 },
                  { text: "New Wrong", isCorrect: false, order: 1 },
                ],
              },
            ],
          })
        ).rejects.toThrowError(/questions cannot be modified because students have already attempted this quiz/i);

        // However, updating title or window is PERMITTED
        const updatedMeta = await updateQuiz(
          quiz.id,
          publishedOffering.id,
          teacherUserA.id,
          Role.TEACHER,
          {
            title: "Updated Title for Locked Quiz",
            durationMin: 35,
          }
        );

        expect(updatedMeta.title).toBe("Updated Title for Locked Quiz");
        expect(updatedMeta.durationMin).toBe(35);
        expect(updatedMeta.hasAttempts).toBe(true);

        // Deleting quiz with attempts is also blocked
        await expect(
          deleteQuiz(quiz.id, publishedOffering.id, teacherUserA.id, Role.TEACHER)
        ).rejects.toThrowError(/cannot delete a quiz with existing student attempts/i);
      } finally {
        // Clean up
        await prisma.quizAttempt.delete({ where: { id: attempt.id } });
        await deleteQuiz(quiz.id, publishedOffering.id, teacherUserA.id, Role.TEACHER);
      }
    });
  });

  describe("Student View Protection (Anti-Cheating)", () => {
    it("ACCEPTANCE: A student can never receive isCorrect flags in any API response for an unfinished quiz", async () => {
      const now = new Date();
      // Quiz scheduled in future (unfinished)
      const startAt = new Date(now.getTime() + 1 * 60 * 60 * 1000);
      const endAt = new Date(startAt.getTime() + 120 * 60 * 1000);

      const quiz = await createQuiz(
        publishedOffering.id,
        teacherUserA.id,
        Role.TEACHER,
        {
          title: `Student View Test Quiz ${Date.now()}`,
          durationMin: 30,
          startAt,
          endAt,
          published: true,
          showAnswersAfterClose: true, // Configured to show answers AFTER close, but it is currently unfinished!
          questions: [
            {
              text: "Secret Answer Question",
              type: QuestionType.SINGLE,
              marks: 2,
              order: 0,
              options: [
                { text: "Option A (Secret correct)", isCorrect: true, order: 0 },
                { text: "Option B", isCorrect: false, order: 1 },
              ],
            },
          ],
        }
      );

      try {
        // Query as student
        const studentView = await getStudentQuizQuestions(
          quiz.id,
          publishedOffering.id,
          studentUser.id
        );

        expect(studentView).toHaveLength(1);
        const question = studentView[0];
        expect(question.options).toHaveLength(2);

        // Verify isCorrect is NOT defined or present on any option
        for (const opt of question.options) {
          expect(opt.isCorrect).toBeUndefined();
        }
      } finally {
        await deleteQuiz(quiz.id, publishedOffering.id, teacherUserA.id, Role.TEACHER);
      }
    });
  });

  describe("Archived Offering Protection", () => {
    it("ACCEPTANCE: Archived offering rejects quiz changes", async () => {
      const now = new Date();
      const startAt = new Date(now.getTime() + 2 * 60 * 60 * 1000);
      const endAt = new Date(startAt.getTime() + 120 * 60 * 1000);

      // 1. Attempting to create quiz in archived offering throws ForbiddenError
      await expect(
        createQuiz(archivedOffering.id, teacherUserA.id, Role.TEACHER, {
          title: "Archived Offering Quiz",
          durationMin: 30,
          startAt,
          endAt,
          published: false,
        })
      ).rejects.toThrowError(/ARCHIVED and read-only/i);
    });
  });

  describe("Teacher Authorization Scope", () => {
    it("ACCEPTANCE: Teacher cannot manage quizzes for another teacher's offering", async () => {
      const now = new Date();
      const startAt = new Date(now.getTime() + 2 * 60 * 60 * 1000);
      const endAt = new Date(startAt.getTime() + 120 * 60 * 1000);

      // Teacher B is NOT assigned to publishedOffering
      await expect(
        createQuiz(publishedOffering.id, teacherUserB.id, Role.TEACHER, {
          title: "Unauthorized Quiz",
          durationMin: 30,
          startAt,
          endAt,
          published: false,
        })
      ).rejects.toThrowError(/You are not assigned as an instructor or TA/i);
    });
  });
});
