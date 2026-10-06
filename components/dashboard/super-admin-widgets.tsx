import * as React from "react";
import Link from "next/link";
import {
  getSuperAdminCounts,
  getSuperAdminAuditLogs,
} from "@/services/dashboard";
import { StatCard } from "@/components/shared/stat-card";
import { formatRelative } from "@/lib/datetime";
import {
  Users,
  Building2,
  BookOpen,
  Layers,
  ShieldCheck,
  ShieldAlert,
  ArrowRight,
  GraduationCap,
} from "lucide-react";

export async function SuperAdminCountsWidget() {
  const counts = await getSuperAdminCounts();

  return (
    <div className="space-y-6">
      {/* Institutional Resource Totals */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Registered Users"
          value={counts.usersByRole.total}
          icon={Users}
          subtext="Total institutional accounts"
        />
        <StatCard
          label="Departments"
          value={counts.departmentsCount}
          icon={Building2}
          subtext="Academic faculties"
        />
        <StatCard
          label="Course Catalog"
          value={counts.coursesCount}
          icon={BookOpen}
          subtext="Curriculum syllabus courses"
        />
        <StatCard
          label="Active Offerings"
          value={counts.offeringsCount}
          icon={Layers}
          subtext="Even Term 2026 courses"
        />
      </div>

      {/* Users by Role Breakdown */}
      <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-foreground flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            <span>User Distribution by Role</span>
          </h2>
          <Link
            href="/admin/users"
            className="text-xs text-muted hover:text-foreground font-medium inline-flex items-center gap-1"
          >
            Manage Users <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl border border-border/80 bg-surface-muted/30">
            <div className="flex items-center justify-between text-xs font-semibold text-muted mb-1">
              <span>Students</span>
              <GraduationCap className="w-4 h-4 text-blue-500" />
            </div>
            <p className="text-2xl font-black text-foreground">
              {counts.usersByRole.student}
            </p>
            <span className="text-[11px] text-muted">Learner accounts</span>
          </div>

          <div className="p-4 rounded-xl border border-border/80 bg-surface-muted/30">
            <div className="flex items-center justify-between text-xs font-semibold text-muted mb-1">
              <span>Faculty</span>
              <BookOpen className="w-4 h-4 text-emerald-500" />
            </div>
            <p className="text-2xl font-black text-foreground">
              {counts.usersByRole.teacher}
            </p>
            <span className="text-[11px] text-muted">Instructors &amp; TAs</span>
          </div>

          <div className="p-4 rounded-xl border border-border/80 bg-surface-muted/30">
            <div className="flex items-center justify-between text-xs font-semibold text-muted mb-1">
              <span>Dept Admins</span>
              <Building2 className="w-4 h-4 text-amber-500" />
            </div>
            <p className="text-2xl font-black text-foreground">
              {counts.usersByRole.deptAdmin}
            </p>
            <span className="text-[11px] text-muted">Department heads</span>
          </div>

          <div className="p-4 rounded-xl border border-border/80 bg-surface-muted/30">
            <div className="flex items-center justify-between text-xs font-semibold text-muted mb-1">
              <span>Super Admins</span>
              <ShieldCheck className="w-4 h-4 text-rose-500" />
            </div>
            <p className="text-2xl font-black text-foreground">
              {counts.usersByRole.superAdmin}
            </p>
            <span className="text-[11px] text-muted">System executives</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export async function SuperAdminAuditLogsWidget() {
  const auditLogs = await getSuperAdminAuditLogs(10);

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6 shadow-xs space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-foreground flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-primary" />
            <span>Recent System Audit Logs</span>
          </h2>
          <p className="text-xs text-muted mt-0.5">
            Latest 10 security and governance activity entries across the platform
          </p>
        </div>
        <Link
          href="/admin/audit-logs"
          className="text-xs text-muted hover:text-foreground font-medium inline-flex items-center gap-1 shrink-0"
        >
          Full Audit Trail <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {auditLogs.length === 0 ? (
        <div className="py-8 text-center rounded-xl border border-dashed border-border/80 bg-surface-muted/20">
          <ShieldAlert className="w-8 h-8 text-muted mx-auto mb-2" />
          <p className="text-sm font-medium text-foreground">
            No Audit Logs Recorded
          </p>
          <p className="text-xs text-muted mt-1 max-w-sm mx-auto">
            Audit logging will record user actions and administrative updates.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border rounded-xl border border-border overflow-hidden">
          <div className="bg-surface-muted/60 p-3 hidden sm:grid sm:grid-cols-12 text-xs font-semibold text-muted">
            <div className="sm:col-span-3">Action</div>
            <div className="sm:col-span-4">Description</div>
            <div className="sm:col-span-3">Actor</div>
            <div className="sm:col-span-2 text-right">Time</div>
          </div>

          {auditLogs.map((log) => (
            <div
              key={log.id}
              className="p-3.5 sm:p-3 sm:grid sm:grid-cols-12 items-center gap-2 hover:bg-surface-muted/30 transition-colors"
            >
              <div className="sm:col-span-3">
                <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-surface-muted text-foreground border border-border">
                  {log.action}
                </span>
              </div>
              <div className="sm:col-span-4 text-xs text-foreground truncate mt-1 sm:mt-0" title={log.description || undefined}>
                {log.description || "—"}
              </div>
              <div className="sm:col-span-3 text-xs text-muted truncate mt-1 sm:mt-0">
                <span className="font-medium text-foreground">{log.actorName}</span>
                <span className="block text-[10px] text-muted">{log.actorEmail}</span>
              </div>
              <div className="sm:col-span-2 sm:text-right text-[11px] text-muted mt-1 sm:mt-0">
                {formatRelative(log.createdAt, new Date())}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
