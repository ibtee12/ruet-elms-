"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getClientIp } from "@/lib/utils/ip";
import { Role, NotificationType } from "@prisma/client";
import { ForbiddenError, NotFoundError } from "@/lib/auth/errors";
import {
  assertOfferingTeacher,
  assertOfferingWritable,
  assertDeptAccess,
} from "@/lib/auth/guards";
import { sanitizeHtml } from "@/lib/sanitize";
import { createBulkNotifications } from "@/lib/notifications";
import { z } from "zod";

const AnnouncementInputSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Title is required.")
    .max(200, "Title cannot exceed 200 characters."),
  body: z
    .string()
    .trim()
    .min(1, "Body is required.")
    .max(10000, "Body cannot exceed 10,000 characters."),
  notifyStudents: z.boolean().optional(),
});

const OverviewUpdateSchema = z.object({
  offeringId: z.string().trim().min(1, "Offering ID is required."),
  description: z.string().trim().max(3000, "Description cannot exceed 3000 characters.").optional(),
  syllabus: z.string().trim().max(10000, "Syllabus cannot exceed 10000 characters.").optional(),
});

async function getSafeClientIp(): Promise<string> {
  try {
    const headerList = await headers();
    return getClientIp(headerList);
  } catch {
    return "127.0.0.1";
  }
}

/**
 * Creates an announcement for a specific course offering.
 * Only instructors and TAs assigned to the offering can post.
 * Reject on ARCHIVED offerings.
 */
export async function createOfferingAnnouncementAction(
  offeringId: string,
  input: {
    title: string;
    body: string;
    notifyStudents?: boolean;
  }
) {
  const caller = await requireRole(Role.TEACHER, Role.SUPER_ADMIN);

  // Rejects archived offerings
  const offering = await assertOfferingWritable(offeringId);

  // Object-level authorization
  if (caller.role === Role.TEACHER) {
    await assertOfferingTeacher(caller.id, offeringId);
  }

  const validated = AnnouncementInputSchema.parse(input);
  const cleanBody = sanitizeHtml(validated.body);

  const clientIp = await getSafeClientIp();

  const announcement = await prisma.$transaction(async (tx) => {
    const ann = await tx.announcement.create({
      data: {
        offeringId,
        title: validated.title,
        body: cleanBody,
        authorId: caller.id,
      },
    });

    await tx.auditLog.create({
      data: {
        action: "ANNOUNCEMENT_CREATED",
        objectType: "Announcement",
        objectId: ann.id,
        userId: caller.id,
        description: `Created offering announcement "${validated.title}" for ${offering.course.code}`,
        ip: clientIp,
      },
    });

    return ann;
  });

  // If notifyStudents is on, create GENERAL notifications for actively enrolled students
  if (validated.notifyStudents) {
    const enrollments = await prisma.enrollment.findMany({
      where: {
        section: { offeringId },
        status: "ACTIVE",
      },
      select: { studentId: true },
    });

    const studentIds = Array.from(new Set(enrollments.map((e) => e.studentId)));

    await createBulkNotifications(
      studentIds.map((sid) => ({
        userId: sid,
        type: NotificationType.GENERAL,
        title: `New Announcement: ${offering.course.code}`,
        message: `${validated.title}`,
        link: `/courses/${offeringId}`,
      }))
    );
  }

  revalidatePath(`/teach/${offeringId}`);
  revalidatePath(`/teach/${offeringId}/announcements`);
  revalidatePath(`/courses/${offeringId}`);
  revalidatePath("/dashboard");

  return { success: true, announcement };
}

/**
 * Creates a department-level announcement.
 * Only DEPT_ADMINs owning the department (or SUPER_ADMIN) can post.
 */
export async function createDepartmentAnnouncementAction(
  departmentId: string,
  input: {
    title: string;
    body: string;
    notifyUsers?: boolean;
  }
) {
  const caller = await requireRole(Role.DEPT_ADMIN, Role.SUPER_ADMIN);
  await assertDeptAccess(caller.id, departmentId);

  const validated = AnnouncementInputSchema.parse(input);
  const cleanBody = sanitizeHtml(validated.body);

  const clientIp = await getSafeClientIp();

  const announcement = await prisma.$transaction(async (tx) => {
    const ann = await tx.announcement.create({
      data: {
        departmentId,
        title: validated.title,
        body: cleanBody,
        authorId: caller.id,
      },
    });

    await tx.auditLog.create({
      data: {
        action: "ANNOUNCEMENT_CREATED",
        objectType: "Announcement",
        objectId: ann.id,
        userId: caller.id,
        description: `Created department announcement "${validated.title}"`,
        ip: clientIp,
      },
    });

    return ann;
  });

  if (input.notifyUsers) {
    // Notify all students and faculty in this department
    const [students, teachers] = await Promise.all([
      prisma.studentProfile.findMany({
        where: { departmentId },
        select: { userId: true },
      }),
      prisma.teacherProfile.findMany({
        where: { departmentId },
        select: { userId: true },
      }),
    ]);

    const recipientIds = Array.from(
      new Set([...students.map((s) => s.userId), ...teachers.map((t) => t.userId)])
    );

    await createBulkNotifications(
      recipientIds.map((uid) => ({
        userId: uid,
        type: NotificationType.GENERAL,
        title: `Department Announcement`,
        message: `${validated.title}`,
        link: `/dashboard`,
      }))
    );
  }

  revalidatePath("/dashboard");
  return { success: true, announcement };
}

/**
 * Updates an announcement.
 */
export async function updateAnnouncementAction(
  announcementId: string,
  input: {
    title: string;
    body: string;
  }
) {
  const caller = await requireRole(Role.TEACHER, Role.DEPT_ADMIN, Role.SUPER_ADMIN);

  const announcement = await prisma.announcement.findUnique({
    where: { id: announcementId },
    include: { offering: true },
  });

  if (!announcement) {
    throw new NotFoundError("Announcement not found.");
  }

  // Check object-level access
  if (announcement.offeringId) {
    // Offering announcement: check teacher assignment and writable status
    await assertOfferingWritable(announcement.offeringId);
    if (caller.role === Role.TEACHER) {
      await assertOfferingTeacher(caller.id, announcement.offeringId);
    }
  } else if (announcement.departmentId) {
    // Department announcement: check department admin access
    await assertDeptAccess(caller.id, announcement.departmentId);
  }

  const validated = AnnouncementInputSchema.parse(input);
  const cleanBody = sanitizeHtml(validated.body);

  const clientIp = await getSafeClientIp();

  const updated = await prisma.$transaction(async (tx) => {
    const ann = await tx.announcement.update({
      where: { id: announcementId },
      data: {
        title: validated.title,
        body: cleanBody,
      },
    });

    await tx.auditLog.create({
      data: {
        action: "ANNOUNCEMENT_UPDATED",
        objectType: "Announcement",
        objectId: ann.id,
        userId: caller.id,
        description: `Updated announcement "${validated.title}"`,
        ip: clientIp,
      },
    });

    return ann;
  });

  if (announcement.offeringId) {
    revalidatePath(`/teach/${announcement.offeringId}`);
    revalidatePath(`/teach/${announcement.offeringId}/announcements`);
    revalidatePath(`/courses/${announcement.offeringId}`);
  }
  revalidatePath("/dashboard");

  return { success: true, announcement: updated };
}

/**
 * Deletes an announcement.
 */
export async function deleteAnnouncementAction(announcementId: string) {
  const caller = await requireRole(Role.TEACHER, Role.DEPT_ADMIN, Role.SUPER_ADMIN);

  const announcement = await prisma.announcement.findUnique({
    where: { id: announcementId },
    include: { offering: true },
  });

  if (!announcement) {
    throw new NotFoundError("Announcement not found.");
  }

  // Check object-level access
  if (announcement.offeringId) {
    await assertOfferingWritable(announcement.offeringId);
    if (caller.role === Role.TEACHER) {
      await assertOfferingTeacher(caller.id, announcement.offeringId);
    }
  } else if (announcement.departmentId) {
    await assertDeptAccess(caller.id, announcement.departmentId);
  }

  const clientIp = await getSafeClientIp();

  await prisma.$transaction(async (tx) => {
    await tx.announcement.delete({
      where: { id: announcementId },
    });

    await tx.auditLog.create({
      data: {
        action: "ANNOUNCEMENT_DELETED",
        objectType: "Announcement",
        objectId: announcementId,
        userId: caller.id,
        description: `Deleted announcement "${announcement.title}"`,
        ip: clientIp,
      },
    });
  });

  if (announcement.offeringId) {
    revalidatePath(`/teach/${announcement.offeringId}`);
    revalidatePath(`/teach/${announcement.offeringId}/announcements`);
    revalidatePath(`/courses/${announcement.offeringId}`);
  }
  revalidatePath("/dashboard");

  return { success: true };
}

/**
 * Updates course description and offering syllabus.
 * Teachers can edit description and syllabus, rejected on ARCHIVED offerings.
 */
export async function updateOfferingOverviewAction(input: {
  offeringId: string;
  description?: string;
  syllabus?: string;
}) {
  const caller = await requireRole(Role.TEACHER, Role.SUPER_ADMIN);
  const validated = OverviewUpdateSchema.parse(input);

  // Reject on ARCHIVED offerings
  const offering = await assertOfferingWritable(validated.offeringId);

  if (caller.role === Role.TEACHER) {
    await assertOfferingTeacher(caller.id, validated.offeringId);
  }

  const cleanSyllabus = validated.syllabus !== undefined ? sanitizeHtml(validated.syllabus) : undefined;
  const cleanDescription = validated.description !== undefined ? sanitizeHtml(validated.description) : undefined;

  const clientIp = await getSafeClientIp();

  await prisma.$transaction(async (tx) => {
    if (cleanSyllabus !== undefined) {
      await tx.courseOffering.update({
        where: { id: validated.offeringId },
        data: { syllabus: cleanSyllabus },
      });
    }

    if (cleanDescription !== undefined) {
      await tx.course.update({
        where: { id: offering.courseId },
        data: { description: cleanDescription },
      });
    }

    await tx.auditLog.create({
      data: {
        action: "OFFERING_UPDATED",
        objectType: "CourseOffering",
        objectId: validated.offeringId,
        userId: caller.id,
        description: `Updated description and syllabus for ${offering.course.code}`,
        ip: clientIp,
      },
    });
  });

  revalidatePath(`/teach/${validated.offeringId}`);
  revalidatePath(`/courses/${validated.offeringId}`);

  return { success: true };
}
