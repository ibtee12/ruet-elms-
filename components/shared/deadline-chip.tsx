"use client";

import * as React from "react";
import { Clock, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  formatDhaka,
  formatRelative,
  getDeadlineUrgency,
} from "@/lib/datetime";

export interface DeadlineChipProps {
  deadline: Date | string | number;
  baseDate?: Date;
  className?: string;
}

export function DeadlineChip({
  deadline,
  baseDate,
  className,
}: DeadlineChipProps) {
  const [showTooltip, setShowTooltip] = React.useState(false);
  const deadlineDate = new Date(deadline);
  const urgency = getDeadlineUrgency(deadlineDate, baseDate);
  const relativeText = formatRelative(deadlineDate, baseDate, {
    isDeadline: true,
  });
  const absoluteText = formatDhaka(deadlineDate, "full");

  const isDanger = urgency === "danger";
  const isWarning = urgency === "warning";

  const Icon = isDanger ? AlertCircle : Clock;

  return (
    <div
      className="relative inline-block"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      onFocus={() => setShowTooltip(true)}
      onBlur={() => setShowTooltip(false)}
    >
      <span
        tabIndex={0}
        role="note"
        aria-label={`${relativeText}, exactly ${absoluteText}`}
        className={cn(
          "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[8px] text-[12px] font-medium leading-tight select-none border transition-colors cursor-help focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
          isDanger &&
            "bg-danger/15 text-danger border-danger/30 dark:bg-danger/20 dark:text-danger",
          isWarning &&
            "bg-warning/15 text-[#854D0E] border-warning/30 dark:bg-warning/20 dark:text-warning",
          !isDanger &&
            !isWarning &&
            "bg-surface-muted text-muted border-border hover:bg-surface-muted/80",
          className
        )}
      >
        <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>{relativeText}</span>
      </span>

      {/* Tooltip on hover / keyboard focus */}
      {showTooltip && (
        <div
          role="tooltip"
          className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2.5 py-1 rounded-md text-[11px] font-normal bg-foreground text-background whitespace-nowrap shadow-md pointer-events-none animate-in fade-in zoom-in-95 duration-150"
        >
          {absoluteText}
        </div>
      )}
    </div>
  );
}
