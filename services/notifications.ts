import { prisma } from "@/lib/prisma";
import { NotificationType } from "@prisma/client";

export interface NotificationItemData {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  link: string | null;
  isRead: boolean;
  createdAt: Date;
}

export interface UserNotificationsPageData {
  items: NotificationItemData[];
  totalCount: number;
  unreadCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  typeFilter: string;
  statusFilter: string;
}

export interface UserNotificationsQueryFilters {
  type?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

/**
 * Loads paginated notifications strictly scoped to the calling user.
 * Users can never view or update another user's notifications.
 */
export async function getUserNotificationsData(
  userId: string,
  filters: UserNotificationsQueryFilters = {}
): Promise<UserNotificationsPageData> {
  const page = Math.max(1, Number(filters.page) || 1);
  const pageSize = Math.min(50, Math.max(5, Number(filters.pageSize) || 15));

  const whereClause: {
    userId: string;
    type?: NotificationType;
    isRead?: boolean;
  } = {
    userId,
  };

  // Filter by Type
  const validTypes = ["URGENT", "ACADEMIC", "GENERAL", "RESULT"];
  if (filters.type && validTypes.includes(filters.type.toUpperCase())) {
    whereClause.type = filters.type.toUpperCase() as NotificationType;
  }

  // Filter by Read Status
  if (filters.status?.toLowerCase() === "unread") {
    whereClause.isRead = false;
  } else if (filters.status?.toLowerCase() === "read") {
    whereClause.isRead = true;
  }

  const [items, totalCount, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        type: true,
        title: true,
        message: true,
        link: true,
        isRead: true,
        createdAt: true,
      },
    }),
    prisma.notification.count({
      where: whereClause,
    }),
    prisma.notification.count({
      where: {
        userId,
        isRead: false,
      },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return {
    items,
    totalCount,
    unreadCount,
    page,
    pageSize,
    totalPages,
    typeFilter: filters.type?.toUpperCase() || "ALL",
    statusFilter: filters.status?.toLowerCase() || "all",
  };
}

export interface RecentNotificationsData {
  unreadCount: number;
  latest: NotificationItemData[];
}

/**
 * Loads the 5 latest notifications and total unread count for topbar bell and polling.
 * Strictly scoped to the calling user.
 */
export async function getRecentNotificationsData(
  userId: string
): Promise<RecentNotificationsData> {
  const [unreadCount, latest] = await Promise.all([
    prisma.notification.count({
      where: {
        userId,
        isRead: false,
      },
    }),
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        type: true,
        title: true,
        message: true,
        link: true,
        isRead: true,
        createdAt: true,
      },
    }),
  ]);

  return {
    unreadCount,
    latest,
  };
}
