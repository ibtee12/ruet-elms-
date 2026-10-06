"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getClientIp } from "@/lib/utils/ip";
import { departmentSchema, DepartmentInput } from "@/lib/validations/department";
import { Role, Department } from "@prisma/client";

/**
 * Server action to create a new academic department.
 * SUPER_ADMIN only.
 */
export async function createDepartmentAction(input: DepartmentInput) {
  // 1. Authorization: Only SUPER_ADMIN can create departments
  const user = await requireRole(Role.SUPER_ADMIN);

  // 2. Validate input
  const parsed = departmentSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    parsed.error.issues.forEach((issue) => {
      const field = issue.path[0] as string;
      fieldErrors[field] = issue.message;
    });
    return {
      success: false,
      error: "Validation failed. Please correct the highlighted errors.",
      fieldErrors,
    };
  }

  const { name, code, description } = parsed.data;
  const uppercaseCode = code.toUpperCase().trim();

  // 3. Uniqueness check for department code
  const existing = await prisma.department.findUnique({
    where: { code: uppercaseCode },
  });

  if (existing) {
    return {
      success: false,
      error: `Department code '${uppercaseCode}' is already in use.`,
      fieldErrors: { code: `Department code '${uppercaseCode}' is already in use.` },
    };
  }

  const headerList = await headers();
  const clientIp = getClientIp(headerList);

  // 4. Create department and record AuditLog
  const department = await prisma.$transaction(async (tx) => {
    const created = await tx.department.create({
      data: {
        name,
        code: uppercaseCode,
        description: description || null,
        isActive: true,
      },
    });

    await tx.auditLog.create({
      data: {
        action: "DEPARTMENT_CREATED",
        objectType: "Department",
        objectId: created.id,
        userId: user.id,
        description: `Department ${created.code} (${created.name}) created`,
        ip: clientIp,
      },
    });

    return created;
  });

  revalidatePath("/admin/departments");
  return { success: true, department };
}

/**
 * Server action to update an existing department.
 * SUPER_ADMIN only.
 */
export async function updateDepartmentAction(
  id: string,
  input: DepartmentInput
) {
  const user = await requireRole(Role.SUPER_ADMIN);

  const parsed = departmentSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    parsed.error.issues.forEach((issue) => {
      const field = issue.path[0] as string;
      fieldErrors[field] = issue.message;
    });
    return {
      success: false,
      error: "Validation failed.",
      fieldErrors,
    };
  }

  const { name, code, description } = parsed.data;
  const uppercaseCode = code.toUpperCase().trim();

  // Check code uniqueness excluding current department
  const existing = await prisma.department.findFirst({
    where: {
      code: uppercaseCode,
      NOT: { id },
    },
  });

  if (existing) {
    return {
      success: false,
      error: `Department code '${uppercaseCode}' is already taken by another department.`,
      fieldErrors: { code: `Code '${uppercaseCode}' is already taken.` },
    };
  }

  const headerList = await headers();
  const clientIp = getClientIp(headerList);

  const updated = await prisma.$transaction(async (tx) => {
    const dept = await tx.department.update({
      where: { id },
      data: {
        name,
        code: uppercaseCode,
        description: description || null,
      },
    });

    await tx.auditLog.create({
      data: {
        action: "DEPARTMENT_UPDATED",
        objectType: "Department",
        objectId: dept.id,
        userId: user.id,
        description: `Department ${dept.code} updated`,
        ip: clientIp,
      },
    });

    return dept;
  });

  revalidatePath("/admin/departments");
  return { success: true, department: updated };
}

/**
 * Server action to toggle department active/inactive status.
 * Records DEPARTMENT_DEACTIVATED when deactivated.
 */
export async function toggleDepartmentStatusAction(
  id: string,
  isActive: boolean
): Promise<{ success: boolean; department?: Department; error?: string }> {
  try {
    const user = await requireRole(Role.SUPER_ADMIN);
    const headerList = await headers();
    const clientIp = getClientIp(headerList);

    const updated = await prisma.$transaction(async (tx) => {
      const dept = await tx.department.update({
        where: { id },
        data: { isActive },
      });

      if (!isActive) {
        await tx.auditLog.create({
          data: {
            action: "DEPARTMENT_DEACTIVATED",
            objectType: "Department",
            objectId: dept.id,
            userId: user.id,
            description: `Department ${dept.code} deactivated`,
            ip: clientIp,
          },
        });
      }

      return dept;
    });

    revalidatePath("/admin/departments");
    return { success: true, department: updated };
  } catch (err: unknown) {
    if (
      err &&
      typeof err === "object" &&
      "name" in err &&
      (err.name === "ForbiddenError" || err.name === "UnauthorizedError")
    ) {
      throw err;
    }
    const message =
      err instanceof Error ? err.message : "Failed to update department status";
    return {
      success: false,
      error: message,
    };
  }
}

/**
 * Server action to delete a department.
 * Blocked if the department has courses, faculty, or students.
 */
export async function deleteDepartmentAction(id: string) {
  const user = await requireRole(Role.SUPER_ADMIN);

  // Check associations
  const [teachersCount, studentsCount, coursesCount] = await Promise.all([
    prisma.teacherProfile.count({ where: { departmentId: id } }),
    prisma.studentProfile.count({ where: { departmentId: id } }),
    prisma.course.count({ where: { departmentId: id } }),
  ]);

  if (teachersCount > 0 || studentsCount > 0 || coursesCount > 0) {
    const reasons: string[] = [];
    if (teachersCount > 0) reasons.push(`${teachersCount} faculty member(s)`);
    if (studentsCount > 0) reasons.push(`${studentsCount} student(s)`);
    if (coursesCount > 0) reasons.push(`${coursesCount} catalog course(s)`);

    return {
      success: false,
      error: `Cannot delete department because it contains ${reasons.join(", ")}. Please deactivate the department instead.`,
    };
  }

  const headerList = await headers();
  const clientIp = getClientIp(headerList);

  await prisma.$transaction(async (tx) => {
    const dept = await tx.department.delete({
      where: { id },
    });

    await tx.auditLog.create({
      data: {
        action: "DEPARTMENT_DELETED",
        objectType: "Department",
        objectId: dept.id,
        userId: user.id,
        description: `Department ${dept.code} deleted`,
        ip: clientIp,
      },
    });
  });

  revalidatePath("/admin/departments");
  return { success: true };
}
