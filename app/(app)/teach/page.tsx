import * as React from "react";
import { Metadata } from "next";
import Link from "next/link";
import { Role } from "@prisma/client";
import { requireRole } from "@/lib/auth/session";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusChip } from "@/components/shared/status-chip";
import { getTeacherOfferings } from "@/services/course-workspace";
import { BookOpen, Users, Layers, ArrowRight, Calendar } from "lucide-react";

export const metadata: Metadata = {
  title: "Teacher Portal | RUET ELMS",
  description: "Manage your assigned course offerings, sections, and learning materials.",
};

export default async function TeacherPortalPage() {
  const caller = await requireRole(Role.TEACHER, Role.SUPER_ADMIN);
  const offerings = await getTeacherOfferings(
    caller.id,
    caller.role === Role.SUPER_ADMIN
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Teaching Course Offerings"
        subtitle="Manage materials, assignments, student rosters, and assessments"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Teaching Portal" },
        ]}
      />

      {offerings.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No Assigned Course Offerings"
          description="You are not currently assigned as an instructor or teaching assistant for any course offerings. Department administrators assign faculty to offerings."
          className="bg-surface py-12"
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {offerings.map((off) => {
            return (
              <div
                key={off.id}
                className="group rounded-2xl border border-border bg-surface p-5 shadow-xs flex flex-col justify-between hover:border-primary/40 hover:shadow-sm transition-all"
              >
                <div className="space-y-3">
                  {/* Top code and teacher role badge */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-bold text-xs uppercase px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                      {off.code}
                    </span>
                    <span
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                        off.myRole === "INSTRUCTOR"
                          ? "bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/20"
                          : "bg-surface-muted text-muted border-border"
                      }`}
                    >
                      {off.myRole === "INSTRUCTOR" ? "Instructor" : "Teaching Assistant"}
                    </span>
                  </div>

                  {/* Title and Department/Term */}
                  <div>
                    <h2 className="text-base font-bold text-foreground line-clamp-1 group-hover:text-primary transition-colors">
                      {off.title}
                    </h2>
                    <div className="flex items-center gap-1.5 text-xs text-muted mt-1">
                      <Calendar className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        {off.term} {off.academicYear} • Dept. of {off.departmentCode}
                      </span>
                    </div>
                  </div>

                  {/* Sections and Students count */}
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/80 text-xs">
                    <div className="flex items-center gap-1.5 text-muted">
                      <Layers className="w-3.5 h-3.5" />
                      <span>{off.sectionCount} Section(s)</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-muted">
                      <Users className="w-3.5 h-3.5" />
                      <span>{off.totalStudents} Student(s)</span>
                    </div>
                  </div>
                </div>

                {/* Status chip and Workspace link */}
                <div className="pt-4 mt-3 border-t border-border flex items-center justify-between">
                  <StatusChip status={off.status.toLowerCase()} />

                  <Link
                    href={`/teach/${off.id}`}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary-hover transition-colors group-hover:translate-x-0.5"
                  >
                    <span>Open Workspace</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
