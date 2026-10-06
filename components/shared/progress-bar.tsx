import * as React from "react";
import { cn } from "@/lib/utils";

export interface ProgressBarProps {
  value: number; // 0 to 100
  max?: number;
  label?: string;
  showPercent?: boolean;
  className?: string;
  barClassName?: string;
}

export function ProgressBar({
  value,
  max = 100,
  label,
  showPercent = true,
  className,
  barClassName,
}: ProgressBarProps) {
  const percentage = Math.min(
    100,
    Math.max(0, Math.round((value / max) * 100))
  );

  return (
    <div className={cn("w-full space-y-1.5", className)}>
      {(label || showPercent) && (
        <div className="flex items-center justify-between text-xs text-muted">
          {label && (
            <span className="font-medium text-foreground">{label}</span>
          )}
          {showPercent && (
            <span className="font-medium tabular-nums ml-auto text-foreground">
              {percentage}%
            </span>
          )}
        </div>
      )}

      <div
        role="progressbar"
        aria-valuenow={percentage}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label || `Progress: ${percentage}%`}
        className="h-2 w-full bg-surface-muted rounded-full overflow-hidden border border-border/50"
      >
        <div
          className={cn(
            "h-full bg-primary rounded-full transition-all duration-300 ease-out",
            barClassName
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
