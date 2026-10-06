"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";
import { NotFoundError, ForbiddenError } from "@/lib/auth/errors";
import { getRecentNotificationsData } from "@/services/notifications";
import { revalidatePath } from "next/cache";

/**
 * Marks a single notification as read.
 * Strictly verifies ownership at the query level.
 * Rejects if attempting to mark someone else's notification.
 */
export async function markNotificationReadAction(notificationId: string) {
  const user = await requireUser();

  const result = await prisma.notification.updateMany({
    where: {
      id: notificationId,
      userId: user.id,
    },
    data: {
      isRead: true,
    },
  });

  if (result.count === 0) {
    const existing = await prisma.notification.findUnique({
      where: { id: notificationId },
      select: { userId: true },
    });

    if (existing && existing.userId !== user.id) {
      throw new ForbiddenError(
        "You are not authorized to update another user's notification."
      );
    }

    throw new NotFoundError("Notification not found.");
  }

  revalidatePath("/notifications");
  return { success: true };
}

/**
 * Marks all unread notifications for the caller as read.
 */
export async function markAllNotificationsReadAction() {
  const user = await requireUser();

  await prisma.notification.updateMany({
    where: {
      userId: user.id,
      isRead: false,
    },
    data: {
      isRead: true,
    },
  });

  revalidatePath("/notifications");
  return { success: true };
}

/**
 * Fetches recent notifications and unread count for topbar polling.
 */
export async function getNotificationBadgeAction() {
  const user = await requireUser();
  return getRecentNotificationsData(user.id);
}
