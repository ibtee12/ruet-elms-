import { prisma } from "@/lib/prisma";
import { CourseOfferingStatus, RiskLevel } from "@prisma/client";
import { calcFinalMarks } from "@/lib/grading";
import {
  calculateLectureCompletion,
  calculateAssignmentCompletion,
  calculateAssignmentAverage,
  calculateQuizAverage,
  calculateProgress,
  parseProgressWeights,
  ComponentWeights,
  DEFAULT_PROGRESS_WEIGHTS,
} from "@/lib/analytics/progress";
import {
  calculateRisk,
  parseRiskConfig,
  RiskConfig,
  DEFAULT_RISK_CONFIG,
  RiskAssessmentResult,
} from "@/lib/analytics/risk";
import {
  getWeeklyIntervals,
  calculateWeeklyActivity,
  WeeklyActivitySummary,
} from "@/lib/analytics/weekly";

export interface StudentAnalyticsResult {
  offeringId: string;
  studentId: string;
  date: Date;
  // Metrics
  lectureCompletion: number; // percentage 0-100
  assignmentCompletion: number; // percentage 0-100
  assignmentAverage: number | null; // percentage 0-100 or null
  quizAverage: number | null; // percentage 0-100 or null
  progress: number; // percentage 0-100
  // Risk
  riskScore: number;
  riskLevel: RiskLevel;
  reasons: string[];
}

export interface AnalyticsSnapshotJobSummary {
  timestamp: string;
  date: string;
  offeringsProcessed: number;
  studentsProcessed: number;
  snapshotsCreatedOrUpdated: number;
  durationMs: number;
}

/**
 * Normalizes any Date object to midnight UTC (YYYY-MM-DD) for Postgres @db.Date compatibility.
 */
export function normalizeSnapshotDate(d: Date = new Date()): Date {
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  const day = d.getUTCDate();
  return new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
}

/**
 * Loads effective progress weights and risk config from database Settings.
 */
export async function getEffectiveAnalyticsSettings(): Promise<{
  weights: ComponentWeights;
  riskConfig: RiskConfig;
}> {
  try {
    const settings = await prisma.setting.findMany({
      where: {
        key: { in: ["progress_weights", "risk_thresholds", "risk_config"] },
      },
    });

    const weightsSetting = settings.find((s) => s.key === "progress_weights");
    const riskSetting =
      settings.find((s) => s.key === "risk_thresholds") ||
      settings.find((s) => s.key === "risk_config");

    return {
      weights: weightsSetting
        ? parseProgressWeights(weightsSetting.value)
        : DEFAULT_PROGRESS_WEIGHTS,
      riskConfig: riskSetting
        ? parseRiskConfig(riskSetting.value)
        : DEFAULT_RISK_CONFIG,
    };
  } catch (err) {
    console.error("[Analytics] Error loading settings from database:", err);
    return {
      weights: DEFAULT_PROGRESS_WEIGHTS,
      riskConfig: DEFAULT_RISK_CONFIG,
    };
  }
}

/**
 * 5. weeklyActivity: ActivityEvent counts for the last 8 weeks and week-over-week change.
 * Uses database aggregation (COUNT queries) without loading individual rows into memory.
 */
export async function getOfferingWeeklyActivity(
  offeringId: string,
  studentId?: string,
  now: Date = new Date()
): Promise<WeeklyActivitySummary> {
  const intervals = getWeeklyIntervals(now);

  // Run 8 aggregate count queries in parallel
  const counts = await Promise.all(
    intervals.map((interval) =>
      prisma.activityEvent.count({
        where: {
          offeringId,
          ...(studentId ? { userId: studentId } : {}),
          createdAt: {
            gte: interval.startDate,
            lt: interval.endDate,
          },
        },
      })
    )
  );

  return calculateWeeklyActivity(counts, intervals);
}

/**
 * Calculates analytics for all active students in a course offering.
 * Uses strict database aggregations (count, groupBy _count, groupBy _max)
 * to avoid loading full row sets into memory.
 */
export async function calculateOfferingStudentsAnalytics(
  offeringId: string,
  options: {
    now?: Date;
    weights?: ComponentWeights;
    riskConfig?: RiskConfig;
  } = {}
): Promise<StudentAnalyticsResult[]> {
  const now = options.now || new Date();
  const normalizedDate = normalizeSnapshotDate(now);

  const { weights, riskConfig } = options.weights && options.riskConfig
    ? { weights: options.weights, riskConfig: options.riskConfig }
    : await getEffectiveAnalyticsSettings();

  // 1. Fetch active enrollments (only studentId and enrolledAt)
  const enrollments = await prisma.enrollment.findMany({
    where: {
      section: { offeringId },
      status: "ACTIVE",
    },
    select: {
      studentId: true,
      enrolledAt: true,
    },
  });

  if (enrollments.length === 0) {
    return [];
  }

  const studentIds = enrollments.map((e) => e.studentId);
  const enrolledAtMap = new Map<string, Date>();
  for (const e of enrollments) {
    enrolledAtMap.set(e.studentId, e.enrolledAt);
  }

  // 2. Lecture aggregation:
  // Count total published materials in offering
  const totalPublishedMaterials = await prisma.material.count({
    where: {
      module: { offeringId },
      published: true,
    },
  });

  // Group by studentId to count completed published materials per student
  const studentCompletedMaterialsMap = new Map<string, number>();
  if (totalPublishedMaterials > 0) {
    const completedGroups = await prisma.materialProgress.groupBy({
      by: ["studentId"],
      where: {
        studentId: { in: studentIds },
        material: {
          module: { offeringId },
          published: true,
        },
      },
      _count: {
        materialId: true,
      },
    });

    for (const g of completedGroups) {
      studentCompletedMaterialsMap.set(g.studentId, g._count.materialId);
    }
  }

  // 3. Assignment aggregation:
  // Fetch published assignments due so far
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

  // Group submissions due so far per student
  const studentSubmittedDueMap = new Map<string, number>();
  if (assignmentIdsDue.length > 0) {
    const submittedDueGroups = await prisma.submission.groupBy({
      by: ["studentId"],
      where: {
        studentId: { in: studentIds },
        assignmentId: { in: assignmentIdsDue },
        status: { in: ["SUBMITTED", "LATE", "GRADED"] },
      },
      _count: {
        assignmentId: true,
      },
    });

    for (const g of submittedDueGroups) {
      studentSubmittedDueMap.set(g.studentId, g._count.assignmentId);
    }
  }

  // Late submissions per student across all published assignments
  const studentLateCountMap = new Map<string, number>();
  const lateGroups = await prisma.submission.groupBy({
    by: ["studentId"],
    where: {
      studentId: { in: studentIds },
      assignment: { offeringId, published: true },
      OR: [
        { status: "LATE" },
        { versions: { some: { isLate: true } } },
      ],
    },
    _count: {
      assignmentId: true,
    },
  });

  for (const g of lateGroups) {
    studentLateCountMap.set(g.studentId, g._count.assignmentId);
  }

  // Graded assignment scores for assignment average
  const gradedSubmissions = await prisma.submission.findMany({
    where: {
      studentId: { in: studentIds },
      assignment: { offeringId, published: true },
      grade: { isNot: null },
    },
    select: {
      studentId: true,
      grade: { select: { marks: true } },
      assignment: { select: { maxMarks: true, latePenaltyPercent: true } },
      versions: {
        orderBy: { versionNo: "desc" },
        take: 1,
        select: { isLate: true },
      },
    },
  });

  const studentGradedItemsMap = new Map<
    string,
    { finalMarks: number; maxMarks: number }[]
  >();

  for (const s of gradedSubmissions) {
    if (!s.grade || Number(s.assignment.maxMarks) <= 0) continue;
    const isLate = s.versions[0]?.isLate ?? false;
    const finalMarks = calcFinalMarks(
      Number(s.grade.marks),
      Number(s.assignment.maxMarks),
      isLate,
      s.assignment.latePenaltyPercent
    );

    const list = studentGradedItemsMap.get(s.studentId) || [];
    list.push({ finalMarks, maxMarks: Number(s.assignment.maxMarks) });
    studentGradedItemsMap.set(s.studentId, list);
  }

  // 4. Quiz aggregation:
  const publishedQuizzes = await prisma.quiz.findMany({
    where: {
      offeringId,
      published: true,
    },
    select: {
      id: true,
      questions: { select: { marks: true } },
    },
  });

  const totalPublishedQuizzes = publishedQuizzes.length;
  const quizMaxMarksMap = new Map<string, number>();
  for (const q of publishedQuizzes) {
    const maxMarks = q.questions.reduce((sum, item) => sum + Number(item.marks), 0);
    quizMaxMarksMap.set(q.id, maxMarks);
  }

  // Database aggregate MAX(score) per (studentId, quizId)
  const studentQuizBestScoresMap = new Map<
    string,
    { maxScore: number; maxMarks: number }[]
  >();

  if (totalPublishedQuizzes > 0) {
    const bestAttemptGroups = await prisma.quizAttempt.groupBy({
      by: ["studentId", "quizId"],
      where: {
        studentId: { in: studentIds },
        quiz: { offeringId, published: true },
        submittedAt: { not: null },
      },
      _max: {
        score: true,
      },
    });

    for (const g of bestAttemptGroups) {
      if (g._max.score === null || g._max.score === undefined) continue;
      const maxMarks = quizMaxMarksMap.get(g.quizId) || 0;
      if (maxMarks <= 0) continue;

      const list = studentQuizBestScoresMap.get(g.studentId) || [];
      list.push({ maxScore: Number(g._max.score), maxMarks });
      studentQuizBestScoresMap.set(g.studentId, list);
    }
  }

  // 5. Inactivity aggregation: MAX(createdAt) per student
  const studentLatestActivityMap = new Map<string, Date>();
  const activityGroups = await prisma.activityEvent.groupBy({
    by: ["userId"],
    where: {
      offeringId,
      userId: { in: studentIds },
    },
    _max: {
      createdAt: true,
    },
  });

  for (const g of activityGroups) {
    if (g._max.createdAt) {
      studentLatestActivityMap.set(g.userId, g._max.createdAt);
    }
  }

  // 6. Assemble metrics and risk for each student
  const results: StudentAnalyticsResult[] = [];

  for (const studentId of studentIds) {
    const completedMaterials = studentCompletedMaterialsMap.get(studentId) || 0;
    const submittedDueAssignments = studentSubmittedDueMap.get(studentId) || 0;
    const lateSubmissionsCount = studentLateCountMap.get(studentId) || 0;
    const missedPastDueCount = Math.max(
      0,
      publishedAssignmentsDueSoFar - submittedDueAssignments
    );

    // Assignment average over graded assignments
    const gradedItems = studentGradedItemsMap.get(studentId) || [];
    const { averagePercentage: assignmentAverage, hasGraded } =
      calculateAssignmentAverage(gradedItems);

    // Quiz average: mean of best attempt percent per quiz
    const bestQuizzes = studentQuizBestScoresMap.get(studentId) || [];
    const { averagePercentage: quizAverage, hasAttempts } =
      calculateQuizAverage(bestQuizzes);

    // Overall progress calculation with weight renormalization
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

    // Inactivity days calculation:
    // If student has an activity event, compute elapsed days from latest event.
    // If student has NEVER had an activity event:
    //   - If enrolled recently (< inactiveDaysThreshold), treat as newly enrolled (null -> no false alarm).
    //   - If enrolled >= inactiveDaysThreshold ago, days = elapsed days since enrollment.
    const lastActivityDate = studentLatestActivityMap.get(studentId);
    let daysSinceLastActivity: number | null = null;

    if (lastActivityDate) {
      const diffMs = now.getTime() - lastActivityDate.getTime();
      daysSinceLastActivity = Math.max(0, Math.floor(diffMs / (24 * 60 * 60 * 1000)));
    } else {
      const enrolledAt = enrolledAtMap.get(studentId) || now;
      const daysSinceEnroll = Math.max(
        0,
        Math.floor((now.getTime() - enrolledAt.getTime()) / (24 * 60 * 60 * 1000))
      );
      if (daysSinceEnroll >= riskConfig.inactiveDaysThreshold) {
        daysSinceLastActivity = daysSinceEnroll;
      } else {
        daysSinceLastActivity = null; // Newly enrolled, no activity yet -> no false alarm
      }
    }

    // Risk calculation
    const riskResult: RiskAssessmentResult = calculateRisk(
      {
        quizAverage,
        hasQuizzes: totalPublishedQuizzes > 0,
        lateSubmissionsCount,
        missedPastDueCount,
        daysSinceLastActivity,
        assignmentAverage,
        hasGradedAssignments: hasGraded,
      },
      riskConfig
    );

    results.push({
      offeringId,
      studentId,
      date: normalizedDate,
      lectureCompletion: progressResult.lectureCompletion,
      assignmentCompletion: progressResult.assignmentCompletion,
      assignmentAverage,
      quizAverage,
      progress: progressResult.progress,
      riskScore: riskResult.riskScore,
      riskLevel: riskResult.riskLevel,
      reasons: riskResult.reasons,
    });
  }

  return results;
}

/**
 * Convenience helper to calculate analytics for a single student.
 */
export async function getStudentCourseProgress(
  offeringId: string,
  studentId: string,
  now: Date = new Date()
): Promise<StudentAnalyticsResult | null> {
  const results = await calculateOfferingStudentsAnalytics(offeringId, { now });
  return results.find((r) => r.studentId === studentId) || null;
}

/**
 * 6. Nightly job that writes an AnalyticsSnapshot per (offering, student, date)
 * with progress, riskScore, riskLevel, and reasons.
 *
 * IDEMPOTENT: Uses `prisma.analyticsSnapshot.upsert` on @@unique([offeringId, studentId, date])
 * so repeated executions on the same date safely update records with zero duplicate rows.
 */
export async function runAnalyticsSnapshotJob(
  options: {
    date?: Date;
    offeringId?: string;
  } = {}
): Promise<AnalyticsSnapshotJobSummary> {
  const startTime = Date.now();
  const now = options.date || new Date();
  const targetDate = normalizeSnapshotDate(now);

  const { weights, riskConfig } = await getEffectiveAnalyticsSettings();

  // Find offerings to process
  const offerings = await prisma.courseOffering.findMany({
    where: {
      status: CourseOfferingStatus.PUBLISHED,
      ...(options.offeringId ? { id: options.offeringId } : {}),
    },
    select: { id: true },
  });

  let studentsProcessed = 0;
  let snapshotsCreatedOrUpdated = 0;

  for (const off of offerings) {
    const studentAnalytics = await calculateOfferingStudentsAnalytics(off.id, {
      now,
      weights,
      riskConfig,
    });

    for (const stat of studentAnalytics) {
      studentsProcessed++;

      await prisma.analyticsSnapshot.upsert({
        where: {
          offeringId_studentId_date: {
            offeringId: stat.offeringId,
            studentId: stat.studentId,
            date: targetDate,
          },
        },
        update: {
          progress: stat.progress,
          riskScore: stat.riskScore,
          riskLevel: stat.riskLevel,
          reasons: stat.reasons,
        },
        create: {
          offeringId: stat.offeringId,
          studentId: stat.studentId,
          date: targetDate,
          progress: stat.progress,
          riskScore: stat.riskScore,
          riskLevel: stat.riskLevel,
          reasons: stat.reasons,
        },
      });

      snapshotsCreatedOrUpdated++;
    }
  }

  const durationMs = Date.now() - startTime;
  const summary: AnalyticsSnapshotJobSummary = {
    timestamp: now.toISOString(),
    date: targetDate.toISOString().slice(0, 10),
    offeringsProcessed: offerings.length,
    studentsProcessed,
    snapshotsCreatedOrUpdated,
    durationMs,
  };

  console.log(
    `[Analytics Cron] Snapshot job finished for date ${summary.date}: ` +
      `${summary.snapshotsCreatedOrUpdated} snapshots created/updated across ` +
      `${summary.offeringsProcessed} offerings (${summary.studentsProcessed} students) in ${summary.durationMs}ms.`
  );

  return summary;
}
