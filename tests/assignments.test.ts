/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { Role, CourseOfferingStatus, NotificationType } from "@prisma/client";
import {
  createAssignmentAction,
  updateAssignmentAction,
  toggleAssignmentPublishedAction,
  deleteAssignmentAction,
} from "@/actions/assignments";
import {
  getTeacherOfferingAssignmentsData,
  getStudentOfferingAssignmentsData,
} from "@/services/assignments";
import {
  dhakaLocalToUtc,
  utcToDhakaInputFormat,
  formatDhaka,
} from "@/lib/datetime";
import * as sessionModule from "@/lib/auth/session";
import { NextRequest } from "next/server";
import { GET as attachmentDownloadRouteHandler } from "@/app/api/assignments/attachments/[attachmentId]/download/route";
import * as storageModule from "@/lib/storage";
import * as nextAuth from "next-auth/next";

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(
    new Headers({ "x-forwarded-for": "10.0.0.1" })
  ),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("Step 20: Assignments, Teacher Side", () => {
  let teacherA: any;
  let studentA: any;
  let offeringA: any;
  let archivedOffering: any;

  beforeEach(async () => {
    vi.spyOn(storageModule, "getSignedDownloadUrl").mockResolvedValue(
      "https://storage.supabase.co/signed/attachment.pdf"
    );

    teacherA = await prisma.user.findFirstOrThrow({
      where: { email: "arahman@cse.ruet.ac.bd" },
    });

    studentA = await prisma.user.findFirstOrThrow({
      where: { email: "2203001@student.ruet.ac.bd" },
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

    // Find or create an archived offering for testing
    let archived = await prisma.courseOffering.findFirst({
      where: {
        status: CourseOfferingStatus.ARCHIVED,
        offeringTeachers: { some: { userId: teacherA.id } },
      },
    });

    if (!archived) {
      archived = await prisma.courseOffering.create({
        data: {
          courseId: offeringA.courseId,
          term: "Spring 2024 (Archived)",
          academicYear: "2023-2024",
          status: CourseOfferingStatus.ARCHIVED,
          offeringTeachers: {
            create: {
              userId: teacherA.id,
              role: "INSTRUCTOR",
            },
          },
        },
      });
    }

    archivedOffering = archived;
  });

  describe("Timezone & DateTime Conversion (Asia/Dhaka)", () => {
    it("ACCEPTANCE: Timezone check: 11:59 PM Dhaka appears as 11:59 PM Dhaka and is stored in UTC", async () => {
      // 1. Enter local Dhaka deadline string: "2026-10-14T23:59"
      const dhakaLocalInput = "2026-10-14T23:59";
      const utcDate = dhakaLocalToUtc(dhakaLocalInput);

      // Dhaka is UTC+6 -> 23:59 Dhaka is 17:59 UTC
      expect(utcDate.toISOString()).toBe("2026-10-14T17:59:00.000Z");

      // 2. Format back using formatDhaka -> confirms 11:59 PM
      const formattedDhaka = formatDhaka(utcDate, "full");
      expect(formattedDhaka).toContain("11:59 PM");
      expect(formattedDhaka).toContain("Oct 14, 2026");

      // 3. Format to datetime-local input string for form editing
      const inputFormat = utcToDhakaInputFormat(utcDate);
      expect(inputFormat).toBe("2026-10-14T23:59");

      // 4. Create assignment in DB and verify database persistence in UTC
      vi.spyOn(sessionModule, "requireRole").mockResolvedValue({
        id: teacherA.id,
        email: teacherA.email,
        name: teacherA.name,
        role: Role.TEACHER,
        mustChangePassword: false,
      });

      const res = await createAssignmentAction({
        offeringId: offeringA.id,
        title: `Timezone Test Assignment ${Date.now()}`,
        deadline: utcDate,
        maxMarks: 50,
        allowedTypes: ["pdf"],
        maxSizeMb: 20,
        lateAllowed: false,
        latePenaltyPercent: 0,
        published: false,
      });

      expect(res.success).toBe(true);

      const dbAssignment = await prisma.assignment.findUniqueOrThrow({
        where: { id: res.assignment.id },
      });

      // Confirm stored in UTC in database
      expect(dbAssignment.deadline.toISOString()).toBe("2026-10-14T17:59:00.000Z");

      // Confirm displayed in Dhaka time as 11:59 PM
      expect(formatDhaka(dbAssignment.deadline, "short")).toContain("11:59 PM");

      // Clean up
      await prisma.assignment.delete({ where: { id: dbAssignment.id } });
    });
  });

  describe("Archived Offering Protection", () => {
    it("ACCEPTANCE: Archived offering rejects all changes server-side", async () => {
      vi.spyOn(sessionModule, "requireRole").mockResolvedValue({
        id: teacherA.id,
        email: teacherA.email,
        name: teacherA.name,
        role: Role.TEACHER,
        mustChangePassword: false,
      });

      // 1. Rejects creation on archived offering
      await expect(
        createAssignmentAction({
          offeringId: archivedOffering.id,
          title: "Archived Attempt",
          deadline: new Date(Date.now() + 86400000),
          maxMarks: 100,
          allowedTypes: ["pdf"],
          maxSizeMb: 10,
          lateAllowed: false,
          latePenaltyPercent: 0,
          published: false,
        })
      ).rejects.toThrow(/archived/i);

      // Create dummy assignment on an unarchived offering to test update/delete on archived offering
      const dummy = await prisma.assignment.create({
        data: {
          offeringId: archivedOffering.id,
          title: "Pre-existing in archive",
          deadline: new Date(Date.now() + 86400000),
          maxMarks: 100,
          allowedTypes: ["pdf"],
          maxSizeMb: 10,
          lateAllowed: false,
          latePenaltyPercent: 0,
          published: false,
          createdById: teacherA.id,
        },
      });

      // 2. Rejects update on archived offering
      await expect(
        updateAssignmentAction({
          assignmentId: dummy.id,
          title: "Renamed Archived",
          deadline: new Date(Date.now() + 86400000),
          maxMarks: 100,
          allowedTypes: ["pdf"],
          maxSizeMb: 10,
          lateAllowed: false,
          latePenaltyPercent: 0,
          published: false,
        })
      ).rejects.toThrow(/archived/i);

      // 3. Rejects deletion on archived offering
      await expect(deleteAssignmentAction(dummy.id)).rejects.toThrow(/archived/i);

      // Clean up
      await prisma.assignment.delete({ where: { id: dummy.id } });
    });
  });

  describe("Student Access & Unpublished Filtering", () => {
    it("ACCEPTANCE: Students never see unpublished assignments", async () => {
      vi.spyOn(sessionModule, "requireRole").mockResolvedValue({
        id: teacherA.id,
        email: teacherA.email,
        name: teacherA.name,
        role: Role.TEACHER,
        mustChangePassword: false,
      });

      // 1. Create a published assignment
      const pubRes = await createAssignmentAction({
        offeringId: offeringA.id,
        title: `Published Assignment ${Date.now()}`,
        deadline: new Date(Date.now() + 2 * 86400000),
        maxMarks: 100,
        allowedTypes: ["pdf"],
        maxSizeMb: 25,
        lateAllowed: true,
        latePenaltyPercent: 5,
        published: true,
      });

      // 2. Create an unpublished draft assignment with an attachment
      const draftRes = await createAssignmentAction({
        offeringId: offeringA.id,
        title: `Draft Assignment ${Date.now()}`,
        deadline: new Date(Date.now() + 3 * 86400000),
        maxMarks: 50,
        allowedTypes: ["zip"],
        maxSizeMb: 10,
        lateAllowed: false,
        latePenaltyPercent: 0,
        published: false,
        attachments: [
          {
            fileKey: `${offeringA.id}/draft-attachment.pdf`,
            originalName: "draft-specs.pdf",
            mime: "application/pdf",
            sizeBytes: 2048,
          },
        ],
      });

      // 3. Query from student's side
      const studentData = await getStudentOfferingAssignmentsData(
        offeringA.id,
        studentA.id
      );

      const studentIds = studentData.assignments.map((a) => a.id);
      expect(studentIds).toContain(pubRes.assignment.id);
      expect(studentIds).not.toContain(draftRes.assignment.id);

      // 4. Student attempts to download draft attachment via route
      const draftAttachment = await prisma.assignmentAttachment.findFirstOrThrow({
        where: { assignmentId: draftRes.assignment.id },
      });

      vi.spyOn(nextAuth, "getServerSession").mockResolvedValue({
        user: {
          id: studentA.id,
          email: studentA.email,
          name: studentA.name,
          role: Role.STUDENT,
        },
      });

      const req = new NextRequest(
        `http://localhost:3000/api/assignments/attachments/${draftAttachment.id}/download`
      );
      const res = await attachmentDownloadRouteHandler(req, {
        params: Promise.resolve({ attachmentId: draftAttachment.id }),
      });

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toMatch(/not published yet/);

      // Clean up
      await prisma.assignmentAttachment.deleteMany({
        where: { assignmentId: draftRes.assignment.id },
      });
      await prisma.assignment.deleteMany({
        where: { id: { in: [pubRes.assignment.id, draftRes.assignment.id] } },
      });
    });
  });

  describe("Notifications, Deadline Changes, and AuditLog", () => {
    it("notifies students on publish and logs DEADLINE_CHANGED on deadline edit", async () => {
      vi.spyOn(sessionModule, "requireRole").mockResolvedValue({
        id: teacherA.id,
        email: teacherA.email,
        name: teacherA.name,
        role: Role.TEACHER,
        mustChangePassword: false,
      });

      const initialDeadline = new Date(Date.now() + 2 * 86400000);

      // 1. Create published assignment
      const createRes = await createAssignmentAction({
        offeringId: offeringA.id,
        title: `Audit Deadline Assignment ${Date.now()}`,
        deadline: initialDeadline,
        maxMarks: 100,
        allowedTypes: ["pdf"],
        maxSizeMb: 10,
        lateAllowed: false,
        latePenaltyPercent: 0,
        published: true,
      });

      // Verify notification created for studentA
      const notif = await prisma.notification.findFirst({
        where: {
          userId: studentA.id,
          type: NotificationType.ACADEMIC,
          title: { contains: "New Assignment" },
        },
      });
      expect(notif).toBeDefined();

      // 2. Extend deadline after publishing
      const extendedDeadline = new Date(Date.now() + 5 * 86400000);
      await updateAssignmentAction({
        assignmentId: createRes.assignment.id,
        title: createRes.assignment.title,
        deadline: extendedDeadline,
        maxMarks: 100,
        allowedTypes: ["pdf"],
        maxSizeMb: 10,
        lateAllowed: false,
        latePenaltyPercent: 0,
        published: true,
      });

      // Verify AuditLog record DEADLINE_CHANGED
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          action: "DEADLINE_CHANGED",
          objectId: createRes.assignment.id,
        },
      });
      expect(auditLog).toBeDefined();
      expect(auditLog?.description).toContain("Deadline for");

      // Verify student received deadline update notification
      const deadlineNotif = await prisma.notification.findFirst({
        where: {
          userId: studentA.id,
          type: NotificationType.ACADEMIC,
          title: { contains: "Assignment Deadline Updated" },
        },
      });
      expect(deadlineNotif).toBeDefined();

      // Clean up
      await prisma.assignment.delete({ where: { id: createRes.assignment.id } });
    });

    it("blocks deletion when student submissions exist and offers unpublishing", async () => {
      vi.spyOn(sessionModule, "requireRole").mockResolvedValue({
        id: teacherA.id,
        email: teacherA.email,
        name: teacherA.name,
        role: Role.TEACHER,
        mustChangePassword: false,
      });

      const assignment = await prisma.assignment.create({
        data: {
          offeringId: offeringA.id,
          title: `Submission Delete Block Test ${Date.now()}`,
          deadline: new Date(Date.now() + 86400000),
          maxMarks: 100,
          allowedTypes: ["pdf"],
          maxSizeMb: 10,
          lateAllowed: false,
          latePenaltyPercent: 0,
          published: true,
          createdById: teacherA.id,
        },
      });

      // Simulate an existing student submission
      await prisma.submission.create({
        data: {
          assignmentId: assignment.id,
          studentId: studentA.id,
          status: "SUBMITTED",
        },
      });

      // Attempt to delete should be blocked
      await expect(deleteAssignmentAction(assignment.id)).rejects.toThrow(
        /Cannot delete.*student submissions exist/
      );

      // Clean up
      await prisma.submission.deleteMany({ where: { assignmentId: assignment.id } });
      await prisma.assignment.delete({ where: { id: assignment.id } });
    });
  });
});
