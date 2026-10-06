import * as React from "react";
import Link from "next/link";
import {
  getStudentOverview,
  getStudentUrgentDeadlines,
  getStudentUpcomingDeadlines,
  getStudentCoursesWithProgress,
  getStudentRecentGrades,
  getStudentRecentAnnouncements,
} from "@/services/dashboard";
import { StatCard } from "@/components/shared/stat-card";
import { ProgressBar } from "@/components/shared/progress-bar";
import { formatDhaka, formatRelative } from "@/lib/datetime";
import { SafeHtml } from "@/lib/sanitize";
import {
  BookOpen,
  Calendar,
  GraduationCap,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Award,
  Megaphone,
  ArrowRight,
  FolderOpen,
  Inbox,
  AlertCircle,
  Sparkles,
  Tag,
} from "lucide-react";
import { getStudentTopRecommendations } from "@/services/student-progress";

export async function StudentStatsWidget({ studentId }: { studentId: string }) {
  const data = await getStudentOverview(studentId);
  const courses = await getStudentCoursesWithProgress(studentId);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        label="Enrolled Courses"
        value={courses.length}
        icon={BookOpen}
        subtext="Active course offerings"
      />
      <StatCard
        label="Pending Submissions"
        value={data.pendingSubmissionsCount}
        icon={AlertCircle}
        subtext={
          data.pendingSubmissionsCount === 0
            ? "All assignments submitted"
            : "Requires your submission"
        }
      />
      <StatCard
        label="Academic Level"
        value={
          data.level && data.term
            ? `L-${data.level}, T-${data.term}`
            : "Active Student"
        }
        icon={GraduationCap}
        subtext={data.batch ? `Batch ${data.batch}` : "Academic standing"}
      />
      <StatCard
        label="Department"
        value={data.departmentName}
        icon={Calendar}
        subtext="RUET Faculty"
      />
    </div>
  );
}

export async function StudentUrgentDeadlinesWidget({
  studentId,
}: {
  studentId: string;
}) {
  const urgent = await getStudentUrgentDeadlines(studentId);

  if (urgent.length === 0) {
    return (
      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 sm:p-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              No Urgent Deadlines
            </h3>
            <p className="text-xs text-muted">
              You have no assignments due within the next 24 hours. Great job staying ahead!
            </p>
          </div>
        </div>
        <Link
          href="/assignments"
          className="text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline shrink-0 hidden sm:inline-flex items-center gap-1"
        >
          View all assignments <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 dark:bg-rose-950/20 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 animate-pulse" />
          <h2 className="text-base font-bold text-foreground">
            Urgent Deadlines (<span className="text-rose-600 dark:text-rose-400">{urgent.length}</span>)
          </h2>
          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/20">
            Due in &lt; 24h
          </span>
        </div>
        <Link
          href="/assignments"
          className="text-xs font-medium text-rose-600 dark:text-rose-400 hover:underline inline-flex items-center gap-1"
        >
          All Assignments <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {urgent.map((item) => (
          <div
            key={item.assignmentId}
            className="p-4 rounded-xl border border-rose-500/20 bg-surface shadow-xs flex flex-col justify-between gap-3"
          >
            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="font-mono text-xs font-bold text-rose-600 dark:text-rose-400 px-2 py-0.5 rounded bg-rose-500/10">
                  {item.courseCode}
                </span>
                <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-600 dark:text-rose-400">
                  <Clock className="w-3.5 h-3.5" />
                  {item.hoursRemaining === 1
                    ? "Due in ~1 hour"
                    : `Due in ~${item.hoursRemaining} hours`}
                </span>
              </div>
              <h3 className="text-sm font-bold text-foreground line-clamp-1">
                {item.assignmentTitle}
              </h3>
              <p className="text-xs text-muted line-clamp-1">
                {item.courseTitle} • Max Marks: {item.maxMarks}
              </p>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-border/60">
              <span className="text-xs text-muted">
                {formatDhaka(item.deadline, "short")}
              </span>
              <Link
                href={`/courses/${item.offeringId}/assignments/${item.assignmentId}`}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700 transition-colors shadow-xs"
              >
                Submit Now <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export async function StudentUpcomingDeadlinesWidget({
  studentId,
}: {
  studentId: string;
}) {
  const deadlines = await getStudentUpcomingDeadlines(studentId);

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6 shadow-xs space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-foreground flex items-center gap-2">
          <Clock className="w-4 h-4 text-primary" />
          <span>Upcoming Deadlines</span>
        </h2>
        <Link
          href="/assignments"
          className="text-xs text-muted hover:text-foreground font-medium inline-flex items-center gap-1"
        >
          View all <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {deadlines.length === 0 ? (
        <div className="py-8 text-center rounded-xl border border-dashed border-border/80 bg-surface-muted/20">
          <Inbox className="w-8 h-8 text-muted mx-auto mb-2" />
          <p className="text-sm font-medium text-foreground">
            No Upcoming Deadlines
          </p>
          <p className="text-xs text-muted mt-1 max-w-sm mx-auto">
            You don&apos;t have any published assignments due right now.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {deadlines.slice(0, 5).map((item) => (
            <div
              key={item.assignmentId}
              className="p-3.5 rounded-xl border border-border/80 bg-surface-muted/30 hover:bg-surface-muted/50 transition-colors flex items-center justify-between gap-3"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] font-bold text-primary px-1.5 py-0.5 rounded bg-primary/10">
                    {item.courseCode}
                  </span>
                  <Link
                    href={`/courses/${item.offeringId}/assignments/${item.assignmentId}`}
                    className="text-xs font-bold text-foreground hover:underline truncate"
                  >
                    {item.assignmentTitle}
                  </Link>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-muted">
                  <span>{formatRelative(item.deadline, new Date(), { isDeadline: true })}</span>
                  <span>•</span>
                  <span>{formatDhaka(item.deadline, "short")}</span>
                  <span>•</span>
                  <span>{item.maxMarks} marks</span>
                </div>
              </div>

              <div className="shrink-0 flex items-center gap-2">
                {item.isSubmitted ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                    <CheckCircle2 className="w-3 h-3" /> Submitted
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20">
                    Pending
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export async function StudentCoursesProgressWidget({
  studentId,
}: {
  studentId: string;
}) {
  const courses = await getStudentCoursesWithProgress(studentId);

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6 shadow-xs space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-foreground flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-primary" />
          <span>My Enrolled Courses</span>
        </h2>
        <Link
          href="/courses"
          className="text-xs text-muted hover:text-foreground font-medium inline-flex items-center gap-1"
        >
          All courses <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {courses.length === 0 ? (
        <div className="py-8 text-center rounded-xl border border-dashed border-border/80 bg-surface-muted/20">
          <FolderOpen className="w-8 h-8 text-muted mx-auto mb-2" />
          <p className="text-sm font-medium text-foreground">
            No Active Courses
          </p>
          <p className="text-xs text-muted mt-1 max-w-sm mx-auto">
            You are not currently enrolled in any published courses for this term.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {courses.map((course) => (
            <div
              key={course.offeringId}
              className="p-4 rounded-xl border border-border/80 bg-surface-muted/20 hover:border-primary/40 hover:bg-surface-muted/40 transition-all flex flex-col justify-between gap-3"
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-bold text-primary px-2 py-0.5 rounded bg-primary/10 border border-primary/20">
                    {course.courseCode}
                  </span>
                  <span className="text-[11px] font-medium text-muted">
                    {course.term}
                  </span>
                </div>
                <h3 className="text-sm font-bold text-foreground line-clamp-1">
                  {course.courseTitle}
                </h3>
                <p className="text-[11px] text-muted line-clamp-1">
                  Faculty: {course.teachers.length > 0 ? course.teachers.join(", ") : "Instructors Assigned"}
                </p>
              </div>

              <div className="space-y-1.5 pt-2 border-t border-border/50">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted">Material Progress</span>
                  <span className="font-semibold text-foreground">
                    {course.completedMaterials} / {course.totalPublishedMaterials} completed
                  </span>
                </div>
                <ProgressBar
                  value={course.progressPercent}
                  max={100}
                  showPercent={false}
                  className="space-y-0"
                />
              </div>

              <div className="flex justify-end pt-1">
                <Link
                  href={`/courses/${course.offeringId}`}
                  className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1"
                >
                  Enter Course <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export async function StudentRecentGradesWidget({
  studentId,
}: {
  studentId: string;
}) {
  const grades = await getStudentRecentGrades(studentId, 5);

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6 shadow-xs space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-foreground flex items-center gap-2">
          <Award className="w-4 h-4 text-primary" />
          <span>Recent Grades</span>
        </h2>
        <Link
          href="/grades"
          className="text-xs text-muted hover:text-foreground font-medium inline-flex items-center gap-1"
        >
          Full Gradebook <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {grades.length === 0 ? (
        <div className="py-8 text-center rounded-xl border border-dashed border-border/80 bg-surface-muted/20">
          <Award className="w-8 h-8 text-muted mx-auto mb-2" />
          <p className="text-sm font-medium text-foreground">
            No Graded Submissions Yet
          </p>
          <p className="text-xs text-muted mt-1 max-w-sm mx-auto">
            Your marks will be displayed here once teachers review and publish evaluations.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {grades.map((g) => {
            const percentage = Math.round((g.finalMarks / g.maxMarks) * 100);
            return (
              <div
                key={g.submissionId}
                className="p-3.5 rounded-xl border border-border/80 bg-surface-muted/30 flex items-center justify-between gap-3"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] font-bold text-primary px-1.5 py-0.5 rounded bg-primary/10">
                      {g.courseCode}
                    </span>
                    <span className="text-xs font-bold text-foreground truncate">
                      {g.assignmentTitle}
                    </span>
                  </div>
                  {g.feedback && (
                    <p className="text-[11px] text-muted italic line-clamp-1">
                      &ldquo;{g.feedback}&rdquo;
                    </p>
                  )}
                  <span className="text-[10px] text-muted block">
                    Graded on {formatDhaka(g.gradedAt, "short")}
                  </span>
                </div>

                <div className="shrink-0 text-right">
                  <span className="text-sm font-extrabold text-foreground">
                    {g.finalMarks} / {g.maxMarks}
                  </span>
                  <span className="block text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                    {percentage}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export async function StudentRecentAnnouncementsWidget({
  studentId,
}: {
  studentId: string;
}) {
  const announcements = await getStudentRecentAnnouncements(studentId, 5);

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6 shadow-xs space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-foreground flex items-center gap-2">
          <Megaphone className="w-4 h-4 text-primary" />
          <span>Recent Announcements</span>
        </h2>
        <span className="text-xs text-muted">Course &amp; Department Notices</span>
      </div>

      {announcements.length === 0 ? (
        <div className="py-8 text-center rounded-xl border border-dashed border-border/80 bg-surface-muted/20">
          <Megaphone className="w-8 h-8 text-muted mx-auto mb-2" />
          <p className="text-sm font-medium text-foreground">
            No Announcements
          </p>
          <p className="text-xs text-muted mt-1 max-w-sm mx-auto">
            There are no recent announcements for your courses or department.
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
                      Department Notice
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

export async function StudentRecommendationsWidget({
  studentId,
}: {
  studentId: string;
}) {
  const recommendations = await getStudentTopRecommendations(studentId, 3);

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6 shadow-xs space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-foreground flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <span>Recommended for You</span>
        </h2>
        <span className="text-xs text-muted">Focused Review</span>
      </div>

      {recommendations.length === 0 ? (
        <div className="py-7 text-center rounded-xl border border-dashed border-border/80 bg-surface-muted/20">
          <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2 opacity-80" />
          <p className="text-sm font-semibold text-foreground">
            You&apos;re All Caught Up!
          </p>
          <p className="text-xs text-muted mt-1 max-w-xs mx-auto">
            No remedial materials recommended right now. Keep up the great work across all your courses!
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {recommendations.map((rec) => (
            <div
              key={rec.id}
              className="p-3.5 rounded-xl border border-border/80 bg-surface-muted/30 flex items-center justify-between gap-3 hover:border-primary/40 transition-colors"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  {rec.courseCode && (
                    <span className="font-mono font-bold text-[10px] uppercase px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                      {rec.courseCode}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted">
                    <Tag className="w-3 h-3 text-primary" />
                    <span>{rec.topicName}</span>
                  </span>
                </div>
                <h3 className="text-xs sm:text-sm font-semibold text-foreground truncate">
                  {rec.title}
                </h3>
              </div>

              <a
                href={rec.openUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary-hover shadow-xs transition-colors"
              >
                <span>Study</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
