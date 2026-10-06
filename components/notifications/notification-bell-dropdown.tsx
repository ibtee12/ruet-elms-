"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell,
  CheckCheck,
  AlertTriangle,
  GraduationCap,
  Award,
  BellRing,
  ExternalLink,
} from "lucide-react";
import { NotificationType } from "@prisma/client";
import {
  markNotificationReadAction,
  markAllNotificationsReadAction,
} from "@/actions/notifications";
import { NotificationItemData } from "@/services/notifications";
import { formatRelative } from "@/lib/datetime";

export function NotificationBellDropdown() {
  const router = useRouter();
  const [isOpen, setIsOpen] = React.useState(false);
  const [unreadCount, setUnreadCount] = React.useState(0);
  const [latest, setLatest] = React.useState<NotificationItemData[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  // Fetch recent notifications data
  const fetchRecent = React.useCallback(async () => {
    try {
      const res = await fetch("/api/notifications/recent", {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setUnreadCount(data.unreadCount ?? 0);
        setLatest(data.latest ?? []);
      }
    } catch (err) {
      console.error("Failed to poll notifications:", err);
    }
  }, []);

  // Initial fetch and 60-second polling interval
  React.useEffect(() => {
    fetchRecent();

    const interval = setInterval(() => {
      fetchRecent();
    }, 60000); // 60 seconds

    return () => clearInterval(interval);
  }, [fetchRecent]);

  // Close dropdown on outside click
  React.useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Mark single as read and navigate
  const handleItemClick = async (item: NotificationItemData) => {
    if (!item.isRead) {
      // Optimistic update
      setUnreadCount((prev) => Math.max(0, prev - 1));
      setLatest((prev) =>
        prev.map((n) => (n.id === item.id ? { ...n, isRead: true } : n))
      );
      try {
        await markNotificationReadAction(item.id);
      } catch (err) {
        console.error("Failed to mark notification read:", err);
      }
    }
    setIsOpen(false);
    if (item.link) {
      router.push(item.link);
    }
  };

  // Mark all as read
  const handleMarkAllRead = async () => {
    setIsLoading(true);
    setUnreadCount(0);
    setLatest((prev) => prev.map((n) => ({ ...n, isRead: true })));

    try {
      await markAllNotificationsReadAction();
    } catch (err) {
      console.error("Failed to mark all notifications read:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // Unread badge text: "9+" for counts greater than 9
  const badgeText = unreadCount > 9 ? "9+" : unreadCount > 0 ? String(unreadCount) : null;

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label={`Notifications (${unreadCount} unread)`}
        className="relative p-2 rounded-lg text-muted hover:text-foreground hover:bg-surface-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer"
      >
        <Bell className="w-5 h-5" />
        {badgeText && (
          <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-mono font-bold flex items-center justify-center shadow-xs animate-in zoom-in-50 duration-150">
            {badgeText}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
          {/* Header */}
          <div className="p-3.5 border-b border-border flex items-center justify-between bg-muted/40">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-foreground">Notifications</span>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-primary/10 text-primary">
                  {unreadCount} new
                </span>
              )}
            </div>

            {unreadCount > 0 && (
              <button
                type="button"
                disabled={isLoading}
                onClick={handleMarkAllRead}
                className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium transition-colors cursor-pointer"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>Mark all read</span>
              </button>
            )}
          </div>

          {/* List of 5 Latest */}
          <div className="max-h-[360px] overflow-y-auto divide-y divide-border/60">
            {latest.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-xs flex flex-col items-center gap-2">
                <BellRing className="w-8 h-8 text-muted-foreground/40 stroke-1" />
                <p>No notifications yet</p>
              </div>
            ) : (
              latest.map((item) => (
                <div
                  key={item.id}
                  onClick={() => handleItemClick(item)}
                  className={`p-3.5 transition-colors cursor-pointer flex items-start gap-3 hover:bg-muted/50 ${
                    !item.isRead ? "bg-primary/5 font-medium" : "bg-card"
                  }`}
                >
                  <NotificationTypeIcon type={item.type} />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <p className="text-xs font-semibold text-foreground truncate">
                        {item.title}
                      </p>
                      {!item.isRead && (
                        <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                      {item.message}
                    </p>
                    <span className="text-[10px] text-muted-foreground/70 mt-1 block">
                      {formatRelative(item.createdAt)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="p-2.5 border-t border-border bg-muted/20 text-center">
            <Link
              href="/notifications"
              onClick={() => setIsOpen(false)}
              className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1"
            >
              <span>View all notifications</span>
              <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function NotificationTypeIcon({ type }: { type: NotificationType }) {
  switch (type) {
    case "URGENT":
      return (
        <span className="p-1.5 rounded-lg bg-rose-500/15 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5">
          <AlertTriangle className="w-4 h-4" />
        </span>
      );
    case "ACADEMIC":
      return (
        <span className="p-1.5 rounded-lg bg-blue-500/15 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5">
          <GraduationCap className="w-4 h-4" />
        </span>
      );
    case "RESULT":
      return (
        <span className="p-1.5 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5">
          <Award className="w-4 h-4" />
        </span>
      );
    case "GENERAL":
    default:
      return (
        <span className="p-1.5 rounded-lg bg-slate-500/15 text-slate-600 dark:text-slate-400 shrink-0 mt-0.5">
          <Bell className="w-4 h-4" />
        </span>
      );
  }
}
