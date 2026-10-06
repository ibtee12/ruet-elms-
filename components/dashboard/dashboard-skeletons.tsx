import * as React from "react";
import { Skeleton } from "@/components/shared/skeleton-loaders";

export function StatsRowSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-2xl border border-border bg-surface p-5 space-y-3"
        >
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-9 w-9 rounded-xl" />
          </div>
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-3 w-32" />
        </div>
      ))}
    </div>
  );
}

export function UrgentDeadlinesSkeleton() {
  return (
    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5 space-y-3 animate-pulse">
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-44 bg-amber-500/20" />
        <Skeleton className="h-5 w-24 bg-amber-500/20" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
        <div className="p-4 rounded-xl border border-amber-500/20 bg-surface/80 space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
        <div className="p-4 rounded-xl border border-amber-500/20 bg-surface/80 space-y-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      </div>
    </div>
  );
}

export function CardListSkeleton({
  count = 3,
}: {
  count?: number;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6 shadow-xs space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-20" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            className="p-4 rounded-xl border border-border/80 bg-surface-muted/30 flex items-center justify-between gap-4"
          >
            <div className="space-y-2 flex-1">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <Skeleton className="h-7 w-20 rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function CoursesProgressSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6 shadow-xs space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-4 w-24" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="p-4 rounded-xl border border-border/80 bg-surface-muted/30 space-y-3"
          >
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-16" />
            </div>
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-2 w-full rounded-full" />
            <div className="flex justify-between">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-3 w-12" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TableWidgetSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6 shadow-xs space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-4 w-24" />
      </div>
      <div className="divide-y divide-border rounded-xl border border-border overflow-hidden">
        <div className="bg-surface-muted/60 p-3 flex gap-4">
          <Skeleton className="h-4 w-1/4" />
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-4 w-1/6" />
          <Skeleton className="h-4 w-1/6" />
        </div>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="p-3.5 flex gap-4 items-center">
            <Skeleton className="h-3.5 w-1/4" />
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3.5 w-1/6" />
            <Skeleton className="h-3.5 w-1/6" />
          </div>
        ))}
      </div>
    </div>
  );
}
