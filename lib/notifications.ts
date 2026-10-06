import { prisma } from "@/lib/prisma";
import { NotificationType } from "@prisma/client";
import { sendUrgentNotificationEmail } from "@/lib/email";

export interface CreateNotificationParams {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  dedupeKey?: string;
  recipientEmail?: string;
  recipientName?: string;
}

/**
 * Fires an email in the background without blocking the caller or failing the action if email delivery fails.
 */
function dispatchUrgentEmailSafe(params: {
  userId: string;
  title: string;
  message: string;
  link?: string;
  recipientEmail?: string;
  recipientName?: string;
}) {
  // Fire and forget
  void (async () => {
    try {
      let email = params.recipientEmail;
      let name = params.recipientName;

      if (!email) {
        const user = await prisma.user.findUnique({
          where: { id: params.userId },
          select: { email: true, name: true },
        });
        if (user) {
          email = user.email;
          name = user.name;
        }
      }

      if (email) {
        await sendUrgentNotificationEmail({
          to: email,
          recipientName: name,
          title: params.title,
          message: params.message,
          link: params.link,
        });
      }
    } catch (err) {
      console.error("[Notifications] Non-blocking email dispatch failed:", err);
    }
  })();
}

/**
 * Creates a single notification.
 * - dedupeKey: ignores duplicates without creating a second row.
 * - URGENT type: triggers fail-safe email in the background, never blocking the caller.
 */
export async function createNotification(params: CreateNotificationParams) {
  let notification;

  if (params.dedupeKey) {
    // If dedupeKey already exists, return the existing row (ignore duplicate)
    const existing = await prisma.notification.findUnique({
      where: { dedupeKey: params.dedupeKey },
    });
    if (existing) {
      return existing;
    }

    try {
      notification = await prisma.notification.create({
        data: {
          userId: params.userId,
          type: params.type,
          title: params.title,
          message: params.message,
          link: params.link,
          dedupeKey: params.dedupeKey,
        },
      });
    } catch (err: unknown) {
      // If a race condition caused unique constraint conflict on dedupeKey, return the existing one
      const existingAfterRace = await prisma.notification.findUnique({
        where: { dedupeKey: params.dedupeKey },
      });
      if (existingAfterRace) {
        return existingAfterRace;
      }
      throw err;
    }
  } else {
    notification = await prisma.notification.create({
      data: {
        userId: params.userId,
        type: params.type,
        title: params.title,
        message: params.message,
        link: params.link,
      },
    });
  }

  // Email only for URGENT, never blocking caller
  if (params.type === NotificationType.URGENT) {
    dispatchUrgentEmailSafe(params);
  }

  return notification;
}

/**
 * Creates multiple user notifications in bulk with batched chunked inserts and deduplication.
 * - Batches in chunks of 100 to prevent oversized queries.
 * - skipDuplicates ensures duplicate dedupeKeys are ignored.
 * - Sends emails for URGENT items in the background without blocking.
 */
export async function createBulkNotifications(
  items: CreateNotificationParams[]
) {
  if (items.length === 0) {
    return { count: 0 };
  }

  // De-duplicate items within this batch by dedupeKey in-memory first
  const seenKeys = new Set<string>();
  const dedupedItems: CreateNotificationParams[] = [];

  for (const item of items) {
    if (item.dedupeKey) {
      if (seenKeys.has(item.dedupeKey)) continue;
      seenKeys.add(item.dedupeKey);
    }
    dedupedItems.push(item);
  }

  const BATCH_SIZE = 100;
  let totalCreated = 0;

  for (let i = 0; i < dedupedItems.length; i += BATCH_SIZE) {
    const chunk = dedupedItems.slice(i, i + BATCH_SIZE);
    const result = await prisma.notification.createMany({
      data: chunk.map((item) => ({
        userId: item.userId,
        type: item.type,
        title: item.title,
        message: item.message,
        link: item.link,
        dedupeKey: item.dedupeKey,
      })),
      skipDuplicates: true,
    });
    totalCreated += result.count;
  }

  // Trigger non-blocking emails for URGENT items in background
  const urgentItems = dedupedItems.filter((i) => i.type === NotificationType.URGENT);
  if (urgentItems.length > 0) {
    for (const item of urgentItems) {
      dispatchUrgentEmailSafe(item);
    }
  }

  return { count: totalCreated };
}

// ---------------------------------------------------------------------------
// Typed helpers for common academic events
// ---------------------------------------------------------------------------

export interface NotifyAnnouncementParams {
  announcementId: string;
  offeringId?: string;
  courseCode?: string;
  title: string;
  recipientUserIds: string[];
}

export async function notifyAnnouncementPosted(params: NotifyAnnouncementParams) {
  const link = params.offeringId ? `/courses/${params.offeringId}` : "/dashboard";
  const prefix = params.courseCode ? `[${params.courseCode}] ` : "";

  const items: CreateNotificationParams[] = params.recipientUserIds.map((userId) => ({
    userId,
    type: NotificationType.GENERAL,
    title: `${prefix}New Announcement`,
    message: params.title,
    link,
    dedupeKey: `announcement_${params.announcementId}_${userId}`,
  }));

  return createBulkNotifications(items);
}

export interface NotifyAssignmentPublishedParams {
  assignmentId: string;
  offeringId: string;
  courseCode: string;
  assignmentTitle: string;
  deadline: Date;
  recipientUserIds: string[];
}

export async function notifyAssignmentPublished(params: NotifyAssignmentPublishedParams) {
  const link = `/courses/${params.offeringId}/assignments/${params.assignmentId}`;
  const formattedDate = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Dhaka",
  }).format(params.deadline);

  const items: CreateNotificationParams[] = params.recipientUserIds.map((userId) => ({
    userId,
    type: NotificationType.ACADEMIC,
    title: `[${params.courseCode}] New Assignment Published`,
    message: `"${params.assignmentTitle}" has been published. Due: ${formattedDate}.`,
    link,
    dedupeKey: `assignment_pub_${params.assignmentId}_${userId}`,
  }));

  return createBulkNotifications(items);
}

export interface NotifyDeadlineChangedParams {
  assignmentId: string;
  offeringId: string;
  courseCode: string;
  assignmentTitle: string;
  newDeadline: Date;
  recipientUserIds: string[];
}

export async function notifyDeadlineChanged(params: NotifyDeadlineChangedParams) {
  const link = `/courses/${params.offeringId}/assignments/${params.assignmentId}`;
  const formattedDate = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Dhaka",
  }).format(params.newDeadline);

  const items: CreateNotificationParams[] = params.recipientUserIds.map((userId) => ({
    userId,
    type: NotificationType.ACADEMIC,
    title: `[${params.courseCode}] Assignment Deadline Updated`,
    message: `The deadline for "${params.assignmentTitle}" has been changed to ${formattedDate}.`,
    link,
    dedupeKey: `assignment_deadline_${params.assignmentId}_${params.newDeadline.getTime()}_${userId}`,
  }));

  return createBulkNotifications(items);
}

export interface NotifyGradePostedParams {
  submissionId: string;
  offeringId: string;
  courseCode: string;
  assignmentId: string;
  assignmentTitle: string;
  studentUserId: string;
  marks: number;
  maxMarks: number;
}

export async function notifyGradePosted(params: NotifyGradePostedParams) {
  const link = `/courses/${params.offeringId}/assignments/${params.assignmentId}`;

  return createNotification({
    userId: params.studentUserId,
    type: NotificationType.RESULT,
    title: `[${params.courseCode}] Grade Posted`,
    message: `Your submission for "${params.assignmentTitle}" has been graded: ${params.marks}/${params.maxMarks}.`,
    link,
    dedupeKey: `grade_${params.submissionId}_${params.marks}`,
  });
}

export interface NotifySubmissionReopenedParams {
  assignmentId: string;
  offeringId: string;
  courseCode: string;
  assignmentTitle: string;
  studentUserId: string;
}

export async function notifySubmissionReopened(params: NotifySubmissionReopenedParams) {
  const link = `/courses/${params.offeringId}/assignments/${params.assignmentId}`;

  return createNotification({
    userId: params.studentUserId,
    type: NotificationType.ACADEMIC,
    title: `[${params.courseCode}] Submission Reopened`,
    message: `Your submission for "${params.assignmentTitle}" was reopened by the instructor. You may now upload a new revision.`,
    link,
    dedupeKey: `reopen_${params.assignmentId}_${params.studentUserId}_${Date.now()}`,
  });
}

export interface NotifyQuizPublishedParams {
  quizId: string;
  offeringId: string;
  courseCode: string;
  quizTitle: string;
  startAt: Date;
  endAt: Date;
  durationMin: number;
  recipientUserIds: string[];
}

export async function notifyQuizPublished(params: NotifyQuizPublishedParams) {
  const link = `/courses/${params.offeringId}/quizzes`;
  const formattedStart = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Dhaka",
  }).format(params.startAt);

  const formattedEnd = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Dhaka",
  }).format(params.endAt);

  const items: CreateNotificationParams[] = params.recipientUserIds.map((userId) => ({
    userId,
    type: NotificationType.ACADEMIC,
    title: `[${params.courseCode}] Quiz Published: ${params.quizTitle}`,
    message: `A new quiz "${params.quizTitle}" has been scheduled from ${formattedStart} to ${formattedEnd} (${params.durationMin} minutes).`,
    link,
    dedupeKey: `quiz_pub_${params.quizId}_${userId}`,
  }));

  return createBulkNotifications(items);
}

export interface NotifyQuizResultsAvailableParams {
  quizId: string;
  offeringId: string;
  courseCode: string;
  quizTitle: string;
  recipientUserIds: string[];
}

export async function notifyQuizResultsAvailable(params: NotifyQuizResultsAvailableParams) {
  const link = `/courses/${params.offeringId}/quizzes/${params.quizId}`;

  const items: CreateNotificationParams[] = params.recipientUserIds.map((userId) => ({
    userId,
    type: NotificationType.RESULT,
    title: `[${params.courseCode}] Quiz Results Available`,
    message: `Evaluation results and scoring for "${params.quizTitle}" are now available.`,
    link,
    dedupeKey: `quiz_res_${params.quizId}_${userId}`,
  }));

  return createBulkNotifications(items);
}

export interface NotifyNewDiscussionThreadParams {
  threadId: string;
  offeringId: string;
  courseCode: string;
  threadTitle: string;
  category: string;
  instructorUserIds: string[];
}

export async function notifyNewDiscussionThread(params: NotifyNewDiscussionThreadParams) {
  const link = `/teach/${params.offeringId}/discussions/${params.threadId}`;

  const items: CreateNotificationParams[] = params.instructorUserIds.map((userId) => ({
    userId,
    type: NotificationType.ACADEMIC,
    title: `[${params.courseCode}] New Discussion: ${params.threadTitle}`,
    message: `A new thread was started in ${params.category.toLowerCase()}: "${params.threadTitle}".`,
    link,
    dedupeKey: `thread_pub_${params.threadId}_${userId}`,
  }));

  return createBulkNotifications(items);
}

export interface NotifyThreadReplyParams {
  threadId: string;
  offeringId: string;
  threadTitle: string;
  threadAuthorId: string;
  replierName?: string;
  isTeacherTarget?: boolean;
}

export async function notifyThreadReply(params: NotifyThreadReplyParams) {
  const link = params.isTeacherTarget
    ? `/teach/${params.offeringId}/discussions/${params.threadId}`
    : `/courses/${params.offeringId}/discussions/${params.threadId}`;

  const sender = params.replierName || "A course participant";

  return createNotification({
    userId: params.threadAuthorId,
    type: NotificationType.GENERAL,
    title: `New Reply: ${params.threadTitle}`,
    message: `${sender} replied to your thread: "${params.threadTitle}".`,
    link,
    dedupeKey: `reply_${params.threadId}_${Date.now()}_${params.threadAuthorId}`,
  });
}
