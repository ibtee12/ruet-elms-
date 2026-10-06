import * as React from "react";
import { Metadata } from "next";
import Link from "next/link";
import { Role } from "@prisma/client";
import { requireRole } from "@/lib/auth/session";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ProgressBar } from "@/components/shared/progress-bar";
import { getStudentEnrolledCourses } from "@/services/course-workspace";
import { KeyRound, BookOpen, GraduationCap, ArrowRight, Calendar } from "lucide-react";

export const metadata: Metadata = {
  title: "My Enrolled Courses | RUET ELMS",
  description: "View courses you are currently enrolled in.",
};

export default async function CoursesPage() {
  const caller = await requireRole(Role.STUDENT, Role.SUPER_ADMIN);
  const enrollments = await getStudentEnrolledCourses(caller.id);

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Courses"
        subtitle="Active course offerings and laboratory sections"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "My Courses" },
        ]}
        actions={
          <Link
            href="/courses/join"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-semibold shadow-xs transition-colors"
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>Join with Code</span>
          </Link>
        }
      />

      {enrollments.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No Active Enrollments"
          description="You are not enrolled in any published courses yet. Enter an instructor join code to self-enroll, or wait for your department admin to assign sections."
          action={{
            label: "Join Course with Code",
            href: "/courses/join",
          }}
          className="bg-surface py-12"
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {enrollments.map((course) => {
            const teachersText =
              course.teachers.length > 0
                ? course.teachers.map((t) => t.name).join(", ")
                : "Faculty unassigned";

            return (
              <div
                key={course.id}
                className="group rounded-2xl border border-border bg-surface p-5 shadow-xs flex flex-col justify-between hover:border-primary/40 hover:shadow-sm transition-all"
              >
                <div className="space-y-3">
                  {/* Top code and section tags */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-bold text-xs uppercase px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                      {course.code}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded bg-surface-muted text-foreground border border-border font-medium">
                      {course.sectionName}
                    </span>
                  </div>

                  {/* Title and Department/Term */}
                  <div>
                    <h2 className="text-base font-bold text-foreground line-clamp-1 group-hover:text-primary transition-colors">
                      {course.title}
                    </h2>
                    <div className="flex items-center gap-1.5 text-xs text-muted mt-1">
                      <Calendar className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        {course.term} • {course.academicYear}
                      </span>
                    </div>
                  </div>

                  {/* Teacher info */}
                  <div className="flex items-center gap-1.5 text-xs text-muted pt-1">
                    <GraduationCap className="w-3.5 h-3.5 shrink-0 text-muted" />
                    <span className="truncate">{teachersText}</span>
                  </div>

                  {/* Material progress */}
                  <div className="pt-2 border-t border-border/70">
                    <ProgressBar
                      value={course.materialProgress.percentage}
                      label={`Material Progress (${course.materialProgress.completed}/${course.materialProgress.total})`}
                      showPercent={true}
                      className="text-[11px]"
                    />
                  </div>
                </div>

                {/* Footer link to course workspace */}
                <div className="pt-4 mt-3 border-t border-border flex items-center justify-between">
                  <span className="text-[11px] text-muted">
                    {course.credits} Credits
                  </span>

                  <Link
                    href={`/courses/${course.id}`}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary-hover transition-colors group-hover:translate-x-0.5"
                  >
                    <span>Enter Course</span>
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
