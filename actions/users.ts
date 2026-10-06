"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import bcrypt from "bcryptjs";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getClientIp } from "@/lib/utils/ip";
import { Role, Prisma } from "@prisma/client";
import { ForbiddenError } from "@/lib/auth/errors";
import {
  createUserSchema,
  editUserSchema,
  CreateUserInput,
  EditUserInput,
} from "@/lib/validations/user";
import { generateTemporaryPassword } from "@/lib/utils/password-generator";
import {
  parseUsersCsv,
  generateImportResultCsv,
  ValidationContext,
} from "@/lib/csv/user-import";
import { sendWelcomeEmail } from "@/lib/email";

/**
 * Helper to fetch caller's department ID if caller is DEPT_ADMIN.
 */
async function getCallerDeptId(userId: string): Promise<string> {
  const profile = await prisma.teacherProfile.findUnique({
    where: { userId },
    select: { departmentId: true },
  });
  if (!profile?.departmentId) {
    throw new ForbiddenError("Department Administrator is not assigned to a department.");
  }
  return profile.departmentId;
}

export interface GetUsersParams {
  page?: number;
  pageSize?: number;
  search?: string;
  role?: Role;
  departmentId?: string;
  isActive?: boolean;
  sortBy?: "name" | "email" | "createdAt" | "lastActiveAt";
  sortOrder?: "asc" | "desc";
}

/**
 * Fetch paginated users with role and department scoping.
 */
export async function getUsersAction(params: GetUsersParams = {}) {
  const caller = await requireRole(Role.SUPER_ADMIN, Role.DEPT_ADMIN);

  const page = Math.max(1, params.page || 1);
  const pageSize = Math.min(100, Math.max(5, params.pageSize || 10));
  const skip = (page - 1) * pageSize;

  const where: Prisma.UserWhereInput = {};

  // DEPT_ADMIN scoping
  if (caller.role === Role.DEPT_ADMIN) {
    const callerDeptId = await getCallerDeptId(caller.id);

    // DEPT_ADMIN can only view TEACHER and STUDENT roles in their own department
    where.role = { in: [Role.TEACHER, Role.STUDENT] };
    where.OR = [
      { teacherProfile: { departmentId: callerDeptId } },
      { studentProfile: { departmentId: callerDeptId } },
    ];
  } else {
    // SUPER_ADMIN filtering
    if (params.role) {
      where.role = params.role;
    }
    if (params.departmentId) {
      where.OR = [
        { teacherProfile: { departmentId: params.departmentId } },
        { studentProfile: { departmentId: params.departmentId } },
      ];
    }
  }

  // Active status filter
  if (params.isActive !== undefined) {
    where.isActive = params.isActive;
  }

  // Search filter (name, email, studentId, employeeId)
  if (params.search?.trim()) {
    const q = params.search.trim();
    const searchFilter: Prisma.UserWhereInput[] = [
      { name: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { studentProfile: { studentId: { contains: q, mode: "insensitive" } } },
      { teacherProfile: { employeeId: { contains: q, mode: "insensitive" } } },
    ];

    if (where.OR) {
      where.AND = [{ OR: where.OR }, { OR: searchFilter }];
      delete where.OR;
    } else {
      where.OR = searchFilter;
    }
  }

  // Sorting
  const sortBy = params.sortBy || "createdAt";
  const sortOrder = params.sortOrder || "desc";
  const orderBy = { [sortBy]: sortOrder };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip,
      take: pageSize,
      orderBy,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        mustChangePassword: true,
        lastActiveAt: true,
        createdAt: true,
        studentProfile: {
          select: {
            studentId: true,
            batch: true,
            level: true,
            term: true,
            department: { select: { id: true, name: true, code: true } },
          },
        },
        teacherProfile: {
          select: {
            employeeId: true,
            designation: true,
            department: { select: { id: true, name: true, code: true } },
          },
        },
      },
    }),
    prisma.user.count({ where }),
  ]);

  return {
    users,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

/**
 * Creates a single user with generated temporary password.
 * SUPER_ADMIN can create any role; DEPT_ADMIN strictly creates TEACHER/STUDENT for their department.
 */
export async function createUserAction(input: CreateUserInput) {
  const caller = await requireRole(Role.SUPER_ADMIN, Role.DEPT_ADMIN);

  // Validate input
  const parsed = createUserSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    parsed.error.issues.forEach((issue) => {
      fieldErrors[issue.path.join(".")] = issue.message;
    });
    return {
      success: false,
      error: "Validation failed.",
      fieldErrors,
    };
  }

  const {
    name,
    email,
    role,
    sendWelcomeEmail: shouldSendWelcomeEmail,
    studentProfile,
    teacherProfile,
  } = parsed.data;

  // Authorization checks for DEPT_ADMIN
  if (caller.role === Role.DEPT_ADMIN) {
    if (role !== Role.TEACHER && role !== Role.STUDENT) {
      throw new ForbiddenError(
        "Department Administrators can only create Teacher or Student accounts."
      );
    }
    const callerDeptId = await getCallerDeptId(caller.id);
    const targetDeptId =
      role === Role.STUDENT
        ? studentProfile?.departmentId
        : teacherProfile?.departmentId;

    if (targetDeptId !== callerDeptId) {
      throw new ForbiddenError(
        "Department Administrators cannot create users for other departments."
      );
    }
  }

  // Check email uniqueness
  const existingUser = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });
  if (existingUser) {
    return {
      success: false,
      error: `Email '${email}' is already registered.`,
      fieldErrors: { email: `Email '${email}' is already in use.` },
    };
  }

  // Profile-specific uniqueness checks
  if (role === Role.STUDENT && studentProfile) {
    const existingStudent = await prisma.studentProfile.findUnique({
      where: { studentId: studentProfile.studentId },
    });
    if (existingStudent) {
      return {
        success: false,
        error: `Student ID '${studentProfile.studentId}' is already registered.`,
        fieldErrors: {
          "studentProfile.studentId": `Student ID '${studentProfile.studentId}' is already registered.`,
        },
      };
    }
  }

  if ((role === Role.TEACHER || role === Role.DEPT_ADMIN) && teacherProfile) {
    const existingTeacher = await prisma.teacherProfile.findUnique({
      where: { employeeId: teacherProfile.employeeId },
    });
    if (existingTeacher) {
      return {
        success: false,
        error: `Employee ID '${teacherProfile.employeeId}' is already registered.`,
        fieldErrors: {
          "teacherProfile.employeeId": `Employee ID '${teacherProfile.employeeId}' is already registered.`,
        },
      };
    }
  }

  // Generate strong temporary password and hash
  const tempPassword = generateTemporaryPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 10);

  const headerList = await headers();
  const clientIp = getClientIp(headerList);

  // Execute in database transaction
  const created = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name,
        email: email.toLowerCase(),
        passwordHash,
        role,
        isActive: true,
        mustChangePassword: true,
      },
    });

    if (role === Role.STUDENT && studentProfile) {
      await tx.studentProfile.create({
        data: {
          userId: user.id,
          studentId: studentProfile.studentId,
          departmentId: studentProfile.departmentId,
          batch: studentProfile.batch,
          level: studentProfile.level,
          term: studentProfile.term,
        },
      });
    } else if (
      (role === Role.TEACHER || role === Role.DEPT_ADMIN) &&
      teacherProfile
    ) {
      await tx.teacherProfile.create({
        data: {
          userId: user.id,
          employeeId: teacherProfile.employeeId,
          departmentId: teacherProfile.departmentId,
          designation: teacherProfile.designation,
        },
      });
    }

    // Audit log (never log plaintext password)
    await tx.auditLog.create({
      data: {
        action: "USER_CREATED",
        objectType: "User",
        objectId: user.id,
        userId: caller.id,
        description: `Created user ${user.email} with role ${user.role}`,
        ip: clientIp,
      },
    });

    return user;
  });

  // Optional welcome email
  if (shouldSendWelcomeEmail) {
    await sendWelcomeEmail({
      to: email,
      recipientName: name,
      role,
      tempPassword,
    });
  }

  revalidatePath("/admin/users");
  return {
    success: true,
    user: created,
    tempPassword, // Returned ONCE to caller
  };
}

/**
 * Updates user credentials and role-specific profile.
 */
export async function updateUserAction(id: string, input: EditUserInput) {
  const caller = await requireRole(Role.SUPER_ADMIN, Role.DEPT_ADMIN);

  const targetUser = await prisma.user.findUniqueOrThrow({
    where: { id },
    include: { studentProfile: true, teacherProfile: true },
  });

  // Authorization checks for DEPT_ADMIN
  if (caller.role === Role.DEPT_ADMIN) {
    if (
      targetUser.role === Role.SUPER_ADMIN ||
      targetUser.role === Role.DEPT_ADMIN
    ) {
      throw new ForbiddenError(
        "Department Administrators cannot edit administrator accounts."
      );
    }
    const callerDeptId = await getCallerDeptId(caller.id);
    const userDeptId =
      targetUser.studentProfile?.departmentId ||
      targetUser.teacherProfile?.departmentId;

    if (userDeptId !== callerDeptId) {
      throw new ForbiddenError(
        "Department Administrators cannot edit users belonging to other departments."
      );
    }
  }

  const parsed = editUserSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Validation failed.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const { name, email, studentProfile, teacherProfile } = parsed.data;

  // Check email uniqueness excluding self
  const emailExisting = await prisma.user.findFirst({
    where: {
      email: email.toLowerCase(),
      NOT: { id },
    },
  });
  if (emailExisting) {
    return {
      success: false,
      error: `Email '${email}' is already in use by another user.`,
    };
  }

  const headerList = await headers();
  const clientIp = getClientIp(headerList);

  const updated = await prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id },
      data: {
        name,
        email: email.toLowerCase(),
      },
    });

    if (targetUser.role === Role.STUDENT && studentProfile) {
      await tx.studentProfile.update({
        where: { userId: id },
        data: {
          studentId: studentProfile.studentId,
          batch: studentProfile.batch,
          level: studentProfile.level,
          term: studentProfile.term,
          departmentId: studentProfile.departmentId,
        },
      });
    } else if (
      (targetUser.role === Role.TEACHER ||
        targetUser.role === Role.DEPT_ADMIN) &&
      teacherProfile
    ) {
      await tx.teacherProfile.update({
        where: { userId: id },
        data: {
          employeeId: teacherProfile.employeeId,
          designation: teacherProfile.designation,
          departmentId: teacherProfile.departmentId,
        },
      });
    }

    await tx.auditLog.create({
      data: {
        action: "USER_UPDATED",
        objectType: "User",
        objectId: user.id,
        userId: caller.id,
        description: `Updated profile details for user ${user.email}`,
        ip: clientIp,
      },
    });

    return user;
  });

  revalidatePath("/admin/users");
  return { success: true, user: updated };
}

/**
 * Activates or deactivates a user. Prevents deactivating self.
 */
export async function toggleUserActiveAction(id: string, isActive: boolean) {
  const caller = await requireRole(Role.SUPER_ADMIN, Role.DEPT_ADMIN);

  // Self deactivation rule
  if (caller.id === id) {
    return {
      success: false,
      error: "You cannot deactivate your own administrative account.",
    };
  }

  const targetUser = await prisma.user.findUniqueOrThrow({
    where: { id },
    include: { studentProfile: true, teacherProfile: true },
  });

  if (caller.role === Role.DEPT_ADMIN) {
    if (
      targetUser.role === Role.SUPER_ADMIN ||
      targetUser.role === Role.DEPT_ADMIN
    ) {
      throw new ForbiddenError(
        "Department Administrators cannot alter administrative accounts."
      );
    }
    const callerDeptId = await getCallerDeptId(caller.id);
    const userDeptId =
      targetUser.studentProfile?.departmentId ||
      targetUser.teacherProfile?.departmentId;
    if (userDeptId !== callerDeptId) {
      throw new ForbiddenError(
        "Department Administrators cannot alter users from other departments."
      );
    }
  }

  const headerList = await headers();
  const clientIp = getClientIp(headerList);

  const updated = await prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id },
      data: { isActive },
    });

    await tx.auditLog.create({
      data: {
        action: isActive ? "USER_REACTIVATED" : "USER_DEACTIVATED",
        objectType: "User",
        objectId: user.id,
        userId: caller.id,
        description: `User ${user.email} marked as ${
          isActive ? "ACTIVE" : "INACTIVE"
        }`,
        ip: clientIp,
      },
    });

    return user;
  });

  revalidatePath("/admin/users");
  return { success: true, user: updated };
}

/**
 * Generates a new temporary password for user.
 * Invalidates all existing sessions by incrementing tokenVersion.
 */
export async function resetUserPasswordAction(id: string) {
  const caller = await requireRole(Role.SUPER_ADMIN, Role.DEPT_ADMIN);

  const targetUser = await prisma.user.findUniqueOrThrow({
    where: { id },
    include: { studentProfile: true, teacherProfile: true },
  });

  if (caller.role === Role.DEPT_ADMIN) {
    if (
      targetUser.role === Role.SUPER_ADMIN ||
      targetUser.role === Role.DEPT_ADMIN
    ) {
      throw new ForbiddenError(
        "Department Administrators cannot reset passwords of administrator accounts."
      );
    }
    const callerDeptId = await getCallerDeptId(caller.id);
    const userDeptId =
      targetUser.studentProfile?.departmentId ||
      targetUser.teacherProfile?.departmentId;
    if (userDeptId !== callerDeptId) {
      throw new ForbiddenError(
        "Department Administrators cannot reset passwords for users in other departments."
      );
    }
  }

  const tempPassword = generateTemporaryPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 10);

  const headerList = await headers();
  const clientIp = getClientIp(headerList);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id },
      data: {
        passwordHash,
        mustChangePassword: true,
        tokenVersion: { increment: 1 },
      },
    });

    await tx.auditLog.create({
      data: {
        action: "PASSWORD_RESET_BY_ADMIN",
        objectType: "User",
        objectId: id,
        userId: caller.id,
        description: `Admin reset password for user ${targetUser.email}`,
        ip: clientIp,
      },
    });
  });

  revalidatePath("/admin/users");
  return {
    success: true,
    tempPassword, // Shown ONCE in UI
  };
}

/**
 * Batch CSV Import Action.
 */
export async function importUsersCsvAction(
  csvContent: string,
  role: "STUDENT" | "TEACHER",
  skipInvalidRows: boolean
) {
  const caller = await requireRole(Role.SUPER_ADMIN, Role.DEPT_ADMIN);

  // Fetch departments map
  const departments = await prisma.department.findMany({
    select: { id: true, code: true },
  });
  const deptCodeToId = new Map(departments.map((d) => [d.code, d.id]));

  let allowedDeptCode: string | undefined = undefined;
  if (caller.role === Role.DEPT_ADMIN) {
    const callerDeptId = await getCallerDeptId(caller.id);
    const dept = departments.find((d) => d.id === callerDeptId);
    allowedDeptCode = dept?.code;
  }

  // Existing emails and IDs
  const [existingEmailsList, existingStudentsList, existingTeachersList] =
    await Promise.all([
      prisma.user.findMany({ select: { email: true } }),
      prisma.studentProfile.findMany({ select: { studentId: true } }),
      prisma.teacherProfile.findMany({ select: { employeeId: true } }),
    ]);

  const validationContext: ValidationContext = {
    existingEmails: new Set(existingEmailsList.map((u) => u.email.toLowerCase())),
    existingStudentIds: new Set(existingStudentsList.map((s) => s.studentId)),
    existingEmployeeIds: new Set(existingTeachersList.map((t) => t.employeeId)),
    departmentCodeToId: deptCodeToId,
    allowedDepartmentCode: allowedDeptCode,
  };

  const parsed = parseUsersCsv(csvContent, role, validationContext);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.globalError || "CSV parsing failed.",
      totalCount: 0,
      validCount: 0,
      errorCount: 0,
      rows: [],
    };
  }

  // If not skipping invalid and there are errors -> reject
  if (!skipInvalidRows && parsed.errorCount > 0) {
    return {
      success: false,
      error: `CSV contains ${parsed.errorCount} invalid rows. Review errors or select 'Skip invalid rows' to proceed with valid records only.`,
      rows: parsed.rows,
      totalCount: parsed.totalCount,
      validCount: parsed.validCount,
      errorCount: parsed.errorCount,
    };
  }

  const validRows = parsed.rows.filter((r) => r.isValid);
  if (validRows.length === 0) {
    return {
      success: false,
      error: "No valid rows found to import.",
      rows: parsed.rows,
      totalCount: parsed.totalCount,
      validCount: 0,
      errorCount: parsed.errorCount,
    };
  }

  const headerList = await headers();
  const clientIp = getClientIp(headerList);

  // Generate temporary passwords and hashes for all valid rows
  const preparedRows = await Promise.all(
    validRows.map(async (row) => {
      const tempPassword = generateTemporaryPassword();
      const passwordHash = await bcrypt.hash(tempPassword, 10);
      return {
        ...row,
        tempPassword,
        passwordHash,
      };
    })
  );

  // Execute in transaction
  const resultItems = await prisma.$transaction(async (tx) => {
    const imported: Array<{
      name: string;
      email: string;
      identifier: string;
      role: string;
      tempPassword?: string;
      status: string;
      error?: string;
    }> = [];

    for (const row of preparedRows) {
      const email = row.data["email"].toLowerCase().trim();
      const name = row.data["name"].trim();
      const deptCode = row.data["departmentcode"].toUpperCase().trim();
      const deptId = deptCodeToId.get(deptCode)!;

      const user = await tx.user.create({
        data: {
          name,
          email,
          passwordHash: row.passwordHash,
          role,
          isActive: true,
          mustChangePassword: true,
        },
      });

      if (role === "STUDENT") {
        const studentId = row.data["studentid"].trim();
        const batch = row.data["batch"].trim();
        const level = Number(row.data["level"]);
        const term = Number(row.data["term"]);

        await tx.studentProfile.create({
          data: {
            userId: user.id,
            studentId,
            departmentId: deptId,
            batch,
            level,
            term,
          },
        });

        imported.push({
          name,
          email,
          identifier: studentId,
          role: "STUDENT",
          tempPassword: row.tempPassword,
          status: "SUCCESS",
        });
      } else {
        const employeeId = row.data["employeeid"].trim();
        const designation = row.data["designation"].trim();

        await tx.teacherProfile.create({
          data: {
            userId: user.id,
            employeeId,
            departmentId: deptId,
            designation,
          },
        });

        imported.push({
          name,
          email,
          identifier: employeeId,
          role: "TEACHER",
          tempPassword: row.tempPassword,
          status: "SUCCESS",
        });
      }
    }

    // Record audit log with counts only
    await tx.auditLog.create({
      data: {
        action: "CSV_IMPORT",
        objectType: "User",
        objectId: "BATCH",
        userId: caller.id,
        description: `Imported ${imported.length} users (${role}) from CSV`,
        ip: clientIp,
      },
    });

    return imported;
  });

  // Attach failed rows to the result export
  const failedItems = parsed.rows
    .filter((r) => !r.isValid)
    .map((r) => ({
      name: r.data["name"] || "N/A",
      email: r.data["email"] || "N/A",
      identifier: r.data["studentid"] || r.data["employeeid"] || "N/A",
      role,
      status: "FAILED",
      error: r.errors.join("; "),
    }));

  const allResultItems = [...resultItems, ...failedItems];
  const resultCsv = generateImportResultCsv(allResultItems);

  revalidatePath("/admin/users");
  return {
    success: true,
    importedCount: resultItems.length,
    skippedCount: parsed.errorCount,
    totalCount: parsed.totalCount,
    resultCsv,
  };
}
