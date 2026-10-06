/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { Role, CourseOfferingStatus, SubmissionStatus, NotificationType } from "@prisma/client";
import { calcFinalMarks } from "@/lib/grading";
import { saveGradeAction, reopenSubmissionAction } from "@/actions/grades";
import {
  getTeacherAssignmentSubmissionsData,
  getTeacherSubmissionDetailData,
} from "@/services/grading";
import { getStudentAssignmentDetailData } from "@/services/assignments";
import * as sessionModule from "@/lib/auth/session";

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(
    new Headers({ "x-forwarded-for": "10.0.0.1" })
  ),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("Step 22: Grading", () => {
  let studentA: any;
  let studentB: any;
  let teacherA: any;
  let teacherTA: any;
  let offeringA: any;
  const createdAssignmentIds: string[] = [];

  beforeEach(async () => {
    vi.restoreAllMocks();

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

    teacherTA = await prisma.user.findFirstOrThrow({
      where: { email: "csultana@cse.ruet.ac.bd" },
    });

    // Ensure TA assignment on offeringA exists with canGrade: false
    await prisma.offeringTeacher.upsert({
      where: {
        offeringId_userId: {
          offeringId: offeringA.id,
          userId: teacherTA.id,
        },
      },
      create: {
        offeringId: offeringA.id,
        userId: teacherTA.id,
        role: "TA",
        canGrade: false,
      },
      update: {
        role: "TA",
        canGrade: false,
      },
    });

    await prisma.courseOffering.update({
      where: { id: offeringA.id },
      data: { allowTaGrading: false },
    });
  });

  afterEach(async () => {
    if (createdAssignmentIds.length > 0) {
      for (const id of createdAssignmentIds) {
        const subs = await prisma.submission.findMany({
          where: { assignmentId: id },
          select: { id: true },
        });
        const subIds = subs.map((s) => s.id);

        if (subIds.length > 0) {
          await prisma.gradeHistory.deleteMany({
            where: { submissionId: { in: subIds } },
          });
          await prisma.grade.deleteMany({
            where: { submissionId: { in: subIds } },
          });
          await prisma.submissionVersion.deleteMany({
            where: { submissionId: { in: subIds } },
          });
          await prisma.submission.deleteMany({
            where: { id: { in: subIds } },
          });
        }

        await prisma.assignmentAttachment.deleteMany({
          where: { assignmentId: id },
        });
        await prisma.assignment.deleteMany({ where: { id } });
      }
      createdAssignmentIds.length = 0;
    }
  });

  describe("Acceptance Criterion: Pure function calcFinalMarks", () => {
    it("handles zero penalty correctly (no deduction)", () => {
      // Zero penalty when late
      expect(calcFinalMarks(85, 100, true, 0)).toBe(85);
      // Zero penalty when on time
      expect(calcFinalMarks(85, 100, false, 0)).toBe(85);
    });

    it("handles 100% penalty correctly (reduces to 0)", () => {
      // 100% penalty on 100 max points with 90 raw marks -> 90 - 100 <= 0 -> 0
      expect(calcFinalMarks(90, 100, true, 100)).toBe(0);
      expect(calcFinalMarks(100, 100, true, 100)).toBe(0);
      expect(calcFinalMarks(50, 50, true, 100)).toBe(0);
    });

    it("floors score at 0 when penalty exceeds raw marks", () => {
      // 20% penalty on 100 max = 20 deduction. Student raw = 5 -> 5 - 20 = -15 -> floored at 0
      expect(calcFinalMarks(5, 100, true, 20)).toBe(0);
      expect(calcFinalMarks(0, 50, true, 10)).toBe(0);
    });

    it("handles rounding correctly to two decimal places", () => {
      // Raw 83.33, max 100, 15% penalty = 15 deduction -> 68.33
      expect(calcFinalMarks(83.333, 100, true, 15)).toBe(68.33);

      // Raw 80, max 33, 10% penalty = 3.3 deduction -> 76.7
      expect(calcFinalMarks(80, 33, true, 10)).toBe(76.7);

      // On time never deducts penalty
      expect(calcFinalMarks(83.333, 100, false, 15)).toBe(83.33);
    });
  });

  describe("Acceptance Criterion: Validation of Marks and Grade Change Reason", () => {
    it("rejects marks above the maximum or negative server-side", async () => {
      const assignment = await prisma.assignment.create({
        data: {
          offeringId: offeringA.id,
          title: "Marks Boundary Test",
          deadline: new Date(Date.now() + 86400000),
          maxMarks: 50,
          allowedTypes: ["pdf"],
          maxSizeMb: 10,
          lateAllowed: false,
          published: true,
          createdById: teacherA.id,
        },
      });
      createdAssignmentIds.push(assignment.id);

      const sub = await prisma.submission.create({
        data: {
          assignmentId: assignment.id,
          studentId: studentA.id,
          status: SubmissionStatus.SUBMITTED,
        },
      });

      vi.spyOn(sessionModule, "requireRole").mockResolvedValue({
        id: teacherA.id,
        email: teacherA.email,
        name: teacherA.name,
        role: Role.TEACHER,
        mustChangePassword: false,
      });

      // 1. Negative marks rejected
      await expect(
        saveGradeAction(sub.id, { marks: -5, feedback: "Negative score test" })
      ).rejects.toThrow(/Marks cannot be negative|between 0 and 50/i);

      // 2. Marks above maximum rejected
      await expect(
        saveGradeAction(sub.id, { marks: 51, feedback: "Over max score test" })
      ).rejects.toThrow(/Marks must be between 0 and 50/i);
    });

    it("rejects changing a grade without a reason", async () => {
      const assignment = await prisma.assignment.create({
        data: {
          offeringId: offeringA.id,
          title: "Grade Change Reason Test",
          deadline: new Date(Date.now() + 86400000),
          maxMarks: 100,
          allowedTypes: ["pdf"],
          maxSizeMb: 10,
          lateAllowed: false,
          published: true,
          createdById: teacherA.id,
        },
      });
      createdAssignmentIds.push(assignment.id);

      const sub = await prisma.submission.create({
        data: {
          assignmentId: assignment.id,
          studentId: studentA.id,
          status: SubmissionStatus.SUBMITTED,
        },
      });

      vi.spyOn(sessionModule, "requireRole").mockResolvedValue({
        id: teacherA.id,
        email: teacherA.email,
        name: teacherA.name,
        role: Role.TEACHER,
        mustChangePassword: false,
      });

      // 1. Initial grade (first time) succeeds without change reason
      const firstRes = await saveGradeAction(sub.id, {
        marks: 80,
        feedback: "Good first attempt",
      });
      expect(firstRes.success).toBe(true);

      // Verify submission status changed to GRADED
      const updatedSub = await prisma.submission.findUniqueOrThrow({
        where: { id: sub.id },
      });
      expect(updatedSub.status).toBe(SubmissionStatus.GRADED);

      // 2. Modifying grade without reason is rejected
      await expect(
        saveGradeAction(sub.id, {
          marks: 88,
          feedback: "Updated score",
          changeReason: "", // Empty reason
        })
      ).rejects.toThrow(/reason is required when modifying/i);

      await expect(
        saveGradeAction(sub.id, {
          marks: 88,
          feedback: "Updated score",
          changeReason: "   ", // Whitespace reason
        })
      ).rejects.toThrow(/reason is required when modifying/i);
    });

    it("changing a grade with a reason creates GradeHistory, AuditLog GRADE_CHANGED, and notifies student", async () => {
      const assignment = await prisma.assignment.create({
        data: {
          offeringId: offeringA.id,
          title: "Grade History Audit Test",
          deadline: new Date(Date.now() + 86400000),
          maxMarks: 100,
          allowedTypes: ["pdf"],
          maxSizeMb: 10,
          lateAllowed: false,
          published: true,
          createdById: teacherA.id,
        },
      });
      createdAssignmentIds.push(assignment.id);

      const sub = await prisma.submission.create({
        data: {
          assignmentId: assignment.id,
          studentId: studentA.id,
          status: SubmissionStatus.SUBMITTED,
        },
      });

      vi.spyOn(sessionModule, "requireRole").mockResolvedValue({
        id: teacherA.id,
        email: teacherA.email,
        name: teacherA.name,
        role: Role.TEACHER,
        mustChangePassword: false,
      });

      // Initial grade
      await saveGradeAction(sub.id, { marks: 75, feedback: "Initial grade" });

      // Grade modification with valid reason
      const changeRes = await saveGradeAction(sub.id, {
        marks: 85,
        feedback: "Corrected problem 2 calculation",
        changeReason: "Re-evaluated question 2 after regrade request",
      });

      expect(changeRes.success).toBe(true);

      // Verify Grade record updated
      const grade = await prisma.grade.findUniqueOrThrow({
        where: { submissionId: sub.id },
      });
      expect(Number(grade.marks)).toBe(85);

      // Verify GradeHistory row created
      const history = await prisma.gradeHistory.findFirstOrThrow({
        where: { submissionId: sub.id },
      });
      expect(Number(history.oldMarks)).toBe(75);
      expect(Number(history.newMarks)).toBe(85);
      expect(history.reason).toBe("Re-evaluated question 2 after regrade request");
      expect(history.changedById).toBe(teacherA.id);

      // Verify AuditLog GRADE_CHANGED
      const audit = await prisma.auditLog.findFirst({
        where: {
          action: "GRADE_CHANGED",
          objectId: grade.id,
          userId: teacherA.id,
        },
      });
      expect(audit).not.toBeNull();
      expect(audit?.description).toContain("75 to 85");

      // Verify RESULT notification sent to student
      const notif = await prisma.notification.findFirst({
        where: {
          userId: studentA.id,
          type: NotificationType.RESULT,
        },
        orderBy: { createdAt: "desc" },
      });
      expect(notif).not.toBeNull();
      expect(notif?.title).toContain("Grade Updated");
    });
  });

  describe("Acceptance Criterion: Reopen Submission Action", () => {
    it("sets reopened true, logs audit, and sends ACADEMIC notification", async () => {
      const assignment = await prisma.assignment.create({
        data: {
          offeringId: offeringA.id,
          title: "Reopen Action Test",
          deadline: new Date(Date.now() + 86400000),
          maxMarks: 100,
          allowedTypes: ["pdf"],
          maxSizeMb: 10,
          lateAllowed: false,
          published: true,
          createdById: teacherA.id,
        },
      });
      createdAssignmentIds.push(assignment.id);

      const sub = await prisma.submission.create({
        data: {
          assignmentId: assignment.id,
          studentId: studentA.id,
          status: SubmissionStatus.GRADED,
          reopened: false,
        },
      });

      vi.spyOn(sessionModule, "requireRole").mockResolvedValue({
        id: teacherA.id,
        email: teacherA.email,
        name: teacherA.name,
        role: Role.TEACHER,
        mustChangePassword: false,
      });

      const res = await reopenSubmissionAction(sub.id);
      expect(res.success).toBe(true);

      const updated = await prisma.submission.findUniqueOrThrow({
        where: { id: sub.id },
      });
      expect(updated.reopened).toBe(true);

      // Verify AuditLog
      const audit = await prisma.auditLog.findFirst({
        where: {
          action: "SUBMISSION_REOPENED",
          objectId: sub.id,
        },
      });
      expect(audit).not.toBeNull();

      // Verify ACADEMIC notification sent to student
      const notif = await prisma.notification.findFirst({
        where: {
          userId: studentA.id,
          type: NotificationType.ACADEMIC,
        },
        orderBy: { createdAt: "desc" },
      });
      expect(notif).not.toBeNull();
      expect(notif?.title).toContain("Submission Reopened");
    });
  });

  describe("Acceptance Criterion: Privacy and Security - Student cannot see another student's grade", () => {
    it("a student cannot view another student's submission or grade", async () => {
      const assignment = await prisma.assignment.create({
        data: {
          offeringId: offeringA.id,
          title: "Privacy Security Test",
          deadline: new Date(Date.now() + 86400000),
          maxMarks: 100,
          allowedTypes: ["pdf"],
          maxSizeMb: 10,
          lateAllowed: false,
          published: true,
          createdById: teacherA.id,
        },
      });
      createdAssignmentIds.push(assignment.id);

      // Student A submits and gets grade 99
      const subA = await prisma.submission.create({
        data: {
          assignmentId: assignment.id,
          studentId: studentA.id,
          status: SubmissionStatus.GRADED,
        },
      });
      await prisma.grade.create({
        data: {
          submissionId: subA.id,
          marks: 99,
          feedback: "Top of the class!",
          gradedById: teacherA.id,
        },
      });

      // 1. Student B queries student detail data for assignment
      // Student B has not submitted anything yet
      const detailStudentB = await getStudentAssignmentDetailData(
        offeringA.id,
        assignment.id,
        studentB.id
      );

      // Detail strictly scopes to studentB.id -> submission is null
      expect(detailStudentB.submission).toBeNull();

      // 2. Student B tries to access teacher submission detail endpoint -> REJECTED
      await expect(
        getTeacherSubmissionDetailData(offeringA.id, subA.id, {
          id: studentB.id,
          role: Role.STUDENT,
        })
      ).rejects.toThrow();
    });
  });

  describe("Acceptance Criterion: TA Grading Permissions", () => {
    it("TAs cannot grade unless allowed by the instructor", async () => {
      const assignment = await prisma.assignment.create({
        data: {
          offeringId: offeringA.id,
          title: "TA Grading Guard Test",
          deadline: new Date(Date.now() + 86400000),
          maxMarks: 100,
          allowedTypes: ["pdf"],
          maxSizeMb: 10,
          lateAllowed: false,
          published: true,
          createdById: teacherA.id,
        },
      });
      createdAssignmentIds.push(assignment.id);

      const sub = await prisma.submission.create({
        data: {
          assignmentId: assignment.id,
          studentId: studentA.id,
          status: SubmissionStatus.SUBMITTED,
        },
      });

      // 1. TA tries to grade when canGrade is false and offering.allowTaGrading is false -> REJECTED
      vi.spyOn(sessionModule, "requireRole").mockResolvedValue({
        id: teacherTA.id,
        email: teacherTA.email,
        name: teacherTA.name,
        role: Role.TEACHER,
        mustChangePassword: false,
      });

      await expect(
        saveGradeAction(sub.id, { marks: 80, feedback: "TA attempt" })
      ).rejects.toThrow(/Teaching Assistants are not permitted to grade/i);

      // 2. Instructor enables canGrade on OfferingTeacher for this TA
      await prisma.offeringTeacher.update({
        where: {
          offeringId_userId: {
            offeringId: offeringA.id,
            userId: teacherTA.id,
          },
        },
        data: { canGrade: true },
      });

      // 3. TA tries to grade now -> SUCCEEDS
      const res = await saveGradeAction(sub.id, {
        marks: 85,
        feedback: "Graded by authorized TA",
      });
      expect(res.success).toBe(true);
      expect(Number(res.grade.marks)).toBe(85);

      // 4. Test offering-level setting: canGrade false, but offering.allowTaGrading is true
      await prisma.offeringTeacher.update({
        where: {
          offeringId_userId: {
            offeringId: offeringA.id,
            userId: teacherTA.id,
          },
        },
        data: { canGrade: false },
      });

      await prisma.courseOffering.update({
        where: { id: offeringA.id },
        data: { allowTaGrading: true },
      });

      // Grade modification with reason by TA -> SUCCEEDS because offering.allowTaGrading is true
      const changeRes = await saveGradeAction(sub.id, {
        marks: 88,
        feedback: "TA regrade",
        changeReason: "Offering allowTaGrading permitted",
      });
      expect(changeRes.success).toBe(true);

      // Reset offering allowTaGrading
      await prisma.courseOffering.update({
        where: { id: offeringA.id },
        data: { allowTaGrading: false },
      });
    });
  });
});
