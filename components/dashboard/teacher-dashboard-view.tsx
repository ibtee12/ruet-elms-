import * as React from "react";
import { Suspense } from "react";
import { PageHeader } from "@/components/shared/page-header";
import {
  TeacherStatsWidget,
  TeacherWaitingForGradingWidget,
  TeacherOfferingsWidget,
  TeacherUpcomingDeadlinesWidget,
  TeacherRecentAnnouncementsWidget,
} from "./teacher-widgets";
import {
  StatsRowSkeleton,
  CardListSkeleton,
  CoursesProgressSkeleton,
} from "./dashboard-skeletons";

export function TeacherDashboardView({
  teacherId,
  teacherName,
  designation,
  departmentName,
}: {
  teacherId: string;
  teacherName: string;
  designation: string;
  departmentName: string;
}) {
  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome back, ${designation} ${teacherName}`}
        subtitle={`Faculty Dashboard • Department of ${departmentName}`}
        actions={
          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
            Even Term 2026
          </span>
        }
      />

      {/* 1. Stat cards */}
      <Suspense fallback={<StatsRowSkeleton count={4} />}>
        <TeacherStatsWidget
          teacherId={teacherId}
          departmentName={departmentName}
          designation={designation}
        />
      </Suspense>

      {/* 2. Main 2-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Suspense fallback={<CardListSkeleton count={3} />}>
            <TeacherWaitingForGradingWidget teacherId={teacherId} />
          </Suspense>

          <Suspense fallback={<CoursesProgressSkeleton />}>
            <TeacherOfferingsWidget teacherId={teacherId} />
          </Suspense>
        </div>

        <div className="space-y-6">
          <Suspense fallback={<CardListSkeleton count={3} />}>
            <TeacherUpcomingDeadlinesWidget teacherId={teacherId} />
          </Suspense>

          <Suspense fallback={<CardListSkeleton count={3} />}>
            <TeacherRecentAnnouncementsWidget teacherId={teacherId} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
