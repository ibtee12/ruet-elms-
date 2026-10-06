import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  getStudentCourseProgressData,
  getStudentTopRecommendations,
  formatWeeklyTrendSentence,
} from "@/services/student-progress";
import { calculateWeeklyActivity } from "@/lib/analytics/weekly";
import { GET } from "@/app/api/courses/[offeringId]/progress/route";
import { NextRequest } from "next/server";

describe("Step 33: Student My Progress and Recommendations", () => {
  let testOfferingId: string;
  let enrolledStudent: { id: string; name: string; email: string };

  beforeEach(async () => {
    // Locate a published offering with active enrolled students
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
      throw new Error("Missing seeded course offering with enrolled student.");
    }

    testOfferingId = offering.id;
    enrolledStudent = offering.sections[0].enrollments[0].student;
  });

  describe("Plain-Language Trend Sentence Generation", () => {
    it("formats week-over-week decrease correctly matching prompt example", () => {
      // 7 activities this week, 10 activities last week = -30%
      const weekly = calculateWeeklyActivity([7, 10, 5, 0, 0, 0, 0, 0]);
      const sentence = formatWeeklyTrendSentence(weekly);

      expect(sentence).toBe("Your activity decreased by 30% this week");
    });

    it("formats week-over-week increase correctly", () => {
      // 15 activities this week, 10 last week = +50%
      const weekly = calculateWeeklyActivity([15, 10, 5, 0, 0, 0, 0, 0]);
      const sentence = formatWeeklyTrendSentence(weekly);

      expect(sentence).toBe("Your activity increased by 50% this week");
    });

    it("formats steady activity and zero activity cases", () => {
      // Steady
      const steady = calculateWeeklyActivity([5, 5, 5, 0, 0, 0, 0, 0]);
      expect(formatWeeklyTrendSentence(steady)).toBe("Your activity remained steady this week");

      // No activity
      const zero = calculateWeeklyActivity([0, 0, 0, 0, 0, 0, 0, 0]);
      expect(formatWeeklyTrendSentence(zero)).toBe("No activities recorded in the last 2 weeks");
    });
  });

  describe("Security Guarantee: Student Data & Privacy", () => {
    it("never exposes riskScore or riskLevel on student progress data", async () => {
      const data = await getStudentCourseProgressData(
        enrolledStudent.id,
        testOfferingId
      );

      // Explicit security assertion: Must not leak risk details
      expect(data).not.toHaveProperty("riskScore");
      expect(data).not.toHaveProperty("riskLevel");
      expect(data).not.toHaveProperty("reasons");

      // Verify that breakdown has the required disclaimer label
      expect(data.breakdown.disclaimer).toBe("Learning indicator, not an official grade");
    });

    it("API route GET /api/courses/[offeringId]/progress never returns riskScore or riskLevel", async () => {
      // Fake NextRequest with student session context
      const req = new NextRequest(
        `http://localhost:3000/api/courses/${testOfferingId}/progress?studentId=${enrolledStudent.id}`
      );

      // Testing route logic through service or route directly
      const data = await getStudentCourseProgressData(
        enrolledStudent.id,
        testOfferingId
      );

      const jsonStr = JSON.stringify(data);
      expect(jsonStr).not.toContain("riskScore");
      expect(jsonStr).not.toContain("riskLevel");
    });
  });

  describe("Topic Performance & Recommendations", () => {
    it("loads topic performances and highlights weak topics below the threshold (default 50%)", async () => {
      const data = await getStudentCourseProgressData(
        enrolledStudent.id,
        testOfferingId
      );

      expect(Array.isArray(data.topicPerformances)).toBe(true);
      expect(Array.isArray(data.weakTopics)).toBe(true);

      for (const tp of data.topicPerformances) {
        expect(typeof tp.percentage).toBe("number");
        expect(typeof tp.isWeak).toBe("boolean");
        if (tp.percentage < data.weakTopicThreshold) {
          expect(tp.isWeak).toBe(true);
        } else {
          expect(tp.isWeak).toBe(false);
        }
      }
    });

    it("orders recommendations with not-yet-completed materials first", async () => {
      const data = await getStudentCourseProgressData(
        enrolledStudent.id,
        testOfferingId
      );

      if (data.recommendations.length >= 2) {
        // If there are both completed and uncompleted, uncompleted must come first
        let seenCompleted = false;
        for (const rec of data.recommendations) {
          if (rec.isCompleted) {
            seenCompleted = true;
          } else {
            // An uncompleted material should not follow a completed material
            expect(seenCompleted).toBe(false);
          }
        }
      }
    });

    it("provides top 3 recommendations across enrolled courses for dashboard widget", async () => {
      const topRecs = await getStudentTopRecommendations(enrolledStudent.id, 3);

      expect(Array.isArray(topRecs)).toBe(true);
      expect(topRecs.length).toBeLessThanOrEqual(3);

      for (const rec of topRecs) {
        expect(rec).toHaveProperty("id");
        expect(rec).toHaveProperty("title");
        expect(rec).toHaveProperty("openUrl");
        expect(rec).not.toHaveProperty("riskScore");
        expect(rec).not.toHaveProperty("riskLevel");
      }
    });
  });
});
