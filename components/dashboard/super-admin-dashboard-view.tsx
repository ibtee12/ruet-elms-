import * as React from "react";
import { Suspense } from "react";
import { PageHeader } from "@/components/shared/page-header";
import {
  SuperAdminCountsWidget,
  SuperAdminAuditLogsWidget,
} from "./super-admin-widgets";
import {
  StatsRowSkeleton,
  TableWidgetSkeleton,
} from "./dashboard-skeletons";

export function SuperAdminDashboardView({
  userName,
}: {
  userName: string;
}) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="System Administration Dashboard"
        subtitle={`Welcome back, ${userName} • Rajshahi University of Engineering & Technology`}
        actions={
          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
            Super Admin
          </span>
        }
      />

      {/* 1. Global counts: users by role, catalog courses, offerings, departments */}
      <Suspense fallback={<StatsRowSkeleton count={4} />}>
        <SuperAdminCountsWidget />
      </Suspense>

      {/* 2. Recent audit logs */}
      <Suspense fallback={<TableWidgetSkeleton rows={10} />}>
        <SuperAdminAuditLogsWidget />
      </Suspense>
    </div>
  );
}
