import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { Role, RiskLevel } from "@prisma/client";
import {
  getTeacherOfferingAnalytics,
  generateAtRiskCsv,
  getDeptAnalyticsSummary,
} from "@/services/teacher-analytics";
import { assertAnalyticsAccess } from "@/lib/auth/guards";
import { ForbiddenError } from "@/lib/auth/errors";
import { GET as exportCsvRoute } from "@/app/api/teach/[offeringId]/analytics/export/route";
import { NextRequest } from "next/server";

describe("Step 34: Teacher Analytics & Class Telemetry", () => {
  let testOfferingId: string;
  let testDeptId: string;
  let assignedTeacher: { id: string; role: Role };
  let otherTeacher: { id: string; role: Role };
  let deptAdmin: { id: string; role: Role };
  let otherDeptAdmin: { id: string; role: Role };
  let studentUser: { id: string; role: Role };

  beforeEach(async () => {
    // 1. Locate published course offering with assigned teacher and enrollments
    const offering = await prisma.courseOffering.findFirst({
      where: {
        status: "PUBLISHED",
        offeringTeachers: { some: {} },
        sections: { some: { enrollments: { some: { status: "ACTIVE" } } } },
      },
      include: {
        course: { select: { departmentId: true } },
        offeringTeachers: { select: { userId: true, role: true } },
        sections: {
          include: {
            enrollments: {
              where: { status: "ACTIVE" },
              select: { studentId: true },
            },
          },
        },
      },
    });

    if (!offering || !offering.offeringTeachers[0] || !offering.sections[0]?.enrollments[0]) {
      throw new Error("Missing seeded course offering with teacher and enrolled students.");
    }

    testOfferingId = offering.id;
    testDeptId = offering.course.departmentId;

    assignedTeacher = {
      id: offering.offeringTeachers[0].userId,
      role: Role.TEACHER,
    };

    // 2. Find teacher of ANOTHER offering
    const unassigned = await prisma.user.findFirst({
      where: {
        role: Role.TEACHER,
        id: { notIn: offering.offeringTeachers.map((ot) => ot.userId) },
      },
    });
    if (!unassigned) throw new Error("Missing other teacher user.");
    otherTeacher = { id: unassigned.id, role: Role.TEACHER };

    // 3. Find dept admin for this department
    const admin = await prisma.user.findFirst({
      where: {
        role: Role.DEPT_ADMIN,
        teacherProfile: { departmentId: testDeptId },
      },
    });
    if (!admin) throw new Error("Missing department admin for test department.");
    deptAdmin = { id: admin.id, role: Role.DEPT_ADMIN };

    // 4. Find dept admin of DIFFERENT department
    const otherAdmin = await prisma.user.findFirst({
      where: {
        role: Role.DEPT_ADMIN,
        teacherProfile: { departmentId: { not: testDeptId } },
      },
    });
    if (otherAdmin) {
      otherDeptAdmin = { id: otherAdmin.id, role: Role.DEPT_ADMIN };
    }

    // 5. Enrolled student user
    studentUser = {
      id: offering.sections[0].enrollments[0].studentId,
      role: Role.STUDENT,
    };
  });

  describe("Access Control & Security (403 Forbidden)", () => {
    it("rejects students with 403 Forbidden", async () => {
      await expect(
        getTeacherOfferingAnalytics(testOfferingId, studentUser)
      ).rejects.toThrow(ForbiddenError);

      await expect(
        assertAnalyticsAccess(studentUser, testOfferingId)
      ).rejects.toThrow(ForbiddenError);
    });

    it("rejects teachers of another offering with 403 Forbidden", async () => {
      await expect(
        getTeacherOfferingAnalytics(testOfferingId, otherTeacher)
      ).rejects.toThrow(ForbiddenError);

      await expect(
        assertAnalyticsAccess(otherTeacher, testOfferingId)
      ).rejects.toThrow(ForbiddenError);
    });

    if (otherDeptAdmin) {
      it("rejects department admins of another department with 403 Forbidden", async () => {
        await expect(
          getTeacherOfferingAnalytics(testOfferingId, otherDeptAdmin)
        ).rejects.toThrow(ForbiddenError);

        await expect(
          assertAnalyticsAccess(otherDeptAdmin, testOfferingId)
        ).rejects.toThrow(ForbiddenError);
      });
    }

    it("allows assigned instructor/TA to access teacher analytics", async () => {
      const data = await getTeacherOfferingAnalytics(testOfferingId, assignedTeacher);
      expect(data).toBeDefined();
      expect(data.offeringId).toBe(testOfferingId);
      expect(data.stats.enrolledStudents).toBeGreaterThan(0);
    });

    it("allows the department admin of that department to access teacher analytics", async () => {
      const data = await getTeacherOfferingAnalytics(testOfferingId, deptAdmin);
      expect(data).toBeDefined();
      expect(data.offeringId).toBe(testOfferingId);
    });

    it("assertAnalyticsAccess throws 403 Forbidden for students and unassigned teachers", async () => {
      await expect(
        assertAnalyticsAccess(studentUser, testOfferingId)
      ).rejects.toThrow(ForbiddenError);

      await expect(
        assertAnalyticsAccess(otherTeacher, testOfferingId)
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe("Analytics Numbers & Seed Data Calculations", () => {
    it("numbers accurately match database counts for the course offering", async () => {
      const data = await getTeacherOfferingAnalytics(testOfferingId, assignedTeacher);

      // 1. Enrolled students count matches active enrollments
      const actualEnrollments = await prisma.enrollment.count({
        where: {
          section: { offeringId: testOfferingId },
          status: "ACTIVE",
        },
      });
      expect(data.stats.enrolledStudents).toBe(actualEnrollments);
      expect(data.students.length).toBe(actualEnrollments);

      // 2. At-risk sum matches high + medium counts
      expect(data.stats.atRiskCount).toBe(
        data.stats.highRiskCount + data.stats.mediumRiskCount
      );

      // 3. Grade distribution brackets sum to total enrolled students
      const totalInBrackets = data.gradeDistribution.reduce(
        (sum, b) => sum + b.count,
        0
      );
      expect(totalInBrackets).toBe(actualEnrollments);

      // 4. Submission rates match published assignments
      const publishedAssignmentCount = await prisma.assignment.count({
        where: { offeringId: testOfferingId, published: true },
      });
      expect(data.assignmentSubmissionRates.length).toBe(publishedAssignmentCount);
    });

    it("a student with no data is never flagged HIGH (safe default: LOW)", async () => {
      const data = await getTeacherOfferingAnalytics(testOfferingId, assignedTeacher);

      for (const st of data.students) {
        if (st.riskScore === 0) {
          expect(st.riskLevel).toBe(RiskLevel.LOW);
        }
      }
    });

    it("topic performance is sorted worst to best (ascending by class average)", async () => {
      const data = await getTeacherOfferingAnalytics(testOfferingId, assignedTeacher);

      if (data.topicPerformance.length >= 2) {
        for (let i = 0; i < data.topicPerformance.length - 1; i++) {
          expect(
            data.topicPerformance[i].classAveragePercent
          ).toBeLessThanOrEqual(
            data.topicPerformance[i + 1].classAveragePercent
          );
        }
        expect(data.hardestTopic?.topicId).toBe(data.topicPerformance[0].topicId);
      }
    });
  });

  describe("Empty State for Offerings with No Enrolled Students", () => {
    it("handles offerings with 0 enrolled students cleanly without throwing errors", async () => {
      // Find or create an offering with 0 enrollments
      const emptyOffering = await prisma.courseOffering.findFirst({
        where: {
          sections: {
            none: { enrollments: { some: {} } },
          },
        },
      });

      if (emptyOffering) {
        const superAdmin = { id: "admin-test-id", role: Role.SUPER_ADMIN };
        const data = await getTeacherOfferingAnalytics(emptyOffering.id, superAdmin);

        expect(data.stats.enrolledStudents).toBe(0);
        expect(data.stats.averageProgress).toBe(0);
        expect(data.stats.atRiskCount).toBe(0);
        expect(data.students).toEqual([]);
        expect(data.gradeDistribution.reduce((s, b) => s + b.count, 0)).toBe(0);
      }
    });
  });

  describe("CSV Report Generation", () => {
    it("generates well-formed CSV with required headers, BOM, and formula sanitization", () => {
      const sampleStudents = [
        {
          studentId: "s1",
          name: "Nahyan Khan",
          email: "nahyan@example.com",
          roll: "2003001",
          sectionName: "Section A",
          riskLevel: RiskLevel.HIGH,
          riskScore: 70,
          progress: 35.5,
          lastActive: new Date("2026-10-10"),
          reasons: ["3 late submissions", "no activity for 8 days"],
        },
        {
          studentId: "s2",
          name: "=SUM(1,2)", // Formula injection test
          email: "student2@example.com",
          roll: "2003002",
          sectionName: "Section B",
          riskLevel: RiskLevel.LOW,
          riskScore: 0,
          progress: 88.0,
          lastActive: null,
          reasons: [],
        },
      ];

      const csv = generateAtRiskCsv(
        {
          code: "CSE 3100",
          title: "Web Development",
          term: "Even",
          academicYear: "2026",
        },
        sampleStudents
      );

      // Verify UTF-8 BOM
      expect(csv.startsWith("\uFEFF")).toBe(true);

      // Verify headers
      expect(csv).toContain("Student ID / Roll");
      expect(csv).toContain("Attention Reasons");
      expect(csv).toContain("Risk Level");

      // Verify data rows
      expect(csv).toContain("Nahyan Khan");
      expect(csv).toContain("HIGH");
      expect(csv).toContain("3 late submissions; no activity for 8 days");

      // Verify formula sanitization (leading = escaped with single quote)
      expect(csv).toContain("\"'=SUM(1,2)\"");
    });
  });

  describe("Department Analytics Summary (/dept/stats)", () => {
    it("generates department stats with course counts and protects student privacy", async () => {
      const summary = await getDeptAnalyticsSummary(testDeptId, deptAdmin);

      expect(summary.departmentId).toBe(testDeptId);
      expect(summary.totalCourses).toBeGreaterThanOrEqual(1);
      expect(typeof summary.totalStudents).toBe("number");
      expect(typeof summary.overallAverageProgress).toBe("number");
      expect(Array.isArray(summary.courses)).toBe(true);

      if (summary.courses.length > 0) {
        const c = summary.courses[0];
        expect(c).toHaveProperty("courseCode");
        expect(c).toHaveProperty("enrolledStudents");
        expect(c).toHaveProperty("highRiskCount");
        expect(c).toHaveProperty("mediumRiskCount");
        expect(c).toHaveProperty("averageProgress");

        // Verify privacy: No student names in department summary
        const summaryStr = JSON.stringify(summary);
        expect(summaryStr).not.toContain("studentName");
        expect(summaryStr).not.toContain("studentEmail");
      }
    });
  });
});
