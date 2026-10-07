"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import crypto from "crypto";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getClientIp } from "@/lib/utils/ip";
import { Role, CourseOfferingStatus, OfferingTeacherRole, Prisma } from "@prisma/client";
import { ForbiddenError } from "@/lib/auth/errors";
import { assertOfferingWritable, canViewOffering } from "@/lib/auth/guards";
import { z } from "zod";

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

/**
 * Every offering write goes through this: rejects ARCHIVED offerings (assertOfferingWritable)
 * and rejects DEPT_ADMINs acting on another department's offering.
 */
async function assertManageOffering(
  caller: { id: string; role: Role },
  offeringId: string
) {
  const offering = await assertOfferingWritable(offeringId);
  if (caller.role === Role.DEPT_ADMIN) {
    const callerDeptId = await getCallerDeptId(caller.id);
    if (offering.course.departmentId !== callerDeptId) {
      throw new ForbiddenError(
        "Department Administrators cannot modify offerings of another department."
      );
    }
  }
  return offering;
}

import {
  getOfferingsParamsSchema,
  type GetOfferingsParams,
  createOfferingSchema,
  type CreateOfferingInput,
  updateOfferingStatusSchema,
  addSectionSchema,
  renameSectionSchema,
  sectionIdParamSchema,
  assignOfferingTeacherSchema,
  removeOfferingTeacherSchema,
} from "@/lib/validations/offerings";

export type { GetOfferingsParams, CreateOfferingInput };

/**
 * Fetch course offerings with filtering by term, academic year, status, and department.
 * Restricted to administrative roles (SUPER_ADMIN, DEPT_ADMIN).
 */
export async function getOfferingsAction(rawParams: GetOfferingsParams = {}) {
  const caller = await requireRole(Role.SUPER_ADMIN, Role.DEPT_ADMIN);
  const params = getOfferingsParamsSchema.parse(rawParams);

  const page = Math.max(1, params.page || 1);
  const pageSize = Math.min(100, Math.max(5, params.pageSize || 20));
  const skip = (page - 1) * pageSize;

  const where: Prisma.CourseOfferingWhereInput = {};

  // DEPT_ADMIN is scoped strictly to courses of their department
  if (caller.role === Role.DEPT_ADMIN) {
    const callerDeptId = await getCallerDeptId(caller.id);
    where.course = { departmentId: callerDeptId };
  } else if (params.departmentId && params.departmentId !== "ALL") {
    where.course = { departmentId: params.departmentId };
  }

  if (params.status) {
    where.status = params.status;
  }

  if (params.term && params.term !== "ALL") {
    where.term = params.term;
  }

  if (params.academicYear && params.academicYear !== "ALL") {
    where.academicYear = params.academicYear;
  }

  if (params.search?.trim()) {
    const q = params.search.trim();
    where.AND = [
      ...(where.AND ? (Array.isArray(where.AND) ? where.AND : [where.AND]) : []),
      {
        course: {
          OR: [
            { code: { contains: q, mode: "insensitive" } },
            { title: { contains: q, mode: "insensitive" } },
          ],
        },
      },
    ];
  }

  const [offerings, total] = await Promise.all([
    prisma.courseOffering.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: [{ academicYear: "desc" }, { createdAt: "desc" }],
      include: {
        course: {
          include: {
            department: { select: { id: true, name: true, code: true } },
          },
        },
        sections: {
          select: {
            id: true,
            name: true,
            _count: { select: { enrollments: true } },
          },
        },
        offeringTeachers: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    }),
    prisma.courseOffering.count({ where }),
  ]);

  return {
    offerings,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

/**
 * Fetch offering detail by ID with authorization checks.
 */
export async function getOfferingDetailAction(offeringId: string) {
  const validOfferingId = z.string().trim().min(1, "Offering ID is required.").parse(offeringId);
  const caller = await requireRole(
    Role.SUPER_ADMIN,
    Role.DEPT_ADMIN,
    Role.TEACHER,
    Role.STUDENT
  );

  const canView = await canViewOffering(caller, validOfferingId);
  if (!canView) {
    throw new ForbiddenError("You are not authorized to view this course offering.");
  }

  const offering = await prisma.courseOffering.findUniqueOrThrow({
    where: { id: validOfferingId },
    include: {
      course: {
        include: {
          department: { select: { id: true, name: true, code: true } },
        },
      },
      sections: {
        orderBy: { name: "asc" },
        include: {
          _count: { select: { enrollments: true } },
        },
      },
      offeringTeachers: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              teacherProfile: { select: { designation: true, employeeId: true } },
            },
          },
        },
      },
    },
  });

  return offering;
}


/**
 * Create a new offering from a catalog course (Initial status: DRAFT).
 */
export async function createOfferingAction(rawInput: {
  courseId: string;
  term: string;
  academicYear: string;
  syllabus?: string;
}) {
  const caller = await requireRole(Role.SUPER_ADMIN, Role.DEPT_ADMIN);
  const input = createOfferingSchema.parse(rawInput);

  const course = await prisma.course.findUniqueOrThrow({
    where: { id: input.courseId },
  });

  // DEPT_ADMIN permission check
  if (caller.role === Role.DEPT_ADMIN) {
    const callerDeptId = await getCallerDeptId(caller.id);
    if (course.departmentId !== callerDeptId) {
      throw new ForbiddenError(
        "Department Administrators can only create offerings for courses in their department."
      );
    }
  }

  const headerList = await headers();
  const clientIp = getClientIp(headerList);

  const created = await prisma.$transaction(async (tx) => {
    const offering = await tx.courseOffering.create({
      data: {
        courseId: input.courseId,
        term: input.term,
        academicYear: input.academicYear,
        status: CourseOfferingStatus.DRAFT,
        syllabus: input.syllabus || null,
        sections: {
          create: [{ name: "Section A" }],
        },
      },
      include: {
        course: true,
        sections: true,
      },
    });

    await tx.auditLog.create({
      data: {
        action: "OFFERING_CREATED",
        objectType: "CourseOffering",
        objectId: offering.id,
        userId: caller.id,
        description: `Created offering for ${offering.course.code} (${offering.academicYear} ${offering.term})`,
        ip: clientIp,
      },
    });

    return offering;
  });

  revalidatePath("/dept/offerings");
  return { success: true, offering: created };
}

/**
 * Update offering status with academic validation rules.
 * DRAFT -> PUBLISHED: Requires at least 1 instructor AND at least 1 section.
 * Any -> ARCHIVED: Sets status to ARCHIVED (read-only forever).
 */
export async function updateOfferingStatusAction(
  offeringId: string,
  newStatus: CourseOfferingStatus
) {
  const validOfferingId = z.string().trim().min(1, "Offering ID is required.").parse(offeringId);
  const validStatus = z.nativeEnum(CourseOfferingStatus).parse(newStatus);
  const caller = await requireRole(Role.SUPER_ADMIN, Role.DEPT_ADMIN);

  // Guard against editing an already archived offering
  const currentOffering = await assertOfferingWritable(validOfferingId);

  // DEPT_ADMIN permission check
  if (caller.role === Role.DEPT_ADMIN) {
    const callerDeptId = await getCallerDeptId(caller.id);
    if (currentOffering.course.departmentId !== callerDeptId) {
      throw new ForbiddenError(
        "Department Administrators cannot modify offerings of another department."
      );
    }
  }

  // Publication requirements check
  if (validStatus === CourseOfferingStatus.PUBLISHED) {
    const [sectionsCount, instructorsCount] = await Promise.all([
      prisma.section.count({ where: { offeringId: validOfferingId } }),
      prisma.offeringTeacher.count({
        where: { offeringId: validOfferingId, role: OfferingTeacherRole.INSTRUCTOR },
      }),
    ]);

    if (sectionsCount === 0) {
      return {
        success: false,
        error:
          "Cannot publish offering: At least one section is required before publishing.",
      };
    }

    if (instructorsCount === 0) {
      return {
        success: false,
        error:
          "Cannot publish offering: At least one INSTRUCTOR must be assigned before publishing.",
      };
    }
  }

  const headerList = await headers();
  const clientIp = getClientIp(headerList);

  const updated = await prisma.$transaction(async (tx) => {
    const off = await tx.courseOffering.update({
      where: { id: validOfferingId },
      data: { status: validStatus },
    });

    const action =
      validStatus === CourseOfferingStatus.PUBLISHED
        ? "OFFERING_PUBLISHED"
        : validStatus === CourseOfferingStatus.ARCHIVED
        ? "OFFERING_ARCHIVED"
        : "OFFERING_UPDATED";

    await tx.auditLog.create({
      data: {
        action,
        objectType: "CourseOffering",
        objectId: validOfferingId,
        userId: caller.id,
        description: `Offering ${currentOffering.course.code} status transitioned to ${validStatus}`,
        ip: clientIp,
      },
    });

    return off;
  });

  revalidatePath(`/dept/offerings/${validOfferingId}`);
  revalidatePath("/dept/offerings");
  return { success: true, offering: updated };
}

/**
 * Add a section to an offering.
 */
export async function addSectionAction(offeringId: string, name: string) {
  const validOfferingId = z.string().trim().min(1, "Offering ID is required.").parse(offeringId);
  const trimmedName = z.string().trim().min(1, "Section name cannot be empty.").max(50).parse(name);

  const caller = await requireRole(Role.SUPER_ADMIN, Role.DEPT_ADMIN);
  await assertManageOffering(caller, validOfferingId);

  const existing = await prisma.section.findUnique({
    where: { offeringId_name: { offeringId: validOfferingId, name: trimmedName } },
  });
  if (existing) {
    return {
      success: false,
      error: `Section '${trimmedName}' already exists in this offering.`,
    };
  }

  const headerList = await headers();
  const clientIp = getClientIp(headerList);

  const section = await prisma.$transaction(async (tx) => {
    const sec = await tx.section.create({
      data: { offeringId: validOfferingId, name: trimmedName },
    });

    await tx.auditLog.create({
      data: {
        action: "SECTION_CHANGED",
        objectType: "Section",
        objectId: sec.id,
        userId: caller.id,
        description: `Added ${sec.name} to offering ${validOfferingId}`,
        ip: clientIp,
      },
    });

    return sec;
  });

  revalidatePath(`/dept/offerings/${validOfferingId}`);
  return { success: true, section };
}

/**
 * Rename a section.
 */
export async function renameSectionAction(sectionId: string, newName: string) {
  const validSectionId = z.string().trim().min(1, "Section ID is required.").parse(sectionId);
  const trimmed = z.string().trim().min(1, "Section name cannot be empty.").max(50).parse(newName);

  const caller = await requireRole(Role.SUPER_ADMIN, Role.DEPT_ADMIN);

  const section = await prisma.section.findUniqueOrThrow({
    where: { id: validSectionId },
  });
  await assertManageOffering(caller, section.offeringId);

  const duplicate = await prisma.section.findFirst({
    where: {
      offeringId: section.offeringId,
      name: trimmed,
      NOT: { id: validSectionId },
    },
  });
  if (duplicate) {
    return {
      success: false,
      error: `Section name '${trimmed}' is already in use.`,
    };
  }

  const headerList = await headers();
  const clientIp = getClientIp(headerList);

  const updated = await prisma.$transaction(async (tx) => {
    const sec = await tx.section.update({
      where: { id: validSectionId },
      data: { name: trimmed },
    });

    await tx.auditLog.create({
      data: {
        action: "SECTION_CHANGED",
        objectType: "Section",
        objectId: sec.id,
        userId: caller.id,
        description: `Renamed section to ${trimmed}`,
        ip: clientIp,
      },
    });

    return sec;
  });

  revalidatePath(`/dept/offerings/${section.offeringId}`);
  return { success: true, section: updated };
}

/**
 * Remove an empty section.
 */
export async function removeSectionAction(sectionId: string) {
  const validSectionId = z.string().trim().min(1, "Section ID is required.").parse(sectionId);
  const caller = await requireRole(Role.SUPER_ADMIN, Role.DEPT_ADMIN);

  const section = await prisma.section.findUniqueOrThrow({
    where: { id: validSectionId },
    include: { _count: { select: { enrollments: true } } },
  });
  await assertManageOffering(caller, section.offeringId);

  if (section._count.enrollments > 0) {
    return {
      success: false,
      error: `Cannot delete section '${section.name}' because it contains ${section._count.enrollments} enrolled student(s).`,
    };
  }

  const headerList = await headers();
  const clientIp = getClientIp(headerList);

  await prisma.$transaction(async (tx) => {
    await tx.section.delete({ where: { id: validSectionId } });

    await tx.auditLog.create({
      data: {
        action: "SECTION_CHANGED",
        objectType: "Section",
        objectId: validSectionId,
        userId: caller.id,
        description: `Deleted section ${section.name}`,
        ip: clientIp,
      },
    });
  });

  revalidatePath(`/dept/offerings/${section.offeringId}`);
  return { success: true };
}

/**
 * Assign a teacher (INSTRUCTOR or TA) to an offering.
 */
export async function assignOfferingTeacherAction(
  offeringId: string,
  userId: string,
  role: OfferingTeacherRole
) {
  const validOfferingId = z.string().trim().min(1, "Offering ID is required.").parse(offeringId);
  const validUserId = z.string().trim().min(1, "User ID is required.").parse(userId);
  const validRole = z.nativeEnum(OfferingTeacherRole).parse(role);

  const caller = await requireRole(Role.SUPER_ADMIN, Role.DEPT_ADMIN);
  await assertManageOffering(caller, validOfferingId);

  const teacher = await prisma.user.findFirst({
    where: { id: validUserId, role: Role.TEACHER, isActive: true },
    include: { teacherProfile: true },
  });
  if (!teacher || !teacher.teacherProfile) {
    return { success: false, error: "Selected user is not an active faculty member." };
  }

  const headerList = await headers();
  const clientIp = getClientIp(headerList);

  const assigned = await prisma.$transaction(async (tx) => {
    const item = await tx.offeringTeacher.upsert({
      where: { offeringId_userId: { offeringId: validOfferingId, userId: validUserId } },
      update: { role: validRole },
      create: { offeringId: validOfferingId, userId: validUserId, role: validRole },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            teacherProfile: {
              select: {
                designation: true,
                employeeId: true,
              },
            },
          },
        },
      },
    });

    await tx.auditLog.create({
      data: {
        action: "TEACHER_ASSIGNED",
        objectType: "OfferingTeacher",
        objectId: item.id,
        userId: caller.id,
        description: `Assigned ${item.user.name} as ${validRole} for offering ${validOfferingId}`,
        ip: clientIp,
      },
    });

    return item;
  });

  revalidatePath(`/dept/offerings/${validOfferingId}`);
  return { success: true, teacher: assigned };
}

/**
 * Remove a teacher from an offering.
 */
export async function removeOfferingTeacherAction(
  offeringId: string,
  userId: string
) {
  const validOfferingId = z.string().trim().min(1, "Offering ID is required.").parse(offeringId);
  const validUserId = z.string().trim().min(1, "User ID is required.").parse(userId);

  const caller = await requireRole(Role.SUPER_ADMIN, Role.DEPT_ADMIN);
  await assertManageOffering(caller, validOfferingId);

  const headerList = await headers();
  const clientIp = getClientIp(headerList);

  await prisma.$transaction(async (tx) => {
    const item = await tx.offeringTeacher.delete({
      where: { offeringId_userId: { offeringId: validOfferingId, userId: validUserId } },
    });

    await tx.auditLog.create({
      data: {
        action: "TEACHER_REMOVED",
        objectType: "OfferingTeacher",
        objectId: item.id,
        userId: caller.id,
        description: `Removed teacher assignment ${validUserId} from offering ${validOfferingId}`,
        ip: clientIp,
      },
    });
  });

  revalidatePath(`/dept/offerings/${validOfferingId}`);
  return { success: true };
}

/**
 * Generate or regenerate join code for an offering.
 */
export async function generateJoinCodeAction(offeringId: string) {
  const validOfferingId = z.string().trim().min(1, "Offering ID is required.").parse(offeringId);
  const caller = await requireRole(Role.SUPER_ADMIN, Role.DEPT_ADMIN);
  await assertManageOffering(caller, validOfferingId);

  const randomPart = crypto.randomBytes(3).toString("hex").toUpperCase();
  const joinCode = `RUET-${randomPart}`;

  const headerList = await headers();
  const clientIp = getClientIp(headerList);

  await prisma.$transaction([
    prisma.courseOffering.update({
      where: { id: validOfferingId },
      data: { joinCode },
    }),
    prisma.auditLog.create({
      data: {
        action: "JOIN_CODE_GENERATED",
        objectType: "CourseOffering",
        objectId: validOfferingId,
        userId: caller.id,
        description: `Generated join code ${joinCode} for course offering`,
        ip: clientIp,
      },
    }),
  ]);

  revalidatePath(`/dept/offerings/${validOfferingId}`);
  return { success: true, joinCode };
}

/**
 * Disable join code for an offering.
 */
export async function disableJoinCodeAction(offeringId: string) {
  const validOfferingId = z.string().trim().min(1, "Offering ID is required.").parse(offeringId);
  const caller = await requireRole(Role.SUPER_ADMIN, Role.DEPT_ADMIN);
  await assertManageOffering(caller, validOfferingId);

  const headerList = await headers();
  const clientIp = getClientIp(headerList);

  await prisma.$transaction([
    prisma.courseOffering.update({
      where: { id: validOfferingId },
      data: { joinCode: null },
    }),
    prisma.auditLog.create({
      data: {
        action: "JOIN_CODE_DISABLED",
        objectType: "CourseOffering",
        objectId: validOfferingId,
        userId: caller.id,
        description: `Disabled self-join code for course offering`,
        ip: clientIp,
      },
    }),
  ]);

  revalidatePath(`/dept/offerings/${validOfferingId}`);
  return { success: true };
}

/**
 * Toggle whether join-by-code is restricted to students of the course's department.
 */
export async function setJoinDeptRestrictionAction(
  offeringId: string,
  restricted: boolean
) {
  const validOfferingId = z.string().trim().min(1, "Offering ID is required.").parse(offeringId);
  const validRestricted = z.boolean().parse(restricted);
  const caller = await requireRole(Role.SUPER_ADMIN, Role.DEPT_ADMIN);
  await assertManageOffering(caller, validOfferingId);

  const headerList = await headers();
  const clientIp = getClientIp(headerList);

  await prisma.$transaction([
    prisma.courseOffering.update({
      where: { id: validOfferingId },
      data: { joinRequiresDeptMatch: validRestricted },
    }),
    prisma.auditLog.create({
      data: {
        action: "OFFERING_UPDATED",
        objectType: "CourseOffering",
        objectId: validOfferingId,
        userId: caller.id,
        description: `Join code department restriction ${validRestricted ? "enabled" : "disabled"}`,
        ip: clientIp,
      },
    }),
  ]);

  revalidatePath(`/dept/offerings/${validOfferingId}`);
  return { success: true, joinRequiresDeptMatch: validRestricted };
}
