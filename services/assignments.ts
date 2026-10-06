import { prisma } from "@/lib/prisma";
import { Role, CourseOfferingStatus } from "@prisma/client";
import { assertCanViewOffering, assertOfferingTeacher } from "@/lib/auth/guards";
import { NotFoundError } from "@/lib/auth/errors";
import { calcFinalMarks } from "@/lib/grading";

export interface AssignmentAttachmentData {
  id: string;
  fileKey: string;
  originalName: string;
  mime: string;
  sizeBytes: number;
}

export interface TeacherAssignmentItemData {
  id: string;
  title: string;
  description: string | null;
  deadline: Date;
  maxMarks: number;
  allowedTypes: string[];
  maxSizeMb: number;
  lateAllowed: boolean;
  latePenaltyPercent: number;
  published: boolean;
  submissionsCount: number;
  gradedCount: number;
  attachments: AssignmentAttachmentData[];
  createdByName: string;
  createdAt: Date;
}

export interface TeacherOfferingAssignmentsData {
  offeringId: string;
  code: string;
  courseTitle: string;
  term: string;
  academicYear: string;
  isArchived: boolean;
  canManage: boolean;
  enrolledStudentsCount: number;
  globalMaxFileSizeMb: number;
  assignments: TeacherAssignmentItemData[];
}

import { StatusType } from "@/components/shared/status-chip";
import { SubmissionStatus } from "@prisma/client";

export interface StudentSubmissionSummaryData {
  id: string;
  status: SubmissionStatus;
  reopened: boolean;
  currentVersionId: string | null;
  latestVersionNo: number | null;
  submittedAt: Date | null;
  isLate: boolean;
  originalName: string | null;
  sizeBytes: number | null;
  marksAwarded?: number | null;
  feedback?: string | null;
}

export interface StudentAssignmentItemData {
  id: string;
  offeringId: string;
  courseCode: string;
  courseTitle: string;
  title: string;
  description: string | null;
  deadline: Date;
  maxMarks: number;
  allowedTypes: string[];
  maxSizeMb: number;
  lateAllowed: boolean;
  latePenaltyPercent: number;
  published: boolean;
  attachments: AssignmentAttachmentData[];
  createdAt: Date;
  submission: StudentSubmissionSummaryData | null;
  statusChipType: StatusType;
}

export interface StudentOfferingAssignmentsData {
  offeringId: string;
  code: string;
  courseTitle: string;
  term: string;
  academicYear: string;
  isArchived: boolean;
  assignments: StudentAssignmentItemData[];
}

export interface StudentSubmissionVersionData {
  id: string;
  versionNo: number;
  fileKey: string;
  originalName: string;
  mime: string;
  sizeBytes: number;
  submittedAt: Date;
  isLate: boolean;
}

export interface StudentGradeHistoryData {
  id: string;
  oldMarks: number | null;
  newMarks: number;
  changedAt: Date;
}

export interface StudentAssignmentDetailData {
  offeringId: string;
  code: string;
  courseTitle: string;
  term: string;
  academicYear: string;
  isArchived: boolean;
  assignment: {
    id: string;
    title: string;
    description: string | null;
    deadline: Date;
    maxMarks: number;
    allowedTypes: string[];
    maxSizeMb: number;
    lateAllowed: boolean;
    latePenaltyPercent: number;
    published: boolean;
    attachments: AssignmentAttachmentData[];
    createdAt: Date;
  };
  submission: {
    id: string;
    status: SubmissionStatus;
    reopened: boolean;
    currentVersionId: string | null;
    versionsCount: number;
    grade?: {
      marks: number;
      finalMarks: number;
      feedback: string | null;
      gradedAt: Date;
      gradedByName: string;
    } | null;
    gradeHistories: StudentGradeHistoryData[];
    versions: StudentSubmissionVersionData[];
  } | null;
  statusChipType: StatusType;
  isOverdue: boolean;
  canSubmit: boolean;
  blockReason: string | null;
}

export interface StudentGlobalAssignmentsData {
  overdue: StudentAssignmentItemData[];
  dueSoon: StudentAssignmentItemData[];
  upcoming: StudentAssignmentItemData[];
  submitted: StudentAssignmentItemData[];
  graded: StudentAssignmentItemData[];
  totalCount: number;
}

export function computeStudentAssignmentStatus(
  deadline: Date,
  submission: {
    status: SubmissionStatus;
    grade?: { marks: unknown; feedback?: string | null } | null;
    isLate?: boolean;
  } | null,
  now: Date = new Date()
): StatusType {
  if (!submission) {
    return now.getTime() > deadline.getTime() ? "overdue" : "not_submitted";
  }
  if (submission.grade || submission.status === SubmissionStatus.GRADED) {
    return "graded";
  }
  if (submission.status === SubmissionStatus.LATE || submission.isLate) {
    return "submitted_late";
  }
  return "submitted";
}

/**
 * Loads assignment list and metadata for teachers and administrators.
 */
export async function getTeacherOfferingAssignmentsData(
  offeringId: string,
  caller: { id: string; role: Role }
): Promise<TeacherOfferingAssignmentsData> {
  await assertCanViewOffering(caller, offeringId);

  const offering = await prisma.courseOffering.findUnique({
    where: { id: offeringId },
    select: {
      id: true,
      status: true,
      term: true,
      academicYear: true,
      course: {
        select: {
          code: true,
          title: true,
        },
      },
      sections: {
        select: {
          _count: {
            select: {
              enrollments: {
                where: { status: "ACTIVE" },
              },
            },
          },
        },
      },
      offeringTeachers: {
        where: { userId: caller.id },
        select: { role: true },
      },
    },
  });

  if (!offering) {
    throw new NotFoundError("Course offering not found.");
  }

  const isArchived = offering.status === CourseOfferingStatus.ARCHIVED;
  const isAssignedTeacher = offering.offeringTeachers.length > 0;
  const canManage =
    !isArchived && (caller.role === Role.SUPER_ADMIN || isAssignedTeacher);

  // Total enrolled students across all sections of this offering
  const enrolledStudentsCount = offering.sections.reduce(
    (acc, sec) => acc + sec._count.enrollments,
    0
  );

  // Query global upload limit setting
  let globalMaxFileSizeMb = 50;
  try {
    const setting = await prisma.setting.findUnique({
      where: { key: "upload_limits" },
    });
    const val = setting?.value as { maxAssignmentSizeMb?: number; maxMaterialSizeMb?: number };
    globalMaxFileSizeMb = val?.maxAssignmentSizeMb || val?.maxMaterialSizeMb || 50;
  } catch {
    globalMaxFileSizeMb = 50;
  }

  // Load assignments
  const rawAssignments = await prisma.assignment.findMany({
    where: { offeringId },
    orderBy: { createdAt: "desc" },
    include: {
      createdBy: {
        select: { name: true },
      },
      attachments: {
        orderBy: { createdAt: "asc" },
      },
      _count: {
        select: {
          submissions: true,
        },
      },
      submissions: {
        where: {
          grade: { isNot: null },
        },
        select: { id: true },
      },
    },
  });

  const assignments: TeacherAssignmentItemData[] = rawAssignments.map((a) => ({
    id: a.id,
    title: a.title,
    description: a.description,
    deadline: a.deadline,
    maxMarks: Number(a.maxMarks),
    allowedTypes: a.allowedTypes,
    maxSizeMb: a.maxSizeMb,
    lateAllowed: a.lateAllowed,
    latePenaltyPercent: a.latePenaltyPercent,
    published: a.published,
    submissionsCount: a._count.submissions,
    gradedCount: a.submissions.length,
    attachments: a.attachments.map((att) => ({
      id: att.id,
      fileKey: att.fileKey,
      originalName: att.originalName,
      mime: att.mime,
      sizeBytes: att.sizeBytes,
    })),
    createdByName: a.createdBy.name,
    createdAt: a.createdAt,
  }));

  return {
    offeringId: offering.id,
    code: offering.course.code,
    courseTitle: offering.course.title,
    term: offering.term,
    academicYear: offering.academicYear,
    isArchived,
    canManage,
    enrolledStudentsCount,
    globalMaxFileSizeMb,
    assignments,
  };
}

/**
 * Loads published assignments for students in a specific offering.
 * Strictly excludes unpublished assignments.
 * Injects student's own submission status and version details.
 */
export async function getStudentOfferingAssignmentsData(
  offeringId: string,
  studentId: string
): Promise<StudentOfferingAssignmentsData> {
  await assertCanViewOffering({ id: studentId, role: Role.STUDENT }, offeringId);

  const offering = await prisma.courseOffering.findUnique({
    where: { id: offeringId },
    select: {
      id: true,
      status: true,
      term: true,
      academicYear: true,
      course: {
        select: {
          code: true,
          title: true,
        },
      },
    },
  });

  if (!offering) {
    throw new NotFoundError("Course offering not found.");
  }

  const isArchived = offering.status === CourseOfferingStatus.ARCHIVED;

  // Load strictly published assignments for students
  const rawAssignments = await prisma.assignment.findMany({
    where: {
      offeringId,
      published: true, // Never return unpublished assignments to students
    },
    orderBy: { deadline: "asc" },
    include: {
      attachments: {
        orderBy: { createdAt: "asc" },
      },
      submissions: {
        where: { studentId },
        include: {
          grade: true,
          versions: {
            orderBy: { versionNo: "desc" },
            take: 1,
          },
        },
      },
    },
  });

  const now = new Date();

  const assignments: StudentAssignmentItemData[] = rawAssignments.map((a) => {
    const rawSub = a.submissions[0] || null;
    const latestVersion = rawSub?.versions[0] || null;

    let submissionSummary: StudentSubmissionSummaryData | null = null;
    if (rawSub) {
      submissionSummary = {
        id: rawSub.id,
        status: rawSub.status,
        reopened: rawSub.reopened,
        currentVersionId: rawSub.currentVersionId,
        latestVersionNo: latestVersion?.versionNo ?? null,
        submittedAt: latestVersion?.submittedAt ?? rawSub.createdAt,
        isLate: latestVersion?.isLate ?? (rawSub.status === SubmissionStatus.LATE),
        originalName: latestVersion?.originalName ?? null,
        sizeBytes: latestVersion?.sizeBytes ?? null,
        marksAwarded: rawSub.grade ? Number(rawSub.grade.marks) : null,
        feedback: rawSub.grade?.feedback ?? null,
      };
    }

    const statusChipType = computeStudentAssignmentStatus(
      a.deadline,
      submissionSummary
        ? {
            status: submissionSummary.status,
            grade: rawSub?.grade,
            isLate: submissionSummary.isLate,
          }
        : null,
      now
    );

    return {
      id: a.id,
      offeringId: offering.id,
      courseCode: offering.course.code,
      courseTitle: offering.course.title,
      title: a.title,
      description: a.description,
      deadline: a.deadline,
      maxMarks: Number(a.maxMarks),
      allowedTypes: a.allowedTypes,
      maxSizeMb: a.maxSizeMb,
      lateAllowed: a.lateAllowed,
      latePenaltyPercent: a.latePenaltyPercent,
      published: a.published,
      attachments: a.attachments.map((att) => ({
        id: att.id,
        fileKey: att.fileKey,
        originalName: att.originalName,
        mime: att.mime,
        sizeBytes: att.sizeBytes,
      })),
      createdAt: a.createdAt,
      submission: submissionSummary,
      statusChipType,
    };
  });

  return {
    offeringId: offering.id,
    code: offering.course.code,
    courseTitle: offering.course.title,
    term: offering.term,
    academicYear: offering.academicYear,
    isArchived,
    assignments,
  };
}

/**
 * Loads a single assignment's full detail for a student,
 * including instructions, attachments, version history, and submission eligibility.
 */
export async function getStudentAssignmentDetailData(
  offeringId: string,
  assignmentId: string,
  studentId: string
): Promise<StudentAssignmentDetailData> {
  await assertCanViewOffering({ id: studentId, role: Role.STUDENT }, offeringId);

  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    include: {
      offering: {
        select: {
          id: true,
          status: true,
          term: true,
          academicYear: true,
          course: {
            select: {
              code: true,
              title: true,
            },
          },
        },
      },
      attachments: {
        orderBy: { createdAt: "asc" },
      },
      submissions: {
        where: { studentId },
        include: {
          grade: {
            include: {
              gradedBy: {
                select: { name: true },
              },
            },
          },
          gradeHistories: {
            orderBy: { changedAt: "desc" },
          },
          versions: {
            orderBy: { versionNo: "desc" },
          },
        },
      },
    },
  });

  if (
    !assignment ||
    assignment.offeringId !== offeringId ||
    !assignment.published
  ) {
    throw new NotFoundError("Assignment not found or not published.");
  }

  const offering = assignment.offering;
  const isArchived = offering.status === CourseOfferingStatus.ARCHIVED;
  const rawSub = assignment.submissions[0] || null;
  const now = new Date();
  const isOverdue = now.getTime() > assignment.deadline.getTime();

  let submissionData: StudentAssignmentDetailData["submission"] = null;
  if (rawSub) {
    const latestVersion = rawSub.versions[0] || null;
    const isLate = latestVersion?.isLate ?? (rawSub.status === SubmissionStatus.LATE);
    const rawMarks = rawSub.grade ? Number(rawSub.grade.marks) : null;
    const finalMarks =
      rawMarks !== null
        ? calcFinalMarks(
            rawMarks,
            Number(assignment.maxMarks),
            isLate,
            assignment.latePenaltyPercent
          )
        : null;

    submissionData = {
      id: rawSub.id,
      status: rawSub.status,
      reopened: rawSub.reopened,
      currentVersionId: rawSub.currentVersionId,
      versionsCount: rawSub.versions.length,
      grade: rawSub.grade
        ? {
            marks: Number(rawSub.grade.marks),
            finalMarks: finalMarks ?? Number(rawSub.grade.marks),
            feedback: rawSub.grade.feedback,
            gradedAt: rawSub.grade.gradedAt,
            gradedByName: rawSub.grade.gradedBy.name,
          }
        : null,
      gradeHistories: rawSub.gradeHistories.map((h) => ({
        id: h.id,
        oldMarks: h.oldMarks ? Number(h.oldMarks) : null,
        newMarks: Number(h.newMarks),
        changedAt: h.changedAt,
      })),
      versions: rawSub.versions.map((v) => ({
        id: v.id,
        versionNo: v.versionNo,
        fileKey: v.fileKey,
        originalName: v.originalName,
        mime: v.mime,
        sizeBytes: v.sizeBytes,
        submittedAt: v.submittedAt,
        isLate: v.isLate,
      })),
    };
  }

  const latestVersion = rawSub?.versions[0] || null;
  const statusChipType = computeStudentAssignmentStatus(
    assignment.deadline,
    rawSub
      ? {
          status: rawSub.status,
          grade: rawSub.grade,
          isLate: latestVersion?.isLate ?? (rawSub.status === SubmissionStatus.LATE),
        }
      : null,
    now
  );

  // Determine submission eligibility
  let canSubmit = true;
  let blockReason: string | null = null;

  if (isArchived) {
    canSubmit = false;
    blockReason = "Course offering is archived. Submissions are closed.";
  } else if (rawSub?.grade && !rawSub.reopened) {
    canSubmit = false;
    blockReason = "This assignment has already been graded and cannot be resubmitted.";
  } else if (isOverdue && !assignment.lateAllowed) {
    canSubmit = false;
    blockReason = "The deadline has passed and late submissions are not accepted.";
  } else if (rawSub && rawSub.versions.length >= 10) {
    canSubmit = false;
    blockReason = "You have reached the maximum limit of 10 submission versions.";
  }

  return {
    offeringId: offering.id,
    code: offering.course.code,
    courseTitle: offering.course.title,
    term: offering.term,
    academicYear: offering.academicYear,
    isArchived,
    assignment: {
      id: assignment.id,
      title: assignment.title,
      description: assignment.description,
      deadline: assignment.deadline,
      maxMarks: Number(assignment.maxMarks),
      allowedTypes: assignment.allowedTypes,
      maxSizeMb: assignment.maxSizeMb,
      lateAllowed: assignment.lateAllowed,
      latePenaltyPercent: assignment.latePenaltyPercent,
      published: assignment.published,
      attachments: assignment.attachments.map((att) => ({
        id: att.id,
        fileKey: att.fileKey,
        originalName: att.originalName,
        mime: att.mime,
        sizeBytes: att.sizeBytes,
      })),
      createdAt: assignment.createdAt,
    },
    submission: submissionData,
    statusChipType,
    isOverdue,
    canSubmit,
    blockReason,
  };
}

/**
 * Loads all published assignments across the student's enrolled courses,
 * grouped into: Overdue, Due soon, Upcoming, Submitted, and Graded.
 */
export async function getStudentGlobalAssignmentsData(
  studentId: string
): Promise<StudentGlobalAssignmentsData> {
  // Query active enrollments in published/active course offerings
  const enrollments = await prisma.enrollment.findMany({
    where: {
      studentId,
      status: "ACTIVE",
      section: {
        offering: {
          status: { not: CourseOfferingStatus.DRAFT },
        },
      },
    },
    select: {
      section: {
        select: {
          offeringId: true,
        },
      },
    },
  });

  const offeringIds = [
    ...new Set(enrollments.map((e) => e.section.offeringId)),
  ];

  if (offeringIds.length === 0) {
    return {
      overdue: [],
      dueSoon: [],
      upcoming: [],
      submitted: [],
      graded: [],
      totalCount: 0,
    };
  }

  const rawAssignments = await prisma.assignment.findMany({
    where: {
      offeringId: { in: offeringIds },
      published: true,
    },
    orderBy: { deadline: "asc" },
    include: {
      offering: {
        select: {
          id: true,
          term: true,
          academicYear: true,
          course: {
            select: {
              code: true,
              title: true,
            },
          },
        },
      },
      attachments: {
        orderBy: { createdAt: "asc" },
      },
      submissions: {
        where: { studentId },
        include: {
          grade: true,
          versions: {
            orderBy: { versionNo: "desc" },
            take: 1,
          },
        },
      },
    },
  });

  const now = new Date();
  const dueSoonWindowMs = 48 * 60 * 60 * 1000; // 48 hours

  const overdue: StudentAssignmentItemData[] = [];
  const dueSoon: StudentAssignmentItemData[] = [];
  const upcoming: StudentAssignmentItemData[] = [];
  const submitted: StudentAssignmentItemData[] = [];
  const graded: StudentAssignmentItemData[] = [];

  for (const a of rawAssignments) {
    const rawSub = a.submissions[0] || null;
    const latestVersion = rawSub?.versions[0] || null;

    let submissionSummary: StudentSubmissionSummaryData | null = null;
    if (rawSub) {
      submissionSummary = {
        id: rawSub.id,
        status: rawSub.status,
        reopened: rawSub.reopened,
        currentVersionId: rawSub.currentVersionId,
        latestVersionNo: latestVersion?.versionNo ?? null,
        submittedAt: latestVersion?.submittedAt ?? rawSub.createdAt,
        isLate: latestVersion?.isLate ?? (rawSub.status === SubmissionStatus.LATE),
        originalName: latestVersion?.originalName ?? null,
        sizeBytes: latestVersion?.sizeBytes ?? null,
        marksAwarded: rawSub.grade ? Number(rawSub.grade.marks) : null,
        feedback: rawSub.grade?.feedback ?? null,
      };
    }

    const statusChipType = computeStudentAssignmentStatus(
      a.deadline,
      submissionSummary
        ? {
            status: submissionSummary.status,
            grade: rawSub?.grade,
            isLate: submissionSummary.isLate,
          }
        : null,
      now
    );

    const item: StudentAssignmentItemData = {
      id: a.id,
      offeringId: a.offering.id,
      courseCode: a.offering.course.code,
      courseTitle: a.offering.course.title,
      title: a.title,
      description: a.description,
      deadline: a.deadline,
      maxMarks: Number(a.maxMarks),
      allowedTypes: a.allowedTypes,
      maxSizeMb: a.maxSizeMb,
      lateAllowed: a.lateAllowed,
      latePenaltyPercent: a.latePenaltyPercent,
      published: a.published,
      attachments: a.attachments.map((att) => ({
        id: att.id,
        fileKey: att.fileKey,
        originalName: att.originalName,
        mime: att.mime,
        sizeBytes: att.sizeBytes,
      })),
      createdAt: a.createdAt,
      submission: submissionSummary,
      statusChipType,
    };

    // Grouping:
    if (submissionSummary?.marksAwarded !== null && submissionSummary?.marksAwarded !== undefined) {
      graded.push(item);
    } else if (submissionSummary) {
      submitted.push(item);
    } else {
      // Unsubmitted
      const timeRemainingMs = a.deadline.getTime() - now.getTime();
      if (timeRemainingMs < 0) {
        overdue.push(item);
      } else if (timeRemainingMs <= dueSoonWindowMs) {
        dueSoon.push(item);
      } else {
        upcoming.push(item);
      }
    }
  }

  return {
    overdue,
    dueSoon,
    upcoming,
    submitted,
    graded,
    totalCount: rawAssignments.length,
  };
}
