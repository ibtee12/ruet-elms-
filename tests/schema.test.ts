import { describe, it, expect } from "vitest";
import {
  Role,
  CourseOfferingStatus,
  OfferingTeacherRole,
  EnrollmentStatus,
  MaterialType,
  SubmissionStatus,
  NotificationType,
  QuestionType,
  QuestionDifficulty,
  ThreadCategory,
  RiskLevel,
} from "@prisma/client";
import { prisma } from "../lib/prisma";
import {
  isValidAnnouncementScope,
  announcementInputSchema,
} from "../lib/validations/announcement";

describe("Prisma Schema Models & Enums (Complete Catalog)", () => {
  it("exports all defined Role enums", () => {
    expect(Role.SUPER_ADMIN).toBe("SUPER_ADMIN");
    expect(Role.DEPT_ADMIN).toBe("DEPT_ADMIN");
    expect(Role.TEACHER).toBe("TEACHER");
    expect(Role.STUDENT).toBe("STUDENT");
  });

  it("exports all CourseOfferingStatus enums", () => {
    expect(CourseOfferingStatus.DRAFT).toBe("DRAFT");
    expect(CourseOfferingStatus.PUBLISHED).toBe("PUBLISHED");
    expect(CourseOfferingStatus.ARCHIVED).toBe("ARCHIVED");
  });

  it("exports all OfferingTeacherRole enums", () => {
    expect(OfferingTeacherRole.INSTRUCTOR).toBe("INSTRUCTOR");
    expect(OfferingTeacherRole.TA).toBe("TA");
  });

  it("exports all EnrollmentStatus enums", () => {
    expect(EnrollmentStatus.ACTIVE).toBe("ACTIVE");
    expect(EnrollmentStatus.DROPPED).toBe("DROPPED");
  });

  it("exports Part B enums (MaterialType, SubmissionStatus, NotificationType)", () => {
    expect(MaterialType.FILE).toBe("FILE");
    expect(MaterialType.LINK).toBe("LINK");
    expect(MaterialType.VIDEO).toBe("VIDEO");

    expect(SubmissionStatus.SUBMITTED).toBe("SUBMITTED");
    expect(SubmissionStatus.LATE).toBe("LATE");
    expect(SubmissionStatus.GRADED).toBe("GRADED");

    expect(NotificationType.URGENT).toBe("URGENT");
    expect(NotificationType.ACADEMIC).toBe("ACADEMIC");
    expect(NotificationType.GENERAL).toBe("GENERAL");
    expect(NotificationType.RESULT).toBe("RESULT");
  });

  it("exports Part C enums (QuestionType, QuestionDifficulty, ThreadCategory, RiskLevel)", () => {
    expect(QuestionType.SINGLE).toBe("SINGLE");
    expect(QuestionType.MULTIPLE).toBe("MULTIPLE");
    expect(QuestionType.TRUE_FALSE).toBe("TRUE_FALSE");

    expect(QuestionDifficulty.EASY).toBe("EASY");
    expect(QuestionDifficulty.MEDIUM).toBe("MEDIUM");
    expect(QuestionDifficulty.HARD).toBe("HARD");

    expect(ThreadCategory.QUESTION).toBe("QUESTION");
    expect(ThreadCategory.DISCUSSION).toBe("DISCUSSION");
    expect(ThreadCategory.DOUBT).toBe("DOUBT");
    expect(ThreadCategory.RESOURCE).toBe("RESOURCE");

    expect(RiskLevel.LOW).toBe("LOW");
    expect(RiskLevel.MEDIUM).toBe("MEDIUM");
    expect(RiskLevel.HIGH).toBe("HIGH");
  });

  it("can query all database tables without error", async () => {
    const tables = [
      // Part A
      () => prisma.user.count(),
      () => prisma.studentProfile.count(),
      () => prisma.teacherProfile.count(),
      () => prisma.department.count(),
      () => prisma.course.count(),
      () => prisma.courseOffering.count(),
      () => prisma.section.count(),
      () => prisma.offeringTeacher.count(),
      () => prisma.enrollment.count(),
      () => prisma.setting.count(),
      () => prisma.auditLog.count(),
      // Part B
      () => prisma.topic.count(),
      () => prisma.module.count(),
      () => prisma.material.count(),
      () => prisma.materialProgress.count(),
      () => prisma.announcement.count(),
      () => prisma.assignment.count(),
      () => prisma.assignmentAttachment.count(),
      () => prisma.submission.count(),
      () => prisma.submissionVersion.count(),
      () => prisma.grade.count(),
      () => prisma.gradeHistory.count(),
      () => prisma.notification.count(),
      () => prisma.activityEvent.count(),
      // Part C
      () => prisma.quiz.count(),
      () => prisma.question.count(),
      () => prisma.option.count(),
      () => prisma.quizAttempt.count(),
      () => prisma.answer.count(),
      () => prisma.thread.count(),
      () => prisma.post.count(),
      () => prisma.analyticsSnapshot.count(),
    ];

    for (const query of tables) {
      const count = await query();
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });

  describe("Announcement Scope Validation", () => {
    it("accepts an announcement scoped only to a course offering", () => {
      expect(isValidAnnouncementScope("offering-123", null)).toBe(true);
      const parsed = announcementInputSchema.safeParse({
        title: "Exam Schedule",
        body: "Midterm will take place next week.",
        offeringId: "offering-123",
      });
      expect(parsed.success).toBe(true);
    });

    it("accepts an announcement scoped only to a department", () => {
      expect(isValidAnnouncementScope(null, "dept-cse")).toBe(true);
      const parsed = announcementInputSchema.safeParse({
        title: "CSE Fest 2026",
        body: "Registration is now open.",
        departmentId: "dept-cse",
      });
      expect(parsed.success).toBe(true);
    });

    it("rejects an announcement with both offeringId and departmentId", () => {
      expect(isValidAnnouncementScope("offering-123", "dept-cse")).toBe(false);
      const parsed = announcementInputSchema.safeParse({
        title: "Invalid Scope",
        body: "Cannot target both offering and dept.",
        offeringId: "offering-123",
        departmentId: "dept-cse",
      });
      expect(parsed.success).toBe(false);
    });

    it("rejects an announcement with neither offeringId nor departmentId", () => {
      expect(isValidAnnouncementScope(null, null)).toBe(false);
      const parsed = announcementInputSchema.safeParse({
        title: "Orphan Announcement",
        body: "Missing scope target.",
      });
      expect(parsed.success).toBe(false);
    });
  });
});
