/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { Role, CourseOfferingStatus, NotificationType } from "@prisma/client";
import { sanitizeHtml } from "@/lib/sanitize";
import {
  createOfferingAnnouncementAction,
  createDepartmentAnnouncementAction,
  updateAnnouncementAction,
  deleteAnnouncementAction,
  updateOfferingOverviewAction,
} from "@/actions/announcements";
import { getOfferingOverviewData } from "@/services/announcements";
import { ForbiddenError } from "@/lib/auth/errors";
import * as sessionModule from "@/lib/auth/session";
import { vi } from "vitest";

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(
    new Headers({ "x-forwarded-for": "10.0.0.1" })
  ),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("Step 17: Overview & Announcements", () => {
  let studentUser: any;
  let teacherA: any;
  let teacherB: any;
  let cseDeptAdmin: any;
  let cseDept: any;
  let eeeDept: any;
  let publishedOffering: any;
  let archivedOffering: any;

  beforeEach(async () => {
    studentUser = await prisma.user.findFirstOrThrow({
      where: { email: "2203001@student.ruet.ac.bd" },
    });

    teacherA = await prisma.user.findFirstOrThrow({
      where: { email: "arahman@cse.ruet.ac.bd" },
    });

    teacherB = await prisma.user.findFirstOrThrow({
      where: { email: "bkarim@cse.ruet.ac.bd" },
    });

    cseDeptAdmin = await prisma.user.findFirstOrThrow({
      where: { email: "deptadmin.cse@ruet.ac.bd" },
    });

    cseDept = await prisma.department.findUniqueOrThrow({
      where: { code: "CSE" },
    });

    eeeDept = await prisma.department.findUniqueOrThrow({
      where: { code: "EEE" },
    });

    // Find a published offering where teacherA is assigned and student is enrolled
    publishedOffering = await prisma.courseOffering.findFirstOrThrow({
      where: {
        status: CourseOfferingStatus.PUBLISHED,
        offeringTeachers: { some: { userId: teacherA.id } },
      },
      include: { course: true },
    });

    // Find or create an archived offering for testing
    let archived = await prisma.courseOffering.findFirst({
      where: { status: CourseOfferingStatus.ARCHIVED },
      include: { course: true },
    });

    if (!archived) {
      archived = await prisma.courseOffering.create({
        data: {
          courseId: publishedOffering.courseId,
          term: "Spring",
          academicYear: "2024",
          status: CourseOfferingStatus.ARCHIVED,
          syllabus: "Archived syllabus content",
          offeringTeachers: {
            create: {
              userId: teacherA.id,
              role: "INSTRUCTOR",
            },
          },
        },
        include: { course: true },
      });
    }

    archivedOffering = archived;
  });

  describe("Acceptance 1: Rich Text Sanitization", () => {
    it("ACCEPTANCE: Script content like <script> is not rendered or stored", () => {
      const maliciousPayload = '<p>Normal text</p><script>alert("XSS")</script><b>Bold text</b>';
      const sanitized = sanitizeHtml(maliciousPayload);

      expect(sanitized).not.toContain("<script>");
      expect(sanitized).not.toContain("alert");
      expect(sanitized).toContain("<p>Normal text</p>");
      expect(sanitized).toContain("<b>Bold text</b>");
    });

    it("strips event handlers and javascript: URLs", () => {
      const dangerousPayload =
        '<a href="javascript:alert(1)" onclick="stealCookies()">Click me</a><img src="x" onerror="alert(2)" />';
      const sanitized = sanitizeHtml(dangerousPayload);

      expect(sanitized).not.toContain("javascript:");
      expect(sanitized).not.toContain("onclick");
      expect(sanitized).not.toContain("onerror");
      expect(sanitized).not.toContain("stealCookies");
    });
  });

  describe("Acceptance 2: Student Cannot Post Announcements", () => {
    it("ACCEPTANCE: Student is rejected on server action when trying to create an offering announcement", async () => {
      vi.spyOn(sessionModule, "requireRole").mockImplementation(async () => {
        throw new ForbiddenError("Access denied. Role 'STUDENT' is not authorized.");
      });

      await expect(
        createOfferingAnnouncementAction(publishedOffering.id, {
          title: "Student Post Attempt",
          body: "Trying to post as student",
        })
      ).rejects.toThrow(ForbiddenError);
    });

    it("ACCEPTANCE: Student is rejected on server action when trying to create a department announcement", async () => {
      vi.spyOn(sessionModule, "requireRole").mockImplementation(async () => {
        throw new ForbiddenError("Access denied. Role 'STUDENT' is not authorized.");
      });

      await expect(
        createDepartmentAnnouncementAction(cseDept.id, {
          title: "Student Dept Post Attempt",
          body: "Trying to post as student to department",
        })
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe("Acceptance 3: Dept Admin Can Only Post to Their Own Department", () => {
    it("ACCEPTANCE: Dept admin can post to their own department", async () => {
      vi.spyOn(sessionModule, "requireRole").mockResolvedValue({
        id: cseDeptAdmin.id,
        email: cseDeptAdmin.email,
        name: cseDeptAdmin.name,
        role: Role.DEPT_ADMIN,
        mustChangePassword: false,
      });

      const res = await createDepartmentAnnouncementAction(cseDept.id, {
        title: "Test CSE Notice",
        body: "<p>Important notice for CSE students.</p>",
      });

      expect(res.success).toBe(true);
      expect(res.announcement.departmentId).toBe(cseDept.id);

      // Clean up
      await prisma.announcement.delete({ where: { id: res.announcement.id } });
      await prisma.auditLog.deleteMany({
        where: { objectId: res.announcement.id },
      });
    });

    it("ACCEPTANCE: Dept admin CANNOT post to another department", async () => {
      vi.spyOn(sessionModule, "requireRole").mockResolvedValue({
        id: cseDeptAdmin.id,
        email: cseDeptAdmin.email,
        name: cseDeptAdmin.name,
        role: Role.DEPT_ADMIN,
        mustChangePassword: false,
      });

      await expect(
        createDepartmentAnnouncementAction(eeeDept.id, {
          title: "Cross Dept Post",
          body: "Trying to post to EEE as CSE admin",
        })
      ).rejects.toThrow(/Department Administrators are only authorized to manage their own department/);
    });
  });

  describe("Acceptance 4: Archived Offerings Reject Announcement Changes", () => {
    it("ACCEPTANCE: Rejects creating announcement on ARCHIVED offering", async () => {
      vi.spyOn(sessionModule, "requireRole").mockResolvedValue({
        id: teacherA.id,
        email: teacherA.email,
        name: teacherA.name,
        role: Role.TEACHER,
        mustChangePassword: false,
      });

      await expect(
        createOfferingAnnouncementAction(archivedOffering.id, {
          title: "Archived Offering Post",
          body: "This should be rejected",
        })
      ).rejects.toThrow(/ARCHIVED and read-only/);
    });

    it("ACCEPTANCE: Rejects updating description and syllabus on ARCHIVED offering", async () => {
      vi.spyOn(sessionModule, "requireRole").mockResolvedValue({
        id: teacherA.id,
        email: teacherA.email,
        name: teacherA.name,
        role: Role.TEACHER,
        mustChangePassword: false,
      });

      await expect(
        updateOfferingOverviewAction({
          offeringId: archivedOffering.id,
          syllabus: "New Syllabus on Archived",
        })
      ).rejects.toThrow(/ARCHIVED and read-only/);
    });
  });

  describe("Teacher Flow: Announcement & Notification Helper", () => {
    it("creates offering announcement and bulk notifications for enrolled students when notifyStudents is true", async () => {
      vi.spyOn(sessionModule, "requireRole").mockResolvedValue({
        id: teacherA.id,
        email: teacherA.email,
        name: teacherA.name,
        role: Role.TEACHER,
        mustChangePassword: false,
      });

      const res = await createOfferingAnnouncementAction(publishedOffering.id, {
        title: "Upcoming Quiz Announcement",
        body: "<p>Quiz will be held on Monday.</p>",
        notifyStudents: true,
      });

      expect(res.success).toBe(true);

      // Verify notification created
      const notifs = await prisma.notification.findMany({
        where: {
          title: `New Announcement: ${publishedOffering.course.code}`,
        },
      });
      expect(notifs.length).toBeGreaterThan(0);
      expect(notifs[0].type).toBe(NotificationType.GENERAL);

      // Clean up announcement, notifications, and audit log
      await prisma.notification.deleteMany({
        where: { title: `New Announcement: ${publishedOffering.course.code}` },
      });
      await prisma.announcement.delete({ where: { id: res.announcement.id } });
      await prisma.auditLog.deleteMany({
        where: { objectId: res.announcement.id },
      });
    });

    it("allows teacher to update course description and syllabus on active offering", async () => {
      vi.spyOn(sessionModule, "requireRole").mockResolvedValue({
        id: teacherA.id,
        email: teacherA.email,
        name: teacherA.name,
        role: Role.TEACHER,
        mustChangePassword: false,
      });

      const newSyllabus = "Updated Syllabus: Advanced SQL and Transactions.";
      const res = await updateOfferingOverviewAction({
        offeringId: publishedOffering.id,
        syllabus: newSyllabus,
      });

      expect(res.success).toBe(true);

      const updated = await prisma.courseOffering.findUniqueOrThrow({
        where: { id: publishedOffering.id },
      });
      expect(updated.syllabus).toBe(newSyllabus);
    });

    it("loads rich overview data with teachers, designations, key counts, and latest announcements", async () => {
      const data = await getOfferingOverviewData(publishedOffering.id, {
        id: studentUser.id,
        role: Role.STUDENT,
      });

      expect(data).toBeDefined();
      expect(data.code).toBe(publishedOffering.course.code);
      expect(data.teachers.length).toBeGreaterThan(0);
      expect(data.teachers[0].designation).toBeDefined();
      expect(data.counts.sections).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(data.announcements)).toBe(true);
    });
  });
});
