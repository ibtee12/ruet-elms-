/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import * as nextAuth from "next-auth/next";
import {
  getUsersAction,
  createUserAction,
  updateUserAction,
  toggleUserActiveAction,
  importUsersCsvAction,
} from "@/actions/users";
import { parseUsersCsv } from "@/lib/csv/user-import";
import { ForbiddenError } from "@/lib/auth/errors";

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(
    new Headers({ "x-forwarded-for": "10.0.0.5" })
  ),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("Step 12: User Management & Batch Import", () => {
  let superAdminUser: any;
  let cseDeptAdminUser: any;
  let eeeTeacherUser: any;
  let cseDept: any;
  let eeeDept: any;
  let createdUserIds: string[] = [];

  beforeEach(async () => {
    superAdminUser = await prisma.user.findFirstOrThrow({
      where: { email: "admin@ruet.ac.bd" },
    });
    cseDeptAdminUser = await prisma.user.findFirstOrThrow({
      where: { email: "deptadmin.cse@ruet.ac.bd" },
    });
    eeeTeacherUser = await prisma.user.findFirstOrThrow({
      where: { email: "dhossain@eee.ruet.ac.bd" },
    });

    cseDept = await prisma.department.findUniqueOrThrow({
      where: { code: "CSE" },
    });
    eeeDept = await prisma.department.findUniqueOrThrow({
      where: { code: "EEE" },
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
    if (createdUserIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
      await prisma.studentProfile.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
      await prisma.teacherProfile.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      });
      createdUserIds = [];
    }
  });

  it("Scenario 1: CSV parser detects 3 intentional errors in a 60-row student CSV and highlights per-row errors", async () => {
    // Generate 60-row CSV with 3 intentional errors:
    // Row 15: Invalid email format
    // Row 30: Unknown department code 'XYZ'
    // Row 45: Invalid level (5)
    const header = "name,email,studentId,departmentCode,batch,level,term";
    const rows: string[] = [];

    for (let i = 1; i <= 60; i++) {
      const studentId = `99030${i.toString().padStart(2, "0")}`;
      let email = `teststudent${i}@student.ruet.ac.bd`;
      let dept = "CSE";
      let level = 3;

      if (i === 15) {
        email = "not-an-email"; // Intentional error 1
      }
      if (i === 30) {
        dept = "XYZ"; // Intentional error 2
      }
      if (i === 45) {
        level = 5; // Intentional error 3 (levels are 1-4)
      }

      rows.push(`Student ${i},${email},${studentId},${dept},2022,${level},2`);
    }

    const csvContent = [header, ...rows].join("\n");

    const deptCodeMap = new Map([
      ["CSE", cseDept.id],
      ["EEE", eeeDept.id],
    ]);

    const result = parseUsersCsv(csvContent, "STUDENT", {
      existingEmails: new Set(),
      existingStudentIds: new Set(),
      existingEmployeeIds: new Set(),
      departmentCodeToId: deptCodeMap,
    });

    expect(result.success).toBe(true);
    expect(result.totalCount).toBe(60);
    expect(result.validCount).toBe(57);
    expect(result.errorCount).toBe(3);

    // Verify row 15 error (header is row 1, so row 15 data is rowNumber 16)
    const row15 = result.rows.find((r) => r.rowNumber === 16);
    expect(row15?.isValid).toBe(false);
    expect(row15?.errors.some((e) => e.includes("Invalid email"))).toBe(true);

    // Verify row 30 error (rowNumber 31)
    const row30 = result.rows.find((r) => r.rowNumber === 31);
    expect(row30?.isValid).toBe(false);
    expect(row30?.errors.some((e) => e.includes("Unknown department"))).toBe(true);

    // Verify row 45 error (rowNumber 46)
    const row45 = result.rows.find((r) => r.rowNumber === 46);
    expect(row45?.isValid).toBe(false);
    expect(row45?.errors.some((e) => e.includes("Level must be an integer between 1 and 4"))).toBe(true);

    // Verify importUsersCsvAction rejects with clear error when skipInvalidRows is false
    const actionResult = await importUsersCsvAction(csvContent, "STUDENT", false);
    expect(actionResult.success).toBe(false);
    expect(actionResult.error).toContain("contains 3 invalid rows");
  });

  it("Scenario 2: Dept admin cannot see or edit users from another department", async () => {
    // Mock CSE Dept Admin login
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

    // 1. Scoped query: Dept admin cannot see EEE users
    const userList = await getUsersAction({ page: 1, pageSize: 50 });
    const hasEeeUsers = userList.users.some(
      (u) =>
        u.teacherProfile?.department.code === "EEE" ||
        u.studentProfile?.department.code === "EEE"
    );
    expect(hasEeeUsers).toBe(false);

    // 2. Direct action call: CSE Admin attempting to edit an EEE teacher throws ForbiddenError
    await expect(
      updateUserAction(eeeTeacherUser.id, {
        name: "Hacked EEE Teacher",
        email: eeeTeacherUser.email,
      })
    ).rejects.toThrow(ForbiddenError);

    // 3. Direct action call: CSE Admin attempting to create student in EEE department throws ForbiddenError
    await expect(
      createUserAction({
        name: "Cross Dept Student",
        email: "crossdept@ruet.ac.bd",
        role: Role.STUDENT,
        studentProfile: {
          studentId: "9903999",
          departmentId: eeeDept.id, // EEE instead of CSE
          batch: "2022",
          level: 1,
          term: 1,
        },
      })
    ).rejects.toThrow(ForbiddenError);
  });

  it("Scenario 3: Dept admin cannot create ADMIN roles", async () => {
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

    await expect(
      createUserAction({
        name: "Unauthorized Super Admin",
        email: "fakeadmin@ruet.ac.bd",
        role: Role.SUPER_ADMIN,
      })
    ).rejects.toThrow(ForbiddenError);

    await expect(
      createUserAction({
        name: "Unauthorized Dept Admin",
        email: "fakedeptadmin@ruet.ac.bd",
        role: Role.DEPT_ADMIN,
      })
    ).rejects.toThrow(ForbiddenError);
  });

  it("Scenario 4: User cannot deactivate their own administrative account", async () => {
    const result = await toggleUserActiveAction(superAdminUser.id, false);
    expect(result.success).toBe(false);
    expect(result.error).toContain("You cannot deactivate your own");
  });

  it("Scenario 5: Temporary passwords are shown once and never stored plaintext in database or audit logs", async () => {
    const email = "temp-password-test@ruet.ac.bd";
    const result = await createUserAction({
      name: "Temporary Password User",
      email,
      role: Role.STUDENT,
      studentProfile: {
        studentId: "8803001",
        departmentId: cseDept.id,
        batch: "2022",
        level: 1,
        term: 1,
      },
    });

    expect(result.success).toBe(true);
    expect(result.tempPassword).toBeDefined();
    expect(typeof result.tempPassword).toBe("string");
    expect(result.tempPassword!.length).toBeGreaterThanOrEqual(10);

    const createdUser = result.user!;
    createdUserIds.push(createdUser.id);

    // Verify DB stores ONLY bcrypt hash, not plaintext password
    const dbUser = await prisma.user.findUniqueOrThrow({
      where: { id: createdUser.id },
    });
    expect(dbUser.passwordHash).not.toBe(result.tempPassword);
    expect(dbUser.passwordHash.startsWith("$2")).toBe(true);
    expect(dbUser.mustChangePassword).toBe(true);

    // Verify AuditLog does NOT contain the plaintext password
    const auditLog = await prisma.auditLog.findFirst({
      where: { objectId: createdUser.id, action: "USER_CREATED" },
    });
    expect(auditLog).toBeDefined();
    expect(auditLog?.description).not.toContain(result.tempPassword);
  });
});
