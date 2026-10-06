import * as React from "react";
import {
  Circle,
  CheckCircle2,
  Clock,
  BadgeCheck,
  AlertCircle,
  FileEdit,
  Globe,
  Archive,
  ShieldCheck,
  AlertTriangle,
  AlertOctagon,
  Flame,
  BookOpen,
  Megaphone,
  Award,
  HelpCircle,
  MessageSquare,
  Lock,
  Pin,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type StatusType =
  | "not_submitted"
  | "submitted"
  | "submitted_late"
  | "graded"
  | "overdue"
  | "missed"
  | "draft"
  | "published"
  | "archived"
  | "risk_low"
  | "risk_medium"
  | "risk_high"
  | "notif_urgent"
  | "notif_academic"
  | "notif_general"
  | "notif_result"
  | "category_question"
  | "category_discussion"
  | "category_doubt"
  | "category_resource"
  | "thread_answered"
  | "thread_unanswered"
  | "thread_locked"
  | "thread_pinned";

interface StatusConfig {
  label: string;
  icon: LucideIcon;
  chipClass: string;
  iconClass: string;
}

const statusMap: Record<StatusType, StatusConfig> = {
  not_submitted: {
    label: "Not submitted",
    icon: Circle,
    chipClass: "bg-muted/15 text-muted dark:bg-muted/20 dark:text-muted",
    iconClass: "text-muted",
  },
  submitted: {
    label: "Submitted",
    icon: CheckCircle2,
    chipClass:
      "bg-primary/15 text-primary-hover dark:bg-primary/20 dark:text-primary font-medium",
    iconClass: "text-primary dark:text-primary",
  },
  submitted_late: {
    label: "Submitted late",
    icon: Clock,
    chipClass:
      "bg-warning/15 text-[#854D0E] dark:bg-warning/20 dark:text-warning font-medium",
    iconClass: "text-warning",
  },
  graded: {
    label: "Graded",
    icon: BadgeCheck,
    chipClass:
      "bg-success/15 text-success-text dark:bg-success/20 dark:text-success font-medium",
    iconClass: "text-success-text dark:text-success",
  },
  overdue: {
    label: "Overdue",
    icon: AlertCircle,
    chipClass:
      "bg-danger/15 text-danger dark:bg-danger/20 dark:text-danger font-medium",
    iconClass: "text-danger",
  },
  missed: {
    label: "Missed",
    icon: AlertCircle,
    chipClass:
      "bg-danger/15 text-danger dark:bg-danger/20 dark:text-danger font-medium",
    iconClass: "text-danger",
  },
  draft: {
    label: "Draft",
    icon: FileEdit,
    chipClass: "bg-muted/15 text-muted dark:bg-muted/20 dark:text-muted",
    iconClass: "text-muted",
  },
  published: {
    label: "Published",
    icon: Globe,
    chipClass:
      "bg-success/15 text-success-text dark:bg-success/20 dark:text-success font-medium",
    iconClass: "text-success-text dark:text-success",
  },
  archived: {
    label: "Archived",
    icon: Archive,
    chipClass: "bg-muted/15 text-muted dark:bg-muted/20 dark:text-muted",
    iconClass: "text-muted",
  },
  risk_low: {
    label: "Risk: Low",
    icon: ShieldCheck,
    chipClass:
      "bg-success/15 text-success-text dark:bg-success/20 dark:text-success font-medium",
    iconClass: "text-success-text dark:text-success",
  },
  risk_medium: {
    label: "Risk: Medium",
    icon: AlertTriangle,
    chipClass:
      "bg-warning/15 text-[#854D0E] dark:bg-warning/20 dark:text-warning font-medium",
    iconClass: "text-warning",
  },
  risk_high: {
    label: "Risk: High",
    icon: AlertOctagon,
    chipClass:
      "bg-danger/15 text-danger dark:bg-danger/20 dark:text-danger font-medium",
    iconClass: "text-danger",
  },
  notif_urgent: {
    label: "Urgent",
    icon: Flame,
    chipClass:
      "bg-danger/15 text-danger dark:bg-danger/20 dark:text-danger font-medium",
    iconClass: "text-danger",
  },
  notif_academic: {
    label: "Academic",
    icon: BookOpen,
    chipClass:
      "bg-warning/15 text-[#854D0E] dark:bg-warning/20 dark:text-warning font-medium",
    iconClass: "text-warning",
  },
  notif_general: {
    label: "General",
    icon: Megaphone,
    chipClass:
      "bg-info/15 text-info dark:bg-info/20 dark:text-info font-medium",
    iconClass: "text-info",
  },
  notif_result: {
    label: "Result",
    icon: Award,
    chipClass:
      "bg-success/15 text-success-text dark:bg-success/20 dark:text-success font-medium",
    iconClass: "text-success-text dark:text-success",
  },
  category_question: {
    label: "Question",
    icon: HelpCircle,
    chipClass:
      "bg-primary/15 text-primary-hover dark:bg-primary/20 dark:text-primary font-medium",
    iconClass: "text-primary dark:text-primary",
  },
  category_discussion: {
    label: "Discussion",
    icon: MessageSquare,
    chipClass:
      "bg-info/15 text-info dark:bg-info/20 dark:text-info font-medium",
    iconClass: "text-info",
  },
  category_doubt: {
    label: "Doubt",
    icon: AlertCircle,
    chipClass:
      "bg-warning/15 text-[#854D0E] dark:bg-warning/20 dark:text-warning font-medium",
    iconClass: "text-warning",
  },
  category_resource: {
    label: "Resource",
    icon: BookOpen,
    chipClass:
      "bg-muted/20 text-foreground dark:bg-muted/30 dark:text-foreground font-medium",
    iconClass: "text-foreground",
  },
  thread_answered: {
    label: "Answered",
    icon: CheckCircle2,
    chipClass:
      "bg-success/15 text-success-text dark:bg-success/20 dark:text-success font-medium",
    iconClass: "text-success-text dark:text-success",
  },
  thread_unanswered: {
    label: "Unanswered",
    icon: Clock,
    chipClass: "bg-muted/15 text-muted dark:bg-muted/20 dark:text-muted",
    iconClass: "text-muted",
  },
  thread_locked: {
    label: "Locked",
    icon: Lock,
    chipClass: "bg-muted/25 text-muted font-medium",
    iconClass: "text-muted",
  },
  thread_pinned: {
    label: "Pinned",
    icon: Pin,
    chipClass:
      "bg-primary/15 text-primary-hover dark:bg-primary/20 dark:text-primary font-medium",
    iconClass: "text-primary dark:text-primary",
  },
};

export interface StatusChipProps {
  status: StatusType | string;
  customLabel?: string;
  className?: string;
}

export function StatusChip({
  status,
  customLabel,
  className,
}: StatusChipProps) {
  // Normalize string key if passed as formatted title (e.g. "Submitted late" -> "submitted_late")
  const normalizedKey = (
    status in statusMap ? status : status.toLowerCase().replace(/[\s-:]+/g, "_")
  ) as StatusType;

  const config = statusMap[normalizedKey] || {
    label: customLabel || status,
    icon: Circle,
    chipClass: "bg-muted/15 text-muted",
    iconClass: "text-muted",
  };

  const Icon = config.icon;
  const label = customLabel || config.label;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[8px] text-[12px] leading-tight select-none border border-transparent",
        config.chipClass,
        className
      )}
    >
      <Icon
        className={cn("w-3.5 h-3.5 shrink-0", config.iconClass)}
        aria-hidden="true"
      />
      <span>{label}</span>
    </span>
  );
}
