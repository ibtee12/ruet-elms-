/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { Role, CourseOfferingStatus } from "@prisma/client";
import {
  getStudentDashboardData,
  getStudentOverview,
  getStudentUrgentDeadlines,
  getStudentUpcomingDeadlines,
  getStudentCoursesWithProgress,
  getStudentRecentGrades,
  getTeacherDashboardData,
  getTeacherOfferings,
  getTeacherWaitingForGrading,
  getTeacherUpcomingDeadlines,
  getDeptAdminDashboardData,
  getDeptAdminStats,
  getDeptAdminDraftOfferings,
  getSuperAdminDashboardData,
  getSuperAdminCounts,
  getSuperAdminAuditLogs,
} from "@/services/dashboard";

describe("Step 25: Role Dashboards per Design Guide", () => {
  let studentUser: any;
  let otherStudentUser: any;
  let teacherUserA: any;
  let teacherUserB: any;
  let deptAdminUser: any;
  let superAdminUser: any;

  beforeEach(async () => {
    // 1. Student User 1
    studentUser = await prisma.user.findFirstOrThrow({
      where: { email: "2203001@student.ruet.ac.bd" },
    });

    // 2. Student User 2
    otherStudentUser = await prisma.user.findFirstOrThrow({
      where: { email: "2203002@student.ruet.ac.bd" },
    });

    // 3. Teacher A (CSE dept)
    teacherUserA = await prisma.user.findFirstOrThrow({
      where: { email: "arahman@cse.ruet.ac.bd" },
    });

    // 4. Teacher B
    teacherUserB = await prisma.user.findFirstOrThrow({
      where: { email: "bkarim@cse.ruet.ac.bd" },
    });

    // 5. Dept Admin (CSE dept)
    deptAdminUser = await prisma.user.findFirst({
      where: { role: Role.DEPT_ADMIN },
    });
    if (!deptAdminUser) {
      // If none explicitly marked, find head/admin or teacher in CSE
      deptAdminUser = await prisma.user.findFirstOrThrow({
        where: { teacherProfile: { isNot: null } },
      });
    }

    // 6. Super Admin
    superAdminUser = await prisma.user.findFirstOrThrow({
      where: { role: Role.SUPER_ADMIN },
    });
  });

  describe("Student Dashboard (/dashboard)", () => {
    it("ACCEPTANCE: Student dashboard loads in under 1 second locally", async () => {
      const start = performance.now();
      const data = await getStudentDashboardData(studentUser.id);
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(1000);
      expect(data).toBeDefined();
      expect(data.userName).toBeDefined();
      expect(typeof data.pendingSubmissionsCount).toBe("number");
    });

    it("calculates urgent deadlines (< 24 hours) for unsubmitted assignments", async () => {
      const urgent = await getStudentUrgentDeadlines(studentUser.id);
      expect(Array.isArray(urgent)).toBe(true);

      // Verify each item is in future and <= 24 hours
      const now = new Date();
      const next24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      for (const item of urgent) {
        expect(item.deadline.getTime()).toBeGreaterThan(now.getTime());
        expect(item.deadline.getTime()).toBeLessThanOrEqual(next24h.getTime());
        expect(item.hoursRemaining).toBeGreaterThanOrEqual(1);
        expect(item.hoursRemaining).toBeLessThanOrEqual(24);
      }
    });

    it("returns upcoming deadlines sorted by deadline asc", async () => {
      const upcoming = await getStudentUpcomingDeadlines(studentUser.id);
      expect(Array.isArray(upcoming)).toBe(true);

      for (let i = 0; i < upcoming.length - 1; i++) {
        expect(upcoming[i].deadline.getTime()).toBeLessThanOrEqual(
          upcoming[i + 1].deadline.getTime()
        );
      }
    });

    it("calculates material progress (completed / published) for enrolled courses", async () => {
      const courses = await getStudentCoursesWithProgress(studentUser.id);
      expect(Array.isArray(courses)).toBe(true);

      for (const c of courses) {
        expect(c.offeringId).toBeDefined();
        expect(c.courseCode).toBeDefined();
        expect(c.totalPublishedMaterials).toBeGreaterThanOrEqual(0);
        expect(c.completedMaterials).toBeGreaterThanOrEqual(0);
        expect(c.progressPercent).toBeGreaterThanOrEqual(0);
        expect(c.progressPercent).toBeLessThanOrEqual(100);
      }
    });

    it("returns recent grades with final marks accounting for penalties", async () => {
      const grades = await getStudentRecentGrades(studentUser.id, 5);
      expect(Array.isArray(grades)).toBe(true);

      for (const g of grades) {
        expect(g.rawMarks).toBeGreaterThanOrEqual(0);
        expect(g.finalMarks).toBeLessThanOrEqual(g.maxMarks);
        expect(g.courseCode).toBeDefined();
      }
    });

    it("ACCEPTANCE: A student with no data sees clean empty states, not errors or blank cards", async () => {
      // Create a temporary student user with no enrollments
      const cleanStudent = await prisma.user.create({
        data: {
          email: `empty-student-${Date.now()}@student.ruet.ac.bd`,
          name: "Brand New Student",
          role: Role.STUDENT,
          passwordHash: "hash",
          studentProfile: {
            create: {
              studentId: `9999${Math.floor(Math.random() * 1000)}`,
              batch: "2026",
              level: 1,
              term: 1,
              department: {
                connect: { code: "CSE" },
              },
            },
          },
        },
      });

      try {
        const data = await getStudentDashboardData(cleanStudent.id);
        expect(data.courses).toHaveLength(0);
        expect(data.urgentDeadlines).toHaveLength(0);
        expect(data.upcomingDeadlines).toHaveLength(0);
        expect(data.recentGrades).toHaveLength(0);
        expect(data.pendingSubmissionsCount).toBe(0);
      } finally {
        await prisma.studentProfile.deleteMany({ where: { userId: cleanStudent.id } });
        await prisma.user.delete({ where: { id: cleanStudent.id } });
      }
    });
  });

  describe("Teacher Dashboard (/dashboard)", () => {
    it("ACCEPTANCE: Teacher dashboard loads in under 1 second locally", async () => {
      const start = performance.now();
      const data = await getTeacherDashboardData(teacherUserA.id);
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(1000);
      expect(data).toBeDefined();
      expect(data.userName).toBeDefined();
    });

    it("ACCEPTANCE: Teacher sees only their own offerings", async () => {
      const offeringsA = await getTeacherOfferings(teacherUserA.id);
      const offeringsB = await getTeacherOfferings(teacherUserB.id);

      // Verify Teacher A offerings are assigned to Teacher A in DB
      for (const off of offeringsA) {
        const isAssigned = await prisma.offeringTeacher.findFirst({
          where: {
            offeringId: off.id,
            userId: teacherUserA.id,
          },
        });
        expect(isAssigned).not.toBeNull();
      }

      // Check Teacher B offerings are assigned to Teacher B
      for (const off of offeringsB) {
        const isAssigned = await prisma.offeringTeacher.findFirst({
          where: {
            offeringId: off.id,
            userId: teacherUserB.id,
          },
        });
        expect(isAssigned).not.toBeNull();
      }
    });

    it("retrieves submissions waiting for grading across teacher's offerings", async () => {
      const waiting = await getTeacherWaitingForGrading(teacherUserA.id);
      expect(Array.isArray(waiting)).toBe(true);

      for (const item of waiting) {
        expect(item.ungradedCount).toBeGreaterThan(0);
        expect(item.assignmentTitle).toBeDefined();
      }
    });

    it("returns upcoming deadlines in teacher's assigned courses", async () => {
      const deadlines = await getTeacherUpcomingDeadlines(teacherUserA.id);
      expect(Array.isArray(deadlines)).toBe(true);

      const now = new Date();
      for (const item of deadlines) {
        expect(item.deadline.getTime()).toBeGreaterThan(now.getTime());
      }
    });
  });

  describe("Dept Admin Dashboard (/dept)", () => {
    it("ACCEPTANCE: Dept admin only sees their department's numbers", async () => {
      // Find dept admin's department
      const adminProfile = await prisma.teacherProfile.findFirst({
        where: { userId: deptAdminUser.id },
      });

      if (adminProfile) {
        const stats = await getDeptAdminStats(deptAdminUser.id);
        expect(stats.departmentCode).toBeDefined();
        expect(stats.offeringsByStatus).toBeDefined();
        expect(typeof stats.offeringsByStatus.total).toBe("number");
        expect(typeof stats.teachersCount).toBe("number");
        expect(typeof stats.studentsCount).toBe("number");

        // Verify the count matches DB query for that department only
        const actualOfferingsCount = await prisma.courseOffering.count({
          where: { course: { departmentId: adminProfile.departmentId } },
        });
        expect(stats.offeringsByStatus.total).toBe(actualOfferingsCount);

        const actualTeacherCount = await prisma.teacherProfile.count({
          where: { departmentId: adminProfile.departmentId },
        });
        expect(stats.teachersCount).toBe(actualTeacherCount);
      }
    });

    it("returns DRAFT offerings awaiting publish for dept admin's department", async () => {
      const drafts = await getDeptAdminDraftOfferings(deptAdminUser.id);
      expect(Array.isArray(drafts)).toBe(true);

      for (const d of drafts) {
        const off = await prisma.courseOffering.findUnique({
          where: { id: d.id },
        });
        expect(off?.status).toBe(CourseOfferingStatus.DRAFT);
      }
    });
  });

  describe("Super Admin Dashboard (/admin)", () => {
    it("ACCEPTANCE: Super admin sees global user counts by role and system counts", async () => {
      const data = await getSuperAdminDashboardData();
      expect(data).toBeDefined();

      expect(data.usersByRole.superAdmin).toBeGreaterThanOrEqual(1);
      expect(data.usersByRole.total).toBeGreaterThan(0);
      expect(data.departmentsCount).toBeGreaterThan(0);
      expect(data.coursesCount).toBeGreaterThan(0);
      expect(data.offeringsCount).toBeGreaterThan(0);

      // Verify audit logs are returned with actor info
      expect(Array.isArray(data.recentAuditLogs)).toBe(true);
      if (data.recentAuditLogs.length > 0) {
        const first = data.recentAuditLogs[0];
        expect(first.action).toBeDefined();
        expect(first.actorName).toBeDefined();
        expect(first.actorEmail).toBeDefined();
      }
    });

    it("retrieves up to 10 recent audit entries", async () => {
      const logs = await getSuperAdminAuditLogs(10);
      expect(Array.isArray(logs)).toBe(true);
      expect(logs.length).toBeLessThanOrEqual(10);
    });
  });
});
