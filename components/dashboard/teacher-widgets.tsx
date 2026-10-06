import * as React from "react";
import Link from "next/link";
import {
  getTeacherOfferings,
  getTeacherWaitingForGrading,
  getTeacherUpcomingDeadlines,
  getTeacherRecentAnnouncements,
} from "@/services/dashboard";
import { StatCard } from "@/components/shared/stat-card";
import { formatDhaka, formatRelative } from "@/lib/datetime";
import { SafeHtml } from "@/lib/sanitize";
import {
  BookOpen,
  CheckCircle2,
  FileCheck2,
  Clock,
  Megaphone,
  ArrowRight,
  FolderOpen,
  ClipboardList,
  Users,
} from "lucide-react";

export async function TeacherStatsWidget({
  teacherId,
  departmentName,
  designation,
}: {
  teacherId: string;
  departmentName: string;
  designation: string;
}) {
  const [offerings, waitingForGrading] = await Promise.all([
    getTeacherOfferings(teacherId),
    getTeacherWaitingForGrading(teacherId),
  ]);

  const totalUngraded = waitingForGrading.reduce(
    (acc, curr) => acc + curr.ungradedCount,
    0
  );

  const totalStudents = offerings.reduce(
    (acc, curr) => acc + curr.enrolledStudentsCount,
    0
  );

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        label="Teaching Offerings"
        value={offerings.length}
        icon={BookOpen}
        subtext="Allocated course sections"
      />
      <StatCard
        label="To Be Graded"
        value={totalUngraded}
        icon={ClipboardList}
        subtext={
          totalUngraded === 0
            ? "Inbox zero — all caught up"
            : "Submissions awaiting grading"
        }
      />
      <StatCard
        label="Enrolled Students"
        value={totalStudents}
        icon={Users}
        subtext="Across all course offerings"
      />
      <StatCard
        label="Faculty Designation"
        value={designation}
        icon={CheckCircle2}
        subtext={`Dept. of ${departmentName}`}
      />
    </div>
  );
}

export async function TeacherWaitingForGradingWidget({
  teacherId,
}: {
  teacherId: string;
}) {
  const items = await getTeacherWaitingForGrading(teacherId);

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6 shadow-xs space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-foreground flex items-center gap-2">
          <FileCheck2 className="w-4 h-4 text-amber-500" />
          <span>Submissions Waiting for Grading</span>
        </h2>
        <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20">
          Queue
        </span>
      </div>

      {items.length === 0 ? (
        <div className="py-8 text-center rounded-xl border border-dashed border-border/80 bg-surface-muted/20">
          <CheckCircle2 className="w-8 h-8 text-emerald-600 dark:text-emerald-400 mx-auto mb-2" />
          <p className="text-sm font-medium text-foreground">
            All caught up!
          </p>
          <p className="text-xs text-muted mt-1 max-w-sm mx-auto">
            There are no student submissions waiting for your grading right now.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div
              key={item.assignmentId}
              className="p-4 rounded-xl border border-border/80 bg-surface-muted/30 flex items-center justify-between gap-4"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-primary px-2 py-0.5 rounded bg-primary/10">
                    {item.courseCode}
                  </span>
                  <h3 className="text-sm font-bold text-foreground truncate">
                    {item.assignmentTitle}
                  </h3>
                </div>
                <p className="text-xs text-muted">
                  <span className="font-bold text-amber-600 dark:text-amber-400">
                    {item.ungradedCount}
                  </span>{" "}
                  ungraded of {item.totalSubmissionsCount} total submissions
                </p>
              </div>

              <Link
                href={`/teach/${item.offeringId}/assignments/${item.assignmentId}/submissions`}
                className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors shadow-xs"
              >
                Grade ({item.ungradedCount}) <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export async function TeacherOfferingsWidget({
  teacherId,
}: {
  teacherId: string;
}) {
  const offerings = await getTeacherOfferings(teacherId);

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6 shadow-xs space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-foreground flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-primary" />
          <span>My Course Offerings</span>
        </h2>
        <Link
          href="/teach"
          className="text-xs text-muted hover:text-foreground font-medium inline-flex items-center gap-1"
        >
          View all <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {offerings.length === 0 ? (
        <div className="py-8 text-center rounded-xl border border-dashed border-border/80 bg-surface-muted/20">
          <FolderOpen className="w-8 h-8 text-muted mx-auto mb-2" />
          <p className="text-sm font-medium text-foreground">
            No Course Offerings
          </p>
          <p className="text-xs text-muted mt-1 max-w-sm mx-auto">
            You are not assigned to any course offerings for the active academic session.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {offerings.map((offering) => (
            <div
              key={offering.id}
              className="p-4 rounded-xl border border-border/80 bg-surface-muted/20 hover:border-primary/40 hover:bg-surface-muted/40 transition-all flex flex-col justify-between gap-3"
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-bold text-primary px-2 py-0.5 rounded bg-primary/10 border border-primary/20">
                    {offering.courseCode}
                  </span>
                  <span
                    className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                      offering.status === "PUBLISHED"
                        ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20"
                        : offering.status === "DRAFT"
                        ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20"
                        : "bg-surface-muted text-muted border border-border"
                    }`}
                  >
                    {offering.status}
                  </span>
                </div>
                <h3 className="text-sm font-bold text-foreground line-clamp-1">
                  {offering.courseTitle}
                </h3>
                <p className="text-xs text-muted">
                  {offering.term} • {offering.academicYear} • Role: {offering.role}
                </p>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-border/50 text-xs">
                <span className="text-muted">
                  {offering.enrolledStudentsCount} students enrolled
                </span>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/teach/${offering.id}/gradebook`}
                    className="text-xs font-medium text-muted hover:text-foreground"
                  >
                    Gradebook
                  </Link>
                  <Link
                    href={`/teach/${offering.id}`}
                    className="text-xs font-bold text-primary hover:underline inline-flex items-center gap-0.5"
                  >
                    Manage <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export async function TeacherUpcomingDeadlinesWidget({
  teacherId,
}: {
  teacherId: string;
}) {
  const deadlines = await getTeacherUpcomingDeadlines(teacherId, 5);

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6 shadow-xs space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-foreground flex items-center gap-2">
          <Clock className="w-4 h-4 text-primary" />
          <span>Upcoming Deadlines in My Courses</span>
        </h2>
        <span className="text-xs text-muted">Active Assignments</span>
      </div>

      {deadlines.length === 0 ? (
        <div className="py-8 text-center rounded-xl border border-dashed border-border/80 bg-surface-muted/20">
          <Clock className="w-8 h-8 text-muted mx-auto mb-2" />
          <p className="text-sm font-medium text-foreground">
            No Upcoming Deadlines
          </p>
          <p className="text-xs text-muted mt-1 max-w-sm mx-auto">
            No active assignment deadlines scheduled in your courses.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {deadlines.map((item) => (
            <div
              key={item.assignmentId}
              className="p-3.5 rounded-xl border border-border/80 bg-surface-muted/30 flex items-center justify-between gap-3"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] font-bold text-primary px-1.5 py-0.5 rounded bg-primary/10">
                    {item.courseCode}
                  </span>
                  <Link
                    href={`/teach/${item.offeringId}/assignments`}
                    className="text-xs font-bold text-foreground hover:underline truncate"
                  >
                    {item.assignmentTitle}
                  </Link>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-muted">
                  <span>{formatRelative(item.deadline, new Date(), { isDeadline: true })}</span>
                  <span>•</span>
                  <span>{formatDhaka(item.deadline, "short")}</span>
                </div>
              </div>

              <div className="shrink-0 text-right">
                <span className="text-xs font-bold text-foreground">
                  {item.submittedCount} / {item.enrolledCount}
                </span>
                <span className="block text-[10px] text-muted">submitted</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export async function TeacherRecentAnnouncementsWidget({
  teacherId,
}: {
  teacherId: string;
}) {
  const announcements = await getTeacherRecentAnnouncements(teacherId, 5);

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6 shadow-xs space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-foreground flex items-center gap-2">
          <Megaphone className="w-4 h-4 text-primary" />
          <span>Recent Announcements</span>
        </h2>
        <span className="text-xs text-muted">Notices</span>
      </div>

      {announcements.length === 0 ? (
        <div className="py-8 text-center rounded-xl border border-dashed border-border/80 bg-surface-muted/20">
          <Megaphone className="w-8 h-8 text-muted mx-auto mb-2" />
          <p className="text-sm font-medium text-foreground">
            No Announcements
          </p>
          <p className="text-xs text-muted mt-1 max-w-sm mx-auto">
            No announcements have been posted for your courses or department.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {announcements.map((ann) => (
            <div
              key={ann.id}
              className="p-4 rounded-xl border border-border/80 bg-surface-muted/30 space-y-2"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {ann.courseCode ? (
                    <span className="font-mono font-bold text-[10px] uppercase px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                      {ann.courseCode}
                    </span>
                  ) : (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20">
                      Department
                    </span>
                  )}
                  <h3 className="text-xs font-bold text-foreground">
                    {ann.title}
                  </h3>
                </div>
                <span className="text-[11px] text-muted">
                  {formatDhaka(ann.createdAt, "short")}
                </span>
              </div>

              <SafeHtml
                html={ann.body}
                className="text-xs text-muted leading-relaxed line-clamp-2"
              />

              <div className="text-[10px] text-muted pt-1">
                By {ann.authorName}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
