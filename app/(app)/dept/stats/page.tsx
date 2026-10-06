import * as React from "react";
import { Metadata } from "next";
import Link from "next/link";
import { Role } from "@prisma/client";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getDeptAnalyticsSummary } from "@/services/teacher-analytics";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import {
  Building2,
  BookOpen,
  Users,
  AlertTriangle,
  TrendingUp,
  Clock,
  ArrowUpRight,
  ShieldAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Department Analytics & Course Telemetry | RUET ELMS",
  description: "Departmental academic performance, course progress metrics, and attention indicator summary across all courses.",
};

export default async function DeptStatsPage() {
  const caller = await requireRole(Role.DEPT_ADMIN, Role.SUPER_ADMIN);

  let departmentId: string | null = null;

  if (caller.role === Role.DEPT_ADMIN) {
    const profile = await prisma.teacherProfile.findUnique({
      where: { userId: caller.id },
      select: { departmentId: true },
    });
    departmentId = profile?.departmentId || null;
  } else {
    // SUPER_ADMIN defaults to first department
    const firstDept = await prisma.department.findFirst({
      select: { id: true },
    });
    departmentId = firstDept?.id || null;
  }

  if (!departmentId) {
    return (
      <div className="p-8 text-center text-muted">
        No department assigned or found for this administrator account.
      </div>
    );
  }

  const data = await getDeptAnalyticsSummary(departmentId, caller);

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <PageHeader
        title={`Department Stats: ${data.departmentCode}`}
        subtitle={`Department of ${data.departmentName} • Academic performance overview across all active courses`}
        actions={
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
            <Building2 className="w-4 h-4" />
            <span>{data.departmentCode} Department</span>
          </span>
        }
      />

      {/* 1. Summary Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          label="Active Courses"
          value={data.totalCourses}
          icon={BookOpen}
          subtext="Published offerings"
        />
        <StatCard
          label="Total Enrollments"
          value={data.totalStudents}
          icon={Users}
          subtext="Active student seats"
        />
        <StatCard
          label="Department Progress"
          value={`${data.overallAverageProgress}%`}
          icon={TrendingUp}
          subtext="Across all courses"
        />
        <StatCard
          label="High Attention"
          value={data.totalHighRisk}
          icon={AlertTriangle}
          subtext="Immediate outreach"
          className={data.totalHighRisk > 0 ? "border-rose-500/30 bg-rose-500/5" : ""}
        />
        <StatCard
          label="Inactive (7+ Days)"
          value={data.totalInactive}
          icon={Clock}
          subtext="No activity logged"
          className={data.totalInactive > 0 ? "border-amber-500/30 bg-amber-500/5" : ""}
        />
      </div>

      {/* 2. Course-by-Course Table (No Student Names) */}
      <section
        aria-labelledby="course-telemetry-heading"
        className="rounded-2xl border border-border bg-surface p-6 sm:p-8 shadow-xs space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-border/60 pb-4">
          <div className="space-y-0.5">
            <h3
              id="course-telemetry-heading"
              className="text-base sm:text-lg font-bold text-foreground flex items-center gap-2"
            >
              <ShieldAlert className="w-5 h-5 text-primary" />
              <span>Course Performance &amp; Attention Summary</span>
            </h3>
            <p className="text-xs text-muted">
              Course-level aggregate metrics. Student identities are protected in department reporting.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto border border-border rounded-xl">
          <table className="w-full text-left text-xs">
            <thead className="bg-surface-muted/60 text-muted uppercase text-[11px] font-semibold border-b border-border">
              <tr>
                <th scope="col" className="py-3 px-4">Course</th>
                <th scope="col" className="py-3 px-3">Term / Year</th>
                <th scope="col" className="py-3 px-3">Enrollments</th>
                <th scope="col" className="py-3 px-3">Avg Progress</th>
                <th scope="col" className="py-3 px-3">High Attention</th>
                <th scope="col" className="py-3 px-3">Medium Attention</th>
                <th scope="col" className="py-3 px-3">Inactive (7d+)</th>
                <th scope="col" className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {data.courses.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-muted">
                    No published course offerings found in this department.
                  </td>
                </tr>
              ) : (
                data.courses.map((c) => (
                  <tr key={c.offeringId} className="hover:bg-surface-muted/30 transition-colors">
                    <td className="py-3 px-4 font-medium">
                      <div className="text-foreground font-semibold flex items-center gap-1.5">
                        <span className="font-mono text-primary font-bold">{c.courseCode}</span>
                        <span>•</span>
                        <span className="truncate max-w-[200px]">{c.courseTitle}</span>
                      </div>
                    </td>

                    <td className="py-3 px-3 text-muted">
                      {c.term} {c.academicYear}
                    </td>

                    <td className="py-3 px-3 font-semibold text-foreground">
                      {c.enrolledStudents}
                    </td>

                    <td className="py-3 px-3">
                      <div className="font-semibold text-foreground">{c.averageProgress}%</div>
                      <div className="w-16 bg-surface-muted rounded-full h-1 mt-1 overflow-hidden">
                        <div
                          className="bg-primary h-1 rounded-full"
                          style={{ width: `${c.averageProgress}%` }}
                        />
                      </div>
                    </td>

                    <td className="py-3 px-3">
                      {c.highRiskCount > 0 ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold text-[11px] bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/30">
                          {c.highRiskCount} High
                        </span>
                      ) : (
                        <span className="text-muted">0</span>
                      )}
                    </td>

                    <td className="py-3 px-3">
                      {c.mediumRiskCount > 0 ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold text-[11px] bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                          {c.mediumRiskCount} Medium
                        </span>
                      ) : (
                        <span className="text-muted">0</span>
                      )}
                    </td>

                    <td className="py-3 px-3 text-muted">
                      {c.inactiveCount > 0 ? (
                        <span className="font-medium text-amber-600 dark:text-amber-400">
                          {c.inactiveCount}
                        </span>
                      ) : (
                        "0"
                      )}
                    </td>

                    <td className="py-3 px-4 text-right">
                      <Link
                        href={`/teach/${c.offeringId}/analytics`}
                        className="inline-flex items-center gap-1 text-xs text-primary font-semibold hover:underline"
                      >
                        <span>View Class Analytics</span>
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
