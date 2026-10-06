import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import {
  getCalendarData,
  getDhakaDateKey,
  generateICalendarFeed,
} from "@/services/calendar";

describe("Step 30: Academic Calendar", () => {
  let testOfferingId: string;
  let teacherUser: { id: string; role: Role; name: string };
  let studentUser: { id: string; role: Role; name: string };

  beforeEach(async () => {
    const offering = await prisma.courseOffering.findFirst({
      where: { status: "PUBLISHED" },
      include: {
        offeringTeachers: { include: { user: true } },
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

    if (!offering || !offering.offeringTeachers[0] || !offering.sections[0]?.enrollments[0]) {
      throw new Error("Missing seeded course offering with teacher and active student enrollment.");
    }

    testOfferingId = offering.id;
    const teacher = offering.offeringTeachers[0].user;
    teacherUser = { id: teacher.id, role: teacher.role, name: teacher.name };

    const student = offering.sections[0].enrollments[0].student;
    studentUser = { id: student.id, role: student.role, name: student.name };
  });

  describe("Midnight Boundary Verification in Asia/Dhaka (Critical Acceptance)", () => {
    it("places events on the exact correct day around UTC midnight boundaries in Asia/Dhaka (+06:00)", () => {
      // 17:59:00 UTC on Oct 14 is 23:59:00 on Oct 14 in Dhaka (BEFORE midnight)
      const beforeMidnightUTC = new Date("2026-10-14T17:59:00Z");
      expect(getDhakaDateKey(beforeMidnightUTC)).toBe("2026-10-14");

      // 18:00:00 UTC on Oct 14 is 00:00:00 on Oct 15 in Dhaka (EXACT midnight)
      const exactMidnightUTC = new Date("2026-10-14T18:00:00Z");
      expect(getDhakaDateKey(exactMidnightUTC)).toBe("2026-10-15");

      // 18:01:00 UTC on Oct 14 is 00:01:00 on Oct 15 in Dhaka (AFTER midnight)
      const afterMidnightUTC = new Date("2026-10-14T18:01:00Z");
      expect(getDhakaDateKey(afterMidnightUTC)).toBe("2026-10-15");

      // Early morning Dhaka time: 01:00 UTC on Oct 15 is 07:00 on Oct 15 in Dhaka
      const morningUTC = new Date("2026-10-15T01:00:00Z");
      expect(getDhakaDateKey(morningUTC)).toBe("2026-10-15");
    });
  });

  describe("Draft & Unpublished Filtering (Critical Acceptance)", () => {
    it("never includes draft or unpublished assignments and quizzes in calendar events", async () => {
      // Create a draft assignment in test offering
      const draftAssignment = await prisma.assignment.create({
        data: {
          offeringId: testOfferingId,
          title: `Draft Assignment ${Date.now()}`,
          deadline: new Date("2026-11-20T10:00:00Z"),
          maxMarks: 50,
          maxSizeMb: 10,
          createdById: teacherUser.id,
          published: false, // DRAFT!
        },
      });

      // Create a published assignment in test offering
      const publishedAssignment = await prisma.assignment.create({
        data: {
          offeringId: testOfferingId,
          title: `Published Assignment ${Date.now()}`,
          deadline: new Date("2026-11-21T10:00:00Z"),
          maxMarks: 50,
          maxSizeMb: 10,
          createdById: teacherUser.id,
          published: true, // PUBLISHED!
        },
      });

      // Create a draft quiz
      const draftQuiz = await prisma.quiz.create({
        data: {
          offeringId: testOfferingId,
          title: `Draft Quiz ${Date.now()}`,
          durationMin: 30,
          startAt: new Date("2026-11-22T08:00:00Z"),
          endAt: new Date("2026-11-22T10:00:00Z"),
          createdById: teacherUser.id,
          published: false, // DRAFT!
        },
      });

      // Fetch student calendar
      const studentCalendar = await getCalendarData(studentUser.id, studentUser.role);
      const studentEventIds = studentCalendar.events.map((e) => e.id);

      expect(studentEventIds).not.toContain(`assignment-${draftAssignment.id}`);
      expect(studentEventIds).not.toContain(`quiz-${draftQuiz.id}`);
      expect(studentEventIds).toContain(`assignment-${publishedAssignment.id}`);

      // Fetch teacher calendar
      const teacherCalendar = await getCalendarData(teacherUser.id, teacherUser.role);
      const teacherEventIds = teacherCalendar.events.map((e) => e.id);

      expect(teacherEventIds).not.toContain(`assignment-${draftAssignment.id}`);
      expect(teacherEventIds).not.toContain(`quiz-${draftQuiz.id}`);
      expect(teacherEventIds).toContain(`assignment-${publishedAssignment.id}`);

      // Cleanup
      await prisma.assignment.deleteMany({
        where: { id: { in: [draftAssignment.id, publishedAssignment.id] } },
      });
      await prisma.quiz.delete({ where: { id: draftQuiz.id } });
    });
  });

  describe("Role-Based Scope and Access", () => {
    it("student sees only courses they are enrolled in", async () => {
      const studentCalendar = await getCalendarData(studentUser.id, studentUser.role);
      const enrolledOfferingIds = studentCalendar.courses.map((c) => c.offeringId);

      // Verify that every event returned for student belongs to an enrolled course offering or department
      for (const ev of studentCalendar.events) {
        if (ev.offeringId) {
          expect(enrolledOfferingIds).toContain(ev.offeringId);
        }
      }
    });

    it("teacher sees only their assigned offerings", async () => {
      const teacherCalendar = await getCalendarData(teacherUser.id, teacherUser.role);
      const teacherOfferingIds = teacherCalendar.courses.map((c) => c.offeringId);

      for (const ev of teacherCalendar.events) {
        if (ev.offeringId) {
          expect(teacherOfferingIds).toContain(ev.offeringId);
        }
      }
    });
  });

  describe("iCalendar Feed Generation (.ics)", () => {
    it("generates valid RFC 5545 iCalendar stream with correct headers, VEVENTs, and timezones", () => {
      const sampleEvents = [
        {
          id: "assignment-test-1",
          type: "ASSIGNMENT_DEADLINE" as const,
          title: "Operating Systems Lab 1",
          description: "Implement simple shell in C",
          startDate: "2026-10-15T18:00:00Z",
          endDate: "2026-10-15T18:00:00Z",
          dhakaDateKey: "2026-10-16",
          dhakaTimeDisplay: "Due at 12:00 AM",
          courseCode: "CSE 3101",
          courseTitle: "Operating Systems",
          offeringId: "offering-123",
          link: "/courses/offering-123/assignments/test-1",
        },
      ];

      const ics = generateICalendarFeed(sampleEvents, "Test Calendar");

      expect(ics).toContain("BEGIN:VCALENDAR");
      expect(ics).toContain("VERSION:2.0");
      expect(ics).toContain("X-WR-TIMEZONE:Asia/Dhaka");
      expect(ics).toContain("BEGIN:VEVENT");
      expect(ics).toContain("SUMMARY:[CSE 3101] Operating Systems Lab 1");
      expect(ics).toContain("DESCRIPTION:Implement simple shell in C");
      expect(ics).toContain("UID:assignment-test-1@ruet.ac.bd");
      expect(ics).toContain("END:VEVENT");
      expect(ics).toContain("END:VCALENDAR");
    });
  });
});
