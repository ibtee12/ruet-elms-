/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { NotificationType } from "@prisma/client";
import {
  createNotification,
  createBulkNotifications,
  notifyAnnouncementPosted,
  notifyAssignmentPublished,
  notifyDeadlineChanged,
  notifyGradePosted,
  notifySubmissionReopened,
} from "@/lib/notifications";
import {
  getUserNotificationsData,
  getRecentNotificationsData,
} from "@/services/notifications";
import {
  markNotificationReadAction,
  markAllNotificationsReadAction,
} from "@/actions/notifications";
import * as emailModule from "@/lib/email";
import * as sessionModule from "@/lib/auth/session";

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(
    new Headers({ "x-forwarded-for": "10.0.0.1" })
  ),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("Step 24: Notification Center", () => {
  let studentA: any;
  let studentB: any;
  const createdNotificationIds: string[] = [];

  beforeEach(async () => {
    vi.restoreAllMocks();

    studentA = await prisma.user.findFirstOrThrow({
      where: { email: "2203001@student.ruet.ac.bd" },
    });

    studentB = await prisma.user.findFirstOrThrow({
      where: { email: "2203002@student.ruet.ac.bd" },
    });
  });

  afterEach(async () => {
    if (createdNotificationIds.length > 0) {
      await prisma.notification.deleteMany({
        where: { id: { in: createdNotificationIds } },
      });
      createdNotificationIds.length = 0;
    }
    // Clean up notifications created for studentA and studentB during tests
    await prisma.notification.deleteMany({
      where: { userId: { in: [studentA.id, studentB.id] } },
    });
  });

  describe("Acceptance Criterion: DedupeKey Support", () => {
    it("duplicate dedupeKey creates no second row (ignores duplicates)", async () => {
      const dedupeKey = `test_dedupe_${Date.now()}_${studentA.id}`;

      // First creation succeeds
      const n1 = await createNotification({
        userId: studentA.id,
        type: NotificationType.GENERAL,
        title: "Test Notification",
        message: "First instance",
        dedupeKey,
      });
      createdNotificationIds.push(n1.id);

      // Count notifications with this dedupeKey
      const count1 = await prisma.notification.count({
        where: { dedupeKey },
      });
      expect(count1).toBe(1);

      // Second creation with the EXACT same dedupeKey
      const n2 = await createNotification({
        userId: studentA.id,
        type: NotificationType.GENERAL,
        title: "Test Notification Duplicate",
        message: "Second instance with duplicate key",
        dedupeKey,
      });

      // Should return the original row or skip, creating NO second row
      expect(n2.id).toBe(n1.id);

      const count2 = await prisma.notification.count({
        where: { dedupeKey },
      });
      expect(count2).toBe(1); // Still exactly 1 row!
    });

    it("bulk notifications skip duplicate dedupeKeys cleanly", async () => {
      const keyShared = `bulk_dedupe_${Date.now()}`;

      const res = await createBulkNotifications([
        {
          userId: studentA.id,
          type: NotificationType.ACADEMIC,
          title: "Bulk Test",
          message: "First in bulk",
          dedupeKey: `${keyShared}_A`,
        },
        {
          userId: studentA.id,
          type: NotificationType.ACADEMIC,
          title: "Bulk Test Duplicate",
          message: "Duplicate in bulk",
          dedupeKey: `${keyShared}_A`,
        },
      ]);

      expect(res.count).toBe(1);

      const count = await prisma.notification.count({
        where: { dedupeKey: `${keyShared}_A` },
      });
      expect(count).toBe(1);
    });
  });

  describe("Acceptance Criterion: Security and User Isolation", () => {
    it("a user cannot mark or read someone else's notification via a crafted ID", async () => {
      // Create notification specifically for Student B
      const notifB = await prisma.notification.create({
        data: {
          userId: studentB.id,
          type: NotificationType.ACADEMIC,
          title: "Private to Student B",
          message: "Only for B",
          isRead: false,
        },
      });
      createdNotificationIds.push(notifB.id);

      // Student A tries to mark Student B's notification as read -> REJECTED
      vi.spyOn(sessionModule, "requireUser").mockResolvedValue({
        id: studentA.id,
        email: studentA.email,
        name: studentA.name,
        role: studentA.role,
        mustChangePassword: false,
      });

      await expect(
        markNotificationReadAction(notifB.id)
      ).rejects.toThrow();

      // Verify Student B's notification is still unread in database
      const checkB = await prisma.notification.findUniqueOrThrow({
        where: { id: notifB.id },
      });
      expect(checkB.isRead).toBe(false);

      // Student A queries their notifications -> Student B's notification is NOT returned
      const studentANotifs = await getUserNotificationsData(studentA.id);
      const foundInA = studentANotifs.items.some((n) => n.id === notifB.id);
      expect(foundInA).toBe(false);
    });

    it("allows a user to mark their own notification as read", async () => {
      const notifA = await prisma.notification.create({
        data: {
          userId: studentA.id,
          type: NotificationType.GENERAL,
          title: "Own Notification",
          message: "For Student A",
          isRead: false,
        },
      });
      createdNotificationIds.push(notifA.id);

      vi.spyOn(sessionModule, "requireUser").mockResolvedValue({
        id: studentA.id,
        email: studentA.email,
        name: studentA.name,
        role: studentA.role,
        mustChangePassword: false,
      });

      const res = await markNotificationReadAction(notifA.id);
      expect(res.success).toBe(true);

      const updated = await prisma.notification.findUniqueOrThrow({
        where: { id: notifA.id },
      });
      expect(updated.isRead).toBe(true);
    });

    it("allows marking all notifications read for the current user only", async () => {
      const n1 = await prisma.notification.create({
        data: {
          userId: studentA.id,
          type: NotificationType.ACADEMIC,
          title: "Unread 1",
          message: "Test 1",
          isRead: false,
        },
      });
      const n2 = await prisma.notification.create({
        data: {
          userId: studentA.id,
          type: NotificationType.GENERAL,
          title: "Unread 2",
          message: "Test 2",
          isRead: false,
        },
      });
      const nB = await prisma.notification.create({
        data: {
          userId: studentB.id,
          type: NotificationType.GENERAL,
          title: "Student B Unread",
          message: "Test B",
          isRead: false,
        },
      });
      createdNotificationIds.push(n1.id, n2.id, nB.id);

      vi.spyOn(sessionModule, "requireUser").mockResolvedValue({
        id: studentA.id,
        email: studentA.email,
        name: studentA.name,
        role: studentA.role,
        mustChangePassword: false,
      });

      await markAllNotificationsReadAction();

      const refreshedA = await prisma.notification.findMany({
        where: { id: { in: [n1.id, n2.id] } },
      });
      expect(refreshedA.every((n) => n.isRead)).toBe(true);

      // Student B's notification remains unread!
      const refreshedB = await prisma.notification.findUniqueOrThrow({
        where: { id: nB.id },
      });
      expect(refreshedB.isRead).toBe(false);
    });
  });

  describe("Acceptance Criterion: Fail-Safe Email Delivery for URGENT Notifications", () => {
    it("email failure does not make the main notification action fail", async () => {
      // Mock email sending to deliberately reject/fail
      const emailSpy = vi
        .spyOn(emailModule, "sendUrgentNotificationEmail")
        .mockRejectedValue(new Error("SMTP Server Connection Timeout"));

      // Creating URGENT notification must succeed despite email failure
      const notif = await createNotification({
        userId: studentA.id,
        type: NotificationType.URGENT,
        title: "Campus Closure Warning",
        message: "Severe weather alert",
        recipientEmail: studentA.email,
        recipientName: studentA.name,
      });

      createdNotificationIds.push(notif.id);

      expect(notif).toBeDefined();
      expect(notif.id).toBeDefined();
      expect(notif.type).toBe(NotificationType.URGENT);

      // Verify email function was attempted
      expect(emailSpy).toHaveBeenCalled();

      // Notification row exists in DB
      const inDb = await prisma.notification.findUnique({
        where: { id: notif.id },
      });
      expect(inDb).not.toBeNull();
    });

    it("non-urgent notifications do not dispatch emails", async () => {
      const emailSpy = vi.spyOn(emailModule, "sendUrgentNotificationEmail");

      const notif = await createNotification({
        userId: studentA.id,
        type: NotificationType.GENERAL,
        title: "Normal Update",
        message: "No email required",
      });
      createdNotificationIds.push(notif.id);

      expect(emailSpy).not.toHaveBeenCalled();
    });
  });

  describe("Acceptance Criterion: Unread Badge formatting and Query Aggregation", () => {
    it("unread badge counts format correctly, including large count display format", async () => {
      // Helper function matching the UI badge format logic
      const getBadgeText = (count: number) => (count > 9 ? "9+" : count > 0 ? String(count) : null);

      expect(getBadgeText(0)).toBeNull();
      expect(getBadgeText(1)).toBe("1");
      expect(getBadgeText(5)).toBe("5");
      expect(getBadgeText(9)).toBe("9");
      expect(getBadgeText(10)).toBe("9+");
      expect(getBadgeText(99)).toBe("9+");

      // Create 11 unread notifications for student A
      const items = Array.from({ length: 11 }).map((_, idx) => ({
        userId: studentA.id,
        type: NotificationType.GENERAL,
        title: `Alert ${idx + 1}`,
        message: `Message ${idx + 1}`,
        isRead: false,
      }));

      await prisma.notification.createMany({ data: items });

      const recent = await getRecentNotificationsData(studentA.id);
      expect(recent.unreadCount).toBeGreaterThanOrEqual(11);
      expect(recent.latest.length).toBe(5); // Top 5 latest
      expect(getBadgeText(recent.unreadCount)).toBe("9+");
    });
  });

  describe("Typed Event Helpers", () => {
    it("notifyAnnouncementPosted bulk notifies with GENERAL type and dedupeKey", async () => {
      const res = await notifyAnnouncementPosted({
        announcementId: "ann_123",
        offeringId: "offering_123",
        courseCode: "CSE 3205",
        title: "Exam Schedule Announced",
        recipientUserIds: [studentA.id, studentB.id],
      });

      expect(res.count).toBe(2);

      const notifs = await prisma.notification.findMany({
        where: { dedupeKey: { startsWith: "announcement_ann_123_" } },
      });
      expect(notifs.length).toBe(2);
      expect(notifs[0].type).toBe(NotificationType.GENERAL);
    });

    it("notifyAssignmentPublished bulk notifies with ACADEMIC type", async () => {
      const deadline = new Date(Date.now() + 86400000);
      const res = await notifyAssignmentPublished({
        assignmentId: "asg_999",
        offeringId: "offering_123",
        courseCode: "CSE 3205",
        assignmentTitle: "Homework 1",
        deadline,
        recipientUserIds: [studentA.id],
      });

      expect(res.count).toBe(1);

      const notif = await prisma.notification.findFirstOrThrow({
        where: { dedupeKey: `assignment_pub_asg_999_${studentA.id}` },
      });
      expect(notif.type).toBe(NotificationType.ACADEMIC);
      expect(notif.link).toContain("/courses/offering_123/assignments/asg_999");
    });

    it("notifyDeadlineChanged notifies with ACADEMIC type", async () => {
      const newDeadline = new Date(Date.now() + 172800000);
      const res = await notifyDeadlineChanged({
        assignmentId: "asg_999",
        offeringId: "offering_123",
        courseCode: "CSE 3205",
        assignmentTitle: "Homework 1",
        newDeadline,
        recipientUserIds: [studentA.id],
      });

      expect(res.count).toBe(1);
    });

    it("notifyGradePosted notifies with RESULT type", async () => {
      const notif = await notifyGradePosted({
        submissionId: "sub_123",
        offeringId: "offering_123",
        courseCode: "CSE 3205",
        assignmentId: "asg_999",
        assignmentTitle: "Homework 1",
        studentUserId: studentA.id,
        marks: 95,
        maxMarks: 100,
      });

      expect(notif.type).toBe(NotificationType.RESULT);
      expect(notif.title).toContain("Grade Posted");
    });

    it("notifySubmissionReopened notifies with ACADEMIC type", async () => {
      const notif = await notifySubmissionReopened({
        assignmentId: "asg_999",
        offeringId: "offering_123",
        courseCode: "CSE 3205",
        assignmentTitle: "Homework 1",
        studentUserId: studentA.id,
      });

      expect(notif.type).toBe(NotificationType.ACADEMIC);
      expect(notif.title).toContain("Submission Reopened");
    });
  });

  describe("Pagination and Type Filtering", () => {
    it("filters notifications by type and read status with pagination", async () => {
      await prisma.notification.createMany({
        data: [
          {
            userId: studentA.id,
            type: NotificationType.URGENT,
            title: "Urgent 1",
            message: "msg",
            isRead: false,
          },
          {
            userId: studentA.id,
            type: NotificationType.ACADEMIC,
            title: "Academic 1",
            message: "msg",
            isRead: false,
          },
          {
            userId: studentA.id,
            type: NotificationType.GENERAL,
            title: "General 1",
            message: "msg",
            isRead: true,
          },
        ],
      });

      // Filter by URGENT
      const urgentPage = await getUserNotificationsData(studentA.id, {
        type: "URGENT",
      });
      expect(urgentPage.items.every((n) => n.type === NotificationType.URGENT)).toBe(true);
      expect(urgentPage.items.length).toBe(1);

      // Filter by UNREAD
      const unreadPage = await getUserNotificationsData(studentA.id, {
        status: "unread",
      });
      expect(unreadPage.items.every((n) => !n.isRead)).toBe(true);

      // Filter by READ
      const readPage = await getUserNotificationsData(studentA.id, {
        status: "read",
      });
      expect(readPage.items.every((n) => n.isRead)).toBe(true);
    });
  });
});
