import * as React from "react";
import { Skeleton, SkeletonTable } from "@/components/shared/skeleton-loaders";

export default function OfferingStudentsLoading() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading student roster...">
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-7 w-72" />
        <Skeleton className="h-4 w-96" />
      </div>

      <div className="p-4 rounded-xl border border-border bg-surface flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-24 rounded-lg" />
          <Skeleton className="h-8 w-24 rounded-lg" />
        </div>
        <Skeleton className="h-8 w-28 rounded-lg" />
      </div>

      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-9 w-64 rounded-lg" />
        <Skeleton className="h-9 w-32 rounded-lg" />
      </div>

      <SkeletonTable rows={8} columns={7} />
      <span className="sr-only">Loading student roster...</span>
    </div>
  );
}
