import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { RiskLevel } from "@prisma/client";
import {
  evaluateRiskLevel,
  calculateRisk,
  parseRiskConfig,
  DEFAULT_RISK_CONFIG,
} from "@/lib/analytics/risk";
import {
  calculateLectureCompletion,
  calculateAssignmentCompletion,
  calculateAssignmentAverage,
  calculateQuizAverage,
  calculateProgress,
  renormalizeWeights,
  parseProgressWeights,
  DEFAULT_PROGRESS_WEIGHTS,
} from "@/lib/analytics/progress";
import {
  getWeeklyIntervals,
  calculateWeeklyActivity,
} from "@/lib/analytics/weekly";
import {
  calculateOfferingStudentsAnalytics,
  getOfferingWeeklyActivity,
  runAnalyticsSnapshotJob,
  normalizeSnapshotDate,
} from "@/services/analytics";
import { POST } from "@/app/api/cron/analytics/route";
import { NextRequest } from "next/server";

describe("Step 32: Analytics Engine", () => {
  describe("Risk Assessment Engine (/lib/analytics/risk.ts)", () => {
    it("satisfies exact boundary values: 29 is LOW, 30 is MEDIUM, 59 is MEDIUM, 60 is HIGH", () => {
      expect(evaluateRiskLevel(0)).toBe(RiskLevel.LOW);
      expect(evaluateRiskLevel(15)).toBe(RiskLevel.LOW);
      expect(evaluateRiskLevel(29)).toBe(RiskLevel.LOW); // Boundary 29 -> LOW

      expect(evaluateRiskLevel(30)).toBe(RiskLevel.MEDIUM); // Boundary 30 -> MEDIUM
      expect(evaluateRiskLevel(45)).toBe(RiskLevel.MEDIUM);
      expect(evaluateRiskLevel(59)).toBe(RiskLevel.MEDIUM); // Boundary 59 -> MEDIUM

      expect(evaluateRiskLevel(60)).toBe(RiskLevel.HIGH); // Boundary 60 -> HIGH
      expect(evaluateRiskLevel(85)).toBe(RiskLevel.HIGH);
      expect(evaluateRiskLevel(100)).toBe(RiskLevel.HIGH);
    });

    it("new student with no data yields LOW risk and zero false alarms", () => {
      const newStudentInput = {
        quizAverage: null, // No quizzes attempted
        hasQuizzes: false,
        lateSubmissionsCount: 0,
        missedPastDueCount: 0,
        daysSinceLastActivity: null, // Newly enrolled
        assignmentAverage: null, // No graded assignments
        hasGradedAssignments: false,
      };

      const result = calculateRisk(newStudentInput);

      expect(result.riskScore).toBe(0);
      expect(result.riskLevel).toBe(RiskLevel.LOW);
      expect(result.reasons).toEqual([]);
    });

    it("calculates specific risk point additions and returns plain-language reasons with numbers", () => {
      // 1. Quiz average < 50 adds +30 points
      const quizRisk = calculateRisk({
        quizAverage: 42.5,
        hasQuizzes: true,
        lateSubmissionsCount: 0,
        missedPastDueCount: 0,
        daysSinceLastActivity: null,
        assignmentAverage: null,
        hasGradedAssignments: false,
      });
      expect(quizRisk.riskScore).toBe(30);
      expect(quizRisk.riskLevel).toBe(RiskLevel.MEDIUM);
      expect(quizRisk.reasons).toContain("Quiz average is 42.5% (below 50%)");

      // 2. Two or more late submissions adds +20 points
      const lateRisk = calculateRisk({
        quizAverage: null,
        hasQuizzes: false,
        lateSubmissionsCount: 3,
        missedPastDueCount: 0,
        daysSinceLastActivity: null,
        assignmentAverage: null,
        hasGradedAssignments: false,
      });
      expect(lateRisk.riskScore).toBe(20);
      expect(lateRisk.reasons).toContain("3 late submissions");

      // 3. Any missed past-due assignments adds +20 points
      const missedRisk = calculateRisk({
        quizAverage: null,
        hasQuizzes: false,
        lateSubmissionsCount: 0,
        missedPastDueCount: 2,
        daysSinceLastActivity: null,
        assignmentAverage: null,
        hasGradedAssignments: false,
      });
      expect(missedRisk.riskScore).toBe(20);
      expect(missedRisk.reasons).toContain("2 missed past-due assignments");

      // 4. Inactivity in 7+ days adds +15 points
      const inactiveRisk = calculateRisk({
        quizAverage: null,
        hasQuizzes: false,
        lateSubmissionsCount: 0,
        missedPastDueCount: 0,
        daysSinceLastActivity: 8,
        assignmentAverage: null,
        hasGradedAssignments: false,
      });
      expect(inactiveRisk.riskScore).toBe(15);
      expect(inactiveRisk.reasons).toContain("no activity for 8 days");

      // 5. Assignment average < 50 adds +15 points
      const lowAssignRisk = calculateRisk({
        quizAverage: null,
        hasQuizzes: false,
        lateSubmissionsCount: 0,
        missedPastDueCount: 0,
        daysSinceLastActivity: null,
        assignmentAverage: 35.0,
        hasGradedAssignments: true,
      });
      expect(lowAssignRisk.riskScore).toBe(15);
      expect(lowAssignRisk.reasons).toContain("Assignment average is 35.0% (below 50%)");

      // Cumulative high risk: quiz < 50 (+30) + 2 late (+20) + missed (+20) = 70 (HIGH)
      const cumulativeRisk = calculateRisk({
        quizAverage: 45.0,
        hasQuizzes: true,
        lateSubmissionsCount: 2,
        missedPastDueCount: 1,
        daysSinceLastActivity: null,
        assignmentAverage: 80.0,
        hasGradedAssignments: true,
      });
      expect(cumulativeRisk.riskScore).toBe(70);
      expect(cumulativeRisk.riskLevel).toBe(RiskLevel.HIGH);
      expect(cumulativeRisk.reasons.length).toBe(3);
    });

    it("parses custom risk config from Setting JSON correctly", () => {
      const parsed = parseRiskConfig({
        lowQuizAverageThreshold: 60,
        lowQuizAveragePoints: 35,
        lateSubmissionsThreshold: 3,
        lateSubmissionsPoints: 25,
        missedAssignmentsPoints: 30,
        inactiveDaysThreshold: 10,
        inactiveDaysPoints: 20,
        lowAssignmentAverageThreshold: 55,
        lowAssignmentAveragePoints: 18,
      });

      expect(parsed.lowQuizAverageThreshold).toBe(60);
      expect(parsed.lowQuizAveragePoints).toBe(35);
      expect(parsed.lateSubmissionsThreshold).toBe(3);
      expect(parsed.lateSubmissionsPoints).toBe(25);
      expect(parsed.missedAssignmentsPoints).toBe(30);
      expect(parsed.inactiveDaysThreshold).toBe(10);
      expect(parsed.inactiveDaysPoints).toBe(20);
      expect(parsed.lowAssignmentAverageThreshold).toBe(55);
      expect(parsed.lowAssignmentAveragePoints).toBe(18);
    });
  });

  describe("Progress Calculation Engine (/lib/analytics/progress.ts)", () => {
    it("handles all components missing gracefully (progress = 0, no NaN)", () => {
      const result = calculateProgress({
        completedMaterials: 0,
        totalPublishedMaterials: 0,
        submittedDueAssignments: 0,
        publishedAssignmentsDueSoFar: 0,
        totalPublishedQuizzes: 0,
        quizAverage: null,
      });

      expect(result.progress).toBe(0);
      expect(result.renormalizedWeights.hasAnyComponent).toBe(false);
      expect(result.renormalizedWeights.lecture).toBe(0);
      expect(result.renormalizedWeights.assignment).toBe(0);
      expect(result.renormalizedWeights.quiz).toBe(0);
    });

    it("correctly renormalizes weights when components are missing", () => {
      // 1. All 3 components present
      const allThree = renormalizeWeights(DEFAULT_PROGRESS_WEIGHTS, {
        lecture: true,
        assignment: true,
        quiz: true,
      });
      expect(allThree.lecture).toBeCloseTo(0.30, 4);
      expect(allThree.assignment).toBeCloseTo(0.30, 4);
      expect(allThree.quiz).toBeCloseTo(0.40, 4);

      // 2. No quizzes yet (e.g. course only has lectures and assignments)
      // Remaining: 0.30 lecture + 0.30 assignment = 0.60
      // Renormalized: 0.30 / 0.60 = 0.50 each
      const noQuizzes = renormalizeWeights(DEFAULT_PROGRESS_WEIGHTS, {
        lecture: true,
        assignment: true,
        quiz: false,
      });
      expect(noQuizzes.lecture).toBeCloseTo(0.50, 4);
      expect(noQuizzes.assignment).toBeCloseTo(0.50, 4);
      expect(noQuizzes.quiz).toBe(0);

      // 3. Only lectures present
      const onlyLectures = renormalizeWeights(DEFAULT_PROGRESS_WEIGHTS, {
        lecture: true,
        assignment: false,
        quiz: false,
      });
      expect(onlyLectures.lecture).toBe(1.0);
      expect(onlyLectures.assignment).toBe(0);
      expect(onlyLectures.quiz).toBe(0);
    });

    it("calculates lectureCompletion, assignmentCompletion, assignmentAverage, and quizAverage accurately", () => {
      // Lecture completion
      const lecEmpty = calculateLectureCompletion(0, 0);
      expect(lecEmpty.exists).toBe(false);
      expect(lecEmpty.percentage).toBe(0);

      const lecPartial = calculateLectureCompletion(4, 10);
      expect(lecPartial.exists).toBe(true);
      expect(lecPartial.ratio).toBe(0.4);
      expect(lecPartial.percentage).toBe(40.0);

      // Assignment completion
      const assEmpty = calculateAssignmentCompletion(0, 0);
      expect(assEmpty.exists).toBe(false);

      const assPartial = calculateAssignmentCompletion(3, 4);
      expect(assPartial.exists).toBe(true);
      expect(assPartial.percentage).toBe(75.0);

      // Assignment average over graded assignments
      const noGraded = calculateAssignmentAverage([]);
      expect(noGraded.hasGraded).toBe(false);
      expect(noGraded.averagePercentage).toBeNull();

      const gradedAvg = calculateAssignmentAverage([
        { finalMarks: 80, maxMarks: 100 }, // 80%
        { finalMarks: 45, maxMarks: 50 },  // 90%
      ]);
      expect(gradedAvg.hasGraded).toBe(true);
      expect(gradedAvg.averagePercentage).toBe(85.0); // (80 + 90) / 2

      // Quiz average: mean of best attempt percent per quiz
      const noQuizAttempts = calculateQuizAverage([]);
      expect(noQuizAttempts.hasAttempts).toBe(false);
      expect(noQuizAttempts.averagePercentage).toBeNull();

      const quizAvg = calculateQuizAverage([
        { maxScore: 16, maxMarks: 20 }, // 80%
        { maxScore: 50, maxMarks: 50 }, // 100%
      ]);
      expect(quizAvg.hasAttempts).toBe(true);
      expect(quizAvg.averagePercentage).toBe(90.0); // (80 + 100) / 2
    });

    it("computes overall progress using renormalized weighted sum", () => {
      // Full course with all 3 components:
      // Lecture: 100% (weight 0.30) -> 30
      // Assignment: 50% (weight 0.30) -> 15
      // Quiz: 80% (weight 0.40) -> 32
      // Total = 77%
      const fullCourse = calculateProgress({
        completedMaterials: 10,
        totalPublishedMaterials: 10,
        submittedDueAssignments: 1,
        publishedAssignmentsDueSoFar: 2,
        totalPublishedQuizzes: 1,
        quizAverage: 80.0,
      });

      expect(fullCourse.progress).toBe(77.0);

      // Course without quizzes yet:
      // Renormalized weights: lecture 0.50, assignment 0.50
      // Lecture: 80% * 0.50 = 40
      // Assignment: 60% * 0.50 = 30
      // Total = 70%
      const noQuizCourse = calculateProgress({
        completedMaterials: 8,
        totalPublishedMaterials: 10,
        submittedDueAssignments: 3,
        publishedAssignmentsDueSoFar: 5,
        totalPublishedQuizzes: 0,
        quizAverage: null,
      });

      expect(noQuizCourse.progress).toBe(70.0);
      expect(noQuizCourse.renormalizedWeights.quiz).toBe(0);
      expect(noQuizCourse.renormalizedWeights.lecture).toBeCloseTo(0.50, 4);
    });

    it("parses progress weights from Setting JSON", () => {
      const parsed = parseProgressWeights({
        materialsWeight: 0.25,
        assignmentWeight: 0.35,
        quizWeight: 0.40,
      });

      expect(parsed.lecture).toBe(0.25);
      expect(parsed.assignment).toBe(0.35);
      expect(parsed.quiz).toBe(0.40);
    });
  });

  describe("Weekly Activity Engine (/lib/analytics/weekly.ts)", () => {
    it("generates 8 weekly interval buckets leading up to now", () => {
      const now = new Date("2026-10-15T12:00:00Z");
      const intervals = getWeeklyIntervals(now);

      expect(intervals.length).toBe(8);
      expect(intervals[0].endDate.getTime()).toBe(now.getTime());
      expect(intervals[0].startDate.getTime()).toBe(
        now.getTime() - 7 * 24 * 60 * 60 * 1000
      );
      expect(intervals[7].startDate.getTime()).toBe(
        now.getTime() - 56 * 24 * 60 * 60 * 1000
      );
    });

    it("calculates weekly counts and week-over-week changes accurately", () => {
      const counts = [25, 20, 15, 10, 5, 0, 0, 0];
      const summary = calculateWeeklyActivity(counts);

      expect(summary.currentWeekCount).toBe(25);
      expect(summary.previousWeekCount).toBe(20);
      expect(summary.weekOverWeekChange).toBe(5); // 25 - 20
      expect(summary.weekOverWeekChangePercent).toBe(25.0); // +25%
      expect(summary.totalEvents8Weeks).toBe(75);
      expect(summary.weeks[0].changeFromOlderWeek).toBe(5);
    });

    it("handles zero previous week count without dividing by zero", () => {
      const counts = [10, 0, 0, 0, 0, 0, 0, 0];
      const summary = calculateWeeklyActivity(counts);

      expect(summary.currentWeekCount).toBe(10);
      expect(summary.previousWeekCount).toBe(0);
      expect(summary.weekOverWeekChange).toBe(10);
      expect(summary.weekOverWeekChangePercent).toBeNull();
    });
  });

  describe("Analytics Services & Nightly Snapshot Job (/services/analytics.ts)", () => {
    let testOfferingId: string;
    let enrolledStudentId: string;

    beforeEach(async () => {
      const offering = await prisma.courseOffering.findFirst({
        where: { status: "PUBLISHED" },
        include: {
          sections: {
            include: {
              enrollments: {
                where: { status: "ACTIVE" },
                include: { student: true },
              },
            },
          },
        },
      });

      if (!offering || !offering.sections[0]?.enrollments[0]) {
        throw new Error("Missing seeded course offering with active student enrollment.");
      }

      testOfferingId = offering.id;
      enrolledStudentId = offering.sections[0].enrollments[0].studentId;
    });

    afterEach(async () => {
      // Clean up test snapshots
      const testDate = normalizeSnapshotDate(new Date("2026-10-20T00:00:00Z"));
      await prisma.analyticsSnapshot.deleteMany({
        where: {
          offeringId: testOfferingId,
          date: testDate,
        },
      });
    });

    it("calculates offering analytics using database aggregation", async () => {
      const results = await calculateOfferingStudentsAnalytics(testOfferingId);

      expect(Array.isArray(results)).toBe(true);
      if (results.length > 0) {
        const studentStat = results[0];
        expect(studentStat.offeringId).toBe(testOfferingId);
        expect(typeof studentStat.progress).toBe("number");
        expect(studentStat.progress).toBeGreaterThanOrEqual(0);
        expect(studentStat.progress).toBeLessThanOrEqual(100);
        expect(["LOW", "MEDIUM", "HIGH"]).toContain(studentStat.riskLevel);
      }
    });

    it("calculates 8-week weekly activity for offering using aggregation", async () => {
      const weekly = await getOfferingWeeklyActivity(testOfferingId);

      expect(weekly.weeks.length).toBe(8);
      expect(typeof weekly.currentWeekCount).toBe("number");
      expect(typeof weekly.weekOverWeekChange).toBe("number");
      expect(typeof weekly.totalEvents8Weeks).toBe("number");
    });

    it("snapshot job is idempotent: running twice for the same date does not duplicate records", async () => {
      const fixedDate = new Date("2026-10-20T10:00:00Z");
      const normalized = normalizeSnapshotDate(fixedDate);

      // Run 1
      const summary1 = await runAnalyticsSnapshotJob({
        date: fixedDate,
        offeringId: testOfferingId,
      });
      expect(summary1.offeringsProcessed).toBe(1);

      const snapshotsAfterRun1 = await prisma.analyticsSnapshot.findMany({
        where: {
          offeringId: testOfferingId,
          date: normalized,
        },
      });
      const initialCount = snapshotsAfterRun1.length;
      expect(initialCount).toBeGreaterThan(0);

      // Run 2 on the exact same date
      const summary2 = await runAnalyticsSnapshotJob({
        date: fixedDate,
        offeringId: testOfferingId,
      });
      expect(summary2.offeringsProcessed).toBe(1);

      const snapshotsAfterRun2 = await prisma.analyticsSnapshot.findMany({
        where: {
          offeringId: testOfferingId,
          date: normalized,
        },
      });

      // IDEMPOTENCY ASSERTION:
      // Record count MUST remain identical, no unique constraint violation or duplicate rows
      expect(snapshotsAfterRun2.length).toBe(initialCount);
    });
  });

  describe("Protected Cron Route Handler (/api/cron/analytics)", () => {
    it("rejects unauthorized calls with 401 when CRON_SECRET is missing or invalid", async () => {
      const req = new NextRequest("http://localhost:3000/api/cron/analytics", {
        method: "POST",
        headers: {
          authorization: "Bearer wrong-secret",
        },
      });

      const res = await POST(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toMatch(/Unauthorized/i);
    });

    it("executes successfully and returns run summary when CRON_SECRET matches", async () => {
      process.env.CRON_SECRET = "ruet-test-cron-secret-123";

      const req = new NextRequest("http://localhost:3000/api/cron/analytics", {
        method: "POST",
        headers: {
          authorization: "Bearer ruet-test-cron-secret-123",
        },
        body: JSON.stringify({
          date: "2026-10-21T00:00:00Z",
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.summary).toBeDefined();
      expect(json.summary.date).toBe("2026-10-21");

      // Clean up snapshot from test run
      const testDate = normalizeSnapshotDate(new Date("2026-10-21T00:00:00Z"));
      await prisma.analyticsSnapshot.deleteMany({
        where: { date: testDate },
      });
    });
  });
});
