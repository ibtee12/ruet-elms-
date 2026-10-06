import * as React from "react";
import Link from "next/link";
import {
  getDeptAdminStats,
  getDeptAdminDraftOfferings,
} from "@/services/dashboard";
import { StatCard } from "@/components/shared/stat-card";
import {
  Users,
  GraduationCap,
  Layers,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Clock,
  BookOpen,
} from "lucide-react";

export async function DeptAdminStatsWidget({ userId }: { userId: string }) {
  const stats = await getDeptAdminStats(userId);

  return (
    <div className="space-y-6">
      {/* Overview Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Offerings"
          value={stats.offeringsByStatus.total}
          icon={Layers}
          subtext="Active academic session"
        />
        <StatCard
          label="Department Faculty"
          value={stats.teachersCount}
          icon={Users}
          subtext={`Dept. of ${stats.departmentCode}`}
        />
        <StatCard
          label="Enrolled Students"
          value={stats.studentsCount}
          icon={GraduationCap}
          subtext="Department student body"
        />
        <StatCard
          label="Draft Offerings"
          value={stats.offeringsByStatus.draft}
          icon={AlertCircle}
          subtext={
            stats.offeringsByStatus.draft === 0
              ? "All offerings published"
              : "Awaiting publication"
          }
        />
      </div>

      {/* Offerings by Status Breakdown Cards */}
      <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-foreground flex items-center gap-2">
            <Layers className="w-4 h-4 text-primary" />
            <span>Course Offerings by Status</span>
          </h2>
          <Link
            href="/dept/offerings"
            className="text-xs text-muted hover:text-foreground font-medium inline-flex items-center gap-1"
          >
            Manage Offerings <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                Draft Status
              </span>
              <p className="text-2xl font-black text-foreground mt-0.5">
                {stats.offeringsByStatus.draft}
              </p>
              <span className="text-[11px] text-muted">Awaiting review &amp; publish</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Clock className="w-5 h-5" />
            </div>
          </div>

          <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                Published &amp; Active
              </span>
              <p className="text-2xl font-black text-foreground mt-0.5">
                {stats.offeringsByStatus.published}
              </p>
              <span className="text-[11px] text-muted">Visible to students</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>

          <div className="p-4 rounded-xl border border-border/80 bg-surface-muted/30 flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-muted">
                Archived
              </span>
              <p className="text-2xl font-black text-foreground mt-0.5">
                {stats.offeringsByStatus.archived}
              </p>
              <span className="text-[11px] text-muted">Read-only historical terms</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-surface-muted text-muted flex items-center justify-center">
              <BookOpen className="w-5 h-5" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export async function DeptAdminDraftOfferingsWidget({
  userId,
}: {
  userId: string;
}) {
  const drafts = await getDeptAdminDraftOfferings(userId);

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6 shadow-xs space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-foreground flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-500" />
            <span>DRAFT Offerings Awaiting Publish</span>
          </h2>
          <p className="text-xs text-muted mt-0.5">
            Review syllabus and instructor assignments before publishing to students
          </p>
        </div>
        <Link
          href="/dept/offerings"
          className="text-xs text-muted hover:text-foreground font-medium inline-flex items-center gap-1 shrink-0"
        >
          View all <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {drafts.length === 0 ? (
        <div className="py-8 text-center rounded-xl border border-dashed border-border/80 bg-surface-muted/20">
          <CheckCircle2 className="w-8 h-8 text-emerald-600 dark:text-emerald-400 mx-auto mb-2" />
          <p className="text-sm font-medium text-foreground">
            No Draft Offerings
          </p>
          <p className="text-xs text-muted mt-1 max-w-sm mx-auto">
            All course offerings in your department are published or archived. None are waiting for publication.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border rounded-xl border border-border overflow-hidden">
          <div className="bg-surface-muted/60 p-3 hidden sm:grid sm:grid-cols-12 text-xs font-semibold text-muted">
            <div className="sm:col-span-3">Course</div>
            <div className="sm:col-span-3">Title</div>
            <div className="sm:col-span-2">Term / Year</div>
            <div className="sm:col-span-2">Assigned Faculty</div>
            <div className="sm:col-span-2 text-right">Action</div>
          </div>

          {drafts.map((off) => (
            <div
              key={off.id}
              className="p-3.5 sm:p-3 sm:grid sm:grid-cols-12 items-center gap-2 hover:bg-surface-muted/30 transition-colors"
            >
              <div className="sm:col-span-3">
                <span className="font-mono text-xs font-bold text-primary px-2 py-0.5 rounded bg-primary/10">
                  {off.courseCode}
                </span>
                <span className="ml-2 inline-flex sm:hidden text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20">
                  DRAFT
                </span>
              </div>
              <div className="sm:col-span-3 text-xs font-semibold text-foreground truncate mt-1 sm:mt-0">
                {off.courseTitle}
              </div>
              <div className="sm:col-span-2 text-xs text-muted mt-1 sm:mt-0">
                {off.term} • {off.academicYear}
              </div>
              <div className="sm:col-span-2 text-xs text-muted truncate mt-1 sm:mt-0">
                {off.teachers.length > 0
                  ? off.teachers.join(", ")
                  : "No faculty assigned"}
              </div>
              <div className="sm:col-span-2 sm:text-right mt-2 sm:mt-0">
                <Link
                  href={`/dept/offerings`}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors shadow-xs"
                >
                  Review <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
