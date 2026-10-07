/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { Role, CourseOfferingStatus, SubmissionStatus } from "@prisma/client";
import { submitAssignmentAction } from "@/actions/submissions";
import {
  getStudentOfferingAssignmentsData,
  getStudentAssignmentDetailData,
  getStudentGlobalAssignmentsData,
} from "@/services/assignments";
import * as sessionModule from "@/lib/auth/session";
import * as storageModule from "@/lib/storage";
import * as nextAuth from "next-auth/next";
import { NextRequest } from "next/server";
import { GET as downloadSubmissionVersionHandler } from "@/app/api/submissions/versions/[versionId]/download/route";
import { uploadRateLimiter } from "@/lib/rate-limiter";

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(
    new Headers({ "x-forwarded-for": "10.0.0.1" })
  ),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

function createMockPdfFile(filename: string): File {
  // Valid PDF header "%PDF-1.4\n" followed by minimal dummy content
  const pdfBytes = new Uint8Array([
    0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xc4, 0xe5,
    0xf2, 0xe5, 0x0a, 0x31, 0x20, 0x30, 0x20, 0x6f, 0x62, 0x6a, 0x0a, 0x3c,
    0x3c, 0x2f, 0x54, 0x79, 0x70, 0x65, 0x2f, 0x43, 0x61, 0x74, 0x61, 0x6c,
    0x6f, 0x67, 0x3e, 0x3e, 0x0a, 0x65, 0x6e, 0x64, 0x6f, 0x62, 0x6a, 0x0a,
  ]);
  return new File([pdfBytes], filename, { type: "application/pdf" });
}

describe("Step 21: Student Assignments and Submissions", () => {
  let studentA: any;
  let studentB: any;
  let teacherA: any;
  let offeringA: any;
  const createdAssignmentIds: string[] = [];

  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    uploadRateLimiter.clear();

    vi.spyOn(storageModule, "uploadToSupabaseBucket").mockResolvedValue({
      success: true,
    });
    vi.spyOn(storageModule, "getSignedDownloadUrl").mockResolvedValue(
      "https://storage.supabase.co/signed/submission-file.pdf"
    );

    studentA = await prisma.user.findFirstOrThrow({
      where: { email: "2203001@student.ruet.ac.bd" },
    });

    studentB = await prisma.user.findFirstOrThrow({
      where: { email: "2203002@student.ruet.ac.bd" },
    });

    teacherA = await prisma.user.findFirstOrThrow({
      where: { email: "arahman@cse.ruet.ac.bd" },
    });

    // Find active published offering where teacherA teaches and studentA is enrolled
    const enrollment = await prisma.enrollment.findFirstOrThrow({
      where: {
        studentId: studentA.id,
        status: "ACTIVE",
        section: {
          offering: {
            status: CourseOfferingStatus.PUBLISHED,
            offeringTeachers: { some: { userId: teacherA.id } },
          },
        },
      },
      include: {
        section: {
          include: {
            offering: true,
          },
        },
      },
    });

    offeringA = enrollment.section.offering;
  });

  afterEach(async () => {
    vi.useRealTimers();
    if (createdAssignmentIds.length > 0) {
      for (const id of createdAssignmentIds) {
        // Clean up submissions, versions, grades, attachments, and assignments
        const subs = await prisma.submission.findMany({
          where: { assignmentId: id },
          select: { id: true },
        });
        const subIds = subs.map((s) => s.id);

        if (subIds.length > 0) {
          await prisma.gradeHistory.deleteMany({ where: { submissionId: { in: subIds } } });
          await prisma.grade.deleteMany({ where: { submissionId: { in: subIds } } });
          await prisma.submission.updateMany({
            where: { id: { in: subIds } },
            data: { currentVersionId: null },
          });
          await prisma.submissionVersion.deleteMany({
            where: { submissionId: { in: subIds } },
          });
          await prisma.submission.deleteMany({ where: { id: { in: subIds } } });
        }
        await prisma.submission.deleteMany({ where: { assignmentId: id } }).catch(() => {});
        await prisma.assignmentAttachment.deleteMany({ where: { assignmentId: id } });
        await prisma.assignment.deleteMany({ where: { id } });
      }
      createdAssignmentIds.length = 0;
    }
  });

  describe("Acceptance Criterion: Multi-version uploads and teacher sees latest by default", () => {
    it("uploading three times produces three versions and teacher sees the latest by default", async () => {
      // 1. Create a published assignment
      const deadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const assignment = await prisma.assignment.create({
        data: {
          offeringId: offeringA.id,
          title: "Multi-version Homework Test",
          deadline,
          maxMarks: 100,
          allowedTypes: ["pdf"],
          maxSizeMb: 25,
          lateAllowed: true,
          published: true,
          createdById: teacherA.id,
        },
      });
      createdAssignmentIds.push(assignment.id);

      // Mock session as studentA
      vi.spyOn(sessionModule, "requireRole").mockResolvedValue({
        id: studentA.id,
        email: studentA.email,
        name: studentA.name,
        role: Role.STUDENT,
        mustChangePassword: false,
      });

      // 2. Upload first time -> Version 1
      const file1 = createMockPdfFile("submission_v1.pdf");
      const fd1 = new FormData();
      fd1.append("file", file1);
      const res1 = await submitAssignmentAction(offeringA.id, assignment.id, fd1);
      expect(res1.success).toBe(true);
      expect(res1.versionNo).toBe(1);

      // 3. Upload second time -> Version 2
      const file2 = createMockPdfFile("submission_v2.pdf");
      const fd2 = new FormData();
      fd2.append("file", file2);
      const res2 = await submitAssignmentAction(offeringA.id, assignment.id, fd2);
      expect(res2.success).toBe(true);
      expect(res2.versionNo).toBe(2);

      // 4. Upload third time -> Version 3
      const file3 = createMockPdfFile("submission_v3.pdf");
      const fd3 = new FormData();
      fd3.append("file", file3);
      const res3 = await submitAssignmentAction(offeringA.id, assignment.id, fd3);
      expect(res3.success).toBe(true);
      expect(res3.versionNo).toBe(3);

      // 5. Verify database state
      const submission = await prisma.submission.findUniqueOrThrow({
        where: {
          assignmentId_studentId: {
            assignmentId: assignment.id,
            studentId: studentA.id,
          },
        },
        include: {
          versions: {
            orderBy: { versionNo: "asc" },
          },
        },
      });

      expect(submission.versions).toHaveLength(3);
      expect(submission.versions.map((v) => v.versionNo)).toEqual([1, 2, 3]);
      // Verify teacher and system sees the latest by default via currentVersionId
      expect(submission.currentVersionId).toBe(res3.versionId);
      expect(submission.currentVersionId).toBe(submission.versions[2].id);

      // 6. Verify student assignment detail returns all 3 versions ordered descending (latest first)
      const detail = await getStudentAssignmentDetailData(
        offeringA.id,
        assignment.id,
        studentA.id
      );
      expect(detail.submission).not.toBeNull();
      expect(detail.submission?.versions).toHaveLength(3);
      expect(detail.submission?.versions[0].versionNo).toBe(3); // Version 3 first
      expect(detail.submission?.currentVersionId).toBe(res3.versionId);
    });
  });

  describe("Acceptance Criterion: isLate calculation using mocked clock and ignoring client timestamps", () => {
    it("submitting at 1 second after deadline is marked late", async () => {
      const fixedDeadline = new Date("2026-10-15T18:00:00.000Z");
      const assignment = await prisma.assignment.create({
        data: {
          offeringId: offeringA.id,
          title: "Late Deadline Evaluation Test",
          deadline: fixedDeadline,
          maxMarks: 50,
          allowedTypes: ["pdf"],
          maxSizeMb: 10,
          lateAllowed: true, // late allowed
          latePenaltyPercent: 15,
          published: true,
          createdById: teacherA.id,
        },
      });
      createdAssignmentIds.push(assignment.id);

      vi.spyOn(sessionModule, "requireRole").mockResolvedValue({
        id: studentA.id,
        email: studentA.email,
        name: studentA.name,
        role: Role.STUDENT,
        mustChangePassword: false,
      });

      // Fast-forward system clock to exactly 1 second AFTER deadline
      vi.useFakeTimers({ toFake: ["Date"] });
      const oneSecondAfterDeadline = new Date(fixedDeadline.getTime() + 1000);
      vi.setSystemTime(oneSecondAfterDeadline);

      const file = createMockPdfFile("late_solution.pdf");
      const fd = new FormData();
      fd.append("file", file);

      const res = await submitAssignmentAction(offeringA.id, assignment.id, fd);
      vi.useRealTimers();
      expect(res.success).toBe(true);
      expect(res.isLate).toBe(true);
      expect(res.status).toBe(SubmissionStatus.LATE);

      const dbVersion = await prisma.submissionVersion.findUniqueOrThrow({
        where: { id: res.versionId },
      });
      expect(dbVersion.isLate).toBe(true);
    });

    it("rejects submission 1 second after deadline when late submissions are not allowed", async () => {
      const fixedDeadline = new Date("2026-10-15T18:00:00.000Z");
      const assignment = await prisma.assignment.create({
        data: {
          offeringId: offeringA.id,
          title: "Strict Deadline No Late Test",
          deadline: fixedDeadline,
          maxMarks: 50,
          allowedTypes: ["pdf"],
          maxSizeMb: 10,
          lateAllowed: false, // Late strictly prohibited
          published: true,
          createdById: teacherA.id,
        },
      });
      createdAssignmentIds.push(assignment.id);

      vi.spyOn(sessionModule, "requireRole").mockResolvedValue({
        id: studentA.id,
        email: studentA.email,
        name: studentA.name,
        role: Role.STUDENT,
        mustChangePassword: false,
      });

      vi.useFakeTimers({ toFake: ["Date"] });
      const oneSecondAfterDeadline = new Date(fixedDeadline.getTime() + 1000);
      vi.setSystemTime(oneSecondAfterDeadline);

      const file = createMockPdfFile("late_solution.pdf");
      const fd = new FormData();
      fd.append("file", file);

      try {
        await expect(
          submitAssignmentAction(offeringA.id, assignment.id, fd)
        ).rejects.toThrow(/deadline for this assignment has passed and late submissions are not accepted/i);
      } finally {
        vi.useRealTimers();
      }
    });

    it("ignores any client-sent timestamps in request body", async () => {
      const fixedDeadline = new Date("2026-10-15T18:00:00.000Z");
      const assignment = await prisma.assignment.create({
        data: {
          offeringId: offeringA.id,
          title: "Client Timestamp Tamper Test",
          deadline: fixedDeadline,
          maxMarks: 50,
          allowedTypes: ["pdf"],
          maxSizeMb: 10,
          lateAllowed: true,
          published: true,
          createdById: teacherA.id,
        },
      });
      createdAssignmentIds.push(assignment.id);

      vi.spyOn(sessionModule, "requireRole").mockResolvedValue({
        id: studentA.id,
        email: studentA.email,
        name: studentA.name,
        role: Role.STUDENT,
        mustChangePassword: false,
      });

      // System clock is 10 seconds after deadline
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date(fixedDeadline.getTime() + 10000));

      const file = createMockPdfFile("solution.pdf");
      const fd = new FormData();
      fd.append("file", file);
      // Malicious client includes a fake timestamp claiming it was submitted 2 hours before deadline
      fd.append("clientTimestamp", new Date(fixedDeadline.getTime() - 7200000).toISOString());
      fd.append("submittedAt", new Date(fixedDeadline.getTime() - 7200000).toISOString());

      let res: any;
      try {
        res = await submitAssignmentAction(offeringA.id, assignment.id, fd);
      } finally {
        vi.useRealTimers();
      }
      // Server-side check takes precedence; must be marked late
      expect(res.isLate).toBe(true);
      expect(res.status).toBe(SubmissionStatus.LATE);
    });
  });

  describe("Acceptance Criterion: Security and Authorization on File Download", () => {
    it("a student cannot download another student's submission file by guessing ID or key", async () => {
      // 1. Create assignment & submit file as studentA
      const assignment = await prisma.assignment.create({
        data: {
          offeringId: offeringA.id,
          title: "Security Authorization Test",
          deadline: new Date(Date.now() + 86400000),
          maxMarks: 100,
          allowedTypes: ["pdf"],
          maxSizeMb: 10,
          lateAllowed: true,
          published: true,
          createdById: teacherA.id,
        },
      });
      createdAssignmentIds.push(assignment.id);

      vi.spyOn(sessionModule, "requireRole").mockResolvedValue({
        id: studentA.id,
        email: studentA.email,
        name: studentA.name,
        role: Role.STUDENT,
        mustChangePassword: false,
      });

      const file = createMockPdfFile("secret_report.pdf");
      const fd = new FormData();
      fd.append("file", file);
      const submitRes = await submitAssignmentAction(offeringA.id, assignment.id, fd);

      // 2. Student B tries to download Student A's submission version
      vi.spyOn(nextAuth, "getServerSession").mockResolvedValue({
        user: {
          id: studentB.id,
          email: studentB.email,
          name: studentB.name,
          role: Role.STUDENT,
        },
      });

      const reqB = new NextRequest(
        `http://localhost:3000/api/submissions/versions/${submitRes.versionId}/download`
      );
      const resB = await downloadSubmissionVersionHandler(reqB, {
        params: Promise.resolve({ versionId: submitRes.versionId }),
      });

      // Strict rejection: 403 Forbidden
      expect(resB.status).toBe(403);
      const jsonB = await resB.json();
      expect(jsonB.error).toMatch(/Forbidden|not authorized/i);

      // 3. Submitting student (Student A) CAN download their own file
      vi.spyOn(nextAuth, "getServerSession").mockResolvedValue({
        user: {
          id: studentA.id,
          email: studentA.email,
          name: studentA.name,
          role: Role.STUDENT,
        },
      });

      const reqA = new NextRequest(
        `http://localhost:3000/api/submissions/versions/${submitRes.versionId}/download`
      );
      const resA = await downloadSubmissionVersionHandler(reqA, {
        params: Promise.resolve({ versionId: submitRes.versionId }),
      });
      // 307 or 302 Redirect to signed URL
      expect([302, 307]).toContain(resA.status);

      // 4. Course Teacher CAN download Student A's submission file
      vi.spyOn(nextAuth, "getServerSession").mockResolvedValue({
        user: {
          id: teacherA.id,
          email: teacherA.email,
          name: teacherA.name,
          role: Role.TEACHER,
        },
      });

      const reqTeacher = new NextRequest(
        `http://localhost:3000/api/submissions/versions/${submitRes.versionId}/download`
      );
      const resTeacher = await downloadSubmissionVersionHandler(reqTeacher, {
        params: Promise.resolve({ versionId: submitRes.versionId }),
      });
      expect([302, 307]).toContain(resTeacher.status);
    });
  });

  describe("Acceptance Criterion: Throttle, Lock after Grading, and Audit Logs", () => {
    it("throttles submissions to a maximum of 10 versions per student per assignment", async () => {
      const assignment = await prisma.assignment.create({
        data: {
          offeringId: offeringA.id,
          title: "Max 10 Versions Throttle Test",
          deadline: new Date(Date.now() + 86400000),
          maxMarks: 100,
          allowedTypes: ["pdf"],
          maxSizeMb: 10,
          lateAllowed: true,
          published: true,
          createdById: teacherA.id,
        },
      });
      createdAssignmentIds.push(assignment.id);

      vi.spyOn(sessionModule, "requireRole").mockResolvedValue({
        id: studentA.id,
        email: studentA.email,
        name: studentA.name,
        role: Role.STUDENT,
        mustChangePassword: false,
      });

      // Submit 10 versions sequentially
      for (let i = 1; i <= 10; i++) {
        const file = createMockPdfFile(`doc_v${i}.pdf`);
        const fd = new FormData();
        fd.append("file", file);
        const res = await submitAssignmentAction(offeringA.id, assignment.id, fd);
        expect(res.versionNo).toBe(i);
      }

      // Attempt 11th submission
      const file11 = createMockPdfFile("doc_v11.pdf");
      const fd11 = new FormData();
      fd11.append("file", file11);

      await expect(
        submitAssignmentAction(offeringA.id, assignment.id, fd11)
      ).rejects.toThrow(/Maximum of 10 submission versions/i);
    }, 120000);

    it("blocks resubmission after grading unless Submission.reopened is true", async () => {
      const assignment = await prisma.assignment.create({
        data: {
          offeringId: offeringA.id,
          title: "Grade Lock Resubmission Test",
          deadline: new Date(Date.now() + 86400000),
          maxMarks: 100,
          allowedTypes: ["pdf"],
          maxSizeMb: 10,
          lateAllowed: true,
          published: true,
          createdById: teacherA.id,
        },
      });
      createdAssignmentIds.push(assignment.id);

      vi.spyOn(sessionModule, "requireRole").mockResolvedValue({
        id: studentA.id,
        email: studentA.email,
        name: studentA.name,
        role: Role.STUDENT,
        mustChangePassword: false,
      });

      // 1. Initial submission
      const file1 = createMockPdfFile("original.pdf");
      const fd1 = new FormData();
      fd1.append("file", file1);
      const res1 = await submitAssignmentAction(offeringA.id, assignment.id, fd1);

      // 2. Teacher grades the submission
      await prisma.grade.create({
        data: {
          submissionId: res1.submissionId,
          marks: 92,
          feedback: "Great work!",
          gradedById: teacherA.id,
        },
      });
      await prisma.submission.update({
        where: { id: res1.submissionId },
        data: { status: SubmissionStatus.GRADED },
      });

      // 3. Student tries to resubmit -> BLOCKED
      const file2 = createMockPdfFile("new_attempt.pdf");
      const fd2 = new FormData();
      fd2.append("file", file2);

      await expect(
        submitAssignmentAction(offeringA.id, assignment.id, fd2)
      ).rejects.toThrow(/already been graded and cannot be resubmitted/i);

      // 4. Instructor reopens the submission
      await prisma.submission.update({
        where: { id: res1.submissionId },
        data: { reopened: true },
      });

      // 5. Student resubmits now -> SUCCEEDS
      const res2 = await submitAssignmentAction(offeringA.id, assignment.id, fd2);
      expect(res2.success).toBe(true);
      expect(res2.versionNo).toBe(2);
    });

    it("records SUBMISSION_UPLOADED in AuditLog", async () => {
      const assignment = await prisma.assignment.create({
        data: {
          offeringId: offeringA.id,
          title: "Audit Log Submission Test",
          deadline: new Date(Date.now() + 86400000),
          maxMarks: 100,
          allowedTypes: ["pdf"],
          maxSizeMb: 10,
          lateAllowed: true,
          published: true,
          createdById: teacherA.id,
        },
      });
      createdAssignmentIds.push(assignment.id);

      vi.spyOn(sessionModule, "requireRole").mockResolvedValue({
        id: studentA.id,
        email: studentA.email,
        name: studentA.name,
        role: Role.STUDENT,
        mustChangePassword: false,
      });

      const file = createMockPdfFile("audit_test.pdf");
      const fd = new FormData();
      fd.append("file", file);
      const res = await submitAssignmentAction(offeringA.id, assignment.id, fd);

      const audit = await prisma.auditLog.findFirst({
        where: {
          action: "SUBMISSION_UPLOADED",
          objectId: res.submissionId,
          userId: studentA.id,
        },
      });

      expect(audit).not.toBeNull();
      expect(audit?.description).toContain(`Submission version ${res.versionNo}`);
      expect(audit?.description).toContain(assignment.id);
    });

    it("assigns sequential version numbers under concurrent submits", async () => {
      const assignment = await prisma.assignment.create({
        data: {
          offeringId: offeringA.id,
          title: "Concurrent Submissions Test",
          deadline: new Date(Date.now() + 86400000),
          maxMarks: 100,
          allowedTypes: ["pdf"],
          maxSizeMb: 10,
          lateAllowed: true,
          published: true,
          createdById: teacherA.id,
        },
      });
      createdAssignmentIds.push(assignment.id);

      vi.spyOn(sessionModule, "requireRole").mockResolvedValue({
        id: studentA.id,
        email: studentA.email,
        name: studentA.name,
        role: Role.STUDENT,
        mustChangePassword: false,
      });

      // Launch 2 submits in parallel
      const fd1 = new FormData();
      fd1.append("file", createMockPdfFile("concurrent_1.pdf"));

      const fd2 = new FormData();
      fd2.append("file", createMockPdfFile("concurrent_2.pdf"));

      const [res1, res2] = await Promise.all([
        submitAssignmentAction(offeringA.id, assignment.id, fd1),
        submitAssignmentAction(offeringA.id, assignment.id, fd2),
      ]);

      expect(res1.success).toBe(true);
      expect(res2.success).toBe(true);

      const versions = [res1.versionNo, res2.versionNo].sort((a, b) => a - b);
      expect(versions).toEqual([1, 2]);

      const subInDb = await prisma.submission.findUniqueOrThrow({
        where: {
          assignmentId_studentId: {
            assignmentId: assignment.id,
            studentId: studentA.id,
          },
        },
        include: {
          versions: { orderBy: { versionNo: "asc" } },
        },
      });

      expect(subInDb.versions).toHaveLength(2);
      expect(subInDb.versions.map((v) => v.versionNo)).toEqual([1, 2]);
    });
  });

  describe("Global Assignments Page Grouping", () => {
    it("correctly groups assignments into Overdue, Due soon, Upcoming, Submitted, and Graded", async () => {
      const now = new Date();
      // 1. Overdue assignment (deadline in past)
      const overdueAssign = await prisma.assignment.create({
        data: {
          offeringId: offeringA.id,
          title: "Past Homework",
          deadline: new Date(now.getTime() - 24 * 60 * 60 * 1000),
          maxMarks: 100,
          allowedTypes: ["pdf"],
          maxSizeMb: 10,
          published: true,
          createdById: teacherA.id,
        },
      });
      createdAssignmentIds.push(overdueAssign.id);

      // 2. Due soon assignment (deadline in 12 hours)
      const dueSoonAssign = await prisma.assignment.create({
        data: {
          offeringId: offeringA.id,
          title: "Due Soon Lab",
          deadline: new Date(now.getTime() + 12 * 60 * 60 * 1000),
          maxMarks: 100,
          allowedTypes: ["pdf"],
          maxSizeMb: 10,
          published: true,
          createdById: teacherA.id,
        },
      });
      createdAssignmentIds.push(dueSoonAssign.id);

      // 3. Upcoming assignment (deadline in 7 days)
      const upcomingAssign = await prisma.assignment.create({
        data: {
          offeringId: offeringA.id,
          title: "Future Final Project",
          deadline: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
          maxMarks: 100,
          allowedTypes: ["pdf"],
          maxSizeMb: 10,
          published: true,
          createdById: teacherA.id,
        },
      });
      createdAssignmentIds.push(upcomingAssign.id);

      // 4. Submitted assignment
      const submittedAssign = await prisma.assignment.create({
        data: {
          offeringId: offeringA.id,
          title: "Submitted Lab Report",
          deadline: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000),
          maxMarks: 100,
          allowedTypes: ["pdf"],
          maxSizeMb: 10,
          published: true,
          createdById: teacherA.id,
        },
      });
      createdAssignmentIds.push(submittedAssign.id);

      const sub = await prisma.submission.create({
        data: {
          assignmentId: submittedAssign.id,
          studentId: studentA.id,
          status: SubmissionStatus.SUBMITTED,
        },
      });
      const v = await prisma.submissionVersion.create({
        data: {
          submissionId: sub.id,
          versionNo: 1,
          fileKey: `${offeringA.id}/sub1.pdf`,
          originalName: "lab.pdf",
          mime: "application/pdf",
          sizeBytes: 1024,
        },
      });
      await prisma.submission.update({
        where: { id: sub.id },
        data: { currentVersionId: v.id },
      });

      // 5. Graded assignment
      const gradedAssign = await prisma.assignment.create({
        data: {
          offeringId: offeringA.id,
          title: "Graded Midterm Assignment",
          deadline: new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000),
          maxMarks: 100,
          allowedTypes: ["pdf"],
          maxSizeMb: 10,
          published: true,
          createdById: teacherA.id,
        },
      });
      createdAssignmentIds.push(gradedAssign.id);

      const subGraded = await prisma.submission.create({
        data: {
          assignmentId: gradedAssign.id,
          studentId: studentA.id,
          status: SubmissionStatus.GRADED,
        },
      });
      const vGraded = await prisma.submissionVersion.create({
        data: {
          submissionId: subGraded.id,
          versionNo: 1,
          fileKey: `${offeringA.id}/subGraded.pdf`,
          originalName: "midterm.pdf",
          mime: "application/pdf",
          sizeBytes: 2048,
        },
      });
      await prisma.grade.create({
        data: {
          submissionId: subGraded.id,
          marks: 95,
          feedback: "Excellent analysis.",
          gradedById: teacherA.id,
        },
      });
      await prisma.submission.update({
        where: { id: subGraded.id },
        data: { currentVersionId: vGraded.id },
      });

      // Query global assignments
      const globalData = await getStudentGlobalAssignmentsData(studentA.id);

      const overdueIds = globalData.overdue.map((a) => a.id);
      const dueSoonIds = globalData.dueSoon.map((a) => a.id);
      const upcomingIds = globalData.upcoming.map((a) => a.id);
      const submittedIds = globalData.submitted.map((a) => a.id);
      const gradedIds = globalData.graded.map((a) => a.id);

      expect(overdueIds).toContain(overdueAssign.id);
      expect(dueSoonIds).toContain(dueSoonAssign.id);
      expect(upcomingIds).toContain(upcomingAssign.id);
      expect(submittedIds).toContain(submittedAssign.id);
      expect(gradedIds).toContain(gradedAssign.id);
    });
  });
});
