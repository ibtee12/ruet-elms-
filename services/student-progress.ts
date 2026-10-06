import { prisma } from "@/lib/prisma";
import { CourseOfferingStatus } from "@prisma/client";
import { assertEnrolled } from "@/lib/auth/guards";
import {
  calculateLectureCompletion,
  calculateAssignmentCompletion,
  calculateAssignmentAverage,
  calculateQuizAverage,
  calculateProgress,
  ComponentWeights,
} from "@/lib/analytics/progress";
import {
  getWeeklyIntervals,
  calculateWeeklyActivity,
  WeeklyActivitySummary,
} from "@/lib/analytics/weekly";
import { getEffectiveAnalyticsSettings } from "@/services/analytics";
import { calcFinalMarks } from "@/lib/grading";

export interface StudentProgressBreakdown {
  progress: number; // 0 to 100
  lecturePercent: number; // 0 to 100
  completedMaterials: number;
  totalMaterials: number;
  assignmentPercent: number; // 0 to 100
  submittedDueAssignments: number;
  totalDueAssignments: number;
  quizPercent: number | null; // 0 to 100 or null if none attempted
  attemptedQuizzes: number;
  totalQuizzes: number;
  disclaimer: string; // "Learning indicator, not an official grade"
}

export interface StudentTopicPerformance {
  topicId: string;
  topicName: string;
  earnedMarks: number;
  maxMarks: number;
  percentage: number;
  isWeak: boolean; // percentage < threshold (default 50%)
  questionCount: number;
}

export interface RecommendedMaterialItem {
  id: string;
  title: string;
  description: string | null;
  type: string;
  mime: string | null;
  sizeBytes: number | null;
  topicId: string;
  topicName: string;
  offeringId: string;
  courseCode?: string;
  courseTitle?: string;
  isCompleted: boolean;
  completedAt: Date | null;
  openUrl: string;
}

export interface StudentCourseProgressData {
  offeringId: string;
  courseCode: string;
  courseTitle: string;
  term: string;
  academicYear: string;
  breakdown: StudentProgressBreakdown;
  weeklyActivity: WeeklyActivitySummary;
  trendSentence: string;
  topicPerformances: StudentTopicPerformance[];
  weakTopics: StudentTopicPerformance[];
  hasTopicTags: boolean; // Whether any materials/questions are tagged with topics
  recommendations: RecommendedMaterialItem[];
  weakTopicThreshold: number; // default: 50%
}

/**
 * Generates a plain-language sentence describing week-over-week activity change.
 * Example: "Your activity decreased by 30% this week"
 */
export function formatWeeklyTrendSentence(summary: WeeklyActivitySummary): string {
  const current = summary.currentWeekCount;
  const previous = summary.previousWeekCount;

  if (previous > 0) {
    const pct = Math.abs(summary.weekOverWeekChangePercent || 0);
    if (summary.weekOverWeekChange > 0) {
      return `Your activity increased by ${pct}% this week`;
    }
    if (summary.weekOverWeekChange < 0) {
      return `Your activity decreased by ${pct}% this week`;
    }
    return `Your activity remained steady this week`;
  }

  if (current > 0) {
    return `You logged ${current} ${current === 1 ? "activity" : "activities"} this week (up from 0 last week)`;
  }

  return `No activities recorded in the last 2 weeks`;
}

/**
 * Loads student progress, weekly activity, topic performance, and recommendations
 * for a specific course offering.
 *
 * SECURITY: Never returns riskScore or riskLevel!
 */
export async function getStudentCourseProgressData(
  studentId: string,
  offeringId: string,
  now: Date = new Date()
): Promise<StudentCourseProgressData> {
  // Authorization guard: Student must be actively enrolled
  await assertEnrolled(studentId, offeringId);

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
        },
      },
    },
  });

  const { weights, riskConfig } = await getEffectiveAnalyticsSettings();
  const weakTopicThreshold = riskConfig.lowQuizAverageThreshold || 50;

  // 1. Materials aggregation
  const publishedMaterials = await prisma.material.findMany({
    where: {
      module: { offeringId },
      published: true,
    },
    select: {
      id: true,
      title: true,
      type: true,
      mime: true,
      sizeBytes: true,
      description: true,
      topicId: true,
      order: true,
      topic: { select: { id: true, name: true } },
      progress: {
        where: { studentId },
        select: { id: true, completedAt: true },
      },
    },
    orderBy: { order: "asc" },
  });

  const totalPublishedMaterials = publishedMaterials.length;
  const completedMaterials = publishedMaterials.filter(
    (m) => m.progress.length > 0
  ).length;

  // 2. Assignments aggregation
  const publishedAssignmentsDue = await prisma.assignment.findMany({
    where: {
      offeringId,
      published: true,
      deadline: { lte: now },
    },
    select: {
      id: true,
      maxMarks: true,
      latePenaltyPercent: true,
    },
  });

  const publishedAssignmentsDueSoFar = publishedAssignmentsDue.length;
  const assignmentIdsDue = publishedAssignmentsDue.map((a) => a.id);

  let submittedDueAssignments = 0;
  if (assignmentIdsDue.length > 0) {
    submittedDueAssignments = await prisma.submission.count({
      where: {
        studentId,
        assignmentId: { in: assignmentIdsDue },
        status: { in: ["SUBMITTED", "LATE", "GRADED"] },
      },
    });
  }

  // Graded assignments for average
  const gradedSubmissions = await prisma.submission.findMany({
    where: {
      studentId,
      assignment: { offeringId, published: true },
      grade: { isNot: null },
    },
    select: {
      grade: { select: { marks: true } },
      assignment: { select: { maxMarks: true, latePenaltyPercent: true } },
      versions: {
        orderBy: { versionNo: "desc" },
        take: 1,
        select: { isLate: true },
      },
    },
  });

  const gradedItems = gradedSubmissions
    .filter((s) => s.grade && Number(s.assignment.maxMarks) > 0)
    .map((s) => ({
      finalMarks: calcFinalMarks(
        Number(s.grade!.marks),
        Number(s.assignment.maxMarks),
        s.versions[0]?.isLate ?? false,
        s.assignment.latePenaltyPercent
      ),
      maxMarks: Number(s.assignment.maxMarks),
    }));

  const { averagePercentage: assignmentAverage } =
    calculateAssignmentAverage(gradedItems);

  // 3. Quizzes aggregation
  const publishedQuizzes = await prisma.quiz.findMany({
    where: {
      offeringId,
      published: true,
    },
    select: {
      id: true,
      questions: { select: { id: true, marks: true, topicId: true } },
    },
  });

  const totalPublishedQuizzes = publishedQuizzes.length;
  const quizMaxMarksMap = new Map<string, number>();
  for (const q of publishedQuizzes) {
    const maxMarks = q.questions.reduce((sum, item) => sum + Number(item.marks), 0);
    quizMaxMarksMap.set(q.id, maxMarks);
  }

  // Student's best attempt per quiz
  const quizBests = await prisma.quizAttempt.groupBy({
    by: ["quizId"],
    where: {
      studentId,
      quiz: { offeringId, published: true },
      submittedAt: { not: null },
    },
    _max: {
      score: true,
    },
  });

  const quizBestItems = quizBests
    .filter((qb) => qb._max.score !== null)
    .map((qb) => ({
      maxScore: Number(qb._max.score),
      maxMarks: quizMaxMarksMap.get(qb.quizId) || 0,
    }));

  const { averagePercentage: quizAverage } = calculateQuizAverage(quizBestItems);

  // 4. Progress calculation
  const progressResult = calculateProgress(
    {
      completedMaterials,
      totalPublishedMaterials,
      submittedDueAssignments,
      publishedAssignmentsDueSoFar,
      totalPublishedQuizzes,
      quizAverage,
    },
    weights
  );

  const breakdown: StudentProgressBreakdown = {
    progress: progressResult.progress,
    lecturePercent: progressResult.lectureCompletion,
    completedMaterials,
    totalMaterials: totalPublishedMaterials,
    assignmentPercent: progressResult.assignmentCompletion,
    submittedDueAssignments,
    totalDueAssignments: publishedAssignmentsDueSoFar,
    quizPercent: quizAverage,
    attemptedQuizzes: quizBestItems.length,
    totalQuizzes: totalPublishedQuizzes,
    disclaimer: "Learning indicator, not an official grade",
  };

  // 5. Weekly Activity Chart (last 8 weeks)
  const intervals = getWeeklyIntervals(now);
  const weeklyCounts = await Promise.all(
    intervals.map((interval) =>
      prisma.activityEvent.count({
        where: {
          offeringId,
          userId: studentId,
          createdAt: {
            gte: interval.startDate,
            lt: interval.endDate,
          },
        },
      })
    )
  );
  const weeklyActivity = calculateWeeklyActivity(weeklyCounts, intervals);
  const trendSentence = formatWeeklyTrendSentence(weeklyActivity);

  // 6. Topic Performance
  const topics = await prisma.topic.findMany({
    where: { offeringId },
    select: { id: true, name: true },
  });

  // Collect best attempt IDs for answer analysis
  const bestAttempts = await prisma.quizAttempt.findMany({
    where: {
      studentId,
      quiz: { offeringId, published: true },
      submittedAt: { not: null },
    },
    orderBy: { score: "desc" },
    select: { id: true, quizId: true },
  });

  const bestAttemptIdsByQuiz = new Map<string, string>();
  for (const att of bestAttempts) {
    if (!bestAttemptIdsByQuiz.has(att.quizId)) {
      bestAttemptIdsByQuiz.set(att.quizId, att.id);
    }
  }
  const bestAttemptIds = Array.from(bestAttemptIdsByQuiz.values());

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
            id: true,
            marks: true,
            topicId: true,
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

  const topicPerformances: StudentTopicPerformance[] = [];
  for (const topic of topics) {
    const stat = topicMarksMap.get(topic.id);
    if (!stat || stat.max <= 0) continue;

    const percentage = Math.round((stat.earned / stat.max) * 10000) / 100;
    const isWeak = percentage < weakTopicThreshold;

    topicPerformances.push({
      topicId: topic.id,
      topicName: topic.name,
      earnedMarks: stat.earned,
      maxMarks: stat.max,
      percentage,
      isWeak,
      questionCount: stat.count,
    });
  }

  // Sort: weak topics first, then ascending by percentage
  topicPerformances.sort((a, b) => {
    if (a.isWeak !== b.isWeak) return a.isWeak ? -1 : 1;
    return a.percentage - b.percentage;
  });

  const weakTopics = topicPerformances.filter((t) => t.isWeak);

  // Check if topic tags exist anywhere in materials or questions
  const totalTaggedMaterials = publishedMaterials.filter((m) => !!m.topicId).length;
  const hasTopicTags = topics.length > 0 && (totalTaggedMaterials > 0 || topicPerformances.length > 0);

  // 7. Recommendations: For each weak topic, published materials tagged with that topic,
  // not-yet-completed first, with a link to open each.
  const recommendations: RecommendedMaterialItem[] = [];
  const weakTopicIds = new Set(weakTopics.map((t) => t.topicId));

  if (weakTopicIds.size > 0) {
    for (const mat of publishedMaterials) {
      if (mat.topicId && weakTopicIds.has(mat.topicId)) {
        const isCompleted = mat.progress.length > 0;
        const completedAt = mat.progress[0]?.completedAt || null;

        recommendations.push({
          id: mat.id,
          title: mat.title,
          description: mat.description,
          type: mat.type,
          mime: mat.mime,
          sizeBytes: mat.sizeBytes,
          topicId: mat.topicId,
          topicName: mat.topic?.name || "Topic Review",
          offeringId,
          courseCode: offering.course.code,
          courseTitle: offering.course.title,
          isCompleted,
          completedAt,
          openUrl: `/api/materials/${mat.id}/download`,
        });
      }
    }

    // Sort: not-yet-completed first, then alphabetical/order
    recommendations.sort((a, b) => {
      if (a.isCompleted !== b.isCompleted) return a.isCompleted ? 1 : -1;
      return a.title.localeCompare(b.title);
    });
  }

  return {
    offeringId,
    courseCode: offering.course.code,
    courseTitle: offering.course.title,
    term: offering.term,
    academicYear: offering.academicYear,
    breakdown,
    weeklyActivity,
    trendSentence,
    topicPerformances,
    weakTopics,
    hasTopicTags,
    recommendations,
    weakTopicThreshold,
  };
}

/**
 * Returns top N recommendations across all enrolled published courses for a student
 * for the student dashboard widget.
 */
export async function getStudentTopRecommendations(
  studentId: string,
  limit: number = 3,
  now: Date = new Date()
): Promise<RecommendedMaterialItem[]> {
  // Find published course offerings the student is enrolled in
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

  const offeringIds = Array.from(
    new Set(enrollments.map((e) => e.section.offeringId))
  );

  const allRecommendations: RecommendedMaterialItem[] = [];

  for (const offeringId of offeringIds) {
    try {
      const data = await getStudentCourseProgressData(studentId, offeringId, now);
      for (const rec of data.recommendations) {
        allRecommendations.push(rec);
      }
    } catch {
      // Ignore individual offering failures
    }
  }

  // Not-yet-completed first, then limit
  allRecommendations.sort((a, b) => {
    if (a.isCompleted !== b.isCompleted) return a.isCompleted ? 1 : -1;
    return 0;
  });

  return allRecommendations.slice(0, limit);
}
