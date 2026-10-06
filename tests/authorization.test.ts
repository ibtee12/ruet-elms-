/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  assertOfferingTeacher,
  assertEnrolled,
  assertDeptAccess,
  canViewOffering,
  offeringsVisibleTo,
  requireRole,
  ForbiddenError,
} from "@/lib/auth";
import { Role } from "@prisma/client";
import { middleware } from "@/middleware";
import { NextRequest } from "next/server";
import * as nextAuthJwt from "next-auth/jwt";
import * as nextAuth from "next-auth/next";

describe("Authorization Layer & Security Guards", () => {
  let studentUser: any;
  let teacherA: any;
  let teacherB: any;
  let taUser: any;
  let cseDeptAdmin: any;
  let eeeDeptAdmin: any;
  let superAdmin: any;
  let cseDept: any;
  let eeeDept: any;
  let cseOfferingWithTA: any;
  let cseOfferingB: any;
  let eeeOffering: any;
  let draftOffering: any;

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
    taUser = await prisma.user.findFirstOrThrow({
      where: { email: "csultana@cse.ruet.ac.bd" },
    });
    cseDeptAdmin = await prisma.user.findFirstOrThrow({
      where: { email: "deptadmin.cse@ruet.ac.bd" },
    });
    eeeDeptAdmin = await prisma.user.findFirstOrThrow({
      where: { email: "deptadmin.eee@ruet.ac.bd" },
    });
    superAdmin = await prisma.user.findFirstOrThrow({
      where: { email: "admin@ruet.ac.bd" },
    });

    cseDept = await prisma.department.findUniqueOrThrow({
      where: { code: "CSE" },
    });
    eeeDept = await prisma.department.findUniqueOrThrow({
      where: { code: "EEE" },
    });

    // Offering with Teacher A (Instructor) and TA (TA)
    cseOfferingWithTA = await prisma.courseOffering.findFirstOrThrow({
      where: {
        offeringTeachers: {
          some: { userId: teacherA.id, role: "INSTRUCTOR" },
        },
        AND: {
          offeringTeachers: {
            some: { userId: taUser.id, role: "TA" },
          },
        },
      },
    });

    // Offering with Teacher B (Instructor)
    cseOfferingB = await prisma.courseOffering.findFirstOrThrow({
      where: {
        offeringTeachers: {
          some: { userId: teacherB.id, role: "INSTRUCTOR" },
        },
      },
    });

    // EEE Offering (where student is not enrolled)
    eeeOffering = await prisma.courseOffering.findFirstOrThrow({
      where: {
        status: "PUBLISHED",
        course: { departmentId: eeeDept.id },
      },
    });

    // Draft Offering
    draftOffering = await prisma.courseOffering.findFirstOrThrow({
      where: { status: "DRAFT" },
    });
  });

  it("Scenario 1: Student cannot access a teacher route (Middleware & requireRole)", async () => {
    // 1. Guard check via requireRole
    vi.spyOn(nextAuth, "getServerSession").mockResolvedValue({
      user: {
        id: studentUser.id,
        email: studentUser.email,
        name: studentUser.name,
        role: Role.STUDENT,
        mustChangePassword: false,
      },
      expires: "2099-01-01",
    });

    await expect(requireRole(Role.TEACHER)).rejects.toThrow(ForbiddenError);

    // 2. Middleware route guard check
    vi.spyOn(nextAuthJwt, "getToken").mockResolvedValue({
      id: studentUser.id,
      role: Role.STUDENT,
      mustChangePassword: false,
    } as nextAuthJwt.JWT);

    const req = new NextRequest("http://localhost:3000/teach/offerings");
    const res = await middleware(req);

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/forbidden");
  });

  it("Scenario 2: Teacher A cannot access Teacher B's offering (assertOfferingTeacher)", async () => {
    // Teacher B can access offering B
    const teacherBCheck = await assertOfferingTeacher(
      teacherB.id,
      cseOfferingB.id
    );
    expect(teacherBCheck).toBeDefined();

    // Teacher A CANNOT access offering B
    await expect(
      assertOfferingTeacher(teacherA.id, cseOfferingB.id)
    ).rejects.toThrow(/not assigned as an instructor or TA/);
  });

  it("Scenario 3: Student not enrolled cannot read an offering (assertEnrolled & canViewOffering)", async () => {
    // Student is not enrolled in the EEE offering
    await expect(
      assertEnrolled(studentUser.id, eeeOffering.id)
    ).rejects.toThrow(/not have an active enrollment/);

    const canView = await canViewOffering(
      { id: studentUser.id, role: Role.STUDENT },
      eeeOffering.id
    );
    expect(canView).toBe(false);
  });

  it("Scenario 4: Dept admin cannot touch another department (assertDeptAccess)", async () => {
    // CSE Admin CAN manage CSE department
    const cseAccess = await assertDeptAccess(cseDeptAdmin.id, cseDept.id);
    expect(cseAccess.authorized).toBe(true);

    // CSE Admin CANNOT manage EEE department
    await expect(
      assertDeptAccess(cseDeptAdmin.id, eeeDept.id)
    ).rejects.toThrow(
      "Department Administrators are only authorized to manage their own department."
    );

    // EEE Admin CAN manage EEE department
    const eeeAccess = await assertDeptAccess(eeeDeptAdmin.id, eeeDept.id);
    expect(eeeAccess.authorized).toBe(true);

    // Super Admin CAN manage ANY department
    const superAccessCSE = await assertDeptAccess(superAdmin.id, cseDept.id);
    const superAccessEEE = await assertDeptAccess(superAdmin.id, eeeDept.id);
    expect(superAccessCSE.authorized).toBe(true);
    expect(superAccessEEE.authorized).toBe(true);
  });

  it("Scenario 5: DRAFT offerings are invisible to students (assertEnrolled & canViewOffering)", async () => {
    // Even if student holds an enrollment, DRAFT offering must be blocked
    await expect(
      assertEnrolled(studentUser.id, draftOffering.id)
    ).rejects.toThrow(/not published/);

    const canView = await canViewOffering(
      { id: studentUser.id, role: Role.STUDENT },
      draftOffering.id
    );
    expect(canView).toBe(false);

    // Verify reusable query scope offeringsVisibleTo excludes DRAFT offerings for students
    const where = await offeringsVisibleTo({
      id: studentUser.id,
      role: Role.STUDENT,
    });
    const visibleOfferings = await prisma.courseOffering.findMany({
      where: {
        AND: [where, { id: draftOffering.id }],
      },
    });
    expect(visibleOfferings).toHaveLength(0);
  });

  it("Scenario 6: TA limits — teaching assistant passes when allowTA: true but is blocked when allowTA: false", async () => {
    // Default allowTA: true -> passes
    const allowed = await assertOfferingTeacher(
      taUser.id,
      cseOfferingWithTA.id,
      { allowTA: true }
    );
    expect(allowed.role).toBe("TA");

    // Strict allowTA: false -> blocked with friendly 403 Forbidden
    await expect(
      assertOfferingTeacher(taUser.id, cseOfferingWithTA.id, {
        allowTA: false,
      })
    ).rejects.toThrow(
      "Teaching Assistants are not permitted to perform this administrative or grading action."
    );

    // Primary Instructor passes both allowTA: true and allowTA: false
    const instructorCheck = await assertOfferingTeacher(
      teacherA.id,
      cseOfferingWithTA.id,
      { allowTA: false }
    );
    expect(instructorCheck.role).toBe("INSTRUCTOR");
  });

  it("Scenario 7: Reusable query scopes filter offerings appropriately for each role", async () => {
    // Super Admin sees all
    const superWhere = await offeringsVisibleTo({
      id: superAdmin.id,
      role: Role.SUPER_ADMIN,
    });
    const allCount = await prisma.courseOffering.count();
    const superCount = await prisma.courseOffering.count({ where: superWhere });
    expect(superCount).toBe(allCount);

    // Teacher sees only assigned offerings
    const teacherWhere = await offeringsVisibleTo({
      id: teacherA.id,
      role: Role.TEACHER,
    });
    const teacherOfferings = await prisma.courseOffering.findMany({
      where: teacherWhere,
    });
    expect(teacherOfferings.length).toBeGreaterThan(0);
    for (const off of teacherOfferings) {
      const assigned = await prisma.offeringTeacher.findUnique({
        where: { offeringId_userId: { offeringId: off.id, userId: teacherA.id } },
      });
      expect(assigned).toBeDefined();
    }
  });
});
