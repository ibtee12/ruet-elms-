"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import crypto from "crypto";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getClientIp } from "@/lib/utils/ip";
import { Role, CourseOfferingStatus, SubmissionStatus } from "@prisma/client";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/auth/errors";
import { assertCanViewOffering } from "@/lib/auth/guards";
import {
  validateMaterialFile,
  uploadToSupabaseBucket,
  sanitizeDisplayName,
} from "@/lib/storage";
import { uploadRateLimiter } from "@/lib/rate-limiter";

async function getSafeClientIp(): Promise<string> {
  try {
    const headerList = await headers();
    return getClientIp(headerList);
  } catch {
    return "127.0.0.1";
  }
}

export interface SubmitAssignmentResult {
  success: boolean;
  submissionId: string;
  versionId: string;
  versionNo: number;
  isLate: boolean;
  status: SubmissionStatus;
}

/**
 * Handles student submission of assignment solutions.
 * Validates file against assignment allowed types and size.
 * Determines late status strictly using server time (ignoring any client timestamps).
 * Executes version increment and record updates inside a database transaction.
 * Throttles to max 10 versions per student per assignment.
 * Locks resubmissions once graded unless explicitly reopened.
 */
export async function submitAssignmentAction(
  offeringId: string,
  assignmentId: string,
  formData: FormData
): Promise<SubmitAssignmentResult> {
  // 1. Session & Role Verification
  const caller = await requireRole(Role.STUDENT, Role.SUPER_ADMIN);
  const clientIp = await getSafeClientIp();

  // Basic offering view authorization check
  await assertCanViewOffering({ id: caller.id, role: caller.role }, offeringId);

  // Rate limit uploads
  const uploadStatus = await uploadRateLimiter.check(caller.id);
  if (!uploadStatus.allowed) {
    throw new ValidationError(
      `Upload rate limit reached. Please wait ${uploadStatus.retryAfterSeconds}s before submitting again.`
    );
  }
  await uploadRateLimiter.consume(caller.id);

  // 2. Extract and pre-validate File
  const file = formData.get("file") as File | null;
  if (!file || !(file instanceof File) || file.size === 0) {
    throw new ValidationError("Please choose a valid file to submit.");
  }

  // Read file into Buffer
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // 3. Fetch Assignment details to check rules
  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    include: {
      offering: {
        select: {
          id: true,
          status: true,
        },
      },
    },
  });

  if (!assignment || assignment.offeringId !== offeringId || !assignment.published) {
    throw new NotFoundError("Assignment not found or not published.");
  }

  if (assignment.offering.status === CourseOfferingStatus.ARCHIVED) {
    throw new ForbiddenError("Cannot submit assignments to an archived course offering.");
  }

  // 4. File extension and allowed types validation
  const baseValidation = await validateMaterialFile(
    file.name,
    buffer,
    file.type,
    assignment.maxSizeMb
  );

  if (!baseValidation.valid) {
    throw new ValidationError(baseValidation.error || "File validation failed.");
  }

  const detectedExt = (baseValidation.ext || "").toLowerCase();

  // Check assignment-specific allowedTypes allowlist (if configured)
  if (assignment.allowedTypes && assignment.allowedTypes.length > 0) {
    const normalizedAllowed = new Set(
      assignment.allowedTypes.map((t) => t.toLowerCase().replace(/^\./, "").trim())
    );

    if (!normalizedAllowed.has(detectedExt)) {
      throw new ValidationError(
        `File type .${detectedExt} is not permitted for this assignment. Allowed types: ${assignment.allowedTypes.join(", ")}.`
      );
    }
  }

  // 5. SERVER-SIDE Deadline & isLate calculation
  // Strict rule: Client-sent timestamps are completely ignored.
  const serverNow = new Date();
  const isLate = serverNow.getTime() > assignment.deadline.getTime();

  if (isLate && !assignment.lateAllowed) {
    throw new ValidationError(
      "The deadline for this assignment has passed and late submissions are not accepted."
    );
  }

  // 6. Upload file to private Supabase storage bucket
  const sanitizedName = sanitizeDisplayName(file.name);
  const randomKey = `${offeringId}/submissions/${assignment.id}/${caller.id}/${crypto.randomUUID()}.${detectedExt}`;

  const uploadRes = await uploadToSupabaseBucket(
    randomKey,
    buffer,
    baseValidation.mime || "application/octet-stream"
  );

  if (!uploadRes.success) {
    throw new Error(uploadRes.error || "Failed to upload submission file to storage.");
  }

  // 7. Atomic Database Transaction
  const submissionStatus = isLate ? SubmissionStatus.LATE : SubmissionStatus.SUBMITTED;

  // 1. Ensure the parent Submission row exists before entering serialized version transaction
  let parentSubmission;
  try {
    parentSubmission = await prisma.submission.upsert({
      where: {
        assignmentId_studentId: {
          assignmentId: assignment.id,
          studentId: caller.id,
        },
      },
      create: {
        assignmentId: assignment.id,
        studentId: caller.id,
        status: submissionStatus,
      },
      update: {
        status: submissionStatus,
      },
      include: {
        grade: true,
      },
    });
  } catch (err: unknown) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      err.code === "P2002"
    ) {
      // Race condition: concurrent submit created the record
      parentSubmission = await prisma.submission.findUniqueOrThrow({
        where: {
          assignmentId_studentId: {
            assignmentId: assignment.id,
            studentId: caller.id,
          },
        },
        include: {
          grade: true,
        },
      });
    } else {
      throw err;
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    // Check enrollment if caller is student
    if (caller.role === Role.STUDENT) {
      const enrollment = await tx.enrollment.findFirst({
        where: {
          studentId: caller.id,
          status: "ACTIVE",
          section: {
            offeringId,
          },
        },
      });

      if (!enrollment) {
        throw new ForbiddenError("You are not actively enrolled in this course offering.");
      }
    }

    // 2. Lock the parent submission row in Postgres to serialize concurrent version increments
    await tx.$executeRaw`SELECT id FROM "Submission" WHERE id = ${parentSubmission.id} FOR UPDATE`;

    // Re-check updated status, reopened, and grade
    const freshSubmission = await tx.submission.findUniqueOrThrow({
      where: { id: parentSubmission.id },
      include: { grade: true },
    });

    // Check if assignment has already been graded and whether it is reopened
    if (freshSubmission.grade && !freshSubmission.reopened) {
      throw new ValidationError(
        "This assignment has already been graded and cannot be resubmitted."
      );
    }

    // Check version count for throttle
    const currentVersionCount = await tx.submissionVersion.count({
      where: { submissionId: freshSubmission.id },
    });

    if (currentVersionCount >= 10) {
      throw new ValidationError(
        "Maximum of 10 submission versions allowed per student for this assignment."
      );
    }

    // Determine highest existing version number
    const latestVersion = await tx.submissionVersion.findFirst({
      where: { submissionId: freshSubmission.id },
      orderBy: { versionNo: "desc" },
    });

    const newVersionNo = (latestVersion?.versionNo ?? 0) + 1;

    // Always create a new SubmissionVersion
    const version = await tx.submissionVersion.create({
      data: {
        submissionId: freshSubmission.id,
        versionNo: newVersionNo,
        fileKey: randomKey,
        originalName: sanitizedName,
        mime: baseValidation.mime || "application/octet-stream",
        sizeBytes: buffer.length,
        submittedAt: serverNow,
        isLate,
      },
    });

    // Update parent Submission with currentVersionId and latest status
    await tx.submission.update({
      where: { id: freshSubmission.id },
      data: {
        currentVersionId: version.id,
        status: submissionStatus,
        updatedAt: serverNow,
      },
    });

    const submissionId = freshSubmission.id;

    // Write AuditLog: SUBMISSION_UPLOADED (assignmentId, versionNo)
    await tx.auditLog.create({
      data: {
        action: "SUBMISSION_UPLOADED",
        objectType: "Submission",
        objectId: submissionId,
        userId: caller.id,
        description: `Submission version ${newVersionNo} uploaded for assignment ${assignment.id} (${assignment.title}). Late: ${isLate}.`,
        ip: clientIp,
      },
    });

    return {
      submissionId,
      versionId: version.id,
      versionNo: newVersionNo,
      isLate,
      status: submissionStatus,
    };
  });

  // Revalidate cache paths
  revalidatePath(`/courses/${offeringId}/assignments`);
  revalidatePath(`/courses/${offeringId}/assignments/${assignmentId}`);
  revalidatePath(`/assignments`);
  revalidatePath(`/teach/${offeringId}/assignments`);

  return {
    success: true,
    ...result,
  };
}
