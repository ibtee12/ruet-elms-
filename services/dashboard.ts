import { prisma } from "@/lib/prisma";
import {
  Role,
  CourseOfferingStatus,
  SubmissionStatus,
} from "@prisma/client";
import { ForbiddenError, NotFoundError } from "@/lib/auth/errors";
import { calcFinalMarks } from "@/lib/grading";

// ---------------------------------------------------------------------------
// Student Dashboard Types & Service Functions
// ---------------------------------------------------------------------------

export interface StudentUrgentDeadline {
  assignmentId: string;
  offeringId: string;
  courseCode: string;
  courseTitle: string;
  assignmentTitle: string;
  deadline: Date;
  maxMarks: number;
  hoursRemaining: number;
}

export interface StudentUpcomingDeadline {
  assignmentId: string;
  offeringId: string;
  courseCode: string;
  courseTitle: string;
  assignmentTitle: string;
  deadline: Date;
  maxMarks: number;
  isSubmitted: boolean;
}

export interface StudentCourseProgressItem {
  offeringId: string;
  courseCode: string;
  courseTitle: string;
  term: string;
  teachers: string[];
  totalPublishedMaterials: number;
  completedMaterials: number;
  progressPercent: number;
}

export interface StudentRecentGradeItem {
  submissionId: string;
  assignmentId: string;
  offeringId: string;
  courseCode: string;
  assignmentTitle: string;
  rawMarks: number;
  finalMarks: number;
  maxMarks: number;
  feedback: string | null;
  gradedAt: Date;
}

export interface StudentDashboardAnnouncement {
  id: string;
  title: string;
  body: string;
  courseCode: string | null;
  offeringId: string | null;
  authorName: string;
  createdAt: Date;
}

export interface StudentOverviewData {
  userName: string;
  departmentName: string;
  batch: string | null;
  level: number | null;
  term: number | null;
  pendingSubmissionsCount: number;
}

export interface StudentDashboardData extends StudentOverviewData {
  urgentDeadlines: StudentUrgentDeadline[];
  upcomingDeadlines: StudentUpcomingDeadline[];
  courses: StudentCourseProgressItem[];
  recentGrades: StudentRecentGradeItem[];
  recentAnnouncements: StudentDashboardAnnouncement[];
}

/**
 * Helper to fetch offering IDs for a student's active enrollments in published offerings.
 */
async function getStudentActiveOfferingIds(studentId: string): Promise<string[]> {
  const enrollments = await prisma.enrollment.findMany({
    where: {
      studentId,
      status: "ACTIVE",
      section: {
        offering: {
          status: CourseOfferingStatus.PUBLISHED,
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

  return Array.from(new Set(enrollments.map((e) => e.section.offeringId)));
}

/**
 * Returns student profile info and count of pending (unsubmitted) assignments.
 */
export async function getStudentOverview(studentId: string): Promise<StudentOverviewData> {
  const user = await prisma.user.findUnique({
    where: { id: studentId },
    select: {
      name: true,
      studentProfile: {
        select: {
          batch: true,
          level: true,
          term: true,
          department: { select: { name: true } },
        },
      },
    },
  });

  if (!user) {
    throw new NotFoundError("Student user not found.");
  }

  const offeringIds = await getStudentActiveOfferingIds(studentId);

  let pendingSubmissionsCount = 0;
  if (offeringIds.length > 0) {
    const publishedAssignments = await prisma.assignment.findMany({
      where: {
        offeringId: { in: offeringIds },
        published: true,
      },
      select: { id: true },
    });

    if (publishedAssignments.length > 0) {
      const assignmentIds = publishedAssignments.map((a) => a.id);
      const submittedCount = await prisma.submission.count({
        where: {
          studentId,
          assignmentId: { in: assignmentIds },
        },
      });
      pendingSubmissionsCount = Math.max(0, assignmentIds.length - submittedCount);
    }
  }

  return {
    userName: user.name,
    departmentName: user.studentProfile?.department.name || "Engineering",
    batch: user.studentProfile?.batch || null,
    level: user.studentProfile?.level || null,
    term: user.studentProfile?.term || null,
    pendingSubmissionsCount,
  };
}

/**
 * Returns urgent deadlines: published assignments in student's enrolled courses
 * due in under 24 hours that have NOT yet been submitted.
 */
export async function getStudentUrgentDeadlines(
  studentId: string
): Promise<StudentUrgentDeadline[]> {
  const offeringIds = await getStudentActiveOfferingIds(studentId);
  if (offeringIds.length === 0) return [];

  const now = new Date();
  const next24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  // Find assignments due between now and next 24 hours
  const assignments = await prisma.assignment.findMany({
    where: {
      offeringId: { in: offeringIds },
      published: true,
      deadline: {
        gt: now,
        lte: next24h,
      },
    },
    select: {
      id: true,
      offeringId: true,
      title: true,
      deadline: true,
      maxMarks: true,
      offering: {
        select: {
          course: { select: { code: true, title: true } },
        },
      },
      submissions: {
        where: { studentId },
        select: { id: true },
      },
    },
    orderBy: { deadline: "asc" },
  });

  // Filter out assignments the student has already submitted
  return assignments
    .filter((a) => a.submissions.length === 0)
    .map((a) => {
      const msRemaining = a.deadline.getTime() - now.getTime();
      const hoursRemaining = Math.max(1, Math.round(msRemaining / (1000 * 60 * 60)));
      return {
        assignmentId: a.id,
        offeringId: a.offeringId,
        courseCode: a.offering.course.code,
        courseTitle: a.offering.course.title,
        assignmentTitle: a.title,
        deadline: a.deadline,
        maxMarks: Number(a.maxMarks),
        hoursRemaining,
      };
    });
}

/**
 * Returns upcoming deadlines (assignments) sorted by deadline ascending.
 * Includes submitted status flag.
 */
export async function getStudentUpcomingDeadlines(
  studentId: string
): Promise<StudentUpcomingDeadline[]> {
  const offeringIds = await getStudentActiveOfferingIds(studentId);
  if (offeringIds.length === 0) return [];

  const now = new Date();

  const assignments = await prisma.assignment.findMany({
    where: {
      offeringId: { in: offeringIds },
      published: true,
      deadline: { gt: now },
    },
    select: {
      id: true,
      offeringId: true,
      title: true,
      deadline: true,
      maxMarks: true,
      offering: {
        select: {
          course: { select: { code: true, title: true } },
        },
      },
      submissions: {
        where: { studentId },
        select: { id: true },
      },
    },
    orderBy: { deadline: "asc" },
  });

  return assignments.map((a) => ({
    assignmentId: a.id,
    offeringId: a.offeringId,
    courseCode: a.offering.course.code,
    courseTitle: a.offering.course.title,
    assignmentTitle: a.title,
    deadline: a.deadline,
    maxMarks: Number(a.maxMarks),
    isSubmitted: a.submissions.length > 0,
  }));
}

/**
 * Returns student's enrolled courses with material progress (completed / published).
 */
export async function getStudentCoursesWithProgress(
  studentId: string
): Promise<StudentCourseProgressItem[]> {
  const enrollments = await prisma.enrollment.findMany({
    where: {
      studentId,
      status: "ACTIVE",
      section: {
        offering: {
          status: CourseOfferingStatus.PUBLISHED,
        },
      },
    },
    include: {
      section: {
        include: {
          offering: {
            include: {
              course: { select: { code: true, title: true } },
              offeringTeachers: {
                include: { user: { select: { name: true } } },
              },
            },
          },
        },
      },
    },
  });

  const offeringIds = Array.from(
    new Set(enrollments.map((e) => e.section.offering.id))
  );

  if (offeringIds.length === 0) return [];

  // Query published materials for these offerings
  const publishedMaterials = await prisma.material.findMany({
    where: {
      module: { offeringId: { in: offeringIds } },
      published: true,
    },
    select: {
      id: true,
      module: { select: { offeringId: true } },
    },
  });

  const materialOfferingMap = new Map<string, string>();
  const totalMaterialsPerOffering: Record<string, number> = {};
  for (const m of publishedMaterials) {
    const oid = m.module.offeringId;
    materialOfferingMap.set(m.id, oid);
    totalMaterialsPerOffering[oid] = (totalMaterialsPerOffering[oid] || 0) + 1;
  }

  // Query completed materials by this student
  const completedProgress =
    publishedMaterials.length > 0
      ? await prisma.materialProgress.findMany({
          where: {
            studentId,
            materialId: { in: publishedMaterials.map((m) => m.id) },
          },
          select: { materialId: true },
        })
      : [];

  const completedPerOffering: Record<string, number> = {};
  for (const cp of completedProgress) {
    const oid = materialOfferingMap.get(cp.materialId);
    if (oid) {
      completedPerOffering[oid] = (completedPerOffering[oid] || 0) + 1;
    }
  }

  // Deduplicate offerings if enrolled in multiple sections (normally 1 section)
  const seenOffering = new Set<string>();
  const courses: StudentCourseProgressItem[] = [];

  for (const enr of enrollments) {
    const off = enr.section.offering;
    if (seenOffering.has(off.id)) continue;
    seenOffering.add(off.id);

    const total = totalMaterialsPerOffering[off.id] || 0;
    const completed = completedPerOffering[off.id] || 0;
    const progressPercent = total > 0 ? Math.round((completed / total) * 100) : 0;

    courses.push({
      offeringId: off.id,
      courseCode: off.course.code,
      courseTitle: off.course.title,
      term: off.term,
      teachers: off.offeringTeachers.map((t) => t.user.name),
      totalPublishedMaterials: total,
      completedMaterials: completed,
      progressPercent,
    });
  }

  return courses;
}

/**
 * Returns recent grades for the student (up to limit, default 5).
 */
export async function getStudentRecentGrades(
  studentId: string,
  limit = 5
): Promise<StudentRecentGradeItem[]> {
  const gradedSubmissions = await prisma.submission.findMany({
    where: {
      studentId,
      grade: { isNot: null },
    },
    include: {
      grade: true,
      assignment: {
        include: {
          offering: {
            include: {
              course: { select: { code: true } },
            },
          },
        },
      },
      versions: {
        orderBy: { versionNo: "desc" },
        take: 1,
        select: { isLate: true },
      },
    },
    orderBy: {
      grade: {
        gradedAt: "desc",
      },
    },
    take: limit,
  });

  return gradedSubmissions.map((s) => {
    const isLate = s.versions[0]?.isLate ?? (s.status === SubmissionStatus.LATE);
    const raw = Number(s.grade!.marks);
    const final = calcFinalMarks(
      raw,
      Number(s.assignment.maxMarks),
      isLate,
      s.assignment.latePenaltyPercent
    );

    return {
      submissionId: s.id,
      assignmentId: s.assignmentId,
      offeringId: s.assignment.offeringId,
      courseCode: s.assignment.offering.course.code,
      assignmentTitle: s.assignment.title,
      rawMarks: raw,
      finalMarks: final,
      maxMarks: Number(s.assignment.maxMarks),
      feedback: s.grade!.feedback,
      gradedAt: s.grade!.gradedAt,
    };
  });
}

/**
 * Returns recent announcements for student's enrolled offerings or department.
 */
export async function getStudentRecentAnnouncements(
  studentId: string,
  limit = 5
): Promise<StudentDashboardAnnouncement[]> {
  const user = await prisma.user.findUnique({
    where: { id: studentId },
    select: {
      studentProfile: { select: { departmentId: true } },
    },
  });

  const offeringIds = await getStudentActiveOfferingIds(studentId);
  const deptId = user?.studentProfile?.departmentId;

  if (offeringIds.length === 0 && !deptId) {
    return [];
  }

  const announcements = await prisma.announcement.findMany({
    where: {
      OR: [
        ...(offeringIds.length > 0 ? [{ offeringId: { in: offeringIds } }] : []),
        ...(deptId ? [{ departmentId: deptId }] : []),
      ],
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      title: true,
      body: true,
      createdAt: true,
      author: { select: { name: true } },
      offering: {
        select: {
          id: true,
          course: { select: { code: true } },
        },
      },
    },
  });

  return announcements.map((ann) => ({
    id: ann.id,
    title: ann.title,
    body: ann.body,
    courseCode: ann.offering?.course.code || null,
    offeringId: ann.offering?.id || null,
    authorName: ann.author.name,
    createdAt: ann.createdAt,
  }));
}

/**
 * Unified Student Dashboard data getter.
 */
export async function getStudentDashboardData(
  studentId: string
): Promise<StudentDashboardData> {
  const [
    overview,
    urgentDeadlines,
    upcomingDeadlines,
    courses,
    recentGrades,
    recentAnnouncements,
  ] = await Promise.all([
    getStudentOverview(studentId),
    getStudentUrgentDeadlines(studentId),
    getStudentUpcomingDeadlines(studentId),
    getStudentCoursesWithProgress(studentId),
    getStudentRecentGrades(studentId, 5),
    getStudentRecentAnnouncements(studentId, 5),
  ]);

  return {
    ...overview,
    urgentDeadlines,
    upcomingDeadlines,
    courses,
    recentGrades,
    recentAnnouncements,
  };
}

// ---------------------------------------------------------------------------
// Teacher Dashboard Types & Service Functions
// ---------------------------------------------------------------------------

export interface TeacherOfferingSummaryItem {
  id: string;
  courseCode: string;
  courseTitle: string;
  term: string;
  academicYear: string;
  status: CourseOfferingStatus;
  role: string;
  enrolledStudentsCount: number;
}

export interface TeacherUngradedSubmissionItem {
  assignmentId: string;
  offeringId: string;
  courseCode: string;
  assignmentTitle: string;
  ungradedCount: number;
  totalSubmissionsCount: number;
}

export interface TeacherUpcomingDeadlineItem {
  assignmentId: string;
  offeringId: string;
  courseCode: string;
  assignmentTitle: string;
  deadline: Date;
  submittedCount: number;
  enrolledCount: number;
}

export interface TeacherOverviewData {
  userName: string;
  designation: string;
  departmentName: string;
  totalOfferingsCount: number;
  totalWaitingForGradingCount: number;
}

export interface TeacherDashboardData extends TeacherOverviewData {
  offerings: TeacherOfferingSummaryItem[];
  waitingForGrading: TeacherUngradedSubmissionItem[];
  upcomingDeadlines: TeacherUpcomingDeadlineItem[];
  recentAnnouncements: StudentDashboardAnnouncement[];
}

/**
 * Returns offerings assigned to this teacher.
 */
export async function getTeacherOfferings(
  teacherId: string
): Promise<TeacherOfferingSummaryItem[]> {
  const teacherOfferings = await prisma.offeringTeacher.findMany({
    where: { userId: teacherId },
    include: {
      offering: {
        include: {
          course: { select: { code: true, title: true } },
          sections: {
            include: {
              _count: {
                select: { enrollments: { where: { status: "ACTIVE" } } },
              },
            },
          },
        },
      },
    },
    orderBy: { offering: { createdAt: "desc" } },
  });

  return teacherOfferings.map((rel) => {
    const off = rel.offering;
    const enrolled = off.sections.reduce((acc, s) => acc + s._count.enrollments, 0);
    return {
      id: off.id,
      courseCode: off.course.code,
      courseTitle: off.course.title,
      term: off.term,
      academicYear: off.academicYear,
      status: off.status,
      role: rel.role,
      enrolledStudentsCount: enrolled,
    };
  });
}

/**
 * Returns assignments with submissions waiting for grading.
 */
export async function getTeacherWaitingForGrading(
  teacherId: string
): Promise<TeacherUngradedSubmissionItem[]> {
  const teacherOfferings = await prisma.offeringTeacher.findMany({
    where: { userId: teacherId },
    select: { offeringId: true },
  });

  const offeringIds = teacherOfferings.map((to) => to.offeringId);
  if (offeringIds.length === 0) return [];

  const assignments = await prisma.assignment.findMany({
    where: {
      offeringId: { in: offeringIds },
      published: true,
      submissions: {
        some: {
          status: { in: [SubmissionStatus.SUBMITTED, SubmissionStatus.LATE] },
          grade: null,
        },
      },
    },
    select: {
      id: true,
      offeringId: true,
      title: true,
      offering: {
        select: {
          course: { select: { code: true } },
        },
      },
      submissions: {
        select: {
          id: true,
          status: true,
          grade: { select: { id: true } },
        },
      },
    },
  });

  const result: TeacherUngradedSubmissionItem[] = [];

  for (const a of assignments) {
    const ungradedSubs = a.submissions.filter(
      (s) => (s.status === "SUBMITTED" || s.status === "LATE") && !s.grade
    );

    if (ungradedSubs.length > 0) {
      result.push({
        assignmentId: a.id,
        offeringId: a.offeringId,
        courseCode: a.offering.course.code,
        assignmentTitle: a.title,
        ungradedCount: ungradedSubs.length,
        totalSubmissionsCount: a.submissions.length,
      });
    }
  }

  return result;
}

/**
 * Returns upcoming deadlines in teacher's assigned courses.
 */
export async function getTeacherUpcomingDeadlines(
  teacherId: string,
  limit = 5
): Promise<TeacherUpcomingDeadlineItem[]> {
  const offerings = await getTeacherOfferings(teacherId);
  if (offerings.length === 0) return [];

  const offeringIds = offerings.map((o) => o.id);
  const enrollmentMap = new Map<string, number>();
  for (const o of offerings) {
    enrollmentMap.set(o.id, o.enrolledStudentsCount);
  }

  const now = new Date();

  const assignments = await prisma.assignment.findMany({
    where: {
      offeringId: { in: offeringIds },
      published: true,
      deadline: { gt: now },
    },
    select: {
      id: true,
      offeringId: true,
      title: true,
      deadline: true,
      offering: {
        select: {
          course: { select: { code: true } },
        },
      },
      _count: {
        select: { submissions: true },
      },
    },
    orderBy: { deadline: "asc" },
    take: limit,
  });

  return assignments.map((a) => ({
    assignmentId: a.id,
    offeringId: a.offeringId,
    courseCode: a.offering.course.code,
    assignmentTitle: a.title,
    deadline: a.deadline,
    submittedCount: a._count.submissions,
    enrolledCount: enrollmentMap.get(a.offeringId) || 0,
  }));
}

/**
 * Returns recent announcements for teacher's courses or department.
 */
export async function getTeacherRecentAnnouncements(
  teacherId: string,
  limit = 5
): Promise<StudentDashboardAnnouncement[]> {
  const user = await prisma.user.findUnique({
    where: { id: teacherId },
    select: {
      teacherProfile: { select: { departmentId: true } },
    },
  });

  const teacherOfferings = await prisma.offeringTeacher.findMany({
    where: { userId: teacherId },
    select: { offeringId: true },
  });

  const offeringIds = teacherOfferings.map((to) => to.offeringId);
  const deptId = user?.teacherProfile?.departmentId;

  if (offeringIds.length === 0 && !deptId) return [];

  const announcements = await prisma.announcement.findMany({
    where: {
      OR: [
        ...(offeringIds.length > 0 ? [{ offeringId: { in: offeringIds } }] : []),
        ...(deptId ? [{ departmentId: deptId }] : []),
      ],
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      title: true,
      body: true,
      createdAt: true,
      author: { select: { name: true } },
      offering: {
        select: {
          id: true,
          course: { select: { code: true } },
        },
      },
    },
  });

  return announcements.map((ann) => ({
    id: ann.id,
    title: ann.title,
    body: ann.body,
    courseCode: ann.offering?.course.code || null,
    offeringId: ann.offering?.id || null,
    authorName: ann.author.name,
    createdAt: ann.createdAt,
  }));
}

/**
 * Unified Teacher Dashboard data getter.
 */
export async function getTeacherDashboardData(
  teacherId: string
): Promise<TeacherDashboardData> {
  const user = await prisma.user.findUnique({
    where: { id: teacherId },
    select: {
      name: true,
      teacherProfile: {
        select: {
          designation: true,
          department: { select: { name: true } },
        },
      },
    },
  });

  if (!user) {
    throw new NotFoundError("Teacher user not found.");
  }

  const [offerings, waitingForGrading, upcomingDeadlines, recentAnnouncements] =
    await Promise.all([
      getTeacherOfferings(teacherId),
      getTeacherWaitingForGrading(teacherId),
      getTeacherUpcomingDeadlines(teacherId, 5),
      getTeacherRecentAnnouncements(teacherId, 5),
    ]);

  const totalWaitingForGradingCount = waitingForGrading.reduce(
    (sum, item) => sum + item.ungradedCount,
    0
  );

  return {
    userName: user.name,
    designation: user.teacherProfile?.designation || "Faculty Member",
    departmentName: user.teacherProfile?.department.name || "Engineering",
    totalOfferingsCount: offerings.length,
    totalWaitingForGradingCount,
    offerings,
    waitingForGrading,
    upcomingDeadlines,
    recentAnnouncements,
  };
}

// ---------------------------------------------------------------------------
// Dept Admin Dashboard Types & Service Functions
// ---------------------------------------------------------------------------

export interface DeptAdminDraftOfferingItem {
  id: string;
  courseCode: string;
  courseTitle: string;
  term: string;
  academicYear: string;
  teachers: string[];
  createdAt: Date;
}

export interface DeptAdminStatsData {
  departmentCode: string;
  departmentName: string;
  teachersCount: number;
  studentsCount: number;
  offeringsByStatus: {
    draft: number;
    published: number;
    archived: number;
    total: number;
  };
}

export interface DeptAdminDashboardData extends DeptAdminStatsData {
  draftOfferings: DeptAdminDraftOfferingItem[];
}

/**
 * Returns Dept Admin stats strictly scoped to their department.
 */
export async function getDeptAdminStats(userId: string): Promise<DeptAdminStatsData> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      teacherProfile: {
        select: {
          departmentId: true,
          department: { select: { code: true, name: true } },
        },
      },
    },
  });

  if (!user) {
    throw new ForbiddenError("User not found.");
  }

  let deptId = user.teacherProfile?.departmentId;
  let deptCode = user.teacherProfile?.department?.code;
  let deptName = user.teacherProfile?.department?.name;

  if (!deptId && user.role === Role.SUPER_ADMIN) {
    const firstDept = await prisma.department.findFirst({
      orderBy: { code: "asc" },
    });
    if (firstDept) {
      deptId = firstDept.id;
      deptCode = firstDept.code;
      deptName = firstDept.name;
    }
  }

  if (!deptId || !deptCode || !deptName) {
    throw new ForbiddenError("User is not affiliated with a department.");
  }

  const [teachersCount, studentsCount, offeringsGroup] = await Promise.all([
    prisma.teacherProfile.count({
      where: { departmentId: deptId },
    }),
    prisma.studentProfile.count({
      where: { departmentId: deptId },
    }),
    prisma.courseOffering.groupBy({
      by: ["status"],
      where: { course: { departmentId: deptId } },
      _count: { _all: true },
    }),
  ]);

  let draft = 0;
  let published = 0;
  let archived = 0;

  for (const g of offeringsGroup) {
    if (g.status === CourseOfferingStatus.DRAFT) draft = g._count._all;
    if (g.status === CourseOfferingStatus.PUBLISHED) published = g._count._all;
    if (g.status === CourseOfferingStatus.ARCHIVED) archived = g._count._all;
  }

  return {
    departmentCode: deptCode,
    departmentName: deptName,
    teachersCount,
    studentsCount,
    offeringsByStatus: {
      draft,
      published,
      archived,
      total: draft + published + archived,
    },
  };
}

/**
 * Returns DRAFT offerings awaiting publish for this department.
 */
export async function getDeptAdminDraftOfferings(
  userId: string
): Promise<DeptAdminDraftOfferingItem[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      teacherProfile: { select: { departmentId: true } },
    },
  });

  if (!user) {
    throw new ForbiddenError("User not found.");
  }

  let deptId = user.teacherProfile?.departmentId;
  if (!deptId && user.role === Role.SUPER_ADMIN) {
    const firstDept = await prisma.department.findFirst({
      orderBy: { code: "asc" },
    });
    if (firstDept) {
      deptId = firstDept.id;
    }
  }

  if (!deptId) {
    throw new ForbiddenError("User is not affiliated with a department.");
  }

  const draftOfferingsData = await prisma.courseOffering.findMany({
    where: {
      course: { departmentId: deptId },
      status: CourseOfferingStatus.DRAFT,
    },
    include: {
      course: { select: { code: true, title: true } },
      offeringTeachers: {
        include: { user: { select: { name: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return draftOfferingsData.map((off) => ({
    id: off.id,
    courseCode: off.course.code,
    courseTitle: off.course.title,
    term: off.term,
    academicYear: off.academicYear,
    teachers: off.offeringTeachers.map((t) => t.user.name),
    createdAt: off.createdAt,
  }));
}

/**
 * Unified Dept Admin Dashboard data getter.
 */
export async function getDeptAdminDashboardData(
  userId: string
): Promise<DeptAdminDashboardData> {
  const [stats, draftOfferings] = await Promise.all([
    getDeptAdminStats(userId),
    getDeptAdminDraftOfferings(userId),
  ]);

  return {
    ...stats,
    draftOfferings,
  };
}

// ---------------------------------------------------------------------------
// Super Admin Dashboard Types & Service Functions
// ---------------------------------------------------------------------------

export interface SuperAdminCountsData {
  usersByRole: {
    superAdmin: number;
    deptAdmin: number;
    teacher: number;
    student: number;
    total: number;
  };
  departmentsCount: number;
  coursesCount: number;
  offeringsCount: number;
}

export interface SuperAdminAuditLogItem {
  id: string;
  action: string;
  description: string | null;
  actorName: string;
  actorEmail: string;
  ip: string | null;
  createdAt: Date;
}

export interface SuperAdminDashboardData extends SuperAdminCountsData {
  recentAuditLogs: SuperAdminAuditLogItem[];
}

/**
 * Returns system-wide counts: users by role, departments, catalog courses, offerings.
 */
export async function getSuperAdminCounts(): Promise<SuperAdminCountsData> {
  const [userRolesGroup, departmentsCount, coursesCount, offeringsCount] =
    await Promise.all([
      prisma.user.groupBy({
        by: ["role"],
        _count: { _all: true },
      }),
      prisma.department.count(),
      prisma.course.count(),
      prisma.courseOffering.count(),
    ]);

  let superAdmin = 0;
  let deptAdmin = 0;
  let teacher = 0;
  let student = 0;

  for (const r of userRolesGroup) {
    if (r.role === Role.SUPER_ADMIN) superAdmin = r._count._all;
    if (r.role === Role.DEPT_ADMIN) deptAdmin = r._count._all;
    if (r.role === Role.TEACHER) teacher = r._count._all;
    if (r.role === Role.STUDENT) student = r._count._all;
  }

  return {
    usersByRole: {
      superAdmin,
      deptAdmin,
      teacher,
      student,
      total: superAdmin + deptAdmin + teacher + student,
    },
    departmentsCount,
    coursesCount,
    offeringsCount,
  };
}

/**
 * Returns recent audit log entries.
 */
export async function getSuperAdminAuditLogs(
  limit = 10
): Promise<SuperAdminAuditLogItem[]> {
  const recentLogs = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      user: { select: { name: true, email: true } },
    },
  });

  return recentLogs.map((log) => ({
    id: log.id,
    action: log.action,
    description: log.description,
    actorName: log.user?.name || "System",
    actorEmail: log.user?.email || "system@ruet.ac.bd",
    ip: log.ip,
    createdAt: log.createdAt,
  }));
}

/**
 * Unified Super Admin Dashboard data getter.
 */
export async function getSuperAdminDashboardData(): Promise<SuperAdminDashboardData> {
  const [counts, recentAuditLogs] = await Promise.all([
    getSuperAdminCounts(),
    getSuperAdminAuditLogs(10),
  ]);

  return {
    ...counts,
    recentAuditLogs,
  };
}
