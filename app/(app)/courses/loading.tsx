import * as React from "react";
import { Skeleton } from "@/components/shared/skeleton-loaders";

export default function CoursesLoading() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading enrolled courses...">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-border bg-surface p-5 shadow-xs space-y-4"
          >
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-20 rounded" />
              <Skeleton className="h-5 w-16 rounded" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-3.5 w-1/2" />
            </div>
            <div className="pt-3 border-t border-border flex items-center justify-between">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-3.5 w-16" />
            </div>
          </div>
        ))}
      </div>
      <span className="sr-only">Loading enrolled courses...</span>
    </div>
  );
}
