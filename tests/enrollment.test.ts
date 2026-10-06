/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { Role, CourseOfferingStatus, OfferingTeacherRole, EnrollmentStatus } from "@prisma/client";
import * as nextAuth from "next-auth/next";
import {
  getRosterAction,
  enrollStudentAction,
  dropEnrollmentAction,
  reenrollAction,
  moveEnrollmentsAction,
  previewEnrollmentAction,
  confirmEnrollmentAction,
  joinByCodeAction,
} from "@/actions/enrollment";
import { assertEnrolled } from "@/lib/auth/guards";
import { ForbiddenError } from "@/lib/auth/errors";
import { joinCodeUserRateLimiter, joinCodeIpRateLimiter, InMemoryRateLimiter } from "@/lib/rate-limiter";

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(
    new Headers({ "x-forwarded-for": "10.0.0.15" })
  ),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("Step 15: Enrollment, Rosters & Self-Join", () => {
  let superAdminUser: any;
  let cseTeacher1: any;
  let cseTeacher2: any;
  let studentUser1: any;
  let studentUser2: any;
  let testOffering: any;
  let sectionA: any;
  let sectionB: any;
  let createdEnrollmentIds: string[] = [];
  let createdOfferingIds: string[] = [];

  beforeEach(async () => {
    // Reset rate limiters for test isolation
    if (joinCodeUserRateLimiter instanceof InMemoryRateLimiter) {
      joinCodeUserRateLimiter.clear();
    }
    if (joinCodeIpRateLimiter instanceof InMemoryRateLimiter) {
      joinCodeIpRateLimiter.clear();
    }

    superAdminUser = await prisma.user.findFirstOrThrow({
      where: { email: "admin@ruet.ac.bd" },
    });
    cseTeacher1 = await prisma.user.findFirstOrThrow({
      where: { email: "arahman@cse.ruet.ac.bd" },
    });
    cseTeacher2 = await prisma.user.findFirstOrThrow({
      where: { email: "bkarim@cse.ruet.ac.bd" },
    });
    studentUser1 = await prisma.user.findFirstOrThrow({
      where: { email: "2203001@student.ruet.ac.bd" },
    });
    studentUser2 = await prisma.user.findFirstOrThrow({
      where: { email: "2203002@student.ruet.ac.bd" },
    });

    // Create a dedicated test course offering
    const cseCourse = await prisma.course.findFirstOrThrow({
      where: { code: "CSE 3200" },
    });

    testOffering = await prisma.courseOffering.create({
      data: {
        courseId: cseCourse.id,
        term: "Even Term",
        academicYear: "2026",
        status: CourseOfferingStatus.PUBLISHED,
        joinCode: "TEST-JOIN-2026",
        joinRequiresDeptMatch: true,
        sections: {
          create: [{ name: "Section A" }, { name: "Section B" }],
        },
        offeringTeachers: {
          create: [
            {
              userId: cseTeacher1.id,
              role: OfferingTeacherRole.INSTRUCTOR,
            },
          ],
        },
      },
      include: {
        sections: true,
      },
    });
    createdOfferingIds.push(testOffering.id);

    sectionA = testOffering.sections.find((s: any) => s.name === "Section A");
    sectionB = testOffering.sections.find((s: any) => s.name === "Section B");

    // Default mock as Super Admin
    vi.spyOn(nextAuth, "getServerSession").mockResolvedValue({
      user: {
        id: superAdminUser.id,
        email: superAdminUser.email,
        name: superAdminUser.name,
        role: Role.SUPER_ADMIN,
        mustChangePassword: false,
      },
      expires: "2099-01-01",
    });
  });

  afterEach(async () => {
    // Clean up enrollments and offerings
    if (createdEnrollmentIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: { objectId: { in: createdEnrollmentIds } },
      });
      await prisma.enrollment.deleteMany({
        where: { id: { in: createdEnrollmentIds } },
      });
      createdEnrollmentIds = [];
    }

    if (createdOfferingIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: { objectId: { in: createdOfferingIds } },
      });
      await prisma.enrollment.deleteMany({
        where: { section: { offeringId: { in: createdOfferingIds } } },
      });
      await prisma.offeringTeacher.deleteMany({
        where: { offeringId: { in: createdOfferingIds } },
      });
      await prisma.section.deleteMany({
        where: { offeringId: { in: createdOfferingIds } },
      });
      await prisma.courseOffering.deleteMany({
        where: { id: { in: createdOfferingIds } },
      });
      createdOfferingIds = [];
    }
  });

  it("Acceptance 1: Duplicate enrollment is blocked with a friendly message", async () => {
    // 1. Enroll studentUser1 in Section A
    const res1 = await enrollStudentAction(testOffering.id, studentUser1.id, sectionA.id);
    expect(res1.success).toBe(true);
    if (res1.success) createdEnrollmentIds.push(res1.enrollmentId);

    // 2. Attempt duplicate enrollment in the same section
    const resDuplicate = await enrollStudentAction(testOffering.id, studentUser1.id, sectionA.id);
    expect(resDuplicate.success).toBe(false);
    expect(resDuplicate.error).toContain("already enrolled in Section A");

    // 3. Attempt enrolling in Section B of the same offering
    const resOtherSection = await enrollStudentAction(testOffering.id, studentUser1.id, sectionB.id);
    expect(resOtherSection.success).toBe(false);
    expect(resOtherSection.error).toContain("already enrolled in Section A");
  });

  it("Acceptance 2: Dropped student loses access to offering but past data survives, and can be re-enrolled", async () => {
    // 1. Enroll student
    const enrollRes = await enrollStudentAction(testOffering.id, studentUser1.id, sectionA.id);
    expect(enrollRes.success).toBe(true);
    if (!enrollRes.success) return;
    const enrollmentId = enrollRes.enrollmentId;
    createdEnrollmentIds.push(enrollmentId);

    // 2. Verify active enrollment allows access
    const activeCheck = await assertEnrolled(studentUser1.id, testOffering.id);
    expect(activeCheck.status).toBe("ACTIVE");

    // 3. Drop student
    const dropRes = await dropEnrollmentAction(enrollmentId);
    expect(dropRes.success).toBe(true);

    // 4. Verify enrollment record STILL exists in database (not deleted), but has status DROPPED
    const dbRecord = await prisma.enrollment.findUnique({
      where: { id: enrollmentId },
    });
    expect(dbRecord).not.toBeNull();
    expect(dbRecord?.status).toBe(EnrollmentStatus.DROPPED);

    // 5. Verify dropped student loses access via assertEnrolled guard
    await expect(assertEnrolled(studentUser1.id, testOffering.id)).rejects.toThrow(
      ForbiddenError
    );

    // 6. Verify dropped student can be re-enrolled
    const reenrollRes = await reenrollAction(enrollmentId);
    expect(reenrollRes.success).toBe(true);

    // 7. Verify student has regained active access
    const restoredCheck = await assertEnrolled(studentUser1.id, testOffering.id);
    expect(restoredCheck.status).toBe("ACTIVE");
  });

  it("Acceptance 3: Teacher of another offering cannot view or edit this roster", async () => {
    // Mock session as cseTeacher2 (who is NOT assigned to testOffering)
    vi.spyOn(nextAuth, "getServerSession").mockResolvedValue({
      user: {
        id: cseTeacher2.id,
        email: cseTeacher2.email,
        name: cseTeacher2.name,
        role: Role.TEACHER,
        mustChangePassword: false,
      },
      expires: "2099-01-01",
    });

    // 1. Attempt reading roster should throw ForbiddenError
    await expect(getRosterAction(testOffering.id)).rejects.toThrow(ForbiddenError);

    // 2. Attempt enrolling student should return forbidden failure
    const enrollAttempt = await enrollStudentAction(testOffering.id, studentUser1.id, sectionA.id);
    expect(enrollAttempt.success).toBe(false);
    expect(enrollAttempt.error).toContain("not assigned");

    // 3. Attempt previewing bulk enrollment should return forbidden failure
    const previewAttempt = await previewEnrollmentAction(testOffering.id, "2203001", sectionA.id);
    expect(previewAttempt.success).toBe(false);
    expect(previewAttempt.error).toContain("not assigned");

    // 4. Switch session to cseTeacher1 (who IS assigned as INSTRUCTOR)
    vi.spyOn(nextAuth, "getServerSession").mockResolvedValue({
      user: {
        id: cseTeacher1.id,
        email: cseTeacher1.email,
        name: cseTeacher1.name,
        role: Role.TEACHER,
        mustChangePassword: false,
      },
      expires: "2099-01-01",
    });

    // cseTeacher1 CAN access the roster
    const rosterData = await getRosterAction(testOffering.id);
    expect(rosterData.offeringId).toBe(testOffering.id);
    expect(rosterData.canManage).toBe(true);
  });

  it("Acceptance 4: Wrong join code gives a generic error and is rate-limited", async () => {
    // Mock student session
    vi.spyOn(nextAuth, "getServerSession").mockResolvedValue({
      user: {
        id: studentUser1.id,
        email: studentUser1.email,
        name: studentUser1.name,
        role: Role.STUDENT,
        mustChangePassword: false,
      },
      expires: "2099-01-01",
    });

    // Attempts 1 to 5 with wrong code
    for (let i = 1; i <= 5; i++) {
      const res = await joinByCodeAction("BAD-CODE-999");
      expect(res.success).toBe(false);
      expect(res.error).toBe("That join code is not valid. Check the code and try again.");
    }

    // Attempt 6 should be rate limited!
    const rateLimitedRes = await joinByCodeAction("TEST-JOIN-2026");
    expect(rateLimitedRes.success).toBe(false);
    expect(rateLimitedRes.code).toBe("RATE_LIMITED");
    expect(rateLimitedRes.error).toContain("Too many incorrect join codes");
  });

  it("Scenario 5: Valid join code successfully enrolls student and logs JOINED_BY_CODE", async () => {
    // Mock studentUser2 session
    vi.spyOn(nextAuth, "getServerSession").mockResolvedValue({
      user: {
        id: studentUser2.id,
        email: studentUser2.email,
        name: studentUser2.name,
        role: Role.STUDENT,
        mustChangePassword: false,
      },
      expires: "2099-01-01",
    });

    const joinRes = await joinByCodeAction("TEST-JOIN-2026");
    expect(joinRes.success).toBe(true);
    if (!joinRes.success) return;

    expect(joinRes.offeringId).toBe(testOffering.id);
    expect(joinRes.sectionName).toBe("Section A");

    // Verify AuditLog was created
    const auditLog = await prisma.auditLog.findFirst({
      where: {
        action: "JOINED_BY_CODE",
        userId: studentUser2.id,
      },
      orderBy: { createdAt: "desc" },
    });
    expect(auditLog).not.toBeNull();
    expect(auditLog?.description).toContain("Joined CSE 3200");
  });

  it("Scenario 6: Bulk move students between sections in transaction", async () => {
    // Enroll both students in Section A
    const r1 = await enrollStudentAction(testOffering.id, studentUser1.id, sectionA.id);
    const r2 = await enrollStudentAction(testOffering.id, studentUser2.id, sectionA.id);
    expect(r1.success).toBe(true);
    expect(r2.success).toBe(true);
    if (!r1.success || !r2.success) return;

    createdEnrollmentIds.push(r1.enrollmentId, r2.enrollmentId);

    // Bulk move both students to Section B
    const moveRes = await moveEnrollmentsAction(
      testOffering.id,
      [r1.enrollmentId, r2.enrollmentId],
      sectionB.id
    );
    expect(moveRes.success).toBe(true);
    if (!moveRes.success) return;
    expect(moveRes.moved).toBe(2);

    // Verify both students now belong to Section B
    const updated = await prisma.enrollment.findMany({
      where: { id: { in: [r1.enrollmentId, r2.enrollmentId] } },
    });
    expect(updated.every((e) => e.sectionId === sectionB.id)).toBe(true);
  });
});
