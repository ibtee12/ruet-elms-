import { describe, it, expect } from "vitest";
import {
  Role,
  CourseOfferingStatus,
  SubmissionStatus,
  OfferingTeacherRole,
} from "@prisma/client";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";

describe("Database Seed Data & Edge Cases Verification", () => {
  it("contains 1 SUPER_ADMIN, 2 DEPT_ADMINs, 6 TEACHERs, and 60 STUDENTs", async () => {
    const superAdmins = await prisma.user.count({
      where: { role: Role.SUPER_ADMIN },
    });
    const deptAdmins = await prisma.user.count({
      where: { role: Role.DEPT_ADMIN },
    });
    const teachers = await prisma.user.count({ where: { role: Role.TEACHER } });
    const students = await prisma.user.count({ where: { role: Role.STUDENT } });

    expect(superAdmins).toBe(1);
    expect(deptAdmins).toBe(2);
    expect(teachers).toBe(6);
    expect(students).toBe(60);
  });

  it("verifies all seeded users authenticate with the documented dev password", async () => {
    const admin = await prisma.user.findUnique({
      where: { email: "admin@ruet.ac.bd" },
    });
    expect(admin).not.toBeNull();
    const isValid = await bcrypt.compare("Password123!", admin!.passwordHash);
    expect(isValid).toBe(true);
    expect(admin!.mustChangePassword).toBe(false);
  });

  it("contains 2 departments with 6 catalog courses each", async () => {
    const cseCourses = await prisma.course.count({
      where: { department: { code: "CSE" } },
    });
    const eeeCourses = await prisma.course.count({
      where: { department: { code: "EEE" } },
    });

    expect(cseCourses).toBe(6);
    expect(eeeCourses).toBe(6);
  });

  it("verifies course offerings including DRAFT and section structures", async () => {
    const draftOfferings = await prisma.courseOffering.count({
      where: { status: CourseOfferingStatus.DRAFT },
    });
    const publishedOfferings = await prisma.courseOffering.count({
      where: { status: CourseOfferingStatus.PUBLISHED },
    });

    expect(draftOfferings).toBeGreaterThanOrEqual(1);
    expect(publishedOfferings).toBeGreaterThanOrEqual(6);

    // DBMS offering has Section A and Section B
    const dbmsOffering = await prisma.courseOffering.findUnique({
      where: { joinCode: "DBMS-2026-EVEN" },
      include: { sections: true, offeringTeachers: true },
    });
    expect(dbmsOffering).not.toBeNull();
    expect(dbmsOffering!.sections.length).toBe(2);

    // One offering has an instructor AND a TA
    const hasInstructorAndTa =
      dbmsOffering!.offeringTeachers.some(
        (t) => t.role === OfferingTeacherRole.INSTRUCTOR
      ) &&
      dbmsOffering!.offeringTeachers.some(
        (t) => t.role === OfferingTeacherRole.TA
      );
    expect(hasInstructorAndTa).toBe(true);
  });

  it("verifies student enrollments (each in 4 offerings)", async () => {
    const student1 = await prisma.user.findUnique({
      where: { email: "2203001@student.ruet.ac.bd" },
      include: { enrollments: true },
    });
    expect(student1).not.toBeNull();
    expect(student1!.enrollments.length).toBe(4);
  });

  it("covers submission edge cases: LATE, UNGRADED, and MISSING", async () => {
    const lateSubmission = await prisma.submission.findFirst({
      where: { status: SubmissionStatus.LATE },
    });
    expect(lateSubmission).not.toBeNull();

    const ungradedSubmission = await prisma.submission.findFirst({
      where: {
        status: SubmissionStatus.SUBMITTED,
        grade: null,
      },
    });
    expect(ungradedSubmission).not.toBeNull();

    // Student 60 has 0 submissions
    const student60 = await prisma.user.findUnique({
      where: { email: "2203060@student.ruet.ac.bd" },
      include: {
        submissions: true,
        quizAttempts: true,
        materialProgress: true,
      },
    });
    expect(student60).not.toBeNull();
    expect(student60!.submissions.length).toBe(0);
    expect(student60!.quizAttempts.length).toBe(0);
    expect(student60!.materialProgress.length).toBe(0);
    expect(student60!.lastActiveAt).toBeNull();
  });

  it("verifies default System Settings are seeded", async () => {
    const uploadLimits = await prisma.setting.findUnique({
      where: { key: "upload_limits" },
    });
    const progressWeights = await prisma.setting.findUnique({
      where: { key: "progress_weights" },
    });
    const riskThresholds = await prisma.setting.findUnique({
      where: { key: "risk_thresholds" },
    });
    const reminderWindows = await prisma.setting.findUnique({
      where: { key: "reminder_windows" },
    });

    expect(uploadLimits).not.toBeNull();
    expect(progressWeights).not.toBeNull();
    expect(riskThresholds).not.toBeNull();
    expect(reminderWindows).not.toBeNull();
  });
});
