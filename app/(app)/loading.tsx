import * as React from "react";
import { Skeleton, SkeletonList } from "@/components/shared/skeleton-loaders";

export default function AppLoading() {
  return (
    <div className="space-y-6 animate-in fade-in duration-200" role="status" aria-label="Loading page content">
      {/* Page Header Skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-64 max-w-full" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>

      {/* Stats / Cards Grid Skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="rounded-[10px] border border-border bg-surface p-5 space-y-3"
          >
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-8 w-8 rounded-full" />
            </div>
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-3 w-40" />
          </div>
        ))}
      </div>

      {/* Main Content List Skeleton */}
      <div className="rounded-[10px] border border-border bg-surface p-6 space-y-4">
        <Skeleton className="h-5 w-48" />
        <SkeletonList count={4} />
      </div>

      <span className="sr-only">Loading page data, please wait...</span>
    </div>
  );
}
