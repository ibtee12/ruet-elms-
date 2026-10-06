"use client";

import * as React from "react";
import Link from "next/link";
import { StudentCourseProgressData } from "@/services/student-progress";
import { formatDhaka } from "@/lib/datetime";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  CheckCircle2,
  AlertTriangle,
  BookOpen,
  FileCheck2,
  HelpCircle,
  Download,
  ExternalLink,
  Video,
  FileText,
  Sparkles,
  Info,
  Tag,
  ArrowRight,
  Clock,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface StudentProgressViewProps {
  data: StudentCourseProgressData;
}

export function StudentProgressView({ data }: StudentProgressViewProps) {
  const {
    breakdown,
    weeklyActivity,
    trendSentence,
    topicPerformances,
    weakTopics,
    hasTopicTags,
    recommendations,
    weakTopicThreshold,
  } = data;

  const maxWeeklyCount = Math.max(
    ...weeklyActivity.weeks.map((w) => w.count),
    5
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* 1. Progress Card */}
      <section
        aria-labelledby="progress-overview-heading"
        className="rounded-2xl border border-border bg-surface p-6 sm:p-8 shadow-xs relative overflow-hidden"
      >
        {/* Decorative background glow */}
        <div
          className="absolute -top-24 -right-24 w-72 h-72 bg-primary/10 rounded-full blur-3xl pointer-events-none"
          aria-hidden="true"
        />

        <div className="relative space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/60 pb-5">
            <div>
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-primary/10 text-primary">
                  <TrendingUp className="w-5 h-5" />
                </span>
                <h2
                  id="progress-overview-heading"
                  className="text-lg sm:text-xl font-bold tracking-tight text-foreground"
                >
                  My Course Progress
                </h2>
              </div>
              <p className="text-xs sm:text-sm text-muted mt-1">
                Aggregated metric combining materials viewed, assignments submitted, and quiz outcomes.
              </p>
            </div>

            {/* Disclaimer pill */}
            <div
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20 shrink-0 self-start sm:self-auto"
              role="note"
            >
              <Info className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>{breakdown.disclaimer}</span>
            </div>
          </div>

          {/* Overall Progress Gauge & Metric */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-center">
            <div className="md:col-span-1 flex flex-col items-center justify-center p-4 rounded-xl bg-surface-muted/60 border border-border/40 text-center">
              <span className="text-4xl sm:text-5xl font-extrabold tracking-tight text-primary">
                {breakdown.progress}%
              </span>
              <span className="text-xs font-semibold uppercase tracking-wider text-muted mt-1">
                Overall Progress
              </span>
              <div className="w-full bg-border rounded-full h-2 mt-3 overflow-hidden">
                <div
                  className="bg-primary h-2 rounded-full transition-all duration-700 ease-out"
                  style={{ width: `${Math.min(100, Math.max(0, breakdown.progress))}%` }}
                  aria-hidden="true"
                />
              </div>
            </div>

            {/* Breakdown Sub-bars */}
            <div className="md:col-span-3 grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Lectures */}
              <div className="p-4 rounded-xl border border-border bg-surface hover:border-primary/40 transition-colors">
                <div className="flex items-center justify-between text-xs text-muted mb-1.5">
                  <span className="flex items-center gap-1.5 font-medium text-foreground">
                    <BookOpen className="w-4 h-4 text-primary" />
                    <span>Lectures</span>
                  </span>
                  <span className="font-semibold text-foreground">
                    {breakdown.lecturePercent}%
                  </span>
                </div>
                <div className="w-full bg-surface-muted rounded-full h-1.5 overflow-hidden mb-2">
                  <div
                    className="bg-primary h-1.5 rounded-full transition-all duration-500"
                    style={{ width: `${breakdown.lecturePercent}%` }}
                    aria-hidden="true"
                  />
                </div>
                <div className="text-[11px] text-muted">
                  {breakdown.completedMaterials} of {breakdown.totalMaterials} materials completed
                </div>
              </div>

              {/* Assignments */}
              <div className="p-4 rounded-xl border border-border bg-surface hover:border-primary/40 transition-colors">
                <div className="flex items-center justify-between text-xs text-muted mb-1.5">
                  <span className="flex items-center gap-1.5 font-medium text-foreground">
                    <FileCheck2 className="w-4 h-4 text-teal-accent" />
                    <span>Assignments</span>
                  </span>
                  <span className="font-semibold text-foreground">
                    {breakdown.assignmentPercent}%
                  </span>
                </div>
                <div className="w-full bg-surface-muted rounded-full h-1.5 overflow-hidden mb-2">
                  <div
                    className="bg-teal-accent h-1.5 rounded-full transition-all duration-500"
                    style={{ width: `${breakdown.assignmentPercent}%` }}
                    aria-hidden="true"
                  />
                </div>
                <div className="text-[11px] text-muted">
                  {breakdown.submittedDueAssignments} of {breakdown.totalDueAssignments} due submitted
                </div>
              </div>

              {/* Quizzes */}
              <div className="p-4 rounded-xl border border-border bg-surface hover:border-primary/40 transition-colors">
                <div className="flex items-center justify-between text-xs text-muted mb-1.5">
                  <span className="flex items-center gap-1.5 font-medium text-foreground">
                    <HelpCircle className="w-4 h-4 text-purple-500" />
                    <span>Quizzes</span>
                  </span>
                  <span className="font-semibold text-foreground">
                    {breakdown.quizPercent !== null ? `${breakdown.quizPercent}%` : "N/A"}
                  </span>
                </div>
                <div className="w-full bg-surface-muted rounded-full h-1.5 overflow-hidden mb-2">
                  <div
                    className="bg-purple-500 h-1.5 rounded-full transition-all duration-500"
                    style={{ width: `${breakdown.quizPercent || 0}%` }}
                    aria-hidden="true"
                  />
                </div>
                <div className="text-[11px] text-muted">
                  {breakdown.attemptedQuizzes} of {breakdown.totalQuizzes} quizzes attempted
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Weekly Activity Chart (last 8 weeks) */}
      <section
        aria-labelledby="activity-trends-heading"
        className="rounded-2xl border border-border bg-surface p-6 sm:p-8 shadow-xs space-y-6"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3
              id="activity-trends-heading"
              className="text-base sm:text-lg font-bold text-foreground"
            >
              Weekly Activity (Last 8 Weeks)
            </h3>
            <p className="text-xs text-muted mt-0.5">
              Course engagement events recorded per week
            </p>
          </div>

          {/* Plain-Language Trend Sentence Badge */}
          <div
            className={cn(
              "inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold shrink-0 self-start sm:self-auto",
              weeklyActivity.weekOverWeekChange > 0
                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20"
                : weeklyActivity.weekOverWeekChange < 0
                ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20"
                : "bg-surface-muted text-muted border border-border"
            )}
          >
            {weeklyActivity.weekOverWeekChange > 0 ? (
              <TrendingUp className="w-4 h-4" aria-hidden="true" />
            ) : weeklyActivity.weekOverWeekChange < 0 ? (
              <TrendingDown className="w-4 h-4" aria-hidden="true" />
            ) : (
              <Minus className="w-4 h-4" aria-hidden="true" />
            )}
            <span>{trendSentence}</span>
          </div>
        </div>

        {/* Accessible Bar Chart */}
        <div
          role="region"
          aria-label="Weekly Activity Bar Chart for the last 8 weeks"
          className="space-y-4"
        >
          <div className="h-44 sm:h-52 flex items-end gap-2 sm:gap-4 pt-4 pb-2 border-b border-border">
            {weeklyActivity.weeks
              .slice()
              .reverse()
              .map((bucket, idx) => {
                const heightPercent =
                  maxWeeklyCount > 0 ? (bucket.count / maxWeeklyCount) * 100 : 0;
                const isCurrentWeek = idx === 7;

                return (
                  <div
                    key={bucket.weekIndex}
                    className="flex-1 flex flex-col items-center h-full justify-end group relative"
                  >
                    {/* Tooltip on hover */}
                    <div className="absolute -top-10 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity bg-navy text-white text-[11px] font-medium py-1 px-2.5 rounded-md pointer-events-none shadow-md z-10 whitespace-nowrap">
                      {bucket.count} events ({formatDhaka(bucket.startDate, "date")})
                    </div>

                    {/* Bar */}
                    <div
                      className={cn(
                        "w-full max-w-[36px] rounded-t-lg transition-all duration-500 group-hover:brightness-110",
                        isCurrentWeek
                          ? "bg-primary"
                          : "bg-primary/40 hover:bg-primary/70"
                      )}
                      style={{
                        height: `${Math.max(6, heightPercent)}%`,
                      }}
                      tabIndex={0}
                      role="img"
                      aria-label={`Week of ${formatDhaka(bucket.startDate, "date")}: ${bucket.count} activities`}
                    />

                    {/* Week label */}
                    <span className="text-[10px] sm:text-xs text-muted font-medium mt-2">
                      {isCurrentWeek ? "This Wk" : `W-${8 - idx}`}
                    </span>
                  </div>
                );
              })}
          </div>

          {/* Accessible Text Alternative Table (Screen Reader & High Contrast users) */}
          <div className="sr-only">
            <table aria-label="8-week course activity details">
              <thead>
                <tr>
                  <th scope="col">Week</th>
                  <th scope="col">Date Range</th>
                  <th scope="col">Activity Count</th>
                </tr>
              </thead>
              <tbody>
                {weeklyActivity.weeks.map((w) => (
                  <tr key={w.weekIndex}>
                    <td>Week {w.weekNumber}</td>
                    <td>
                      {formatDhaka(w.startDate, "date")} – {formatDhaka(w.endDate, "date")}
                    </td>
                    <td>{w.count} events</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* 3. Topic Performance */}
      <section
        aria-labelledby="topic-performance-heading"
        className="rounded-2xl border border-border bg-surface p-6 sm:p-8 shadow-xs space-y-6"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-border/60 pb-4">
          <div>
            <h3
              id="topic-performance-heading"
              className="text-base sm:text-lg font-bold text-foreground"
            >
              Topic Performance
            </h3>
            <p className="text-xs text-muted mt-0.5">
              Knowledge retention based on questions answered in quizzes and assessments.
            </p>
          </div>
          <span className="text-xs text-muted font-medium">
            Weak threshold: &lt; {weakTopicThreshold}%
          </span>
        </div>

        {topicPerformances.length === 0 ? (
          <div className="text-center py-10 px-4 rounded-xl border border-dashed border-border bg-surface-muted/30">
            <Tag className="w-8 h-8 text-muted mx-auto mb-2 opacity-60" />
            <p className="text-sm font-semibold text-foreground">No topic evaluations yet</p>
            <p className="text-xs text-muted mt-1 max-w-sm mx-auto">
              Topic performance will calculate automatically as you complete quizzes containing topic-tagged questions.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {topicPerformances.map((tp) => (
              <div
                key={tp.topicId}
                className={cn(
                  "p-4 rounded-xl border transition-all",
                  tp.isWeak
                    ? "border-amber-500/30 bg-amber-500/5 hover:border-amber-500/50"
                    : "border-border bg-surface hover:border-border/80"
                )}
              >
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={cn(
                        "w-2 h-2 rounded-full shrink-0",
                        tp.isWeak ? "bg-amber-500" : "bg-emerald-500"
                      )}
                      aria-hidden="true"
                    />
                    <h4 className="text-sm font-semibold text-foreground truncate">
                      {tp.topicName}
                    </h4>
                  </div>

                  <span
                    className={cn(
                      "text-xs font-bold px-2 py-0.5 rounded-full",
                      tp.isWeak
                        ? "bg-amber-500/20 text-amber-700 dark:text-amber-300"
                        : "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                    )}
                  >
                    {tp.percentage}%
                  </span>
                </div>

                <div className="w-full bg-border/60 rounded-full h-1.5 overflow-hidden mb-2">
                  <div
                    className={cn(
                      "h-1.5 rounded-full transition-all duration-500",
                      tp.isWeak ? "bg-amber-500" : "bg-emerald-500"
                    )}
                    style={{ width: `${Math.min(100, Math.max(0, tp.percentage))}%` }}
                    aria-hidden="true"
                  />
                </div>

                <div className="flex items-center justify-between text-[11px] text-muted">
                  <span>
                    {tp.earnedMarks} / {tp.maxMarks} marks ({tp.questionCount} question
                    {tp.questionCount > 1 ? "s" : ""})
                  </span>
                  <span>{tp.isWeak ? "Review suggested" : "On track"}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 4. Recommendations */}
      <section
        aria-labelledby="recommendations-heading"
        className="rounded-2xl border border-border bg-surface p-6 sm:p-8 shadow-xs space-y-6"
      >
        <div className="border-b border-border/60 pb-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <h3
              id="recommendations-heading"
              className="text-base sm:text-lg font-bold text-foreground"
            >
              Recommended Study Materials
            </h3>
          </div>
          <p className="text-xs text-muted mt-0.5">
            Tailored study materials to reinforce topics scored below {weakTopicThreshold}%. Uncompleted materials are highlighted first.
          </p>
        </div>

        {/* Case A: No topic tags exist in course */}
        {!hasTopicTags ? (
          <div className="text-center py-12 px-4 rounded-xl border border-dashed border-border bg-surface-muted/30">
            <BookOpen className="w-10 h-10 text-muted mx-auto mb-3 opacity-50" />
            <h4 className="text-sm font-semibold text-foreground">
              No topic recommendations yet
            </h4>
            <p className="text-xs text-muted mt-1 max-w-md mx-auto">
              Recommendations appear when the teacher tags materials and assessments with learning topics. Check the Materials tab for all published course content.
            </p>
            <div className="mt-4">
              <Link
                href={`/courses/${data.offeringId}/materials`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface border border-border text-xs font-semibold text-foreground hover:bg-surface-muted transition-colors"
              >
                <span>Browse Course Materials</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        ) : weakTopics.length === 0 ? (
          /* Case B: Encouraging empty state when student has no weak topics */
          <div className="text-center py-12 px-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h4 className="text-base font-bold text-emerald-800 dark:text-emerald-300">
              Outstanding Work!
            </h4>
            <p className="text-xs sm:text-sm text-emerald-700/90 dark:text-emerald-400/90 mt-1 max-w-md mx-auto">
              You are performing above {weakTopicThreshold}% in all evaluated topics. No remediation materials are required right now. Keep up the consistent effort!
            </p>
          </div>
        ) : recommendations.length === 0 ? (
          /* Case C: Weak topics exist, but no materials tagged with them */
          <div className="text-center py-10 px-4 rounded-xl border border-dashed border-border bg-surface-muted/30">
            <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-2 opacity-80" />
            <h4 className="text-sm font-semibold text-foreground">
              No specific materials tagged for your weak topics
            </h4>
            <p className="text-xs text-muted mt-1 max-w-sm mx-auto">
              Your instructor has not yet tagged reading materials for {weakTopics.map((w) => w.topicName).join(", ")}. Consult your instructor or teaching assistant for supplemental guidance.
            </p>
          </div>
        ) : (
          /* Case D: Render Recommendations */
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {recommendations.map((rec) => (
              <div
                key={rec.id}
                className={cn(
                  "p-4 rounded-xl border flex flex-col justify-between transition-all",
                  !rec.isCompleted
                    ? "border-primary/40 bg-surface shadow-2xs hover:border-primary"
                    : "border-border bg-surface-muted/30 hover:border-border/80"
                )}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-primary/10 text-primary border border-primary/20">
                      <Tag className="w-3 h-3" />
                      <span>{rec.topicName}</span>
                    </span>

                    {rec.isCompleted ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Completed</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                        <Clock className="w-3.5 h-3.5" />
                        <span>Not yet completed</span>
                      </span>
                    )}
                  </div>

                  <div className="flex items-start gap-3 pt-1">
                    <div className="w-8 h-8 rounded-lg bg-surface-muted border border-border flex items-center justify-center shrink-0 text-muted">
                      {rec.type === "VIDEO" ? (
                        <Video className="w-4 h-4 text-purple-500" />
                      ) : rec.type === "LINK" ? (
                        <ExternalLink className="w-4 h-4 text-sky-500" />
                      ) : (
                        <FileText className="w-4 h-4 text-primary" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <h4 className="text-sm font-semibold text-foreground leading-snug line-clamp-1">
                        {rec.title}
                      </h4>
                      {rec.description && (
                        <p className="text-xs text-muted line-clamp-2 mt-0.5">
                          {rec.description}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between gap-2">
                  <Link
                    href={`/courses/${data.offeringId}/materials`}
                    className="text-xs text-muted hover:text-foreground transition-colors"
                  >
                    View in Course
                  </Link>

                  <a
                    href={rec.openUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary-hover text-xs font-semibold shadow-xs transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Open Material</span>
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
