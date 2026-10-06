import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { NotificationType } from "@prisma/client";
import {
  processReminders,
  matchActiveWindow,
  DEFAULT_REMINDER_WINDOWS,
} from "@/services/reminders";
import { POST } from "@/app/api/cron/reminders/route";
import { NextRequest } from "next/server";

describe("Step 31: Automated Reminders Cron", () => {
  let testOfferingId: string;
  let teacherUserId: string;
  let student1: { id: string; email: string; name: string };
  let student2: { id: string; email: string; name: string };

  const createdAssignmentIds: string[] = [];
  const createdQuizIds: string[] = [];

  beforeEach(async () => {
    // Locate published offering with teacher and active enrollments
    const offering = await prisma.courseOffering.findFirst({
      where: { status: "PUBLISHED" },
      include: {
        offeringTeachers: true,
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

    if (
      !offering ||
      !offering.offeringTeachers[0] ||
      !offering.sections[0]?.enrollments[0]
    ) {
      throw new Error("Missing seeded course offering with active enrollments.");
    }

    testOfferingId = offering.id;
    teacherUserId = offering.offeringTeachers[0].userId;

    const enrolledStudents = offering.sections.flatMap((s) =>
      s.enrollments.map((e) => e.student)
    );

    student1 = enrolledStudents[0];
    student2 = enrolledStudents[1] || enrolledStudents[0];
  });

  afterEach(async () => {
    if (createdAssignmentIds.length > 0) {
      await prisma.submission.deleteMany({
        where: { assignmentId: { in: createdAssignmentIds } },
      });
      await prisma.assignment.deleteMany({
        where: { id: { in: createdAssignmentIds } },
      });
      createdAssignmentIds.length = 0;
    }
    if (createdQuizIds.length > 0) {
      await prisma.quiz.deleteMany({
        where: { id: { in: createdQuizIds } },
      });
      createdQuizIds.length = 0;
    }
  });

  describe("Window Matching with Mocked Clock (All Windows)", () => {
    it("correctly matches all reminder windows (7d, 3d, 1d, 6h, 1h) based on remaining time", () => {
      const baseNow = new Date("2026-10-15T12:00:00Z");

      // 1 hour window: target is 45 minutes ahead
      const t1h = new Date(baseNow.getTime() + 45 * 60 * 1000);
      const w1h = matchActiveWindow(t1h, baseNow, DEFAULT_REMINDER_WINDOWS);
      expect(w1h?.key).toBe("1h");
      expect(w1h?.isUrgent).toBe(true);

      // 6 hour window: target is 4 hours ahead
      const t6h = new Date(baseNow.getTime() + 4 * 60 * 60 * 1000);
      const w6h = matchActiveWindow(t6h, baseNow, DEFAULT_REMINDER_WINDOWS);
      expect(w6h?.key).toBe("6h");
      expect(w6h?.isUrgent).toBe(true);

      // 1 day window: target is 18 hours ahead
      const t1d = new Date(baseNow.getTime() + 18 * 60 * 60 * 1000);
      const w1d = matchActiveWindow(t1d, baseNow, DEFAULT_REMINDER_WINDOWS);
      expect(w1d?.key).toBe("1d");
      expect(w1d?.isUrgent).toBe(false);

      // 3 days window: target is 2.5 days ahead
      const t3d = new Date(baseNow.getTime() + 2.5 * 24 * 60 * 60 * 1000);
      const w3d = matchActiveWindow(t3d, baseNow, DEFAULT_REMINDER_WINDOWS);
      expect(w3d?.key).toBe("3d");
      expect(w3d?.isUrgent).toBe(false);

      // 7 days window: target is 5 days ahead
      const t7d = new Date(baseNow.getTime() + 5 * 24 * 60 * 60 * 1000);
      const w7d = matchActiveWindow(t7d, baseNow, DEFAULT_REMINDER_WINDOWS);
      expect(w7d?.key).toBe("7d");
      expect(w7d?.isUrgent).toBe(false);

      // Outside window: target is 10 days ahead
      const t10d = new Date(baseNow.getTime() + 10 * 24 * 60 * 60 * 1000);
      const w10d = matchActiveWindow(t10d, baseNow, DEFAULT_REMINDER_WINDOWS);
      expect(w10d).toBeNull();

      // Expired deadline (past)
      const tPast = new Date(baseNow.getTime() - 1000);
      const wPast = matchActiveWindow(tPast, baseNow, DEFAULT_REMINDER_WINDOWS);
      expect(wPast).toBeNull();
    });
  });

  describe("Deduplication (Acceptance: Running Twice in a Row Creates No Duplicates)", () => {
    it("never creates duplicate notifications when executed twice in a row", async () => {
      const mockedNow = new Date("2026-10-15T10:00:00Z");
      const deadline = new Date("2026-10-15T10:50:00Z"); // 50 mins away (1h window)

      const assignment = await prisma.assignment.create({
        data: {
          offeringId: testOfferingId,
          title: `Dedupe Test Assignment ${Date.now()}`,
          deadline,
          maxMarks: 50,
          maxSizeMb: 10,
          createdById: teacherUserId,
          published: true,
        },
      });
      createdAssignmentIds.push(assignment.id);

      // First run: should create notifications
      const run1 = await processReminders(mockedNow);
      expect(run1.notificationsCreated).toBeGreaterThanOrEqual(1);

      // Count notifications for this assignment
      const notifsAfterRun1 = await prisma.notification.count({
        where: {
          dedupeKey: { contains: `:ASSIGNMENT:${assignment.id}:1h` },
        },
      });
      expect(notifsAfterRun1).toBeGreaterThanOrEqual(1);

      // Second run at the same mocked clock time
      const run2 = await processReminders(mockedNow);
      expect(run2.notificationsCreated).toBe(0);

      // run2 must NOT create any duplicate notifications for this window
      const notifsAfterRun2 = await prisma.notification.count({
        where: {
          dedupeKey: { contains: `:ASSIGNMENT:${assignment.id}:1h` },
        },
      });
      expect(notifsAfterRun2).toBe(notifsAfterRun1);
    });
  });

  describe("Submission State Check (Acceptance: Submitted Students Receive No Reminder)", () => {
    it("does not send a reminder to a student who has already submitted", async () => {
      const mockedNow = new Date("2026-10-15T10:00:00Z");
      const deadline = new Date("2026-10-15T15:30:00Z"); // 5.5 hours away (6h window)

      const assignment = await prisma.assignment.create({
        data: {
          offeringId: testOfferingId,
          title: `Submission Reminder Test ${Date.now()}`,
          deadline,
          maxMarks: 50,
          maxSizeMb: 10,
          createdById: teacherUserId,
          published: true,
        },
      });
      createdAssignmentIds.push(assignment.id);

      // Student 1 submits
      await prisma.submission.create({
        data: {
          assignmentId: assignment.id,
          studentId: student1.id,
          status: "SUBMITTED",
        },
      });

      // Run reminders job
      await processReminders(mockedNow);

      // Student 1 (already submitted) must receive NO notification
      const student1Notif = await prisma.notification.findUnique({
        where: {
          dedupeKey: `${student1.id}:ASSIGNMENT:${assignment.id}:6h`,
        },
      });
      expect(student1Notif).toBeNull();

      // Student 2 (unsubmitted, if different) should receive notification
      if (student2.id !== student1.id) {
        const student2Notif = await prisma.notification.findUnique({
          where: {
            dedupeKey: `${student2.id}:ASSIGNMENT:${assignment.id}:6h`,
          },
        });
        expect(student2Notif).not.toBeNull();
        expect(student2Notif?.type).toBe(NotificationType.URGENT);
      }
    });
  });

  describe("API Route Security (Acceptance: Unauthorized Calls Return 401 With No Work Done)", () => {
    it("returns 401 when missing CRON_SECRET authorization header", async () => {
      const req = new NextRequest("http://localhost:3000/api/cron/reminders", {
        method: "POST",
      });

      const res = await POST(req);
      expect(res.status).toBe(401);

      const json = await res.json();
      expect(json.error).toContain("Unauthorized");
    });

    it("returns 401 when provided invalid CRON_SECRET token", async () => {
      const req = new NextRequest("http://localhost:3000/api/cron/reminders", {
        method: "POST",
        headers: {
          Authorization: "Bearer invalid-wrong-token-12345",
        },
      });

      const res = await POST(req);
      expect(res.status).toBe(401);
    });

    it("accepts valid CRON_SECRET and returns summary without personal data", async () => {
      const secret = process.env.CRON_SECRET || "ruet_elms_cron_secret_2026";
      const req = new NextRequest("http://localhost:3000/api/cron/reminders", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secret}`,
        },
      });

      const res = await POST(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.summary).toBeDefined();
      expect(typeof json.summary.notificationsCreated).toBe("number");
      expect(typeof json.summary.durationMs).toBe("number");

      // Verify no student names or emails in summary response
      const str = JSON.stringify(json.summary);
      expect(str).not.toContain("@ruet.ac.bd");
      expect(str).not.toContain("student");
    });
  });
});
