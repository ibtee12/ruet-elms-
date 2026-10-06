"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  TeacherQuizResultsData,
} from "@/services/quiz-attempts";
import { formatDhaka } from "@/lib/datetime";
import {
  updateQuizGradingMethodAction,
  notifyQuizResultsAction,
} from "@/actions/quiz-attempts";
import {
  HelpCircle,
  Download,
  Search,
  ArrowLeft,
  Users,
  Award,
  TrendingUp,
  BarChart3,
  AlertTriangle,
  CheckCircle2,
  Bell,
  ArrowUpDown,
  SlidersHorizontal,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";

interface TeacherQuizResultsViewProps {
  offeringId: string;
  data: TeacherQuizResultsData;
}

export function TeacherQuizResultsView({
  offeringId,
  data,
}: TeacherQuizResultsViewProps) {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = React.useState("");
  const [filterType, setFilterType] = React.useState<"ALL" | "ATTEMPTED" | "MISSING" | "BELOW40">("ALL");
  const [sortField, setSortField] = React.useState<"roll" | "name" | "score" | "time">("roll");
  const [sortDirection, setSortDirection] = React.useState<"asc" | "desc">("asc");
  const [isUpdatingMethod, setIsUpdatingMethod] = React.useState(false);
  const [isNotifying, setIsNotifying] = React.useState(false);

  // Sorting
  const handleSort = (field: "roll" | "name" | "score" | "time") => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  // Change grading method
  const handleGradingMethodChange = async (
    newMethod: "BEST" | "LATEST" | "AVERAGE"
  ) => {
    if (newMethod === data.gradingMethod || isUpdatingMethod) return;
    setIsUpdatingMethod(true);
    try {
      await updateQuizGradingMethodAction(data.quizId, offeringId, newMethod);
      toast.success(`Grading method updated to ${newMethod}`);
      router.refresh();
    } catch (err: unknown) {
      const error = err as { message?: string };
      toast.error(error.message || "Failed to update grading method");
    } finally {
      setIsUpdatingMethod(false);
    }
  };

  // Send results notification
  const handleNotifyStudents = async () => {
    if (isNotifying) return;
    setIsNotifying(true);
    try {
      const res = await notifyQuizResultsAction(data.quizId, offeringId);
      toast.success(`Results notification dispatched to ${res.count} students`);
      router.refresh();
    } catch (err: unknown) {
      const error = err as { message?: string };
      toast.error(error.message || "Failed to dispatch notifications");
    } finally {
      setIsNotifying(false);
    }
  };

  // Filter students
  const filteredStudents = React.useMemo(() => {
    return data.students.filter((student) => {
      const q = searchTerm.toLowerCase().trim();
      const matchesSearch =
        !q ||
        student.name.toLowerCase().includes(q) ||
        (student.roll && student.roll.toLowerCase().includes(q)) ||
        student.email.toLowerCase().includes(q);

      if (!matchesSearch) return false;

      if (filterType === "ATTEMPTED") return student.attemptsUsed > 0;
      if (filterType === "MISSING") return student.attemptsUsed === 0;
      if (filterType === "BELOW40") {
        return student.percentage !== null && student.percentage < 40;
      }

      return true;
    });
  }, [data.students, searchTerm, filterType]);

  // Sort students
  const sortedStudents = React.useMemo(() => {
    return [...filteredStudents].sort((a, b) => {
      const dir = sortDirection === "asc" ? 1 : -1;

      if (sortField === "roll") {
        const rollA = a.roll || "";
        const rollB = b.roll || "";
        return dir * rollA.localeCompare(rollB, undefined, { numeric: true });
      }

      if (sortField === "name") {
        return dir * a.name.localeCompare(b.name);
      }

      if (sortField === "score") {
        const scoreA = a.score ?? -999;
        const scoreB = b.score ?? -999;
        return dir * (scoreA - scoreB);
      }

      if (sortField === "time") {
        const timeA = a.durationTakenMinutes ?? -1;
        const timeB = b.durationTakenMinutes ?? -1;
        return dir * (timeA - timeB);
      }

      return 0;
    });
  }, [filteredStudents, sortField, sortDirection]);

  return (
    <div className="space-y-8 pb-16">
      {/* 1. Header with Breadcrumbs & Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href={`/teach/${offeringId}/quizzes`}
            className="p-2 rounded-lg text-muted hover:text-foreground hover:bg-surface border border-border transition-colors"
            title="Back to Quizzes List"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-primary px-2 py-0.5 rounded bg-primary/10">
                {data.courseCode}
              </span>
              <span className="text-xs text-muted">Evaluation &amp; Results</span>
            </div>
            <h1 className="text-xl font-bold text-foreground mt-0.5">
              {data.quizTitle}
            </h1>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2 self-stretch sm:self-auto">
          {/* Notify students button */}
          <button
            type="button"
            disabled={isNotifying}
            onClick={handleNotifyStudents}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
              data.resultsNotified
                ? "bg-surface-muted border-border text-muted hover:text-foreground"
                : "bg-primary/10 border-primary/20 text-primary hover:bg-primary/20"
            }`}
            title={
              data.resultsNotified
                ? "Results already notified. Click to re-notify."
                : "Notify all enrolled students that results are available."
            }
          >
            <Bell className="w-3.5 h-3.5" />
            <span>
              {isNotifying
                ? "Sending..."
                : data.resultsNotified
                ? "Re-notify Results"
                : "Notify Students"}
            </span>
          </button>

          {/* Export CSV (formula injection safe) */}
          <a
            href={`/api/teach/${offeringId}/quizzes/${data.quizId}/export`}
            download
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-surface hover:bg-surface-muted text-foreground border border-border transition-colors shadow-xs"
          >
            <Download className="w-3.5 h-3.5 text-muted" />
            <span>Export CSV</span>
          </a>
        </div>
      </div>

      {/* 2. Top Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3.5">
        <div className="p-4 rounded-xl border border-border bg-surface shadow-xs space-y-1">
          <div className="flex items-center justify-between text-muted text-xs font-medium">
            <span>Enrolled Students</span>
            <Users className="w-4 h-4 text-primary" />
          </div>
          <div className="text-2xl font-black text-foreground font-mono">
            {data.totalEnrolled}
          </div>
          <div className="text-[11px] text-muted">Active course students</div>
        </div>

        <div className="p-4 rounded-xl border border-border bg-surface shadow-xs space-y-1">
          <div className="flex items-center justify-between text-muted text-xs font-medium">
            <span>Attempted</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-black text-foreground font-mono">
            {data.attemptedCount}
            <span className="text-xs text-muted font-sans font-normal ml-1">
              (
              {data.totalEnrolled > 0
                ? Math.round((data.attemptedCount / data.totalEnrolled) * 100)
                : 0}
              %)
            </span>
          </div>
          <div className="text-[11px] text-muted">Submitted attempts</div>
        </div>

        <div className="p-4 rounded-xl border border-border bg-surface shadow-xs space-y-1">
          <div className="flex items-center justify-between text-muted text-xs font-medium">
            <span>Class Average</span>
            <TrendingUp className="w-4 h-4 text-primary" />
          </div>
          <div className="text-2xl font-black text-foreground font-mono">
            {data.averageScore !== null ? data.averageScore : "—"}
            <span className="text-xs text-muted font-mono font-normal ml-1">
              / {data.totalMarks}
            </span>
          </div>
          <div className="text-[11px] text-muted">
            {data.averageScore !== null && data.totalMarks > 0
              ? `${Math.round((data.averageScore / data.totalMarks) * 100)}% overall`
              : "No evaluations yet"}
          </div>
        </div>

        <div className="p-4 rounded-xl border border-border bg-surface shadow-xs space-y-1">
          <div className="flex items-center justify-between text-muted text-xs font-medium">
            <span>Highest Score</span>
            <Award className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-black text-foreground font-mono">
            {data.highestScore !== null ? data.highestScore : "—"}
            <span className="text-xs text-muted font-mono font-normal ml-1">
              / {data.totalMarks}
            </span>
          </div>
          <div className="text-[11px] text-muted">Top student marks</div>
        </div>

        <div className="p-4 rounded-xl border border-border bg-surface shadow-xs space-y-1 col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between text-muted text-xs font-medium">
            <span>Lowest Score</span>
            <BarChart3 className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl font-black text-foreground font-mono">
            {data.lowestScore !== null ? data.lowestScore : "—"}
            <span className="text-xs text-muted font-mono font-normal ml-1">
              / {data.totalMarks}
            </span>
          </div>
          <div className="text-[11px] text-muted">Lowest evaluated</div>
        </div>
      </div>

      {/* 3. Distribution & Grading Method Config Card */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Score Distribution Chart */}
        <div className="lg:col-span-2 p-5 sm:p-6 rounded-2xl border border-border bg-surface shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-bold text-foreground">
                Score Distribution
              </h3>
            </div>
            <span className="text-xs text-muted">
              {data.attemptedCount} evaluated {data.attemptedCount === 1 ? "student" : "students"}
            </span>
          </div>

          <div className="space-y-3 pt-2">
            {data.distribution.map((bucket) => (
              <div key={bucket.range} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono font-medium text-foreground">
                    {bucket.range}
                  </span>
                  <span className="font-mono text-muted text-[11px]">
                    {bucket.count} {bucket.count === 1 ? "student" : "students"} ({bucket.percentage}%)
                  </span>
                </div>
                <div className="h-2 w-full bg-surface-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-500"
                    style={{ width: `${bucket.percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Grading Method Configuration */}
        <div className="p-5 sm:p-6 rounded-2xl border border-border bg-surface shadow-xs space-y-4">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-bold text-foreground">
              Gradebook Policy
            </h3>
          </div>
          <p className="text-xs text-muted leading-relaxed">
            Configure how multiple attempts calculate the official grade exported to the course Gradebook matrix.
          </p>

          <div className="space-y-2 pt-1">
            {[
              {
                id: "BEST" as const,
                label: "Best Attempt (Default)",
                desc: "Highest score achieved across attempts.",
              },
              {
                id: "LATEST" as const,
                label: "Latest Attempt",
                desc: "Score from the most recent submission.",
              },
              {
                id: "AVERAGE" as const,
                label: "Average of Attempts",
                desc: "Mean score across all completed attempts.",
              },
            ].map((method) => {
              const isSelected = data.gradingMethod === method.id;
              return (
                <button
                  key={method.id}
                  type="button"
                  disabled={isUpdatingMethod}
                  onClick={() => handleGradingMethodChange(method.id)}
                  className={`w-full p-3 rounded-xl border text-left transition-all ${
                    isSelected
                      ? "border-primary bg-primary/10 text-primary shadow-xs"
                      : "border-border bg-surface-muted/30 hover:bg-surface-muted text-foreground"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold">{method.label}</span>
                    {isSelected && (
                      <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                    )}
                  </div>
                  <p className="text-[11px] text-muted mt-0.5">{method.desc}</p>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 4. Per-Question Correctness Table (to find hard questions) */}
      <div className="p-5 sm:p-6 rounded-2xl border border-border bg-surface shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-bold text-foreground">
              Per-Question Correctness Rate
            </h3>
          </div>
          <span className="text-xs text-muted">
            Highlights difficult questions (&lt; 50% correct)
          </span>
        </div>

        <div className="overflow-x-auto border border-border rounded-xl">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-surface-muted/60 text-muted font-semibold uppercase tracking-wider border-b border-border">
              <tr>
                <th className="px-3.5 py-2.5">#</th>
                <th className="px-4 py-2.5">Question Text</th>
                <th className="px-3 py-2.5">Type</th>
                <th className="px-3 py-2.5">Topic</th>
                <th className="px-3 py-2.5 font-mono text-center">Marks</th>
                <th className="px-3 py-2.5 font-mono text-center">Correct</th>
                <th className="px-3 py-2.5 font-mono text-center">Incorrect</th>
                <th className="px-4 py-2.5 text-right">Correctness Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {data.questionStats.map((q) => (
                <tr key={q.id} className="hover:bg-surface-muted/30 transition-colors">
                  <td className="px-3.5 py-3 font-mono font-bold text-foreground">
                    Q{q.order + 1}
                  </td>
                  <td className="px-4 py-3 font-medium text-foreground max-w-sm truncate" title={q.text}>
                    {q.text}
                  </td>
                  <td className="px-3 py-3 text-muted uppercase tracking-wider text-[11px]">
                    {q.type.replace("_", " ")}
                  </td>
                  <td className="px-3 py-3 text-muted">
                    {q.topicName || "General"}
                  </td>
                  <td className="px-3 py-3 font-mono text-center text-foreground font-semibold">
                    {q.marks}
                  </td>
                  <td className="px-3 py-3 font-mono text-center text-emerald-600 dark:text-emerald-400 font-semibold">
                    {q.correctCount}
                  </td>
                  <td className="px-3 py-3 font-mono text-center text-rose-600 dark:text-rose-400 font-semibold">
                    {q.incorrectCount}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-2 justify-end">
                      {q.isHard && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/20">
                          <AlertTriangle className="w-3 h-3" />
                          Hard
                        </span>
                      )}
                      <span className="font-mono font-bold text-foreground">
                        {q.correctnessRate}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. Student Results Table */}
      <div className="p-5 sm:p-6 rounded-2xl border border-border bg-surface shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
            {[
              { id: "ALL", label: `All (${data.students.length})` },
              { id: "ATTEMPTED", label: `Attempted (${data.attemptedCount})` },
              { id: "MISSING", label: `Missing (${data.students.length - data.attemptedCount})` },
              {
                id: "BELOW40",
                label: `Below 40% (${data.students.filter((s) => s.percentage !== null && s.percentage < 40).length})`,
              },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterType(tab.id as typeof filterType)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors shrink-0 ${
                  filterType === tab.id
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-muted hover:text-foreground hover:bg-surface-muted"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search roll, name, email..."
              className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-border bg-surface-muted/40 text-xs text-foreground placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        <div className="overflow-x-auto border border-border rounded-xl">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-surface-muted/60 text-muted font-semibold uppercase tracking-wider border-b border-border">
              <tr>
                <th
                  onClick={() => handleSort("roll")}
                  className="px-4 py-3 cursor-pointer hover:text-foreground transition-colors"
                >
                  <div className="flex items-center gap-1">
                    <span>Roll / ID</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort("name")}
                  className="px-4 py-3 cursor-pointer hover:text-foreground transition-colors"
                >
                  <div className="flex items-center gap-1">
                    <span>Student Name</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="px-3 py-3">Section</th>
                <th className="px-3 py-3 text-center">Attempts</th>
                <th
                  onClick={() => handleSort("score")}
                  className="px-4 py-3 cursor-pointer hover:text-foreground transition-colors font-mono"
                >
                  <div className="flex items-center gap-1">
                    <span>Score ({data.gradingMethod})</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort("time")}
                  className="px-3 py-3 cursor-pointer hover:text-foreground transition-colors"
                >
                  <div className="flex items-center gap-1">
                    <span>Time Taken</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="px-4 py-3">Last Submitted</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {sortedStudents.map((s) => {
                const latestAttempt = s.attempts[0];
                return (
                  <tr key={s.studentId} className="hover:bg-surface-muted/30 transition-colors">
                    <td className="px-4 py-3 font-mono font-bold text-foreground">
                      {s.roll || "N/A"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-foreground">{s.name}</div>
                      <div className="text-[11px] text-muted">{s.email}</div>
                    </td>
                    <td className="px-3 py-3 text-muted">
                      {s.sectionName}
                    </td>
                    <td className="px-3 py-3 font-mono text-center text-foreground">
                      {s.attemptsUsed}
                    </td>
                    <td className="px-4 py-3 font-mono">
                      {s.score !== null ? (
                        <div className="flex items-baseline gap-1">
                          <span className="font-bold text-foreground text-sm">
                            {s.score}
                          </span>
                          <span className="text-muted text-[11px]">
                            / {data.totalMarks}
                          </span>
                          <span className="text-muted text-[11px] ml-1">
                            ({s.percentage}%)
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted italic">Unattempted</span>
                      )}
                    </td>
                    <td className="px-3 py-3 font-mono text-muted">
                      {s.durationTakenMinutes !== null
                        ? `${s.durationTakenMinutes} min`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-muted text-[11px]">
                      {s.latestSubmittedAt
                        ? formatDhaka(s.latestSubmittedAt, "short")
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {latestAttempt ? (
                        <Link
                          href={`/teach/${offeringId}/quizzes/${data.quizId}/attempts/${latestAttempt.id}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold text-primary hover:bg-primary/10 transition-colors"
                        >
                          <span>Review</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </Link>
                      ) : (
                        <span className="text-muted text-[11px]">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
