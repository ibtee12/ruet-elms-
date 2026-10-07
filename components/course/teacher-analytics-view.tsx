"use client";

import * as React from "react";
import { useState } from "react";
import Link from "next/link";
import { RiskLevel } from "@prisma/client";
import { TeacherOfferingAnalyticsData } from "@/services/teacher-analytics";
import { StatCard } from "@/components/shared/stat-card";
import { formatDhaka, formatRelative } from "@/lib/datetime";
import {
  Users,
  TrendingUp,
  FileCheck2,
  HelpCircle,
  AlertTriangle,
  Clock,
  Download,
  ChevronDown,
  ChevronUp,
  Award,
  AlertCircle,
  CheckCircle2,
  Layers,
  ArrowUpRight,
  ShieldAlert,
  BarChart3,
  Calendar,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface TeacherAnalyticsViewProps {
  data: TeacherOfferingAnalyticsData;
}

export function TeacherAnalyticsView({ data }: TeacherAnalyticsViewProps) {
  const {
    stats,
    gradeDistribution,
    assignmentSubmissionRates,
    topicPerformance,
    hardestTopic,
    strongestTopic,
    weeklyActivity,
    students,
  } = data;

  const [levelFilter, setLevelFilter] = useState<"ALL" | "HIGH" | "MEDIUM" | "LOW">("ALL");
  const [expandedStudentIds, setExpandedStudentIds] = useState<Set<string>>(new Set());

  const toggleExpand = (studentId: string) => {
    setExpandedStudentIds((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) {
        next.delete(studentId);
      } else {
        next.add(studentId);
      }
      return next;
    });
  };

  const filteredStudents = students.filter((s) => {
    if (levelFilter === "ALL") return true;
    return s.riskLevel === levelFilter;
  });

  const maxWeeklyCount = Math.max(
    ...weeklyActivity.weeks.map((w) => w.count),
    5
  );

  // Empty state for offering with zero enrolled students
  if (stats.enrolledStudents === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-surface p-12 text-center space-y-4 animate-in fade-in">
        <div className="w-16 h-16 rounded-full bg-surface-muted border border-border flex items-center justify-center mx-auto text-muted">
          <Users className="w-8 h-8 opacity-60" />
        </div>
        <div className="max-w-md mx-auto space-y-1">
          <h2 className="text-lg font-bold text-foreground">
            No enrolled students yet
          </h2>
          <p className="text-xs sm:text-sm text-muted">
            This course offering does not currently have any actively enrolled students. Class performance analytics, risk assessments, and submission charts will populate automatically once students join.
          </p>
        </div>
        <div className="pt-2">
          <Link
            href={`/teach/${data.offeringId}/students`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold shadow-xs hover:bg-primary-hover transition-colors"
          >
            <span>Manage Student Enrollments</span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* 1. Stat Cards Row */}
      <section aria-labelledby="analytics-overview-heading" className="space-y-4">
        <h2 id="analytics-overview-heading" className="sr-only">
          Class Analytics Overview
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          <StatCard
            label="Enrolled Students"
            value={stats.enrolledStudents}
            icon={Users}
            subtext="Active in class"
          />
          <StatCard
            label="Average Progress"
            value={`${stats.averageProgress}%`}
            icon={TrendingUp}
            subtext="Overall class mean"
          />
          <StatCard
            label="Assignment Completion"
            value={`${stats.assignmentCompletionRate}%`}
            icon={FileCheck2}
            subtext="Due items submitted"
          />
          <StatCard
            label="Average Quiz Score"
            value={stats.averageQuizPercent !== null ? `${stats.averageQuizPercent}%` : "N/A"}
            icon={HelpCircle}
            subtext="Best attempt mean"
          />
          <StatCard
            label="At-Risk Students"
            value={stats.atRiskCount}
            icon={AlertTriangle}
            subtext={`${stats.highRiskCount} High • ${stats.mediumRiskCount} Medium`}
            className={stats.highRiskCount > 0 ? "border-rose-500/30 bg-rose-500/5" : ""}
          />
          <StatCard
            label="Inactive (7+ Days)"
            value={stats.inactiveCount}
            icon={Clock}
            subtext="No activity logged"
            className={stats.inactiveCount > 0 ? "border-amber-500/30 bg-amber-500/5" : ""}
          />
        </div>
      </section>

      {/* 2. Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1: Grade Distribution */}
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-border/60 pb-3">
            <div>
              <h3 className="text-base font-bold text-foreground">
                Grade &amp; Progress Distribution
              </h3>
              <p className="text-xs text-muted">
                Student distribution by progress brackets
              </p>
            </div>
            <Award className="w-5 h-5 text-primary" />
          </div>

          <div className="space-y-3 pt-2">
            {gradeDistribution.map((bracket) => (
              <div key={bracket.label} className="space-y-1">
                <div className="flex items-center justify-between text-xs font-medium">
                  <span className="flex items-center gap-2 text-foreground">
                    <span className={cn("w-2 h-2 rounded-full", bracket.colorClass)} />
                    <span className="font-semibold">{bracket.label}</span>
                    <span className="text-muted">({bracket.description})</span>
                  </span>
                  <span className="text-muted font-mono">
                    {bracket.count} students ({bracket.percentage}%)
                  </span>
                </div>
                <div className="w-full bg-surface-muted rounded-full h-2 overflow-hidden">
                  <div
                    className={cn("h-2 rounded-full transition-all duration-500", bracket.colorClass)}
                    style={{ width: `${bracket.percentage}%` }}
                    aria-hidden="true"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Chart 2: Weekly Activity for Class */}
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-border/60 pb-3">
            <div>
              <h3 className="text-base font-bold text-foreground">
                Class Weekly Activity
              </h3>
              <p className="text-xs text-muted">
                Engagement events for the last 8 weeks
              </p>
            </div>
            <BarChart3 className="w-5 h-5 text-primary" />
          </div>

          <div
            role="region"
            aria-label="Class Activity Bar Chart"
            className="h-44 sm:h-52 flex items-end gap-2 sm:gap-3 pt-4 pb-2 border-b border-border"
          >
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
                    <div className="absolute -top-10 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity bg-navy text-white text-[11px] font-medium py-1 px-2 rounded-md pointer-events-none shadow-md z-10 whitespace-nowrap">
                      {bucket.count} events ({formatDhaka(bucket.startDate, "date")})
                    </div>
                    <div
                      className={cn(
                        "w-full max-w-[28px] rounded-t-lg transition-all duration-500",
                        isCurrentWeek ? "bg-primary" : "bg-primary/40 hover:bg-primary/70"
                      )}
                      style={{ height: `${Math.max(6, heightPercent)}%` }}
                      tabIndex={0}
                      role="img"
                      aria-label={`Week of ${formatDhaka(bucket.startDate, "date")}: ${bucket.count} events`}
                    />
                    <span className="text-[10px] sm:text-xs text-muted font-medium mt-2">
                      {isCurrentWeek ? "This Wk" : `W-${8 - idx}`}
                    </span>
                  </div>
                );
              })}
          </div>

          {/* Accessible Table Alternative */}
          <div className="sr-only">
            <table>
              <thead>
                <tr>
                  <th>Week</th>
                  <th>Dates</th>
                  <th>Events</th>
                </tr>
              </thead>
              <tbody>
                {weeklyActivity.weeks.map((w) => (
                  <tr key={w.weekIndex}>
                    <td>Week {w.weekNumber}</td>
                    <td>{formatDhaka(w.startDate, "date")}</td>
                    <td>{w.count} events</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Chart 3: Topic Performance (Sorted Worst to Best) */}
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-border/60 pb-3">
            <div>
              <h3 className="text-base font-bold text-foreground">
                Topic Performance (Sorted Worst to Best)
              </h3>
              <p className="text-xs text-muted">
                Class average scores on questions grouped by topic
              </p>
            </div>
            <Layers className="w-5 h-5 text-primary" />
          </div>

          {/* Callouts for Hardest and Strongest Topics */}
          {(hardestTopic || strongestTopic) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-2">
              {hardestTopic && (
                <div className="p-3 rounded-xl border border-rose-500/20 bg-rose-500/5 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-rose-700 dark:text-rose-400">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>Hardest Topic</span>
                  </div>
                  <div className="text-sm font-semibold text-foreground truncate">
                    {hardestTopic.topicName}
                  </div>
                  <div className="text-xs text-muted">
                    Class Average: <span className="font-bold text-rose-600 dark:text-rose-400">{hardestTopic.classAveragePercent}%</span>
                  </div>
                </div>
              )}

              {strongestTopic && (
                <div className="p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Strongest Topic</span>
                  </div>
                  <div className="text-sm font-semibold text-foreground truncate">
                    {strongestTopic.topicName}
                  </div>
                  <div className="text-xs text-muted">
                    Class Average: <span className="font-bold text-emerald-600 dark:text-emerald-400">{strongestTopic.classAveragePercent}%</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {topicPerformance.length === 0 ? (
            <p className="text-xs text-muted text-center py-6">
              No quiz questions are tagged with topics yet.
            </p>
          ) : (
            <div className="space-y-3">
              {topicPerformance.map((tp) => (
                <div key={tp.topicId} className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-medium">
                    <span className="text-foreground font-semibold truncate max-w-[200px]">
                      {tp.topicName}
                    </span>
                    <span
                      className={cn(
                        "font-mono font-bold",
                        tp.classAveragePercent < 50
                          ? "text-rose-600 dark:text-rose-400"
                          : tp.classAveragePercent < 70
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-emerald-600 dark:text-emerald-400"
                      )}
                    >
                      {tp.classAveragePercent}%
                    </span>
                  </div>
                  <div className="w-full bg-surface-muted rounded-full h-1.5 overflow-hidden">
                    <div
                      className={cn(
                        "h-1.5 rounded-full transition-all duration-500",
                        tp.classAveragePercent < 50
                          ? "bg-rose-500"
                          : tp.classAveragePercent < 70
                          ? "bg-amber-500"
                          : "bg-emerald-500"
                      )}
                      style={{ width: `${Math.min(100, Math.max(0, tp.classAveragePercent))}%` }}
                      aria-hidden="true"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Chart 4: Submission Rate per Assignment */}
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-border/60 pb-3">
            <div>
              <h3 className="text-base font-bold text-foreground">
                Submission Rate per Assignment
              </h3>
              <p className="text-xs text-muted">
                Completed submissions compared to active enrollment
              </p>
            </div>
            <FileCheck2 className="w-5 h-5 text-primary" />
          </div>

          {assignmentSubmissionRates.length === 0 ? (
            <p className="text-xs text-muted text-center py-6">
              No published assignments in this course yet.
            </p>
          ) : (
            <div className="space-y-3.5">
              {assignmentSubmissionRates.map((a) => (
                <div key={a.id} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-foreground truncate max-w-[220px]">
                      {a.title}
                    </span>
                    <span className="font-mono text-muted text-[11px]">
                      {a.submittedCount} / {a.enrolledCount} ({a.ratePercent}%)
                    </span>
                  </div>
                  <div className="w-full bg-surface-muted rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-teal-accent h-2 rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, Math.max(0, a.ratePercent))}%` }}
                      aria-hidden="true"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 3. At-Risk Section ("Attention Indicator") */}
      <section
        aria-labelledby="attention-indicator-heading"
        className="rounded-2xl border border-border bg-surface p-6 sm:p-8 shadow-xs space-y-6"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/60 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-300">
                <ShieldAlert className="w-5 h-5" />
              </span>
              <h3
                id="attention-indicator-heading"
                className="text-base sm:text-lg font-bold text-foreground"
              >
                Attention Indicator
              </h3>
            </div>
            <p className="text-xs text-muted max-w-2xl">
              This indicator is an advisory guide based on objective course telemetry, not a judgment. Individual reasons are listed for each student to enable supportive, early academic outreach.
            </p>
          </div>

          {/* Export CSV Button */}
          <div className="flex items-center gap-2 shrink-0">
            <a
              href={`/api/teach/${data.offeringId}/analytics/export`}
              download
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border bg-surface hover:bg-surface-muted text-xs font-semibold text-foreground transition-colors shadow-2xs"
            >
              <Download className="w-3.5 h-3.5 text-primary" />
              <span>Export CSV</span>
            </a>
          </div>
        </div>

        {/* Level Filters */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {(["ALL", "HIGH", "MEDIUM", "LOW"] as const).map((lvl) => (
            <button
              key={lvl}
              onClick={() => setLevelFilter(lvl)}
              className={cn(
                "px-3 py-1 rounded-lg text-xs font-semibold transition-colors shrink-0",
                levelFilter === lvl
                  ? "bg-primary text-primary-foreground shadow-2xs"
                  : "bg-surface-muted text-muted hover:text-foreground"
              )}
            >
              {lvl === "ALL"
                ? `All Students (${students.length})`
                : lvl === "HIGH"
                ? `High Attention (${stats.highRiskCount})`
                : lvl === "MEDIUM"
                ? `Medium Attention (${stats.mediumRiskCount})`
                : `Low Attention (${stats.lowRiskCount})`}
            </button>
          ))}
        </div>

        {/* Students Table */}
        <div className="overflow-x-auto border border-border rounded-xl">
          <table className="w-full text-left text-xs">
            <thead className="bg-surface-muted/60 text-muted uppercase text-[11px] font-semibold border-b border-border">
              <tr>
                <th scope="col" className="py-3 px-4">Student</th>
                <th scope="col" className="py-3 px-3">Attention Level</th>
                <th scope="col" className="py-3 px-3">Progress</th>
                <th scope="col" className="py-3 px-3">Last Active</th>
                <th scope="col" className="py-3 px-3">Reasons</th>
                <th scope="col" className="py-3 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-muted">
                    No students found matching the selected filter.
                  </td>
                </tr>
              ) : (
                filteredStudents.map((st) => {
                  const isExpanded = expandedStudentIds.has(st.studentId);
                  return (
                    <React.Fragment key={st.studentId}>
                      <tr className="hover:bg-surface-muted/30 transition-colors">
                        <td className="py-3 px-4 font-medium">
                          <div className="text-foreground font-semibold">{st.name}</div>
                          <div className="text-[11px] text-muted">
                            {st.roll ? `${st.roll} • ` : ""}
                            {st.email}
                          </div>
                        </td>

                        <td className="py-3 px-3">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-bold text-[11px]",
                              st.riskLevel === RiskLevel.HIGH
                                ? "bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/30"
                                : st.riskLevel === RiskLevel.MEDIUM
                                ? "bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30"
                                : "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30"
                            )}
                          >
                            {st.riskLevel === RiskLevel.HIGH ? (
                              <AlertCircle className="w-3 h-3" />
                            ) : st.riskLevel === RiskLevel.MEDIUM ? (
                              <AlertTriangle className="w-3 h-3" />
                            ) : (
                              <CheckCircle2 className="w-3 h-3" />
                            )}
                            <span>{st.riskLevel}</span>
                          </span>
                        </td>

                        <td className="py-3 px-3">
                          <div className="font-semibold text-foreground">{st.progress}%</div>
                          <div className="w-16 bg-surface-muted rounded-full h-1 mt-1 overflow-hidden">
                            <div
                              className="bg-primary h-1 rounded-full"
                              style={{ width: `${st.progress}%` }}
                            />
                          </div>
                        </td>

                        <td className="py-3 px-3 text-muted">
                          {st.lastActive ? formatRelative(st.lastActive) : "Never"}
                        </td>

                        <td className="py-3 px-3">
                          {st.reasons.length === 0 ? (
                            <span className="text-muted">On track (no issues)</span>
                          ) : (
                            <button
                              onClick={() => toggleExpand(st.studentId)}
                              className="inline-flex items-center gap-1 text-primary hover:underline font-semibold"
                            >
                              <span>{st.reasons.length} reason{st.reasons.length > 1 ? "s" : ""}</span>
                              {isExpanded ? (
                                <ChevronUp className="w-3.5 h-3.5" />
                              ) : (
                                <ChevronDown className="w-3.5 h-3.5" />
                              )}
                            </button>
                          )}
                        </td>

                        <td className="py-3 px-3 text-right">
                          <Link
                            href={`/teach/${data.offeringId}/gradebook?studentId=${st.studentId}`}
                            className="inline-flex items-center gap-1 text-xs text-primary font-semibold hover:underline"
                          >
                            <span>Gradebook</span>
                            <ArrowUpRight className="w-3 h-3" />
                          </Link>
                        </td>
                      </tr>

                      {/* Expandable "Why" row */}
                      {isExpanded && st.reasons.length > 0 && (
                        <tr className="bg-surface-muted/50">
                          <td colSpan={6} className="py-2.5 px-6">
                            <div className="space-y-1">
                              <span className="text-[11px] font-bold text-muted uppercase">
                                Telemetry Reasons:
                              </span>
                              <ul className="list-disc list-inside space-y-0.5 text-xs text-foreground font-medium">
                                {st.reasons.map((r, idx) => (
                                  <li key={idx}>{r}</li>
                                ))}
                              </ul>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
