"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import crypto from "crypto";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getClientIp } from "@/lib/utils/ip";
import { Role, NotificationType, CourseOfferingStatus } from "@prisma/client";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/auth/errors";
import {
  assertOfferingTeacher,
  assertOfferingWritable,
} from "@/lib/auth/guards";
import {
  validateMaterialFile,
  uploadToSupabaseBucket,
  deleteFromSupabaseBucket,
  sanitizeDisplayName,
} from "@/lib/storage";
import { sanitizeHtml } from "@/lib/sanitize";
import { formatDhaka } from "@/lib/datetime";
import { createBulkNotifications } from "@/lib/notifications";
import { z } from "zod";

async function getSafeClientIp(): Promise<string> {
  try {
    const headerList = await headers();
    return getClientIp(headerList);
  } catch {
    return "127.0.0.1";
  }
}

const AssignmentSchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, "Title must be at least 2 characters.")
    .max(150, "Title cannot exceed 150 characters."),
  description: z.string().optional().default(""),
  deadline: z.coerce.date(),
  maxMarks: z.coerce.number().positive("Maximum marks must be greater than 0."),
  allowedTypes: z.array(z.string()).default([]),
  maxSizeMb: z.coerce.number().int().min(1).max(500).default(50),
  lateAllowed: z.boolean().default(false),
  latePenaltyPercent: z.coerce.number().int().min(0).max(100).default(0),
  published: z.boolean().default(false),
});

export interface AttachmentInput {
  fileKey: string;
  originalName: string;
  mime: string;
  sizeBytes: number;
}

export interface CreateAssignmentParams {
  offeringId: string;
  title: string;
  description?: string;
  deadline: Date | string;
  maxMarks: number;
  allowedTypes: string[];
  maxSizeMb: number;
  lateAllowed: boolean;
  latePenaltyPercent: number;
  published: boolean;
  attachments?: AttachmentInput[];
}

export interface UpdateAssignmentParams {
  assignmentId: string;
  title: string;
  description?: string;
  deadline: Date | string;
  maxMarks: number;
  allowedTypes: string[];
  maxSizeMb: number;
  lateAllowed: boolean;
  latePenaltyPercent: number;
  published: boolean;
  attachments?: AttachmentInput[];
}

/**
 * Creates a new assignment for a course offering.
 */
export async function createAssignmentAction(params: CreateAssignmentParams) {
  const caller = await requireRole(Role.TEACHER, Role.SUPER_ADMIN);
  const clientIp = await getSafeClientIp();

  await assertOfferingWritable(params.offeringId);
  if (caller.role === Role.TEACHER) {
    await assertOfferingTeacher(caller.id, params.offeringId);
  }

  const validated = AssignmentSchema.parse(params);
  const cleanDescription = validated.description ? sanitizeHtml(validated.description) : "";

  // Validation: deadline must be in the future when publishing
  if (validated.published && validated.deadline.getTime() <= Date.now()) {
    throw new ValidationError(
      "The assignment deadline must be set in the future when publishing."
    );
  }

  const assignment = await prisma.assignment.create({
    data: {
      offeringId: params.offeringId,
      title: validated.title,
      description: cleanDescription,
      deadline: validated.deadline,
      maxMarks: validated.maxMarks,
      allowedTypes: validated.allowedTypes,
      maxSizeMb: validated.maxSizeMb,
      lateAllowed: validated.lateAllowed,
      latePenaltyPercent: validated.latePenaltyPercent,
      published: validated.published,
      createdById: caller.id,
      attachments: {
        create: (params.attachments || []).map((att) => ({
          fileKey: att.fileKey,
          originalName: sanitizeDisplayName(att.originalName),
          mime: att.mime,
          sizeBytes: att.sizeBytes,
        })),
      },
    },
    include: {
      attachments: true,
      offering: {
        include: {
          course: true,
        },
      },
    },
  });

  // AuditLog: ASSIGNMENT_CREATED
  await prisma.auditLog.create({
    data: {
      action: "ASSIGNMENT_CREATED",
      objectType: "Assignment",
      objectId: assignment.id,
      userId: caller.id,
      description: `Assignment "${assignment.title}" created (${validated.published ? "Published" : "Draft"})`,
      ip: clientIp,
    },
  });

  // If published immediately, log ASSIGNMENT_PUBLISHED and notify students
  if (validated.published) {
    await prisma.auditLog.create({
      data: {
        action: "ASSIGNMENT_PUBLISHED",
        objectType: "Assignment",
        objectId: assignment.id,
        userId: caller.id,
        description: `Assignment "${assignment.title}" published for students`,
        ip: clientIp,
      },
    });

    // Notify enrolled students
    await notifyEnrolledStudents({
      offeringId: params.offeringId,
      title: `New Assignment: ${assignment.title}`,
      message: `A new assignment was published for ${assignment.offering.course.code}. Deadline: ${formatDhaka(assignment.deadline, "full")}`,
      link: `/courses/${params.offeringId}/assignments`,
    });
  }

  revalidatePath(`/teach/${params.offeringId}/assignments`);
  revalidatePath(`/courses/${params.offeringId}/assignments`);

  return { success: true, assignment };
}

/**
 * Updates an existing assignment.
 */
export async function updateAssignmentAction(params: UpdateAssignmentParams) {
  const caller = await requireRole(Role.TEACHER, Role.SUPER_ADMIN);
  const clientIp = await getSafeClientIp();

  const existing = await prisma.assignment.findUnique({
    where: { id: params.assignmentId },
    include: {
      attachments: true,
      offering: {
        include: {
          course: true,
        },
      },
    },
  });

  if (!existing) {
    throw new NotFoundError("Assignment not found.");
  }

  await assertOfferingWritable(existing.offeringId);
  if (caller.role === Role.TEACHER) {
    await assertOfferingTeacher(caller.id, existing.offeringId);
  }

  const validated = AssignmentSchema.parse(params);
  const cleanDescription = validated.description ? sanitizeHtml(validated.description) : "";

  // Validation: deadline must be in future if publishing for the first time
  const isPublishingNow = !existing.published && validated.published;
  if (isPublishingNow && validated.deadline.getTime() <= Date.now()) {
    throw new ValidationError(
      "The assignment deadline must be in the future when publishing."
    );
  }

  const oldDeadlineTime = existing.deadline.getTime();
  const newDeadlineTime = validated.deadline.getTime();
  const deadlineChanged = oldDeadlineTime !== newDeadlineTime;

  // Handle attachments sync
  const newAttachments = params.attachments || [];
  const currentAttachmentKeys = new Set(existing.attachments.map((a) => a.fileKey));
  const newAttachmentKeys = new Set(newAttachments.map((a) => a.fileKey));

  // Attachments to delete
  const attachmentsToDelete = existing.attachments.filter(
    (a) => !newAttachmentKeys.has(a.fileKey)
  );

  for (const del of attachmentsToDelete) {
    await prisma.assignmentAttachment.delete({ where: { id: del.id } });
    await deleteFromSupabaseBucket(del.fileKey);
    await prisma.auditLog.create({
      data: {
        action: "FILE_DELETED",
        objectType: "AssignmentAttachment",
        objectId: del.id,
        userId: caller.id,
        description: `Deleted assignment attachment "${del.originalName}"`,
        ip: clientIp,
      },
    });
  }

  // Attachments to add
  const attachmentsToAdd = newAttachments.filter(
    (a) => !currentAttachmentKeys.has(a.fileKey)
  );

  for (const add of attachmentsToAdd) {
    await prisma.assignmentAttachment.create({
      data: {
        assignmentId: existing.id,
        fileKey: add.fileKey,
        originalName: sanitizeDisplayName(add.originalName),
        mime: add.mime,
        sizeBytes: add.sizeBytes,
      },
    });
  }

  const updated = await prisma.assignment.update({
    where: { id: params.assignmentId },
    data: {
      title: validated.title,
      description: cleanDescription,
      deadline: validated.deadline,
      maxMarks: validated.maxMarks,
      allowedTypes: validated.allowedTypes,
      maxSizeMb: validated.maxSizeMb,
      lateAllowed: validated.lateAllowed,
      latePenaltyPercent: validated.latePenaltyPercent,
      published: validated.published,
    },
    include: {
      attachments: true,
    },
  });

  // AuditLog: ASSIGNMENT_UPDATED
  await prisma.auditLog.create({
    data: {
      action: "ASSIGNMENT_UPDATED",
      objectType: "Assignment",
      objectId: updated.id,
      userId: caller.id,
      description: `Assignment "${updated.title}" details updated`,
      ip: clientIp,
    },
  });

  // If newly published, log and notify
  if (isPublishingNow) {
    await prisma.auditLog.create({
      data: {
        action: "ASSIGNMENT_PUBLISHED",
        objectType: "Assignment",
        objectId: updated.id,
        userId: caller.id,
        description: `Assignment "${updated.title}" published for students`,
        ip: clientIp,
      },
    });

    await notifyEnrolledStudents({
      offeringId: existing.offeringId,
      title: `New Assignment: ${updated.title}`,
      message: `A new assignment was published for ${existing.offering.course.code}. Deadline: ${formatDhaka(updated.deadline, "full")}`,
      link: `/courses/${existing.offeringId}/assignments`,
    });
  }

  // If already published and deadline was edited, log DEADLINE_CHANGED and notify students
  if (existing.published && deadlineChanged) {
    await prisma.auditLog.create({
      data: {
        action: "DEADLINE_CHANGED",
        objectType: "Assignment",
        objectId: updated.id,
        userId: caller.id,
        description: `Deadline for "${updated.title}" changed from ${formatDhaka(existing.deadline, "full")} to ${formatDhaka(updated.deadline, "full")}`,
        ip: clientIp,
      },
    });

    await notifyEnrolledStudents({
      offeringId: existing.offeringId,
      title: `Assignment Deadline Updated: ${updated.title}`,
      message: `The deadline for ${updated.title} (${existing.offering.course.code}) was updated to ${formatDhaka(updated.deadline, "full")}.`,
      link: `/courses/${existing.offeringId}/assignments`,
    });
  }

  revalidatePath(`/teach/${existing.offeringId}/assignments`);
  revalidatePath(`/courses/${existing.offeringId}/assignments`);

  return { success: true, assignment: updated };
}

/**
 * Toggles an assignment's published state.
 */
export async function toggleAssignmentPublishedAction(
  assignmentId: string,
  published: boolean
) {
  const caller = await requireRole(Role.TEACHER, Role.SUPER_ADMIN);
  const clientIp = await getSafeClientIp();

  const existing = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    include: {
      offering: {
        include: { course: true },
      },
    },
  });

  if (!existing) {
    throw new NotFoundError("Assignment not found.");
  }

  await assertOfferingWritable(existing.offeringId);
  if (caller.role === Role.TEACHER) {
    await assertOfferingTeacher(caller.id, existing.offeringId);
  }

  if (published && existing.deadline.getTime() <= Date.now()) {
    throw new ValidationError(
      "The assignment deadline must be in the future to publish."
    );
  }

  const updated = await prisma.assignment.update({
    where: { id: assignmentId },
    data: { published },
  });

  if (published) {
    await prisma.auditLog.create({
      data: {
        action: "ASSIGNMENT_PUBLISHED",
        objectType: "Assignment",
        objectId: updated.id,
        userId: caller.id,
        description: `Assignment "${updated.title}" published`,
        ip: clientIp,
      },
    });

    await notifyEnrolledStudents({
      offeringId: existing.offeringId,
      title: `New Assignment: ${updated.title}`,
      message: `Assignment was published for ${existing.offering.course.code}. Deadline: ${formatDhaka(updated.deadline, "full")}`,
      link: `/courses/${existing.offeringId}/assignments`,
    });
  } else {
    await prisma.auditLog.create({
      data: {
        action: "ASSIGNMENT_UPDATED",
        objectType: "Assignment",
        objectId: updated.id,
        userId: caller.id,
        description: `Assignment "${updated.title}" unpublished (set to draft)`,
        ip: clientIp,
      },
    });
  }

  revalidatePath(`/teach/${existing.offeringId}/assignments`);
  revalidatePath(`/courses/${existing.offeringId}/assignments`);

  return { success: true, published: updated.published };
}

/**
 * Deletes an assignment.
 * Strictly blocked if student submissions exist.
 */
export async function deleteAssignmentAction(assignmentId: string) {
  const caller = await requireRole(Role.TEACHER, Role.SUPER_ADMIN);
  const clientIp = await getSafeClientIp();

  const existing = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    include: {
      attachments: true,
      _count: {
        select: { submissions: true },
      },
    },
  });

  if (!existing) {
    throw new NotFoundError("Assignment not found.");
  }

  await assertOfferingWritable(existing.offeringId);
  if (caller.role === Role.TEACHER) {
    await assertOfferingTeacher(caller.id, existing.offeringId);
  }

  // Deletion policy: delete only when there are no submissions
  if (existing._count.submissions > 0) {
    throw new ValidationError(
      `Cannot delete "${existing.title}" because ${existing._count.submissions} student submissions exist. You can unpublish it instead.`
    );
  }

  // Delete attachment files from storage
  for (const att of existing.attachments) {
    await deleteFromSupabaseBucket(att.fileKey);
    await prisma.auditLog.create({
      data: {
        action: "FILE_DELETED",
        objectType: "AssignmentAttachment",
        objectId: att.id,
        userId: caller.id,
        description: `Deleted assignment attachment "${att.originalName}"`,
        ip: clientIp,
      },
    });
  }

  await prisma.assignmentAttachment.deleteMany({
    where: { assignmentId },
  });

  await prisma.assignment.delete({
    where: { id: assignmentId },
  });

  await prisma.auditLog.create({
    data: {
      action: "ASSIGNMENT_DELETED",
      objectType: "Assignment",
      objectId: assignmentId,
      userId: caller.id,
      description: `Assignment "${existing.title}" deleted`,
      ip: clientIp,
    },
  });

  revalidatePath(`/teach/${existing.offeringId}/assignments`);
  revalidatePath(`/courses/${existing.offeringId}/assignments`);

  return { success: true };
}

/**
 * Uploads an attachment file for an assignment via the storage pipeline.
 */
export async function uploadAssignmentAttachmentAction(
  offeringId: string,
  formData: FormData
) {
  const caller = await requireRole(Role.TEACHER, Role.SUPER_ADMIN);

  await assertOfferingWritable(offeringId);
  if (caller.role === Role.TEACHER) {
    await assertOfferingTeacher(caller.id, offeringId);
  }

  const file = formData.get("file") as File | null;
  if (!file || !(file instanceof File) || file.size === 0) {
    throw new ValidationError("Please choose a valid file to upload.");
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const validation = await validateMaterialFile(file.name, buffer, file.type);
  if (!validation.valid) {
    throw new ValidationError(validation.error || "File validation failed.");
  }

  const sanitizedName = sanitizeDisplayName(file.name);
  const ext = validation.ext || "bin";
  const randomKey = `${offeringId}/assignments/${crypto.randomUUID()}.${ext}`;

  const uploadRes = await uploadToSupabaseBucket(
    randomKey,
    buffer,
    validation.mime || "application/octet-stream"
  );

  if (!uploadRes.success) {
    throw new Error(uploadRes.error || "Failed to upload file to storage.");
  }

  const headerList = await headers();
  const clientIp = getClientIp(headerList);

  await prisma.auditLog.create({
    data: {
      action: "FILE_UPLOADED",
      objectType: "AssignmentAttachment",
      objectId: randomKey,
      userId: caller.id,
      description: `Uploaded assignment attachment "${sanitizedName}" (${buffer.length} bytes)`,
      ip: clientIp,
    },
  });

  return {
    success: true,
    attachment: {
      fileKey: randomKey,
      originalName: sanitizedName,
      mime: validation.mime || "application/octet-stream",
      sizeBytes: buffer.length,
    },
  };
}

/**
 * Internal helper to send bulk ACADEMIC notifications to enrolled students.
 */
async function notifyEnrolledStudents({
  offeringId,
  title,
  message,
  link,
}: {
  offeringId: string;
  title: string;
  message: string;
  link: string;
}) {
  try {
    const enrollments = await prisma.enrollment.findMany({
      where: {
        status: "ACTIVE",
        section: {
          offeringId,
        },
      },
      select: {
        studentId: true,
      },
    });

    if (enrollments.length === 0) return;

    await createBulkNotifications(
      enrollments.map((e) => ({
        userId: e.studentId,
        type: NotificationType.ACADEMIC,
        title,
        message,
        link,
      }))
    );
  } catch (err) {
    console.error("Failed to notify enrolled students about assignment", err);
  }
}
