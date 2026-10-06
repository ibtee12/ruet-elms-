import { prisma } from "@/lib/prisma";
import { NotificationType } from "@prisma/client";
import { createNotification } from "@/lib/notifications";

export interface ReminderWindowConfig {
  key: string; // "7d", "3d", "1d", "6h", "1h"
  label: string; // "7 days", "3 days", "24 hours", "6 hours", "1 hour"
  durationMs: number;
  isUrgent: boolean;
}

export const DEFAULT_REMINDER_WINDOWS: ReminderWindowConfig[] = [
  {
    key: "7d",
    label: "7 days",
    durationMs: 7 * 24 * 60 * 60 * 1000,
    isUrgent: false,
  },
  {
    key: "3d",
    label: "3 days",
    durationMs: 3 * 24 * 60 * 60 * 1000,
    isUrgent: false,
  },
  {
    key: "1d",
    label: "24 hours",
    durationMs: 24 * 60 * 60 * 1000,
    isUrgent: false,
  },
  {
    key: "6h",
    label: "6 hours",
    durationMs: 6 * 60 * 60 * 1000,
    isUrgent: true,
  },
  {
    key: "1h",
    label: "1 hour",
    durationMs: 60 * 60 * 1000,
    isUrgent: true,
  },
];

/**
 * Parses reminder windows from a Setting or string list.
 * Recognizes formats like "7d", "3d", "1d", "6h", "1h".
 */
export function parseReminderWindowString(val: string): ReminderWindowConfig | null {
  const trimmed = val.trim().toLowerCase();
  const match = trimmed.match(/^(\d+)(d|h|m)$/);
  if (!match) return null;

  const count = parseInt(match[1], 10);
  const unit = match[2];

  let durationMs = 0;
  let label = "";

  if (unit === "d") {
    durationMs = count * 24 * 60 * 60 * 1000;
    label = `${count} ${count === 1 ? "day" : "days"}`;
  } else if (unit === "h") {
    durationMs = count * 60 * 60 * 1000;
    label = `${count} ${count === 1 ? "hour" : "hours"}`;
  } else if (unit === "m") {
    durationMs = count * 60 * 1000;
    label = `${count} ${count === 1 ? "minute" : "minutes"}`;
  }

  // 6h and 1h (or <= 6h) are considered URGENT with email delivery
  const isUrgent = durationMs <= 6 * 60 * 60 * 1000;

  return {
    key: trimmed,
    label,
    durationMs,
    isUrgent,
  };
}

/**
 * Loads reminder windows from database Setting (key: "reminder_windows").
 * Falls back to DEFAULT_REMINDER_WINDOWS if setting is absent or unconfigured.
 */
export async function getEffectiveReminderWindows(): Promise<ReminderWindowConfig[]> {
  try {
    const setting = await prisma.setting.findUnique({
      where: { key: "reminder_windows" },
    });

    if (setting?.value && typeof setting.value === "object") {
      const val = setting.value as Record<string, unknown>;

      if (Array.isArray(val.windows)) {
        const parsed = val.windows
          .map((w) => (typeof w === "string" ? parseReminderWindowString(w) : null))
          .filter((w): w is ReminderWindowConfig => w !== null);

        if (parsed.length > 0) {
          // Sort descending by duration
          return parsed.sort((a, b) => b.durationMs - a.durationMs);
        }
      }
    }
  } catch (err) {
    console.error("[Reminders] Failed to load reminder_windows setting:", err);
  }

  return DEFAULT_REMINDER_WINDOWS;
}

/**
 * Determines which reminder window (if any) an upcoming deadline falls into at time `now`.
 * Windows are evaluated in descending order of duration:
 * A deadline matches window W if:
 * 0 < remainingMs <= W.durationMs, AND (W is smallest OR remainingMs > nextSmallerWindow.durationMs).
 */
export function matchActiveWindow(
  targetTime: Date,
  now: Date,
  windows: ReminderWindowConfig[]
): ReminderWindowConfig | null {
  const remainingMs = targetTime.getTime() - now.getTime();

  // Deadlines in the past or zero have expired
  if (remainingMs <= 0) {
    return null;
  }

  // Ensure windows are sorted descending
  const sorted = [...windows].sort((a, b) => b.durationMs - a.durationMs);

  for (let i = 0; i < sorted.length; i++) {
    const win = sorted[i];
    const nextSmaller = sorted[i + 1];

    if (remainingMs <= win.durationMs) {
      if (!nextSmaller || remainingMs > nextSmaller.durationMs) {
        return win;
      }
    }
  }

  return null;
}

export interface ReminderRunSummary {
  timestamp: string;
  windowsChecked: string[];
  publishedAssignmentsChecked: number;
  publishedQuizzesChecked: number;
  notificationsCreated: number;
  urgentCount: number;
  durationMs: number;
}

/**
 * Pure, testable reminder processing function:
 * - Injects "now" (defaults to current system time).
 * - Identifies published assignments and quizzes with upcoming deadlines.
 * - Matches active reminder windows.
 * - Dispatches notifications to enrolled students who have not submitted or attempted.
 * - Deduplicates via dedupeKey = `${userId}:${itemType}:${itemId}:${windowKey}`.
 * - Logs run summary with counts only (no personal data).
 */
export async function processReminders(
  now: Date = new Date(),
  customWindows?: ReminderWindowConfig[]
): Promise<ReminderRunSummary> {
  const startTime = Date.now();
  const windows = customWindows || (await getEffectiveReminderWindows());

  let notificationsCreated = 0;
  let urgentCount = 0;

  // 1. Process published assignments
  const publishedAssignments = await prisma.assignment.findMany({
    where: {
      published: true,
      offering: { status: "PUBLISHED" },
      deadline: { gt: now },
    },
    include: {
      offering: {
        include: {
          course: { select: { code: true, title: true } },
          sections: {
            include: {
              enrollments: {
                where: { status: "ACTIVE" },
                include: {
                  student: { select: { id: true, email: true, name: true } },
                },
              },
            },
          },
        },
      },
      submissions: {
        where: {
          status: { in: ["SUBMITTED", "LATE", "GRADED"] },
        },
        select: { studentId: true },
      },
    },
  });

  for (const assignment of publishedAssignments) {
    const matchedWindow = matchActiveWindow(assignment.deadline, now, windows);
    if (!matchedWindow) continue;

    // Set of students who already submitted
    const submittedStudentIds = new Set(assignment.submissions.map((s) => s.studentId));

    // Collect enrolled active students
    const targetStudents = new Map<string, { id: string; email: string; name: string }>();
    for (const section of assignment.offering.sections) {
      for (const enrollment of section.enrollments) {
        const student = enrollment.student;
        if (!submittedStudentIds.has(student.id)) {
          targetStudents.set(student.id, student);
        }
      }
    }

    // Send notifications
    for (const student of targetStudents.values()) {
      const dedupeKey = `${student.id}:ASSIGNMENT:${assignment.id}:${matchedWindow.key}`;

      // Check if already sent
      const existing = await prisma.notification.findUnique({
        where: { dedupeKey },
      });

      if (!existing) {
        await createNotification({
          userId: student.id,
          type: matchedWindow.isUrgent
            ? NotificationType.URGENT
            : NotificationType.ACADEMIC,
          title: `[${assignment.offering.course.code}] Deadline in ${matchedWindow.label}: ${assignment.title}`,
          message: `The assignment "${assignment.title}" is due in ${matchedWindow.label}. Please make sure to submit your work before the deadline.`,
          link: `/courses/${assignment.offeringId}/assignments/${assignment.id}`,
          dedupeKey,
          recipientEmail: student.email,
          recipientName: student.name,
        });

        notificationsCreated++;
        if (matchedWindow.isUrgent) {
          urgentCount++;
        }
      }
    }
  }

  // 2. Process published quizzes
  const publishedQuizzes = await prisma.quiz.findMany({
    where: {
      published: true,
      offering: { status: "PUBLISHED" },
      endAt: { gt: now },
    },
    include: {
      offering: {
        include: {
          course: { select: { code: true, title: true } },
          sections: {
            include: {
              enrollments: {
                where: { status: "ACTIVE" },
                include: {
                  student: { select: { id: true, email: true, name: true } },
                },
              },
            },
          },
        },
      },
      attempts: {
        select: { studentId: true },
      },
    },
  });

  for (const quiz of publishedQuizzes) {
    const matchedWindow = matchActiveWindow(quiz.endAt, now, windows);
    if (!matchedWindow) continue;

    // Set of students who already attempted
    const attemptedStudentIds = new Set(quiz.attempts.map((a) => a.studentId));

    // Collect enrolled active students
    const targetStudents = new Map<string, { id: string; email: string; name: string }>();
    for (const section of quiz.offering.sections) {
      for (const enrollment of section.enrollments) {
        const student = enrollment.student;
        if (!attemptedStudentIds.has(student.id)) {
          targetStudents.set(student.id, student);
        }
      }
    }

    // Send notifications
    for (const student of targetStudents.values()) {
      const dedupeKey = `${student.id}:QUIZ:${quiz.id}:${matchedWindow.key}`;

      const existing = await prisma.notification.findUnique({
        where: { dedupeKey },
      });

      if (!existing) {
        await createNotification({
          userId: student.id,
          type: matchedWindow.isUrgent
            ? NotificationType.URGENT
            : NotificationType.ACADEMIC,
          title: `[${quiz.offering.course.code}] Quiz Closes in ${matchedWindow.label}: ${quiz.title}`,
          message: `The quiz "${quiz.title}" will close in ${matchedWindow.label}. Please finish and submit your attempt on time.`,
          link: `/courses/${quiz.offeringId}/quizzes/${quiz.id}`,
          dedupeKey,
          recipientEmail: student.email,
          recipientName: student.name,
        });

        notificationsCreated++;
        if (matchedWindow.isUrgent) {
          urgentCount++;
        }
      }
    }
  }

  const durationMs = Date.now() - startTime;

  const summary: ReminderRunSummary = {
    timestamp: now.toISOString(),
    windowsChecked: windows.map((w) => w.key),
    publishedAssignmentsChecked: publishedAssignments.length,
    publishedQuizzesChecked: publishedQuizzes.length,
    notificationsCreated,
    urgentCount,
    durationMs,
  };

  // Log summary with counts only (no personal data)
  console.log(
    `[Reminders Cron] Run summary at ${summary.timestamp}: ` +
      `${summary.notificationsCreated} notifications created (${summary.urgentCount} urgent/email) ` +
      `across ${summary.publishedAssignmentsChecked} assignments and ${summary.publishedQuizzesChecked} quizzes in ${summary.durationMs}ms.`
  );

  return summary;
}
