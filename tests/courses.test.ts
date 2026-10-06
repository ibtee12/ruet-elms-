/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import * as nextAuth from "next-auth/next";
import {
  getCoursesAction,
  createCourseAction,
  updateCourseAction,
  deleteCourseAction,
} from "@/actions/courses";
import { ForbiddenError } from "@/lib/auth/errors";

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(
    new Headers({ "x-forwarded-for": "10.0.0.8" })
  ),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("Step 13: Course Catalog Management", () => {
  let superAdminUser: any;
  let cseDeptAdminUser: any;
  let cseDept: any;
  let eeeDept: any;
  let createdCourseIds: string[] = [];

  beforeEach(async () => {
    superAdminUser = await prisma.user.findFirstOrThrow({
      where: { email: "admin@ruet.ac.bd" },
    });
    cseDeptAdminUser = await prisma.user.findFirstOrThrow({
      where: { email: "deptadmin.cse@ruet.ac.bd" },
    });
    cseDept = await prisma.department.findUniqueOrThrow({
      where: { code: "CSE" },
    });
    eeeDept = await prisma.department.findUniqueOrThrow({
      where: { code: "EEE" },
    });

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
    if (createdCourseIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: { objectId: { in: createdCourseIds } },
      });
      await prisma.course.deleteMany({
        where: { id: { in: createdCourseIds } },
      });
      createdCourseIds = [];
    }
  });

  it("Scenario 1: Validation rejects credits outside 0.75 - 6.00 range", async () => {
    // 1. Credits < 0.75
    const tooLow = await createCourseAction({
      code: "CSE 4991",
      title: "Micro-credit Course",
      credits: 0.5,
      departmentId: cseDept.id,
    });
    expect(tooLow.success).toBe(false);
    expect(tooLow.fieldErrors?.credits).toBeDefined();

    // 2. Credits > 6.00
    const tooHigh = await createCourseAction({
      code: "CSE 4992",
      title: "Mega-credit Course",
      credits: 7.5,
      departmentId: cseDept.id,
    });
    expect(tooHigh.success).toBe(false);
    expect(tooHigh.fieldErrors?.credits).toBeDefined();
  });

  it("Scenario 2: Validation rejects invalid course code format", async () => {
    const invalidFormats = ["cse3205", "C 12", "toolongdepartmentcode 123", "CSE-3205"];

    for (const code of invalidFormats) {
      const res = await createCourseAction({
        code,
        title: "Test Course",
        credits: 3.0,
        departmentId: cseDept.id,
      });
      expect(res.success).toBe(false);
      expect(res.fieldErrors?.code).toBeDefined();
    }
  });

  it("Scenario 3: Duplicates are blocked within the same department", async () => {
    // Seeded course CSE 3200 exists in CSE
    const existing = await prisma.course.findFirstOrThrow({
      where: { departmentId: cseDept.id },
    });

    const duplicateRes = await createCourseAction({
      code: existing.code,
      title: "Duplicate Course Name",
      credits: 3.0,
      departmentId: cseDept.id,
    });

    expect(duplicateRes.success).toBe(false);
    expect(duplicateRes.fieldErrors?.code).toBeDefined();
    expect(duplicateRes.fieldErrors?.code).toContain("already exists in this department");
  });

  it("Scenario 4: Deleting a course with offerings is blocked", async () => {
    // Find a course that has offerings
    const courseWithOfferings = await prisma.course.findFirstOrThrow({
      where: { offerings: { some: {} } },
      include: { _count: { select: { offerings: true } } },
    });

    const deleteRes = await deleteCourseAction(courseWithOfferings.id);
    expect(deleteRes.success).toBe(false);
    expect(deleteRes.error).toContain("recorded offering(s)");

    // Ensure still in DB
    const stillExists = await prisma.course.findUnique({
      where: { id: courseWithOfferings.id },
    });
    expect(stillExists).not.toBeNull();
  });

  it("Scenario 5: Dept admin is restricted to their department at query level and cannot create cross-dept course", async () => {
    vi.spyOn(nextAuth, "getServerSession").mockResolvedValue({
      user: {
        id: cseDeptAdminUser.id,
        email: cseDeptAdminUser.email,
        name: cseDeptAdminUser.name,
        role: Role.DEPT_ADMIN,
        mustChangePassword: false,
      },
      expires: "2099-01-01",
    });

    // 1. Query level restriction
    const cseCourses = await getCoursesAction({ page: 1, pageSize: 50 });
    const hasEee = cseCourses.courses.some((c) => c.department.code === "EEE");
    expect(hasEee).toBe(false);

    // 2. Direct action attempt to create course for EEE department
    await expect(
      createCourseAction({
        code: "EEE 4999",
        title: "Unauthorized EEE Course",
        credits: 3.0,
        departmentId: eeeDept.id, // EEE dept
      })
    ).rejects.toThrow(ForbiddenError);
  });

  it("Scenario 6: Super admin can create and update catalog course with AuditLog records", async () => {
    const createRes = await createCourseAction({
      code: "CSE 4299",
      title: "Advanced Quantum Computing",
      credits: 3.0,
      departmentId: cseDept.id,
      description: "Exploration of quantum algorithms and quantum gates.",
    });

    expect(createRes.success).toBe(true);
    expect(createRes.course).toBeDefined();

    const courseId = createRes.course!.id;
    createdCourseIds.push(courseId);

    // Verify AuditLog COURSE_CREATED
    const createLog = await prisma.auditLog.findFirst({
      where: { objectId: courseId, action: "COURSE_CREATED" },
    });
    expect(createLog).toBeDefined();
    expect(createLog?.userId).toBe(superAdminUser.id);

    // Update Course
    const updateRes = await updateCourseAction(courseId, {
      code: "CSE 4299",
      title: "Quantum Information Theory",
      credits: 3.5,
      departmentId: cseDept.id,
    });

    expect(updateRes.success).toBe(true);
    expect(updateRes.course?.title).toBe("Quantum Information Theory");
    expect(updateRes.course?.credits).toBe(3.5);

    // Verify AuditLog COURSE_UPDATED
    const updateLog = await prisma.auditLog.findFirst({
      where: { objectId: courseId, action: "COURSE_UPDATED" },
    });
    expect(updateLog).toBeDefined();
  });
});
