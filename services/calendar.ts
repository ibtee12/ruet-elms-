import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import { formatDhaka } from "@/lib/datetime";

export type CalendarEventType =
  | "ASSIGNMENT_DEADLINE"
  | "QUIZ_WINDOW"
  | "ANNOUNCEMENT";

export interface CalendarEvent {
  id: string;
  type: CalendarEventType;
  title: string;
  description?: string | null;
  startDate: string; // ISO UTC
  endDate?: string | null; // ISO UTC
  dhakaDateKey: string; // "YYYY-MM-DD" in Asia/Dhaka
  dhakaTimeDisplay: string;
  courseCode?: string;
  courseTitle?: string;
  offeringId?: string;
  link: string;
}

export interface UserCourseOption {
  offeringId: string;
  courseCode: string;
  courseTitle: string;
  term: string;
  academicYear: string;
}

export interface CalendarData {
  events: CalendarEvent[];
  courses: UserCourseOption[];
  userRole: Role;
}

/**
 * Accurately returns the calendar date string ("YYYY-MM-DD") in the Asia/Dhaka timezone.
 * Handles midnight boundaries cleanly (e.g. 23:59 vs 00:01).
 */
export function getDhakaDateKey(dateInput: Date | string | number): string {
  const date = new Date(dateInput);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date);
}

/**
 * Fetches all calendar events and course options accessible to the specified user.
 * - Students: only their enrolled, PUBLISHED offerings. Only published assignments and quizzes.
 * - Teachers: only their assigned offerings. Only published items (drafts excluded).
 * - Admins: department-scoped or all published offerings.
 */
export async function getCalendarData(
  userId: string,
  userRole: Role
): Promise<CalendarData> {
  const offeringIds: string[] = [];
  let departmentId: string | null = null;
  const courseOptions: UserCourseOption[] = [];

  const isTeacher = userRole === Role.TEACHER;
  const isStudent = userRole === Role.STUDENT;

  if (isStudent) {
    const studentProfile = await prisma.studentProfile.findUnique({
      where: { userId },
      select: { departmentId: true },
    });
    departmentId = studentProfile?.departmentId || null;

    const enrollments = await prisma.enrollment.findMany({
      where: {
        studentId: userId,
        status: "ACTIVE",
        section: {
          offering: {
            status: "PUBLISHED",
          },
        },
      },
      include: {
        section: {
          include: {
            offering: {
              include: {
                course: true,
              },
            },
          },
        },
      },
    });

    const seenOfferings = new Set<string>();
    for (const e of enrollments) {
      const off = e.section.offering;
      if (!seenOfferings.has(off.id)) {
        seenOfferings.add(off.id);
        offeringIds.push(off.id);
        courseOptions.push({
          offeringId: off.id,
          courseCode: off.course.code,
          courseTitle: off.course.title,
          term: off.term,
          academicYear: off.academicYear,
        });
      }
    }
  } else if (isTeacher) {
    const teacherProfile = await prisma.teacherProfile.findUnique({
      where: { userId },
      select: { departmentId: true },
    });
    departmentId = teacherProfile?.departmentId || null;

    const teacherOfferings = await prisma.offeringTeacher.findMany({
      where: { userId },
      include: {
        offering: {
          include: {
            course: true,
          },
        },
      },
    });

    for (const to of teacherOfferings) {
      const off = to.offering;
      offeringIds.push(off.id);
      courseOptions.push({
        offeringId: off.id,
        courseCode: off.course.code,
        courseTitle: off.course.title,
        term: off.term,
        academicYear: off.academicYear,
      });
    }
  } else if (userRole === Role.DEPT_ADMIN) {
    const adminProfile = await prisma.teacherProfile.findUnique({
      where: { userId },
      select: { departmentId: true },
    });
    departmentId = adminProfile?.departmentId || null;

    const offerings = await prisma.courseOffering.findMany({
      where: {
        course: { departmentId: departmentId || undefined },
      },
      include: { course: true },
    });

    for (const off of offerings) {
      offeringIds.push(off.id);
      courseOptions.push({
        offeringId: off.id,
        courseCode: off.course.code,
        courseTitle: off.course.title,
        term: off.term,
        academicYear: off.academicYear,
      });
    }
  } else {
    // SUPER_ADMIN
    const offerings = await prisma.courseOffering.findMany({
      where: { status: "PUBLISHED" },
      include: { course: true },
    });
    for (const off of offerings) {
      offeringIds.push(off.id);
      courseOptions.push({
        offeringId: off.id,
        courseCode: off.course.code,
        courseTitle: off.course.title,
        term: off.term,
        academicYear: off.academicYear,
      });
    }
  }

  // If user has no offerings and no department, return early
  if (offeringIds.length === 0 && !departmentId) {
    return { events: [], courses: courseOptions, userRole };
  }

  // 1. Fetch published assignments (drafts never appear)
  const assignments = await prisma.assignment.findMany({
    where: {
      offeringId: { in: offeringIds },
      published: true,
    },
    include: {
      offering: {
        include: {
          course: { select: { code: true, title: true } },
        },
      },
    },
    orderBy: { deadline: "asc" },
  });

  // 2. Fetch published quizzes (drafts never appear)
  const quizzes = await prisma.quiz.findMany({
    where: {
      offeringId: { in: offeringIds },
      published: true,
    },
    include: {
      offering: {
        include: {
          course: { select: { code: true, title: true } },
        },
      },
    },
    orderBy: { startAt: "asc" },
  });

  // 3. Fetch announcements (scoped to department or user's offerings)
  const announcementWhere: {
    OR: Array<
      | { offeringId: { in: string[] } }
      | { departmentId: string }
    >;
  } = {
    OR: [],
  };

  if (offeringIds.length > 0) {
    announcementWhere.OR.push({ offeringId: { in: offeringIds } });
  }
  if (departmentId) {
    announcementWhere.OR.push({ departmentId });
  }

  const announcements = announcementWhere.OR.length > 0
    ? await prisma.announcement.findMany({
        where: announcementWhere,
        include: {
          offering: {
            include: {
              course: { select: { code: true, title: true } },
            },
          },
          department: {
            select: { code: true, name: true },
          },
        },
        orderBy: { createdAt: "desc" },
      })
    : [];

  const events: CalendarEvent[] = [];

  // Map assignments to events
  for (const a of assignments) {
    const link = isTeacher
      ? `/teach/${a.offeringId}/assignments/${a.id}`
      : `/courses/${a.offeringId}/assignments/${a.id}`;

    events.push({
      id: `assignment-${a.id}`,
      type: "ASSIGNMENT_DEADLINE",
      title: a.title,
      description: a.description,
      startDate: a.deadline.toISOString(),
      endDate: a.deadline.toISOString(),
      dhakaDateKey: getDhakaDateKey(a.deadline),
      dhakaTimeDisplay: `Due at ${formatDhaka(a.deadline, "time")}`,
      courseCode: a.offering.course.code,
      courseTitle: a.offering.course.title,
      offeringId: a.offeringId,
      link,
    });
  }

  // Map quizzes to events
  for (const q of quizzes) {
    const link = isTeacher
      ? `/teach/${q.offeringId}/quizzes/${q.id}`
      : `/courses/${q.offeringId}/quizzes/${q.id}`;

    const startTime = formatDhaka(q.startAt, "time");
    const endTime = formatDhaka(q.endAt, "time");

    events.push({
      id: `quiz-${q.id}`,
      type: "QUIZ_WINDOW",
      title: q.title,
      description: q.description,
      startDate: q.startAt.toISOString(),
      endDate: q.endAt.toISOString(),
      dhakaDateKey: getDhakaDateKey(q.startAt),
      dhakaTimeDisplay: `${startTime} – ${endTime} (${q.durationMin} min)`,
      courseCode: q.offering.course.code,
      courseTitle: q.offering.course.title,
      offeringId: q.offeringId,
      link,
    });
  }

  // Map announcements to events
  for (const ann of announcements) {
    const link = ann.offeringId
      ? isTeacher
        ? `/teach/${ann.offeringId}/announcements`
        : `/courses/${ann.offeringId}`
      : "/dashboard";

    const code = ann.offering?.course.code || ann.department?.code || "RUET";
    const title = ann.offering?.course.title || ann.department?.name || "Department";

    events.push({
      id: `announcement-${ann.id}`,
      type: "ANNOUNCEMENT",
      title: ann.title,
      description: ann.body,
      startDate: ann.createdAt.toISOString(),
      endDate: null,
      dhakaDateKey: getDhakaDateKey(ann.createdAt),
      dhakaTimeDisplay: `Posted at ${formatDhaka(ann.createdAt, "time")}`,
      courseCode: code,
      courseTitle: title,
      offeringId: ann.offeringId || undefined,
      link,
    });
  }

  // Sort events chronologically by startDate
  events.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

  return {
    events,
    courses: courseOptions,
    userRole,
  };
}

/**
 * Generates an RFC 5545 compliant iCalendar string (.ics) of upcoming deadlines.
 */
export function generateICalendarFeed(
  events: CalendarEvent[],
  calendarName = "RUET ELMS Deadlines"
): string {
  function formatICalDate(isoString: string): string {
    const date = new Date(isoString);
    return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  }

  function escapeICalText(str?: string | null): string {
    if (!str) return "";
    return str
      .replace(/\\/g, "\\\\")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,")
      .replace(/\n/g, "\\n");
  }

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//RUET ELMS//Academic Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeICalText(calendarName)}`,
    "X-WR-TIMEZONE:Asia/Dhaka",
  ];

  for (const event of events) {
    const dtStart = formatICalDate(event.startDate);
    const dtEnd = event.endDate ? formatICalDate(event.endDate) : dtStart;
    const now = formatICalDate(new Date().toISOString());
    const summary = event.courseCode
      ? `[${event.courseCode}] ${event.title}`
      : event.title;

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${event.id}@ruet.ac.bd`);
    lines.push(`DTSTAMP:${now}`);
    lines.push(`DTSTART:${dtStart}`);
    lines.push(`DTEND:${dtEnd}`);
    lines.push(`SUMMARY:${escapeICalText(summary)}`);
    if (event.description) {
      lines.push(`DESCRIPTION:${escapeICalText(event.description)}`);
    }
    lines.push(`CATEGORIES:${event.type}`);
    lines.push("STATUS:CONFIRMED");
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
