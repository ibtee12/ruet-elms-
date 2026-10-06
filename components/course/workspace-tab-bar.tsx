"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  FileCheck2,
  HelpCircle,
  MessageSquare,
  Award,
  TrendingUp,
  Megaphone,
  Users,
  BarChart3,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface TabItem {
  label: string;
  href: string;
  icon: LucideIcon;
  exact?: boolean;
}

interface WorkspaceTabBarProps {
  offeringId: string;
  portal: "student" | "teacher";
}

export function WorkspaceTabBar({ offeringId, portal }: WorkspaceTabBarProps) {
  const pathname = usePathname();

  const studentTabs: TabItem[] = [
    {
      label: "Overview",
      href: `/courses/${offeringId}`,
      icon: LayoutDashboard,
      exact: true,
    },
    {
      label: "Materials",
      href: `/courses/${offeringId}/materials`,
      icon: FileText,
    },
    {
      label: "Assignments",
      href: `/courses/${offeringId}/assignments`,
      icon: FileCheck2,
    },
    {
      label: "Quizzes",
      href: `/courses/${offeringId}/quizzes`,
      icon: HelpCircle,
    },
    {
      label: "Discussions",
      href: `/courses/${offeringId}/discussions`,
      icon: MessageSquare,
    },
    {
      label: "Grades",
      href: `/courses/${offeringId}/grades`,
      icon: Award,
    },
    {
      label: "My Progress",
      href: `/courses/${offeringId}/progress`,
      icon: TrendingUp,
    },
  ];

  const teacherTabs: TabItem[] = [
    {
      label: "Overview",
      href: `/teach/${offeringId}`,
      icon: LayoutDashboard,
      exact: true,
    },
    {
      label: "Materials",
      href: `/teach/${offeringId}/materials`,
      icon: FileText,
    },
    {
      label: "Assignments",
      href: `/teach/${offeringId}/assignments`,
      icon: FileCheck2,
    },
    {
      label: "Quizzes",
      href: `/teach/${offeringId}/quizzes`,
      icon: HelpCircle,
    },
    {
      label: "Discussions",
      href: `/teach/${offeringId}/discussions`,
      icon: MessageSquare,
    },
    {
      label: "Announcements",
      href: `/teach/${offeringId}/announcements`,
      icon: Megaphone,
    },
    {
      label: "Students",
      href: `/teach/${offeringId}/students`,
      icon: Users,
    },
    {
      label: "Gradebook",
      href: `/teach/${offeringId}/gradebook`,
      icon: Award,
    },
    {
      label: "Analytics",
      href: `/teach/${offeringId}/analytics`,
      icon: BarChart3,
    },
  ];

  const tabs = portal === "student" ? studentTabs : teacherTabs;

  return (
    <div className="border-b border-border -mx-4 px-4 sm:mx-0 sm:px-0">
      <nav
        role="tablist"
        aria-label="Course Workspace Navigation"
        className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-2 select-none"
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = tab.exact
            ? pathname === tab.href
            : pathname === tab.href || pathname.startsWith(`${tab.href}/`);

          return (
            <Link
              key={tab.href}
              href={tab.href}
              role="tab"
              aria-selected={isActive}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold shrink-0 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                isActive
                  ? "bg-primary text-primary-foreground shadow-xs shadow-primary/20 font-bold"
                  : "text-muted hover:text-foreground hover:bg-surface-muted"
              )}
            >
              <Icon
                className={cn(
                  "w-3.5 h-3.5 shrink-0 transition-colors",
                  isActive ? "text-primary-foreground" : "text-muted"
                )}
                aria-hidden="true"
              />
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
