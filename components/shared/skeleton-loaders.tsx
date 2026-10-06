import * as React from "react";
import { cn } from "@/lib/utils";

export type SkeletonProps = React.HTMLAttributes<HTMLDivElement>;

export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "animate-pulse rounded-md bg-surface-muted dark:bg-surface-muted/60",
        className
      )}
      {...props}
    />
  );
}

export interface SkeletonListProps {
  count?: number;
  className?: string;
}

export function SkeletonList({ count = 4, className }: SkeletonListProps) {
  return (
    <div
      role="status"
      aria-label="Loading list items..."
      className={cn("space-y-3", className)}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-[10px] border border-border bg-surface p-4 flex items-center justify-between gap-4"
        >
          <div className="space-y-2 flex-1">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-7 w-20 rounded-[8px]" />
        </div>
      ))}
      <span className="sr-only">Loading content...</span>
    </div>
  );
}

export interface SkeletonTableProps {
  rows?: number;
  columns?: number;
  className?: string;
}

export function SkeletonTable({
  rows = 5,
  columns = 4,
  className,
}: SkeletonTableProps) {
  return (
    <div
      role="status"
      aria-label="Loading table data..."
      className={cn(
        "w-full rounded-[10px] border border-border bg-surface overflow-hidden",
        className
      )}
    >
      {/* Table Header skeleton */}
      <div className="grid grid-flow-col auto-cols-fr gap-4 bg-surface-muted px-4 py-3 border-b border-border">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} className="h-4 w-3/4" />
        ))}
      </div>

      {/* Rows skeleton */}
      <div className="divide-y divide-border">
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div
            key={rowIndex}
            className="grid grid-flow-col auto-cols-fr gap-4 px-4 py-3.5 items-center"
          >
            {Array.from({ length: columns }).map((_, colIndex) => (
              <Skeleton
                key={colIndex}
                className={cn("h-3.5", colIndex === 0 ? "w-4/5" : "w-1/2")}
              />
            ))}
          </div>
        ))}
      </div>
      <span className="sr-only">Loading table...</span>
    </div>
  );
}
