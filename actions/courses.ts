"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getClientIp } from "@/lib/utils/ip";
import { Role, Prisma } from "@prisma/client";
import { ForbiddenError } from "@/lib/auth/errors";
import { courseSchema, CourseInput } from "@/lib/validations/course";

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

export interface GetCoursesParams {
  search?: string;
  departmentId?: string;
  page?: number;
  pageSize?: number;
}

/**
 * Fetch catalog courses with department scoping and search.
 */
export async function getCoursesAction(params: GetCoursesParams = {}) {
  const caller = await requireRole(Role.SUPER_ADMIN, Role.DEPT_ADMIN);

  const page = Math.max(1, params.page || 1);
  const pageSize = Math.min(100, Math.max(5, params.pageSize || 10));
  const skip = (page - 1) * pageSize;

  const where: Prisma.CourseWhereInput = {};

  // DEPT_ADMIN is strictly scoped to their own department
  if (caller.role === Role.DEPT_ADMIN) {
    const callerDeptId = await getCallerDeptId(caller.id);
    where.departmentId = callerDeptId;
  } else if (params.departmentId && params.departmentId !== "ALL") {
    where.departmentId = params.departmentId;
  }

  // Search filter (code, title)
  if (params.search?.trim()) {
    const q = params.search.trim();
    where.OR = [
      { code: { contains: q, mode: "insensitive" } },
      { title: { contains: q, mode: "insensitive" } },
    ];
  }

  const [courses, total] = await Promise.all([
    prisma.course.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { code: "asc" },
      include: {
        department: { select: { id: true, name: true, code: true } },
        _count: { select: { offerings: true } },
      },
    }),
    prisma.course.count({ where }),
  ]);

  return {
    courses: courses.map((c) => ({
      ...c,
      credits: Number(c.credits),
    })),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

/**
 * Create a new catalog course.
 */
export async function createCourseAction(input: CourseInput) {
  const caller = await requireRole(Role.SUPER_ADMIN, Role.DEPT_ADMIN);

  const parsed = courseSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    parsed.error.issues.forEach((issue) => {
      fieldErrors[issue.path[0] as string] = issue.message;
    });
    return {
      success: false,
      error: "Validation failed. Please correct the highlighted errors.",
      fieldErrors,
    };
  }

  const { code, title, credits, departmentId, description } = parsed.data;
  const formattedCode = code.toUpperCase().trim();

  // DEPT_ADMIN permission check
  if (caller.role === Role.DEPT_ADMIN) {
    const callerDeptId = await getCallerDeptId(caller.id);
    if (departmentId !== callerDeptId) {
      throw new ForbiddenError(
        "Department Administrators can only create courses for their own department."
      );
    }
  }

  // Check unique constraint (departmentId, code)
  const existing = await prisma.course.findUnique({
    where: {
      departmentId_code: {
        departmentId,
        code: formattedCode,
      },
    },
  });

  if (existing) {
    return {
      success: false,
      error: `Course code '${formattedCode}' already exists in this department.`,
      fieldErrors: {
        code: `Course code '${formattedCode}' already exists in this department.`,
      },
    };
  }

  const headerList = await headers();
  const clientIp = getClientIp(headerList);

  const created = await prisma.$transaction(async (tx) => {
    const course = await tx.course.create({
      data: {
        code: formattedCode,
        title,
        credits: new Prisma.Decimal(credits),
        departmentId,
        description: description || null,
      },
      include: {
        department: { select: { id: true, name: true, code: true } },
        _count: { select: { offerings: true } },
      },
    });

    await tx.auditLog.create({
      data: {
        action: "COURSE_CREATED",
        objectType: "Course",
        objectId: course.id,
        userId: caller.id,
        description: `Created catalog course ${course.code}: ${course.title} (${course.credits} cr)`,
        ip: clientIp,
      },
    });

    return course;
  });

  revalidatePath("/admin/courses");
  return {
    success: true,
    course: {
      ...created,
      credits: Number(created.credits),
    },
  };
}

/**
 * Update an existing catalog course.
 */
export async function updateCourseAction(id: string, input: CourseInput) {
  const caller = await requireRole(Role.SUPER_ADMIN, Role.DEPT_ADMIN);

  const targetCourse = await prisma.course.findUniqueOrThrow({
    where: { id },
  });

  // DEPT_ADMIN permission check
  if (caller.role === Role.DEPT_ADMIN) {
    const callerDeptId = await getCallerDeptId(caller.id);
    if (targetCourse.departmentId !== callerDeptId) {
      throw new ForbiddenError(
        "Department Administrators cannot edit courses of another department."
      );
    }
  }

  const parsed = courseSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    parsed.error.issues.forEach((issue) => {
      fieldErrors[issue.path[0] as string] = issue.message;
    });
    return {
      success: false,
      error: "Validation failed.",
      fieldErrors,
    };
  }

  const { code, title, credits, departmentId, description } = parsed.data;
  const formattedCode = code.toUpperCase().trim();

  // Check unique constraint excluding self
  const duplicate = await prisma.course.findFirst({
    where: {
      departmentId,
      code: formattedCode,
      NOT: { id },
    },
  });

  if (duplicate) {
    return {
      success: false,
      error: `Course code '${formattedCode}' already exists in this department.`,
      fieldErrors: {
        code: `Course code '${formattedCode}' is already taken.`,
      },
    };
  }

  const headerList = await headers();
  const clientIp = getClientIp(headerList);

  const updated = await prisma.$transaction(async (tx) => {
    const course = await tx.course.update({
      where: { id },
      data: {
        code: formattedCode,
        title,
        credits: new Prisma.Decimal(credits),
        departmentId,
        description: description || null,
      },
      include: {
        department: { select: { id: true, name: true, code: true } },
        _count: { select: { offerings: true } },
      },
    });

    await tx.auditLog.create({
      data: {
        action: "COURSE_UPDATED",
        objectType: "Course",
        objectId: course.id,
        userId: caller.id,
        description: `Updated course ${course.code}: ${course.title}`,
        ip: clientIp,
      },
    });

    return course;
  });

  revalidatePath("/admin/courses");
  return {
    success: true,
    course: {
      ...updated,
      credits: Number(updated.credits),
    },
  };
}

/**
 * Delete a course. Blocked if offerings exist.
 */
export async function deleteCourseAction(id: string) {
  const caller = await requireRole(Role.SUPER_ADMIN, Role.DEPT_ADMIN);

  const course = await prisma.course.findUniqueOrThrow({
    where: { id },
    include: { _count: { select: { offerings: true } } },
  });

  if (caller.role === Role.DEPT_ADMIN) {
    const callerDeptId = await getCallerDeptId(caller.id);
    if (course.departmentId !== callerDeptId) {
      throw new ForbiddenError(
        "Department Administrators cannot delete courses from other departments."
      );
    }
  }

  // Block deletion if offerings exist
  if (course._count.offerings > 0) {
    return {
      success: false,
      error: `Cannot delete course '${course.code}' because it has ${course._count.offerings} recorded offering(s). You may edit the course details instead.`,
    };
  }

  const headerList = await headers();
  const clientIp = getClientIp(headerList);

  await prisma.$transaction(async (tx) => {
    await tx.course.delete({ where: { id } });

    await tx.auditLog.create({
      data: {
        action: "COURSE_DELETED",
        objectType: "Course",
        objectId: id,
        userId: caller.id,
        description: `Deleted catalog course ${course.code}`,
        ip: clientIp,
      },
    });
  });

  revalidatePath("/admin/courses");
  return { success: true };
}
