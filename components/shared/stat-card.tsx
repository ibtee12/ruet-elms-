import * as React from "react";
import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StatCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  icon?: LucideIcon;
  trend?: {
    value: string;
    isPositive?: boolean;
  };
  className?: string;
}

export function StatCard({
  label,
  value,
  subtext,
  icon: Icon,
  trend,
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        "rounded-[10px] border border-border bg-surface p-4 sm:p-5 transition-colors",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs sm:text-sm font-medium text-muted">{label}</p>
        {Icon && (
          <div className="w-8 h-8 rounded-lg bg-surface-muted flex items-center justify-center text-muted shrink-0">
            <Icon className="w-4 h-4" />
          </div>
        )}
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground tabular-nums">
          {value}
        </span>
        {trend && (
          <span
            className={cn(
              "text-xs font-medium",
              trend.isPositive ? "text-success-text" : "text-danger"
            )}
          >
            {trend.value}
          </span>
        )}
      </div>

      {subtext && (
        <p className="mt-1 text-xs text-muted leading-normal">{subtext}</p>
      )}
    </div>
  );
}
