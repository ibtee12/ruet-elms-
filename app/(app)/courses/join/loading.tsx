import * as React from "react";
import { Skeleton } from "@/components/shared/skeleton-loaders";

export default function JoinCourseLoading() {
  return (
    <div className="max-w-xl mx-auto space-y-6 py-6" aria-busy="true" aria-label="Loading join course form">
      {/* Page Header Skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-80" />
      </div>

      {/* Form Card Skeleton */}
      <div className="p-6 rounded-2xl border border-border bg-surface shadow-xs space-y-5">
        <div className="flex items-start gap-3.5">
          <Skeleton className="w-10 h-10 rounded-xl shrink-0" />
          <div className="space-y-2 flex-1">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>

        <div className="space-y-2 pt-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-11 w-full rounded-lg" />
          <Skeleton className="h-3 w-72" />
        </div>

        <div className="pt-2 flex items-center justify-between">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-9 w-28 rounded-lg" />
        </div>
      </div>
    </div>
  );
}
