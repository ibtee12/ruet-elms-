/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import * as nextAuth from "next-auth/next";
import {
  createDepartmentAction,
  updateDepartmentAction,
  toggleDepartmentStatusAction,
  deleteDepartmentAction,
} from "@/actions/departments";
import { ForbiddenError } from "@/lib/auth/errors";

// Mock next/headers and next/cache for Server Action execution in Vitest
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(
    new Headers({
      "x-forwarded-for": "192.168.1.100",
    })
  ),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("Step 11: Academic Departments Management", () => {
  let superAdminUser: any;
  let teacherUser: any;
  let studentUser: any;
  let deptAdminUser: any;
  let cseDept: any;
  let createdDeptIds: string[] = [];

  beforeEach(async () => {
    superAdminUser = await prisma.user.findFirstOrThrow({
      where: { email: "admin@ruet.ac.bd" },
    });
    teacherUser = await prisma.user.findFirstOrThrow({
      where: { email: "arahman@cse.ruet.ac.bd" },
    });
    studentUser = await prisma.user.findFirstOrThrow({
      where: { email: "2203001@student.ruet.ac.bd" },
    });
    deptAdminUser = await prisma.user.findFirstOrThrow({
      where: { email: "deptadmin.cse@ruet.ac.bd" },
    });
    cseDept = await prisma.department.findUniqueOrThrow({
      where: { code: "CSE" },
    });

    // Default mock: Super admin logged in
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
    // Clean up any dynamically created test departments
    if (createdDeptIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: { objectId: { in: createdDeptIds } },
      });
      await prisma.department.deleteMany({
        where: { id: { in: createdDeptIds } },
      });
      createdDeptIds = [];
    }
  });

  it("Scenario 1: Non-super-admins get 403 Forbidden on department actions", async () => {
    const nonAdminRoles = [
      { user: studentUser, role: Role.STUDENT },
      { user: teacherUser, role: Role.TEACHER },
      { user: deptAdminUser, role: Role.DEPT_ADMIN },
    ];

    for (const { user, role } of nonAdminRoles) {
      vi.spyOn(nextAuth, "getServerSession").mockResolvedValueOnce({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role,
          mustChangePassword: false,
        },
        expires: "2099-01-01",
      });

      await expect(
        createDepartmentAction({
          name: "Unauthorized Department",
          code: "UNAUTH",
        })
      ).rejects.toThrow(ForbiddenError);
    }
  });

  it("Scenario 2: Duplicate department code shows friendly field error", async () => {
    const result = await createDepartmentAction({
      name: "Computer Science Duplicate",
      code: "CSE", // already exists in seed
    });

    expect(result.success).toBe(false);
    expect(result.fieldErrors?.code).toBeDefined();
    expect(result.fieldErrors?.code).toContain("Department code 'CSE' is already in use.");
  });

  it("Scenario 3: Validation fails for invalid codes or short names", async () => {
    // 1. Short name
    const shortNameResult = await createDepartmentAction({
      name: "CE", // min is 3 chars
      code: "CIVIL",
    });
    expect(shortNameResult.success).toBe(false);
    expect(shortNameResult.fieldErrors?.name).toBeDefined();

    // 2. Code with special characters / numbers / lowercase
    const invalidCodeResult = await createDepartmentAction({
      name: "Civil Engineering",
      code: "ce-1",
    });
    expect(invalidCodeResult.success).toBe(false);
    expect(invalidCodeResult.fieldErrors?.code).toBeDefined();
  });

  it("Scenario 4: A department with users or courses cannot be deleted", async () => {
    // Attempting to delete CSE (which has seeded teachers, students, and courses)
    const result = await deleteDepartmentAction(cseDept.id);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Cannot delete department because it contains");
    expect(result.error).toContain("Please deactivate the department instead.");

    // Verify CSE is still in database
    const stillExists = await prisma.department.findUnique({
      where: { id: cseDept.id },
    });
    expect(stillExists).not.toBeNull();
  });

  it("Scenario 5: Deactivating a department sets isActive to false and logs DEPARTMENT_DEACTIVATED", async () => {
    // Create a temporary department to deactivate
    const dept = await prisma.department.create({
      data: {
        name: "Temporary Architecture",
        code: "TEMP1",
        isActive: true,
      },
    });
    createdDeptIds.push(dept.id);

    // Deactivate it
    const toggleResult = await toggleDepartmentStatusAction(dept.id, false);
    expect(toggleResult.success).toBe(true);
    expect(toggleResult.department?.isActive).toBe(false);

    // Verify in DB
    const dbDept = await prisma.department.findUnique({
      where: { id: dept.id },
    });
    expect(dbDept?.isActive).toBe(false);

    // Verify AuditLog
    const auditLog = await prisma.auditLog.findFirst({
      where: {
        objectId: dept.id,
        action: "DEPARTMENT_DEACTIVATED",
      },
    });
    expect(auditLog).toBeDefined();
    expect(auditLog?.userId).toBe(superAdminUser.id);
  });

  it("Scenario 6: Super admin can create a new department and records DEPARTMENT_CREATED audit log", async () => {
    const result = await createDepartmentAction({
      name: "Mechatronics Engineering",
      code: "MTE",
      description: "Department of Mechatronics & Robotics",
    });

    expect(result.success).toBe(true);
    expect(result.department).toBeDefined();
    if (result.department) {
      createdDeptIds.push(result.department.id);
      expect(result.department.code).toBe("MTE");
      expect(result.department.name).toBe("Mechatronics Engineering");
      expect(result.department.isActive).toBe(true);

      // Verify AuditLog
      const log = await prisma.auditLog.findFirst({
        where: {
          objectId: result.department.id,
          action: "DEPARTMENT_CREATED",
        },
      });
      expect(log).toBeDefined();
      expect(log?.userId).toBe(superAdminUser.id);
      expect(log?.ip).toBe("192.168.1.100");
    }
  });

  it("Scenario 7: Super admin can update a department and records DEPARTMENT_UPDATED audit log", async () => {
    const dept = await prisma.department.create({
      data: {
        name: "Old Dept Name",
        code: "OLD",
        isActive: true,
      },
    });
    createdDeptIds.push(dept.id);

    const updateResult = await updateDepartmentAction(dept.id, {
      name: "Updated Dept Name",
      code: "UPD",
      description: "Updated description",
    });

    expect(updateResult.success).toBe(true);
    expect(updateResult.department?.name).toBe("Updated Dept Name");
    expect(updateResult.department?.code).toBe("UPD");

    // Verify AuditLog
    const log = await prisma.auditLog.findFirst({
      where: {
        objectId: dept.id,
        action: "DEPARTMENT_UPDATED",
      },
    });
    expect(log).toBeDefined();
    expect(log?.userId).toBe(superAdminUser.id);
  });

  it("Scenario 8: Super admin can delete an empty department without users or courses", async () => {
    const emptyDept = await prisma.department.create({
      data: {
        name: "Empty Test Department",
        code: "EMPTY",
        isActive: true,
      },
    });

    const result = await deleteDepartmentAction(emptyDept.id);
    expect(result.success).toBe(true);

    const deleted = await prisma.department.findUnique({
      where: { id: emptyDept.id },
    });
    expect(deleted).toBeNull();

    // Verify AuditLog
    const log = await prisma.auditLog.findFirst({
      where: {
        objectId: emptyDept.id,
        action: "DEPARTMENT_DELETED",
      },
    });
    expect(log).toBeDefined();
    // Clean up audit log created during test
    await prisma.auditLog.deleteMany({ where: { objectId: emptyDept.id } });
  });
});
