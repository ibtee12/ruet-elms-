import * as React from "react";
import { Skeleton, SkeletonTable } from "@/components/shared/skeleton-loaders";

export default function OfferingDetailLoading() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading offering details...">
      <div className="space-y-2">
        <Skeleton className="h-7 w-80" />
        <Skeleton className="h-4 w-96" />
      </div>

      <div className="flex items-center gap-2 border-b border-border pb-3">
        <Skeleton className="h-9 w-40 rounded-lg" />
        <Skeleton className="h-9 w-40 rounded-lg" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="p-6 rounded-2xl border border-border bg-surface space-y-4">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
        <div className="p-6 rounded-2xl border border-border bg-surface space-y-4">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
      </div>

      <SkeletonTable rows={5} columns={5} />
      <span className="sr-only">Loading offering details...</span>
    </div>
  );
}
