import * as React from "react";
import { Suspense } from "react";
import { PageHeader } from "@/components/shared/page-header";
import {
  StudentStatsWidget,
  StudentUrgentDeadlinesWidget,
  StudentUpcomingDeadlinesWidget,
  StudentCoursesProgressWidget,
  StudentRecentGradesWidget,
  StudentRecentAnnouncementsWidget,
  StudentRecommendationsWidget,
} from "./student-widgets";
import {
  StatsRowSkeleton,
  UrgentDeadlinesSkeleton,
  CardListSkeleton,
  CoursesProgressSkeleton,
} from "./dashboard-skeletons";

export function StudentDashboardView({
  studentId,
  studentName,
  departmentName,
  batch,
  level,
  term,
}: {
  studentId: string;
  studentName: string;
  departmentName: string;
  batch: string | null;
  level: number | null;
  term: number | null;
}) {
  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome back, ${studentName}`}
        subtitle={`Student Portal • Department of ${departmentName}${
          batch ? ` (Batch ${batch})` : ""
        }${level && term ? ` • Level ${level}, Term ${term}` : ""}`}
        actions={
          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
            Even Term 2026
          </span>
        }
      />

      {/* 1. Overview Statistics */}
      <Suspense fallback={<StatsRowSkeleton count={4} />}>
        <StudentStatsWidget studentId={studentId} />
      </Suspense>

      {/* 2. Urgent Deadlines (< 24 Hours) Banner/Widget */}
      <Suspense fallback={<UrgentDeadlinesSkeleton />}>
        <StudentUrgentDeadlinesWidget studentId={studentId} />
      </Suspense>

      {/* 3. Main Grid: Courses with Progress & Upcoming Deadlines */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Suspense fallback={<CoursesProgressSkeleton />}>
            <StudentCoursesProgressWidget studentId={studentId} />
          </Suspense>

          <Suspense fallback={<CardListSkeleton count={4} />}>
            <StudentRecentGradesWidget studentId={studentId} />
          </Suspense>
        </div>

        <div className="space-y-6">
          <Suspense fallback={<CardListSkeleton count={3} />}>
            <StudentUpcomingDeadlinesWidget studentId={studentId} />
          </Suspense>

          <Suspense fallback={<CardListSkeleton count={3} />}>
            <StudentRecommendationsWidget studentId={studentId} />
          </Suspense>

          <Suspense fallback={<CardListSkeleton count={3} />}>
            <StudentRecentAnnouncementsWidget studentId={studentId} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
