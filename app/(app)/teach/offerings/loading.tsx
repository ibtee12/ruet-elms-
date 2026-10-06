import * as React from "react";
import { Skeleton } from "@/components/shared/skeleton-loaders";

export default function TeachOfferingsLoading() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading assigned course offerings...">
      <div className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-96" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-border bg-surface p-5 shadow-xs space-y-4"
          >
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-24 rounded" />
              <Skeleton className="h-5 w-28 rounded-full" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-5 w-4/5" />
              <Skeleton className="h-3.5 w-3/5" />
            </div>
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border">
              <Skeleton className="h-3.5 w-20" />
              <Skeleton className="h-3.5 w-20" />
            </div>
            <div className="pt-3 border-t border-border flex items-center justify-between">
              <Skeleton className="h-3.5 w-20" />
              <Skeleton className="h-4 w-24" />
            </div>
          </div>
        ))}
      </div>
      <span className="sr-only">Loading assigned offerings...</span>
    </div>
  );
}
