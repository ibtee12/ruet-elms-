"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Bell,
  CheckCheck,
  Filter,
  AlertTriangle,
  GraduationCap,
  Award,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Inbox,
} from "lucide-react";
import { NotificationType } from "@prisma/client";
import {
  markNotificationReadAction,
  markAllNotificationsReadAction,
} from "@/actions/notifications";
import {
  UserNotificationsPageData,
  NotificationItemData,
} from "@/services/notifications";
import { formatRelative, formatDhaka } from "@/lib/datetime";
import { toast } from "sonner";

interface NotificationsViewProps {
  initialData: UserNotificationsPageData;
}

export function NotificationsView({ initialData }: NotificationsViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [data, setData] = React.useState<UserNotificationsPageData>(initialData);
  const [isMarkingAll, setIsMarkingAll] = React.useState(false);

  React.useEffect(() => {
    setData(initialData);
  }, [initialData]);

  // Update query params
  const updateQuery = (updates: { type?: string; status?: string; page?: number }) => {
    const params = new URLSearchParams(searchParams.toString());

    if (updates.type !== undefined) {
      if (updates.type === "ALL") params.delete("type");
      else params.set("type", updates.type);
      params.delete("page"); // reset to page 1
    }

    if (updates.status !== undefined) {
      if (updates.status === "all") params.delete("status");
      else params.set("status", updates.status);
      params.delete("page"); // reset to page 1
    }

    if (updates.page !== undefined) {
      if (updates.page <= 1) params.delete("page");
      else params.set("page", String(updates.page));
    }

    router.push(`/notifications?${params.toString()}`);
  };

  // Mark single as read and navigate
  const handleItemClick = async (item: NotificationItemData) => {
    if (!item.isRead) {
      // Optimistic update
      setData((prev) => ({
        ...prev,
        unreadCount: Math.max(0, prev.unreadCount - 1),
        items: prev.items.map((n) => (n.id === item.id ? { ...n, isRead: true } : n)),
      }));

      try {
        await markNotificationReadAction(item.id);
      } catch (err) {
        console.error("Failed to mark read:", err);
      }
    }

    if (item.link) {
      router.push(item.link);
    }
  };

  // Mark all as read
  const handleMarkAllRead = async () => {
    setIsMarkingAll(true);
    setData((prev) => ({
      ...prev,
      unreadCount: 0,
      items: prev.items.map((n) => ({ ...n, isRead: true })),
    }));

    try {
      const res = await markAllNotificationsReadAction();
      if (res.success) {
        toast.success("All notifications marked as read.");
        router.refresh();
      }
    } catch (err) {
      toast.error("Failed to mark all as read");
      console.error(err);
    } finally {
      setIsMarkingAll(false);
    }
  };

  const typeTabs: { label: string; value: string }[] = [
    { label: "All Types", value: "ALL" },
    { label: "Urgent", value: "URGENT" },
    { label: "Academic", value: "ACADEMIC" },
    { label: "General", value: "GENERAL" },
    { label: "Results", value: "RESULT" },
  ];

  const statusTabs: { label: string; value: string }[] = [
    { label: "All", value: "all" },
    { label: "Unread", value: "unread" },
    { label: "Read", value: "read" },
  ];

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header Banner */}
      <div className="bg-card border border-border p-5 sm:p-6 rounded-xl shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              Notification Center
            </h1>
            {data.unreadCount > 0 && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-destructive/15 text-destructive border border-destructive/20 font-mono">
                {data.unreadCount} unread
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Stay up to date with course announcements, assignments, grading results, and urgent university alerts.
          </p>
        </div>

        {data.unreadCount > 0 && (
          <button
            type="button"
            disabled={isMarkingAll}
            onClick={handleMarkAllRead}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 rounded-lg transition-colors cursor-pointer shrink-0"
          >
            <CheckCheck className="w-4 h-4" />
            <span>Mark all as read</span>
          </button>
        )}
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 bg-muted/30 border border-border/80 p-3 rounded-xl">
        {/* Type Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
          <span className="text-xs font-semibold text-muted-foreground mr-1 hidden sm:inline flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" /> Type:
          </span>
          {typeTabs.map((tab) => {
            const isActive = data.typeFilter === tab.value;
            return (
              <button
                key={tab.value}
                onClick={() => updateQuery({ type: tab.value })}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer shrink-0 ${
                  isActive
                    ? "bg-foreground text-background shadow-xs font-semibold"
                    : "bg-card text-muted-foreground hover:bg-muted border border-border/60"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1.5 w-full md:w-auto justify-end">
          <span className="text-xs font-semibold text-muted-foreground mr-1 hidden sm:inline">
            Status:
          </span>
          {statusTabs.map((tab) => {
            const isActive = data.statusFilter === tab.value;
            return (
              <button
                key={tab.value}
                onClick={() => updateQuery({ status: tab.value })}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                  isActive
                    ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                    : "bg-card text-muted-foreground hover:bg-muted border border-border/60"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Notifications List */}
      <div className="border border-border rounded-xl bg-card shadow-xs overflow-hidden">
        {data.items.length === 0 ? (
          <div className="py-16 px-4 text-center text-muted-foreground flex flex-col items-center justify-center gap-3">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground/60">
              <Inbox className="w-6 h-6 stroke-1" />
            </div>
            <div>
              <p className="font-semibold text-foreground text-sm">No notifications found</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {data.statusFilter === "unread"
                  ? "You have caught up with all notifications!"
                  : "No notifications match your current filter selection."}
              </p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {data.items.map((item) => {
              const isUnread = !item.isRead;
              return (
                <div
                  key={item.id}
                  onClick={() => handleItemClick(item)}
                  className={`p-4 sm:p-5 flex items-start gap-3.5 sm:gap-4 transition-colors cursor-pointer group hover:bg-muted/50 ${
                    isUnread ? "bg-primary/5" : "bg-card"
                  }`}
                >
                  {/* Type Icon */}
                  <NotificationTypeBadge type={item.type} />

                  {/* Body */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <h3 className={`text-sm tracking-tight truncate ${
                          isUnread ? "font-bold text-foreground" : "font-semibold text-foreground/90"
                        }`}>
                          {item.title}
                        </h3>
                        {isUnread && (
                          <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className="text-xs text-muted-foreground font-mono"
                          title={formatDhaka(item.createdAt, "full")}
                        >
                          {formatRelative(item.createdAt)}
                        </span>
                        {item.link && (
                          <ExternalLink className="w-3.5 h-3.5 text-muted-foreground/60 group-hover:text-primary transition-colors" />
                        )}
                      </div>
                    </div>

                    <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                      {item.message}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination Footer */}
        {data.totalPages > 1 && (
          <div className="p-4 border-t border-border bg-muted/20 flex items-center justify-between gap-2 text-xs">
            <span className="text-muted-foreground">
              Showing page <strong className="text-foreground">{data.page}</strong> of{" "}
              <strong className="text-foreground">{data.totalPages}</strong> ({data.totalCount} total)
            </span>

            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={data.page <= 1}
                onClick={() => updateQuery({ page: data.page - 1 })}
                className="p-1.5 rounded-lg border border-border bg-card text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                aria-label="Previous page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <button
                type="button"
                disabled={data.page >= data.totalPages}
                onClick={() => updateQuery({ page: data.page + 1 })}
                className="p-1.5 rounded-lg border border-border bg-card text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                aria-label="Next page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function NotificationTypeBadge({ type }: { type: NotificationType }) {
  switch (type) {
    case "URGENT":
      return (
        <span className="p-2 rounded-xl bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/25 shrink-0 mt-0.5">
          <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5" />
        </span>
      );
    case "ACADEMIC":
      return (
        <span className="p-2 rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/25 shrink-0 mt-0.5">
          <GraduationCap className="w-4 h-4 sm:w-5 sm:h-5" />
        </span>
      );
    case "RESULT":
      return (
        <span className="p-2 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25 shrink-0 mt-0.5">
          <Award className="w-4 h-4 sm:w-5 sm:h-5" />
        </span>
      );
    case "GENERAL":
    default:
      return (
        <span className="p-2 rounded-xl bg-slate-500/15 text-slate-600 dark:text-slate-400 border border-slate-500/25 shrink-0 mt-0.5">
          <Bell className="w-4 h-4 sm:w-5 sm:h-5" />
        </span>
      );
  }
}
