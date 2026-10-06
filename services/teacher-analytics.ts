import { prisma } from "@/lib/prisma";
import { Role, RiskLevel } from "@prisma/client";
import { assertAnalyticsAccess, assertDeptAccess } from "@/lib/auth/guards";
import {
  calculateOfferingStudentsAnalytics,
  getOfferingWeeklyActivity,
} from "@/services/analytics";
import { WeeklyActivitySummary } from "@/lib/analytics/weekly";

export interface TeacherAnalyticsStatCards {
  enrolledStudents: number;
  averageQuizPercent: number | null;
  assignmentCompletionRate: number; // percentage 0-100
  averageProgress: number; // percentage 0-100
  atRiskCount: number; // HIGH + MEDIUM
  highRiskCount: number;
  mediumRiskCount: number;
  lowRiskCount: number;
  inactiveCount: number; // >= 7 days
}

export interface GradeDistributionBracket {
  label: string; // "80–100%", "70–79%", etc.
  description: string;
  min: number;
  max: number;
  count: number;
  percentage: number;
  colorClass: string;
}

export interface AssignmentSubmissionRateItem {
  id: string;
  title: string;
  deadline: Date;
  submittedCount: number;
  enrolledCount: number;
  ratePercent: number;
}

export interface TopicPerformanceAnalyticsItem {
  topicId: string;
  topicName: string;
  questionCount: number;
  earnedMarks: number;
  maxMarks: number;
  classAveragePercent: number;
}

export interface TeacherAnalyticsStudentRow {
  studentId: string;
  name: string;
  email: string;
  roll: string | null;
  sectionName: string;
  riskLevel: RiskLevel;
  riskScore: number;
  progress: number;
  lastActive: Date | null;
  reasons: string[];
}

export interface TeacherOfferingAnalyticsData {
  offeringId: string;
  courseCode: string;
  courseTitle: string;
  term: string;
  academicYear: string;
  departmentCode: string;
  departmentName: string;
  stats: TeacherAnalyticsStatCards;
  gradeDistribution: GradeDistributionBracket[];
  assignmentSubmissionRates: AssignmentSubmissionRateItem[];
  topicPerformance: TopicPerformanceAnalyticsItem[];
  hardestTopic: TopicPerformanceAnalyticsItem | null;
  strongestTopic: TopicPerformanceAnalyticsItem | null;
  weeklyActivity: WeeklyActivitySummary;
  students: TeacherAnalyticsStudentRow[];
}

export interface DeptCourseStatsItem {
  offeringId: string;
  courseCode: string;
  courseTitle: string;
  term: string;
  academicYear: string;
  enrolledStudents: number;
  highRiskCount: number;
  mediumRiskCount: number;
  inactiveCount: number;
  averageProgress: number;
}

export interface DeptAnalyticsSummaryData {
  departmentId: string;
  departmentName: string;
  departmentCode: string;
  totalCourses: number;
  totalStudents: number;
  totalHighRisk: number;
  totalMediumRisk: number;
  totalInactive: number;
  overallAverageProgress: number;
  courses: DeptCourseStatsItem[];
}

/**
 * Loads teacher analytics for a course offering.
 * Only accessible to instructors/TAs of the offering, department admins of that dept, and SUPER_ADMIN.
 */
export async function getTeacherOfferingAnalytics(
  offeringId: string,
  caller: { id: string; role: Role },
  now: Date = new Date()
): Promise<TeacherOfferingAnalyticsData> {
  // Authorization guard
  await assertAnalyticsAccess(caller, offeringId);

  const offering = await prisma.courseOffering.findUniqueOrThrow({
    where: { id: offeringId },
    select: {
      id: true,
      term: true,
      academicYear: true,
      course: {
        select: {
          code: true,
          title: true,
          department: {
            select: { code: true, name: true },
          },
        },
      },
    },
  });

  // Fetch active enrollments with user profiles
  const enrollments = await prisma.enrollment.findMany({
    where: {
      section: { offeringId },
      status: "ACTIVE",
    },
    include: {
      student: {
        select: {
          id: true,
          name: true,
          email: true,
          lastActiveAt: true,
          studentProfile: {
            select: { studentId: true },
          },
        },
      },
      section: {
        select: { name: true },
      },
    },
    orderBy: [
      { section: { name: "asc" } },
      { student: { name: "asc" } },
    ],
  });

  const enrolledStudents = enrollments.length;

  // Empty state handling for offerings with zero enrolled students
  if (enrolledStudents === 0) {
    const weeklyActivity = await getOfferingWeeklyActivity(offeringId, undefined, now);
    return {
      offeringId,
      courseCode: offering.course.code,
      courseTitle: offering.course.title,
      term: offering.term,
      academicYear: offering.academicYear,
      departmentCode: offering.course.department.code,
      departmentName: offering.course.department.name,
      stats: {
        enrolledStudents: 0,
        averageQuizPercent: null,
        assignmentCompletionRate: 0,
        averageProgress: 0,
        atRiskCount: 0,
        highRiskCount: 0,
        mediumRiskCount: 0,
        lowRiskCount: 0,
        inactiveCount: 0,
      },
      gradeDistribution: getEmptyGradeDistribution(),
      assignmentSubmissionRates: [],
      topicPerformance: [],
      hardestTopic: null,
      strongestTopic: null,
      weeklyActivity,
      students: [],
    };
  }

  // 1. Calculate student analytics (progress, completions, risk)
  const studentMetrics = await calculateOfferingStudentsAnalytics(offeringId, { now });
  const metricsMap = new Map<string, (typeof studentMetrics)[0]>();
  for (const m of studentMetrics) {
    metricsMap.set(m.studentId, m);
  }

  // Latest activity per student
  const activityGroups = await prisma.activityEvent.groupBy({
    by: ["userId"],
    where: {
      offeringId,
      userId: { in: enrollments.map((e) => e.student.id) },
    },
    _max: {
      createdAt: true,
    },
  });

  const lastActiveMap = new Map<string, Date>();
  for (const g of activityGroups) {
    if (g._max.createdAt) {
      lastActiveMap.set(g.userId, g._max.createdAt);
    }
  }

  // 2. Assemble student rows
  const students: TeacherAnalyticsStudentRow[] = [];
  let totalProgress = 0;
  let totalAssignmentCompletion = 0;
  let quizPercentSum = 0;
  let quizPercentCount = 0;
  let highRiskCount = 0;
  let mediumRiskCount = 0;
  let lowRiskCount = 0;
  let inactiveCount = 0;

  for (const enr of enrollments) {
    const s = enr.student;
    const stat = metricsMap.get(s.id);
    const lastActive = lastActiveMap.get(s.id) || s.lastActiveAt || null;

    const progress = stat ? stat.progress : 0;
    const riskLevel = stat ? stat.riskLevel : RiskLevel.LOW;
    const riskScore = stat ? stat.riskScore : 0;
    const reasons = stat ? stat.reasons : [];

    totalProgress += progress;
    if (stat) {
      totalAssignmentCompletion += stat.assignmentCompletion;
      if (stat.quizAverage !== null) {
        quizPercentSum += stat.quizAverage;
        quizPercentCount++;
      }
    }

    if (riskLevel === RiskLevel.HIGH) {
      highRiskCount++;
    } else if (riskLevel === RiskLevel.MEDIUM) {
      mediumRiskCount++;
    } else {
      lowRiskCount++;
    }

    // Check inactivity: 7+ days or never active if enrolled >= 7 days
    if (lastActive) {
      const diffDays = Math.floor((now.getTime() - lastActive.getTime()) / (24 * 60 * 60 * 1000));
      if (diffDays >= 7) inactiveCount++;
    } else {
      const enrollDays = Math.floor((now.getTime() - enr.enrolledAt.getTime()) / (24 * 60 * 60 * 1000));
      if (enrollDays >= 7) inactiveCount++;
    }

    students.push({
      studentId: s.id,
      name: s.name,
      email: s.email,
      roll: s.studentProfile?.studentId || null,
      sectionName: enr.section.name,
      riskLevel,
      riskScore,
      progress,
      lastActive,
      reasons,
    });
  }

  // Sort students: HIGH risk first, then MEDIUM, then LOW; within same level, descending by riskScore
  students.sort((a, b) => {
    const rank = (lvl: RiskLevel) =>
      lvl === RiskLevel.HIGH ? 3 : lvl === RiskLevel.MEDIUM ? 2 : 1;
    if (rank(a.riskLevel) !== rank(b.riskLevel)) {
      return rank(b.riskLevel) - rank(a.riskLevel);
    }
    return b.riskScore - a.riskScore;
  });

  const averageProgress = Math.round((totalProgress / enrolledStudents) * 100) / 100;
  const assignmentCompletionRate = Math.round((totalAssignmentCompletion / enrolledStudents) * 100) / 100;
  const averageQuizPercent =
    quizPercentCount > 0 ? Math.round((quizPercentSum / quizPercentCount) * 100) / 100 : null;

  const stats: TeacherAnalyticsStatCards = {
    enrolledStudents,
    averageQuizPercent,
    assignmentCompletionRate,
    averageProgress,
    atRiskCount: highRiskCount + mediumRiskCount,
    highRiskCount,
    mediumRiskCount,
    lowRiskCount,
    inactiveCount,
  };

  // 3. Grade Distribution
  const gradeDistribution = calculateGradeDistribution(students.map((s) => s.progress));

  // 4. Submission Rate per Assignment
  const publishedAssignments = await prisma.assignment.findMany({
    where: {
      offeringId,
      published: true,
    },
    select: {
      id: true,
      title: true,
      deadline: true,
      submissions: {
        where: {
          studentId: { in: enrollments.map((e) => e.student.id) },
          status: { in: ["SUBMITTED", "LATE", "GRADED"] },
        },
        select: { id: true },
      },
    },
    orderBy: { deadline: "asc" },
  });

  const assignmentSubmissionRates: AssignmentSubmissionRateItem[] = publishedAssignments.map(
    (a) => {
      const submittedCount = a.submissions.length;
      const ratePercent =
        enrolledStudents > 0
          ? Math.round((submittedCount / enrolledStudents) * 10000) / 100
          : 0;

      return {
        id: a.id,
        title: a.title,
        deadline: a.deadline,
        submittedCount,
        enrolledCount: enrolledStudents,
        ratePercent,
      };
    }
  );

  // 5. Topic Performance (sorted worst to best)
  const topics = await prisma.topic.findMany({
    where: { offeringId },
    select: { id: true, name: true },
  });

  // Best attempts across all students for published quizzes
  const allBestAttempts = await prisma.quizAttempt.groupBy({
    by: ["studentId", "quizId"],
    where: {
      studentId: { in: enrollments.map((e) => e.student.id) },
      quiz: { offeringId, published: true },
      submittedAt: { not: null },
    },
    _max: { score: true },
  });

  // Find exact attempt IDs corresponding to best scores
  const bestAttemptIds: string[] = [];
  for (const ba of allBestAttempts) {
    if (ba._max.score === null) continue;
    const att = await prisma.quizAttempt.findFirst({
      where: {
        studentId: ba.studentId,
        quizId: ba.quizId,
        score: ba._max.score,
        submittedAt: { not: null },
      },
      select: { id: true },
    });
    if (att) bestAttemptIds.push(att.id);
  }

  const topicMarksMap = new Map<
    string,
    { earned: number; max: number; count: number }
  >();

  if (bestAttemptIds.length > 0) {
    const answers = await prisma.answer.findMany({
      where: {
        attemptId: { in: bestAttemptIds },
        question: { topicId: { not: null } },
      },
      select: {
        marksAwarded: true,
        question: {
          select: {
            topicId: true,
            marks: true,
          },
        },
      },
    });

    for (const ans of answers) {
      const tId = ans.question.topicId;
      if (!tId) continue;
      const current = topicMarksMap.get(tId) || { earned: 0, max: 0, count: 0 };
      current.earned += Number(ans.marksAwarded);
      current.max += Number(ans.question.marks);
      current.count += 1;
      topicMarksMap.set(tId, current);
    }
  }

  const topicPerformance: TopicPerformanceAnalyticsItem[] = [];
  for (const topic of topics) {
    const stat = topicMarksMap.get(topic.id);
    if (!stat || stat.max <= 0) continue;

    const classAveragePercent =
      Math.round((stat.earned / stat.max) * 10000) / 100;

    topicPerformance.push({
      topicId: topic.id,
      topicName: topic.name,
      questionCount: stat.count,
      earnedMarks: stat.earned,
      maxMarks: stat.max,
      classAveragePercent,
    });
  }

  // Sort worst to best (lowest percent first)
  topicPerformance.sort((a, b) => a.classAveragePercent - b.classAveragePercent);

  const hardestTopic = topicPerformance.length > 0 ? topicPerformance[0] : null;
  const strongestTopic =
    topicPerformance.length > 1
      ? topicPerformance[topicPerformance.length - 1]
      : null;

  // 6. Weekly Activity for Class
  const weeklyActivity = await getOfferingWeeklyActivity(offeringId, undefined, now);

  return {
    offeringId,
    courseCode: offering.course.code,
    courseTitle: offering.course.title,
    term: offering.term,
    academicYear: offering.academicYear,
    departmentCode: offering.course.department.code,
    departmentName: offering.course.department.name,
    stats,
    gradeDistribution,
    assignmentSubmissionRates,
    topicPerformance,
    hardestTopic,
    strongestTopic,
    weeklyActivity,
    students,
  };
}

function getEmptyGradeDistribution(): GradeDistributionBracket[] {
  return [
    { label: "80–100%", description: "Excellent", min: 80, max: 100, count: 0, percentage: 0, colorClass: "bg-emerald-500" },
    { label: "70–79%", description: "Good", min: 70, max: 79.99, count: 0, percentage: 0, colorClass: "bg-teal-500" },
    { label: "60–69%", description: "Satisfactory", min: 60, max: 69.99, count: 0, percentage: 0, colorClass: "bg-sky-500" },
    { label: "50–59%", description: "Pass", min: 50, max: 59.99, count: 0, percentage: 0, colorClass: "bg-amber-500" },
    { label: "<50%", description: "At-risk", min: 0, max: 49.99, count: 0, percentage: 0, colorClass: "bg-rose-500" },
  ];
}

function calculateGradeDistribution(progressValues: number[]): GradeDistributionBracket[] {
  const brackets = getEmptyGradeDistribution();
  const total = progressValues.length;
  if (total === 0) return brackets;

  for (const p of progressValues) {
    if (p >= 80) brackets[0].count++;
    else if (p >= 70) brackets[1].count++;
    else if (p >= 60) brackets[2].count++;
    else if (p >= 50) brackets[3].count++;
    else brackets[4].count++;
  }

  for (const b of brackets) {
    b.percentage = Math.round((b.count / total) * 10000) / 100;
  }

  return brackets;
}

/**
 * Sanitizes CSV field values to prevent CSV injection vulnerabilities.
 */
function sanitizeCsvValue(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return '""';
  let str = String(val).trim();
  // Escape formulas starting with =, +, -, @
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  // Escape internal double quotes
  str = str.replace(/"/g, '""');
  return `"${str}"`;
}

/**
 * Generates CSV content for the instructor at-risk report.
 */
export function generateAtRiskCsv(
  courseInfo: { code: string; title: string; term: string; academicYear: string },
  students: TeacherAnalyticsStudentRow[]
): string {
  const headers = [
    "Student ID / Roll",
    "Student Name",
    "Email",
    "Section",
    "Risk Level",
    "Risk Score",
    "Progress (%)",
    "Last Active",
    "Attention Reasons",
  ];

  const rows = students.map((s) => [
    sanitizeCsvValue(s.roll || "N/A"),
    sanitizeCsvValue(s.name),
    sanitizeCsvValue(s.email),
    sanitizeCsvValue(s.sectionName),
    sanitizeCsvValue(s.riskLevel),
    sanitizeCsvValue(s.riskScore),
    sanitizeCsvValue(`${s.progress}%`),
    sanitizeCsvValue(s.lastActive ? s.lastActive.toISOString().slice(0, 10) : "Never"),
    sanitizeCsvValue(s.reasons.length > 0 ? s.reasons.join("; ") : "None"),
  ]);

  const csvBody = [headers.map(sanitizeCsvValue).join(","), ...rows.map((r) => r.join(","))].join("\r\n");

  // Prepend UTF-8 BOM
  return "\uFEFF" + csvBody;
}

/**
 * Generates department-level summary stats across all courses for /dept/stats.
 * No student names are included.
 */
export async function getDeptAnalyticsSummary(
  departmentId: string,
  caller: { id: string; role: Role },
  now: Date = new Date()
): Promise<DeptAnalyticsSummaryData> {
  await assertDeptAccess(caller.id, departmentId);

  const dept = await prisma.department.findUniqueOrThrow({
    where: { id: departmentId },
    select: { id: true, code: true, name: true },
  });

  const offerings = await prisma.courseOffering.findMany({
    where: {
      course: { departmentId },
      status: "PUBLISHED",
    },
    include: {
      course: { select: { code: true, title: true } },
      sections: {
        select: {
          _count: {
            select: { enrollments: { where: { status: "ACTIVE" } } },
          },
        },
      },
    },
    orderBy: [{ academicYear: "desc" }, { course: { code: "asc" } }],
  });

  const courses: DeptCourseStatsItem[] = [];
  let totalStudents = 0;
  let totalHighRisk = 0;
  let totalMediumRisk = 0;
  let totalInactive = 0;
  let progressSum = 0;
  let coursesWithProgress = 0;

  for (const off of offerings) {
    const enrolled = off.sections.reduce((sum, s) => sum + s._count.enrollments, 0);
    totalStudents += enrolled;

    if (enrolled === 0) {
      courses.push({
        offeringId: off.id,
        courseCode: off.course.code,
        courseTitle: off.course.title,
        term: off.term,
        academicYear: off.academicYear,
        enrolledStudents: 0,
        highRiskCount: 0,
        mediumRiskCount: 0,
        inactiveCount: 0,
        averageProgress: 0,
      });
      continue;
    }

    try {
      const studentMetrics = await calculateOfferingStudentsAnalytics(off.id, { now });
      let high = 0;
      let medium = 0;
      let progSum = 0;

      for (const sm of studentMetrics) {
        if (sm.riskLevel === RiskLevel.HIGH) high++;
        else if (sm.riskLevel === RiskLevel.MEDIUM) medium++;
        progSum += sm.progress;
      }

      // Check inactivities
      const activeGroups = await prisma.activityEvent.groupBy({
        by: ["userId"],
        where: { offeringId: off.id },
        _max: { createdAt: true },
      });

      let inactive = 0;
      for (const ag of activeGroups) {
        if (ag._max.createdAt) {
          const days = Math.floor((now.getTime() - ag._max.createdAt.getTime()) / (24 * 60 * 60 * 1000));
          if (days >= 7) inactive++;
        }
      }

      const avgProg = Math.round((progSum / enrolled) * 100) / 100;
      totalHighRisk += high;
      totalMediumRisk += medium;
      totalInactive += inactive;
      progressSum += avgProg;
      coursesWithProgress++;

      courses.push({
        offeringId: off.id,
        courseCode: off.course.code,
        courseTitle: off.course.title,
        term: off.term,
        academicYear: off.academicYear,
        enrolledStudents: enrolled,
        highRiskCount: high,
        mediumRiskCount: medium,
        inactiveCount: inactive,
        averageProgress: avgProg,
      });
    } catch {
      // Fallback if metric calculation fails
    }
  }

  const overallAverageProgress =
    coursesWithProgress > 0
      ? Math.round((progressSum / coursesWithProgress) * 100) / 100
      : 0;

  return {
    departmentId: dept.id,
    departmentName: dept.name,
    departmentCode: dept.code,
    totalCourses: offerings.length,
    totalStudents,
    totalHighRisk,
    totalMediumRisk,
    totalInactive,
    overallAverageProgress,
    courses,
  };
}
