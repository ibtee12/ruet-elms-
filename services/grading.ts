import { prisma } from "@/lib/prisma";
import { Role, CourseOfferingStatus, SubmissionStatus } from "@prisma/client";
import { assertOfferingTeacher } from "@/lib/auth/guards";
import { NotFoundError } from "@/lib/auth/errors";
import { calcFinalMarks } from "@/lib/grading";

export interface StudentSubmissionRowData {
  studentId: string;
  name: string;
  email: string;
  roll: string | null;
  sectionName: string;
  submissionId: string | null;
  status: "not_submitted" | "submitted" | "submitted_late" | "graded";
  isLate: boolean;
  versionCount: number;
  latestVersionNo: number | null;
  latestVersionId: string | null;
  submittedAt: Date | null;
  rawMarks: number | null;
  finalMarks: number | null;
  reopened: boolean;
  gradedAt: Date | null;
  gradedByName: string | null;
}

export interface TeacherAssignmentSubmissionsData {
  offeringId: string;
  courseCode: string;
  courseTitle: string;
  term: string;
  academicYear: string;
  isArchived: boolean;
  canGrade: boolean;
  assignment: {
    id: string;
    title: string;
    description: string | null;
    deadline: Date;
    maxMarks: number;
    lateAllowed: boolean;
    latePenaltyPercent: number;
    published: boolean;
  };
  stats: {
    totalEnrolled: number;
    submittedCount: number;
    gradedCount: number;
    lateCount: number;
    avgScore: number | null;
  };
  rows: StudentSubmissionRowData[];
}

export interface SubmissionVersionItemData {
  id: string;
  versionNo: number;
  originalName: string;
  mime: string;
  sizeBytes: number;
  submittedAt: Date;
  isLate: boolean;
  fileKey: string;
}

export interface GradeHistoryItemData {
  id: string;
  oldMarks: number | null;
  newMarks: number;
  reason: string;
  changedAt: Date;
  changedByName: string;
}

export interface TeacherSubmissionDetailData {
  offeringId: string;
  courseCode: string;
  courseTitle: string;
  term: string;
  academicYear: string;
  isArchived: boolean;
  canGrade: boolean;
  assignment: {
    id: string;
    title: string;
    description: string | null;
    deadline: Date;
    maxMarks: number;
    lateAllowed: boolean;
    latePenaltyPercent: number;
  };
  student: {
    id: string;
    name: string;
    email: string;
    roll: string | null;
    sectionName: string | null;
  };
  submission: {
    id: string;
    status: SubmissionStatus;
    reopened: boolean;
    currentVersionId: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
  versions: SubmissionVersionItemData[];
  grade: {
    id: string;
    marks: number;
    feedback: string | null;
    gradedAt: Date;
    gradedByName: string;
  } | null;
  finalMarks: number | null;
  histories: GradeHistoryItemData[];
  prevSubmissionId: string | null;
  nextSubmissionId: string | null;
}

/**
 * Loads submissions roster for a specific assignment,
 * including all actively enrolled students (even if unsubmitted).
 */
export async function getTeacherAssignmentSubmissionsData(
  offeringId: string,
  assignmentId: string,
  caller: { id: string; role: Role }
): Promise<TeacherAssignmentSubmissionsData> {
  if (caller.role !== Role.SUPER_ADMIN) {
    await assertOfferingTeacher(caller.id, offeringId, { allowTA: true });
  }

  const offering = await prisma.courseOffering.findUnique({
    where: { id: offeringId },
    select: {
      id: true,
      status: true,
      term: true,
      academicYear: true,
      allowTaGrading: true,
      course: {
        select: {
          code: true,
          title: true,
        },
      },
      offeringTeachers: {
        where: { userId: caller.id },
        select: {
          role: true,
          canGrade: true,
        },
      },
    },
  });

  if (!offering) {
    throw new NotFoundError("Course offering not found.");
  }

  const isArchived = offering.status === CourseOfferingStatus.ARCHIVED;
  const teacherRel = offering.offeringTeachers[0];
  const canGrade =
    !isArchived &&
    (caller.role === Role.SUPER_ADMIN ||
      teacherRel?.role === "INSTRUCTOR" ||
      (teacherRel?.role === "TA" && (teacherRel.canGrade || offering.allowTaGrading)));

  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    select: {
      id: true,
      offeringId: true,
      title: true,
      description: true,
      deadline: true,
      maxMarks: true,
      lateAllowed: true,
      latePenaltyPercent: true,
      published: true,
    },
  });

  if (!assignment || assignment.offeringId !== offeringId) {
    throw new NotFoundError("Assignment not found for this course offering.");
  }

  // Load all active enrollments in this offering
  const enrollments = await prisma.enrollment.findMany({
    where: {
      status: "ACTIVE",
      section: {
        offeringId,
      },
    },
    include: {
      student: {
        select: {
          id: true,
          name: true,
          email: true,
          studentProfile: {
            select: {
              studentId: true,
            },
          },
        },
      },
      section: {
        select: {
          name: true,
        },
      },
    },
    orderBy: [
      { section: { name: "asc" } },
      { student: { name: "asc" } },
    ],
  });

  // Load all submissions for this assignment
  const submissions = await prisma.submission.findMany({
    where: {
      assignmentId,
    },
    include: {
      grade: {
        include: {
          gradedBy: {
            select: { name: true },
          },
        },
      },
      versions: {
        orderBy: { versionNo: "desc" },
      },
    },
  });

  const subMap = new Map<string, (typeof submissions)[0]>();
  for (const s of submissions) {
    subMap.set(s.studentId, s);
  }

  let submittedCount = 0;
  let gradedCount = 0;
  let lateCount = 0;
  let totalScore = 0;

  const rows: StudentSubmissionRowData[] = enrollments.map((enr) => {
    const sub = subMap.get(enr.studentId) || null;
    const latestVer = sub?.versions[0] || null;
    const isLate = latestVer?.isLate ?? (sub?.status === SubmissionStatus.LATE);

    let status: StudentSubmissionRowData["status"] = "not_submitted";
    let rawMarks: number | null = null;
    let finalMarks: number | null = null;

    if (sub) {
      submittedCount++;
      if (isLate) lateCount++;

      if (sub.grade) {
        status = "graded";
        gradedCount++;
        rawMarks = Number(sub.grade.marks);
        finalMarks = calcFinalMarks(
          rawMarks,
          Number(assignment.maxMarks),
          isLate,
          assignment.latePenaltyPercent
        );
        totalScore += finalMarks;
      } else if (isLate) {
        status = "submitted_late";
      } else {
        status = "submitted";
      }
    }

    return {
      studentId: enr.student.id,
      name: enr.student.name,
      email: enr.student.email,
      roll: enr.student.studentProfile?.studentId || null,
      sectionName: enr.section.name,
      submissionId: sub?.id || null,
      status,
      isLate,
      versionCount: sub?.versions.length || 0,
      latestVersionNo: latestVer?.versionNo || null,
      latestVersionId: latestVer?.id || null,
      submittedAt: latestVer?.submittedAt || sub?.createdAt || null,
      rawMarks,
      finalMarks,
      reopened: sub?.reopened || false,
      gradedAt: sub?.grade?.gradedAt || null,
      gradedByName: sub?.grade?.gradedBy.name || null,
    };
  });

  const avgScore =
    gradedCount > 0
      ? Math.round((totalScore / gradedCount) * 100) / 100
      : null;

  return {
    offeringId: offering.id,
    courseCode: offering.course.code,
    courseTitle: offering.course.title,
    term: offering.term,
    academicYear: offering.academicYear,
    isArchived,
    canGrade,
    assignment: {
      id: assignment.id,
      title: assignment.title,
      description: assignment.description,
      deadline: assignment.deadline,
      maxMarks: Number(assignment.maxMarks),
      lateAllowed: assignment.lateAllowed,
      latePenaltyPercent: assignment.latePenaltyPercent,
      published: assignment.published,
    },
    stats: {
      totalEnrolled: enrollments.length,
      submittedCount,
      gradedCount,
      lateCount,
      avgScore,
    },
    rows,
  };
}

/**
 * Loads a submission's detailed view for a teacher,
 * with all versions, file download links, grade history, and next/prev navigation.
 */
export async function getTeacherSubmissionDetailData(
  offeringId: string,
  submissionId: string,
  caller: { id: string; role: Role }
): Promise<TeacherSubmissionDetailData> {
  if (caller.role !== Role.SUPER_ADMIN) {
    await assertOfferingTeacher(caller.id, offeringId, { allowTA: true });
  }

  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: {
      assignment: {
        include: {
          offering: {
            select: {
              id: true,
              status: true,
              term: true,
              academicYear: true,
              allowTaGrading: true,
              course: {
                select: {
                  code: true,
                  title: true,
                },
              },
              offeringTeachers: {
                where: { userId: caller.id },
                select: {
                  role: true,
                  canGrade: true,
                },
              },
            },
          },
        },
      },
      student: {
        select: {
          id: true,
          name: true,
          email: true,
          studentProfile: {
            select: { studentId: true },
          },
          enrollments: {
            where: {
              status: "ACTIVE",
              section: { offeringId },
            },
            select: {
              section: { select: { name: true } },
            },
          },
        },
      },
      versions: {
        orderBy: { versionNo: "desc" },
      },
      grade: {
        include: {
          gradedBy: { select: { name: true } },
        },
      },
      gradeHistories: {
        orderBy: { changedAt: "desc" },
        include: {
          changedBy: { select: { name: true } },
        },
      },
    },
  });

  if (!submission || submission.assignment.offeringId !== offeringId) {
    throw new NotFoundError("Submission not found for this course offering.");
  }

  const offering = submission.assignment.offering;
  const isArchived = offering.status === CourseOfferingStatus.ARCHIVED;
  const teacherRel = offering.offeringTeachers[0];
  const canGrade =
    !isArchived &&
    (caller.role === Role.SUPER_ADMIN ||
      teacherRel?.role === "INSTRUCTOR" ||
      (teacherRel?.role === "TA" && (teacherRel.canGrade || offering.allowTaGrading)));

  // Calculate next and previous submission IDs in this assignment for rapid grading flow
  const allSubs = await prisma.submission.findMany({
    where: { assignmentId: submission.assignmentId },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });

  const currentIndex = allSubs.findIndex((s) => s.id === submission.id);
  const prevSubmissionId = currentIndex > 0 ? allSubs[currentIndex - 1].id : null;
  const nextSubmissionId =
    currentIndex < allSubs.length - 1 ? allSubs[currentIndex + 1].id : null;

  const latestVer = submission.versions[0] || null;
  const isLate = latestVer?.isLate ?? (submission.status === SubmissionStatus.LATE);

  let finalMarks: number | null = null;
  if (submission.grade) {
    finalMarks = calcFinalMarks(
      Number(submission.grade.marks),
      Number(submission.assignment.maxMarks),
      isLate,
      submission.assignment.latePenaltyPercent
    );
  }

  return {
    offeringId: offering.id,
    courseCode: offering.course.code,
    courseTitle: offering.course.title,
    term: offering.term,
    academicYear: offering.academicYear,
    isArchived,
    canGrade,
    assignment: {
      id: submission.assignment.id,
      title: submission.assignment.title,
      description: submission.assignment.description,
      deadline: submission.assignment.deadline,
      maxMarks: Number(submission.assignment.maxMarks),
      lateAllowed: submission.assignment.lateAllowed,
      latePenaltyPercent: submission.assignment.latePenaltyPercent,
    },
    student: {
      id: submission.student.id,
      name: submission.student.name,
      email: submission.student.email,
      roll: submission.student.studentProfile?.studentId || null,
      sectionName: submission.student.enrollments[0]?.section.name || null,
    },
    submission: {
      id: submission.id,
      status: submission.status,
      reopened: submission.reopened,
      currentVersionId: submission.currentVersionId,
      createdAt: submission.createdAt,
      updatedAt: submission.updatedAt,
    },
    versions: submission.versions.map((v) => ({
      id: v.id,
      versionNo: v.versionNo,
      originalName: v.originalName,
      mime: v.mime,
      sizeBytes: v.sizeBytes,
      submittedAt: v.submittedAt,
      isLate: v.isLate,
      fileKey: v.fileKey,
    })),
    grade: submission.grade
      ? {
          id: submission.grade.id,
          marks: Number(submission.grade.marks),
          feedback: submission.grade.feedback,
          gradedAt: submission.grade.gradedAt,
          gradedByName: submission.grade.gradedBy.name,
        }
      : null,
    finalMarks,
    histories: submission.gradeHistories.map((h) => ({
      id: h.id,
      oldMarks: h.oldMarks ? Number(h.oldMarks) : null,
      newMarks: Number(h.newMarks),
      reason: h.reason,
      changedAt: h.changedAt,
      changedByName: h.changedBy.name,
    })),
    prevSubmissionId,
    nextSubmissionId,
  };
}
