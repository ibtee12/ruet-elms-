import * as React from "react";
import { Suspense } from "react";
import { PageHeader } from "@/components/shared/page-header";
import {
  DeptAdminStatsWidget,
  DeptAdminDraftOfferingsWidget,
} from "./dept-admin-widgets";
import {
  StatsRowSkeleton,
  TableWidgetSkeleton,
} from "./dashboard-skeletons";

export function DeptAdminDashboardView({
  userId,
  userName,
  departmentName,
  departmentCode,
}: {
  userId: string;
  userName: string;
  departmentName: string;
  departmentCode: string;
}) {
  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome back, ${userName}`}
        subtitle={`Department Administration • Department of ${departmentName} (${departmentCode})`}
        actions={
          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
            Admin Console
          </span>
        }
      />

      {/* 1. Status breakdown and faculty/student statistics */}
      <Suspense fallback={<StatsRowSkeleton count={4} />}>
        <DeptAdminStatsWidget userId={userId} />
      </Suspense>

      {/* 2. Draft offerings awaiting publish */}
      <Suspense fallback={<TableWidgetSkeleton rows={4} />}>
        <DeptAdminDraftOfferingsWidget userId={userId} />
      </Suspense>
    </div>
  );
}
