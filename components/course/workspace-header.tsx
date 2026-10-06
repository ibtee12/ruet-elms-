import * as React from "react";
import Link from "next/link";
import { ArrowLeft, BookOpen, GraduationCap, Calendar, Award } from "lucide-react";
import { StatusChip } from "@/components/shared/status-chip";
import { WorkspaceHeaderData } from "@/services/course-workspace";

interface WorkspaceHeaderProps {
  data: WorkspaceHeaderData;
  portal: "student" | "teacher";
}

export function WorkspaceHeader({ data, portal }: WorkspaceHeaderProps) {
  const backHref = portal === "student" ? "/courses" : "/teach";
  const backLabel = portal === "student" ? "Back to My Courses" : "Back to Teaching Portal";

  // Format teacher string: e.g. "Dr. A. Rahman (Instructor), C. Sultana (TA)"
  const teachersList =
    data.teachers.length > 0
      ? data.teachers
          .map((t) => `${t.name} (${t.role === "INSTRUCTOR" ? "Instructor" : "TA"})`)
          .join(", ")
      : "No faculty assigned yet";

  return (
    <div className="space-y-4">
      {/* Back button link */}
      <div>
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-foreground font-medium transition-colors group"
        >
          <ArrowLeft className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5" />
          <span>{backLabel}</span>
        </Link>
      </div>

      {/* Main course card header */}
      <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono font-bold text-xs uppercase px-2.5 py-1 rounded-md bg-primary/10 text-primary border border-primary/20">
              {data.code}
            </span>
            <span className="text-xs px-2.5 py-1 rounded-md bg-surface-muted text-muted font-medium border border-border">
              Dept. of {data.departmentCode}
            </span>
            {data.sectionName && (
              <span className="text-xs px-2.5 py-1 rounded-md bg-primary/5 text-primary border border-primary/15 font-semibold">
                {data.sectionName}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {portal === "teacher" && (
              <StatusChip status={data.status.toLowerCase()} />
            )}
            {data.myRole && portal === "teacher" && (
              <span
                className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${
                  data.myRole === "INSTRUCTOR"
                    ? "bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/20"
                    : "bg-surface-muted text-muted border-border"
                }`}
              >
                {data.myRole === "INSTRUCTOR" ? "Instructor" : "Teaching Assistant"}
              </span>
            )}
          </div>
        </div>

        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">
            {data.title}
          </h1>
          <p className="text-xs sm:text-sm text-muted mt-1">
            {data.departmentName}
          </p>
        </div>

        {/* Metadata info strip */}
        <div className="pt-3 border-t border-border/80 flex flex-wrap items-center gap-y-2 gap-x-5 text-xs text-muted">
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-muted shrink-0" />
            <span>
              {data.term} • {data.academicYear}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <Award className="w-3.5 h-3.5 text-muted shrink-0" />
            <span>{data.credits} Credits</span>
          </div>

          <div className="flex items-center gap-1.5">
            <GraduationCap className="w-3.5 h-3.5 text-muted shrink-0" />
            <span className="font-medium text-foreground">
              {teachersList}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
