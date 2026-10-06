"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getClientIp } from "@/lib/utils/ip";
import { Role, SubmissionStatus, NotificationType } from "@prisma/client";
import { NotFoundError, ValidationError } from "@/lib/auth/errors";
import { assertCanGradeOffering } from "@/lib/auth/guards";
import { createNotification } from "@/lib/notifications";
import { z } from "zod";

async function getSafeClientIp(): Promise<string> {
  try {
    const headerList = await headers();
    return getClientIp(headerList);
  } catch {
    return "127.0.0.1";
  }
}

const SaveGradeSchema = z.object({
  marks: z.coerce.number().min(0, "Marks cannot be negative."),
  feedback: z.string().optional().default(""),
  changeReason: z.string().optional().default(""),
});

export interface SaveGradeParams {
  marks: number;
  feedback?: string;
  changeReason?: string;
}

/**
 * Saves a grade for a student submission.
 * Validates marks (0 to maxMarks).
 * First grade creates Grade and sets status GRADED, sending a RESULT notification.
 * Changing a grade requires a reason, creates GradeHistory, and writes AuditLog GRADE_CHANGED.
 */
export async function saveGradeAction(
  submissionId: string,
  params: SaveGradeParams
) {
  const caller = await requireRole(Role.TEACHER, Role.SUPER_ADMIN);
  const clientIp = await getSafeClientIp();

  const validated = SaveGradeSchema.parse(params);

  // Fetch submission with assignment and offering
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: {
      assignment: {
        include: {
          offering: {
            include: {
              course: true,
            },
          },
        },
      },
      student: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      grade: true,
    },
  });

  if (!submission) {
    throw new NotFoundError("Submission not found.");
  }

  const assignment = submission.assignment;
  const offering = assignment.offering;

  // Authorization check: instructor or TA with grading privileges
  await assertCanGradeOffering(caller.id, caller.role, offering.id);

  const maxMarks = Number(assignment.maxMarks);

  // Marks boundary validation
  if (validated.marks < 0 || validated.marks > maxMarks) {
    throw new ValidationError(
      `Marks must be between 0 and ${maxMarks}. Received: ${validated.marks}.`
    );
  }

  const existingGrade = submission.grade;
  const isGradeChange = existingGrade !== null;

  // Grade change strictly requires a non-empty reason
  if (isGradeChange) {
    const trimmedReason = validated.changeReason.trim();
    if (!trimmedReason) {
      throw new ValidationError(
        "A reason is required when modifying an existing grade."
      );
    }
  }

  // Database transaction for atomic grade persistence, history logging, and audit logs
  const result = await prisma.$transaction(async (tx) => {
    let savedGrade;

    if (!existingGrade) {
      // 1. First time grading: Create Grade and set Submission status to GRADED
      savedGrade = await tx.grade.create({
        data: {
          submissionId: submission.id,
          marks: validated.marks,
          feedback: validated.feedback.trim() || null,
          gradedById: caller.id,
        },
      });

      await tx.submission.update({
        where: { id: submission.id },
        data: {
          status: SubmissionStatus.GRADED,
          updatedAt: new Date(),
        },
      });

      await tx.auditLog.create({
        data: {
          action: "GRADE_ASSIGNED",
          objectType: "Grade",
          objectId: savedGrade.id,
          userId: caller.id,
          description: `Grade ${validated.marks}/${maxMarks} assigned to student ${submission.student.name} for assignment "${assignment.title}"`,
          ip: clientIp,
        },
      });
    } else {
      // 2. Grade modification: Create GradeHistory row and update Grade
      const reasonClean = validated.changeReason.trim();

      await tx.gradeHistory.create({
        data: {
          submissionId: submission.id,
          oldMarks: existingGrade.marks,
          newMarks: validated.marks,
          changedById: caller.id,
          reason: reasonClean,
          changedAt: new Date(),
        },
      });

      savedGrade = await tx.grade.update({
        where: { id: existingGrade.id },
        data: {
          marks: validated.marks,
          feedback: validated.feedback.trim() || null,
          updatedAt: new Date(),
        },
      });

      await tx.auditLog.create({
        data: {
          action: "GRADE_CHANGED",
          objectType: "Grade",
          objectId: savedGrade.id,
          userId: caller.id,
          description: `Grade changed from ${existingGrade.marks} to ${validated.marks} for student ${submission.student.name} on assignment "${assignment.title}". Reason: ${reasonClean}`,
          ip: clientIp,
        },
      });
    }

    return savedGrade;
  });

  // Notify student of RESULT
  try {
    const notificationTitle = isGradeChange
      ? `Grade Updated: ${assignment.title}`
      : `Grade Posted: ${assignment.title}`;

    const notificationMessage = isGradeChange
      ? `Your grade for ${assignment.title} (${offering.course.code}) was updated to ${validated.marks}/${maxMarks}.`
      : `Your submission for ${assignment.title} (${offering.course.code}) has been graded: ${validated.marks}/${maxMarks}.`;

    await createNotification({
      userId: submission.studentId,
      type: NotificationType.RESULT,
      title: notificationTitle,
      message: notificationMessage,
      link: `/courses/${offering.id}/assignments/${assignment.id}`,
    });
  } catch (err) {
    console.error("Failed to notify student about grade", err);
  }

  // Revalidate cache
  revalidatePath(`/teach/${offering.id}/assignments/${assignment.id}/submissions`);
  revalidatePath(`/teach/${offering.id}/submissions/${submission.id}`);
  revalidatePath(`/courses/${offering.id}/assignments/${assignment.id}`);
  revalidatePath(`/courses/${offering.id}/assignments`);
  revalidatePath(`/assignments`);

  return { success: true, grade: result };
}

/**
 * Reopens a submission, allowing the student to resubmit after grading or closing.
 * Sets reopened to true and sends an ACADEMIC notification to the student.
 */
export async function reopenSubmissionAction(submissionId: string) {
  const caller = await requireRole(Role.TEACHER, Role.SUPER_ADMIN);
  const clientIp = await getSafeClientIp();

  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: {
      assignment: {
        include: {
          offering: {
            include: {
              course: true,
            },
          },
        },
      },
      student: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (!submission) {
    throw new NotFoundError("Submission not found.");
  }

  const assignment = submission.assignment;
  const offering = assignment.offering;

  await assertCanGradeOffering(caller.id, caller.role, offering.id);

  const updated = await prisma.submission.update({
    where: { id: submission.id },
    data: {
      reopened: true,
      updatedAt: new Date(),
    },
  });

  await prisma.auditLog.create({
    data: {
      action: "SUBMISSION_REOPENED",
      objectType: "Submission",
      objectId: submission.id,
      userId: caller.id,
      description: `Submission reopened for student ${submission.student.name} on assignment "${assignment.title}"`,
      ip: clientIp,
    },
  });

  // Notify student
  try {
    await createNotification({
      userId: submission.studentId,
      type: NotificationType.ACADEMIC,
      title: `Submission Reopened: ${assignment.title}`,
      message: `Your submission for ${assignment.title} (${offering.course.code}) has been unlocked by your instructor. You may now turn in an updated solution.`,
      link: `/courses/${offering.id}/assignments/${assignment.id}`,
    });
  } catch (err) {
    console.error("Failed to notify student about reopened submission", err);
  }

  revalidatePath(`/teach/${offering.id}/assignments/${assignment.id}/submissions`);
  revalidatePath(`/teach/${offering.id}/submissions/${submission.id}`);
  revalidatePath(`/courses/${offering.id}/assignments/${assignment.id}`);
  revalidatePath(`/courses/${offering.id}/assignments`);
  revalidatePath(`/assignments`);

  return { success: true, submission: updated };
}
