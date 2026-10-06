"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  TeacherGradebookData,
  GradebookAssignmentColumn,
  GradebookStudentRowData,
} from "@/services/gradebook";
import { updateGradebookSettingsAction } from "@/actions/gradebook";
import {
  Download,
  Search,
  SlidersHorizontal,
  Clock,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Info,
} from "lucide-react";
import { toast } from "sonner";

interface TeacherGradebookViewProps {
  initialData: TeacherGradebookData;
}

type SortField = "roll" | "name" | "total" | "percentage" | string; // string represents assignmentId
type SortDirection = "asc" | "desc";
type FilterType = "all" | "late" | "missing" | "below40";

export function TeacherGradebookView({ initialData }: TeacherGradebookViewProps) {
  const router = useRouter();
  const [data, setData] = React.useState<TeacherGradebookData>(initialData);
  const [search, setSearch] = React.useState("");
  const [filter, setFilter] = React.useState<FilterType>("all");
  const [sortField, setSortField] = React.useState<SortField>("roll");
  const [sortDirection, setSortDirection] = React.useState<SortDirection>("asc");
  const [isUpdatingSettings, setIsUpdatingSettings] = React.useState(false);
  const [showSettingsModal, setShowSettingsModal] = React.useState(false);

  // Sync when initialData changes from server revalidation
  React.useEffect(() => {
    setData(initialData);
  }, [initialData]);

  // Handle Sort
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  // Filter & Search logic
  const filteredStudents = React.useMemo(() => {
    return data.students.filter((student) => {
      // Search
      const q = search.toLowerCase().trim();
      const matchesSearch =
        !q ||
        student.name.toLowerCase().includes(q) ||
        (student.roll && student.roll.toLowerCase().includes(q)) ||
        student.email.toLowerCase().includes(q);

      if (!matchesSearch) return false;

      // Filter
      if (filter === "late") return student.hasLate;
      if (filter === "missing") return student.hasMissing;
      if (filter === "below40") return student.isBelow40;

      return true;
    });
  }, [data.students, search, filter]);

  // Sort logic
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

      if (sortField === "total") {
        return dir * (a.totalFinalMarks - b.totalFinalMarks);
      }

      if (sortField === "percentage") {
        const pA = a.percentage ?? -1;
        const pB = b.percentage ?? -1;
        return dir * (pA - pB);
      }

      // Assignment columns
      const cellA = a.cells[sortField];
      const cellB = b.cells[sortField];
      const valA = cellA?.finalMarks ?? -1;
      const valB = cellB?.finalMarks ?? -1;
      return dir * (valA - valB);
    });
  }, [filteredStudents, sortField, sortDirection]);

  // Counts for filter pills
  const counts = React.useMemo(() => {
    return {
      all: data.students.length,
      late: data.students.filter((s) => s.hasLate).length,
      missing: data.students.filter((s) => s.hasMissing).length,
      below40: data.students.filter((s) => s.isBelow40).length,
    };
  }, [data.students]);

  // Toggle settings
  const handleToggleTreatMissing = async () => {
    setIsUpdatingSettings(true);
    const newValue = !data.treatMissingAsZero;
    const res = await updateGradebookSettingsAction(data.offeringId, {
      treatMissingAsZero: newValue,
    });
    setIsUpdatingSettings(false);

    if (res.success) {
      toast.success(
        newValue
          ? "Missing submissions are now treated as 0 in totals."
          : "Missing submissions are now excluded from totals."
      );
      router.refresh();
    } else {
      toast.error(res.error || "Failed to update setting");
    }
  };

  const handleToggleShowClassAverage = async () => {
    setIsUpdatingSettings(true);
    const newValue = !data.showClassAverageToStudents;
    const res = await updateGradebookSettingsAction(data.offeringId, {
      showClassAverageToStudents: newValue,
    });
    setIsUpdatingSettings(false);

    if (res.success) {
      toast.success(
        newValue
          ? "Class averages are now visible to students."
          : "Class averages are now hidden from students."
      );
      router.refresh();
    } else {
      toast.error(res.error || "Failed to update setting");
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Metric Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-card border border-border p-5 rounded-xl shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              Course Gradebook & Evaluation Matrix
            </h1>
            <span className="text-xs px-2.5 py-0.5 rounded-full font-medium bg-primary/10 text-primary border border-primary/20">
              {data.courseCode}
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Consolidated marks breakdown across all {data.assignments.length} published assignments for {data.students.length} enrolled students.
          </p>
        </div>

        {/* Global actions: Settings & CSV Export */}
        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          <button
            onClick={() => setShowSettingsModal(true)}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-3.5 py-2 text-sm font-medium border border-border bg-background hover:bg-muted/60 text-foreground rounded-lg transition-colors cursor-pointer"
          >
            <SlidersHorizontal className="w-4 h-4 text-muted-foreground" />
            <span>Settings</span>
          </button>

          <a
            href={`/api/teach/${data.offeringId}/gradebook/export`}
            download
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg shadow-xs transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Export CSV</span>
          </a>
        </div>
      </div>

      {/* Evaluation Policy Notice Banner */}
      <div className="flex items-start sm:items-center justify-between gap-3 px-4 py-3 bg-muted/40 border border-border/80 rounded-lg text-xs sm:text-sm text-muted-foreground">
        <div className="flex items-center gap-2.5">
          <Info className="w-4 h-4 text-primary shrink-0" />
          <span>
            {data.treatMissingAsZero ? (
              <strong className="text-foreground">Policy: Missing submissions (-) are counted as 0 in total marks & percentages.</strong>
            ) : (
              <span>
                <strong className="text-foreground">Policy: Missing submissions (-) are excluded from total marks & percentages.</strong> Only submitted/graded assignments are averaged.
              </span>
            )}
          </span>
        </div>
        <div className="hidden md:flex items-center gap-2 text-xs">
          <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
            <Clock className="w-3.5 h-3.5" /> Late penalty applied
          </span>
          <span className="text-muted-foreground/40">•</span>
          <span className="text-muted-foreground">Quizzes excluded</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
          <button
            onClick={() => setFilter("all")}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer shrink-0 ${
              filter === "all"
                ? "bg-foreground text-background"
                : "bg-muted/60 text-muted-foreground hover:bg-muted"
            }`}
          >
            All Students ({counts.all})
          </button>

          <button
            onClick={() => setFilter("late")}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer shrink-0 ${
              filter === "late"
                ? "bg-amber-600 text-white"
                : "bg-muted/60 text-muted-foreground hover:bg-muted"
            }`}
          >
            Late ({counts.late})
          </button>

          <button
            onClick={() => setFilter("missing")}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer shrink-0 ${
              filter === "missing"
                ? "bg-rose-600 text-white"
                : "bg-muted/60 text-muted-foreground hover:bg-muted"
            }`}
          >
            Missing ({counts.missing})
          </button>

          <button
            onClick={() => setFilter("below40")}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer shrink-0 ${
              filter === "below40"
                ? "bg-destructive text-destructive-foreground"
                : "bg-muted/60 text-muted-foreground hover:bg-muted"
            }`}
          >
            Below 40% ({counts.below40})
          </button>
        </div>

        {/* Search Input */}
        <div className="relative min-w-[240px] md:w-72">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search roll, name, email..."
            className="w-full pl-9 pr-3 py-1.5 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      {/* Gradebook Matrix Table */}
      <div className="border border-border rounded-xl bg-card shadow-xs overflow-hidden">
        <div className="overflow-x-auto max-h-[720px] relative">
          <table className="w-full text-left border-collapse text-sm">
            {/* Sticky Header */}
            <thead className="sticky top-0 z-30 bg-muted/90 backdrop-blur-md border-b border-border text-xs font-medium text-muted-foreground uppercase tracking-wider">
              <tr>
                {/* Sticky Student Column Header */}
                <th
                  onClick={() => handleSort("roll")}
                  className="sticky left-0 z-40 bg-muted/95 backdrop-blur-md px-4 py-3.5 cursor-pointer hover:text-foreground transition-colors min-w-[220px] border-r border-border shadow-[2px_0_5px_rgba(0,0,0,0.03)]"
                >
                  <div className="flex items-center justify-between">
                    <span>Student / Roll</span>
                    <SortIcon currentField={sortField} field="roll" currentDir={sortDirection} />
                  </div>
                </th>

                {/* Section Column */}
                <th className="px-3 py-3.5 min-w-[90px]">Section</th>

                {/* Dynamic Assignment Columns */}
                {data.assignments.map((assignment) => (
                  <th
                    key={assignment.id}
                    onClick={() => handleSort(assignment.id)}
                    className="px-3.5 py-3.5 cursor-pointer hover:text-foreground transition-colors min-w-[150px] border-r border-border/40"
                  >
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-semibold text-foreground truncate max-w-[120px]" title={assignment.title}>
                          {assignment.title}
                        </span>
                        <SortIcon currentField={sortField} field={assignment.id} currentDir={sortDirection} />
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground font-normal">
                        <span>Max: {assignment.maxMarks}</span>
                        {assignment.type === "QUIZ" ? (
                          <span className="text-purple-600 dark:text-purple-400 font-medium">
                            Quiz ({assignment.gradingMethod || "BEST"})
                          </span>
                        ) : assignment.latePenaltyPercent > 0 ? (
                          <span className="text-amber-600 dark:text-amber-400 font-mono">
                            -{assignment.latePenaltyPercent}% late
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </th>
                ))}

                {/* Total Column Header */}
                <th
                  onClick={() => handleSort("total")}
                  className="px-4 py-3.5 cursor-pointer hover:text-foreground transition-colors min-w-[120px] bg-muted/60"
                >
                  <div className="flex items-center justify-between">
                    <span>Total Marks</span>
                    <SortIcon currentField={sortField} field="total" currentDir={sortDirection} />
                  </div>
                </th>

                {/* Percentage Column Header */}
                <th
                  onClick={() => handleSort("percentage")}
                  className="px-4 py-3.5 cursor-pointer hover:text-foreground transition-colors min-w-[110px] bg-muted/80 text-right pr-5"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Score %</span>
                    <SortIcon currentField={sortField} field="percentage" currentDir={sortDirection} />
                  </div>
                </th>
              </tr>
            </thead>

            {/* Table Body */}
            <tbody className="divide-y divide-border/60">
              {/* Summary / Class Average Row at top */}
              {data.assignments.length > 0 && (
                <tr className="bg-primary/5 font-medium text-xs border-b border-border">
                  <td className="sticky left-0 z-20 bg-primary/10 backdrop-blur-md px-4 py-3 border-r border-border font-semibold text-primary">
                    Class Average
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">—</td>
                  {data.assignments.map((assignment) => {
                    const avg = data.assignmentAverages[assignment.id];
                    return (
                      <td key={assignment.id} className="px-3.5 py-3 border-r border-border/40 font-mono text-xs">
                        {avg?.averageMarks !== null ? (
                          <div>
                            <span className="text-foreground font-semibold">{avg.averageMarks}</span>
                            <span className="text-muted-foreground"> / {assignment.maxMarks}</span>
                            {avg.averagePercentage !== null && (
                              <div className="text-[10px] text-muted-foreground">
                                ({avg.averagePercentage}%)
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-4 py-3 text-muted-foreground font-mono">—</td>
                  <td className="px-4 py-3 text-right pr-5 font-semibold text-primary font-mono">
                    {data.classAveragePercentage !== null ? `${data.classAveragePercentage}%` : "—"}
                  </td>
                </tr>
              )}

              {sortedStudents.length === 0 ? (
                <tr>
                  <td
                    colSpan={data.assignments.length + 4}
                    className="px-6 py-12 text-center text-muted-foreground"
                  >
                    No students match the current search or filter criteria.
                  </td>
                </tr>
              ) : (
                sortedStudents.map((student) => {
                  return (
                    <tr
                      key={student.studentId}
                      className="hover:bg-muted/40 transition-colors group"
                    >
                      {/* Sticky Student Column */}
                      <td className="sticky left-0 z-20 bg-card group-hover:bg-muted/80 backdrop-blur-sm px-4 py-3 border-r border-border shadow-[2px_0_5px_rgba(0,0,0,0.03)]">
                        <div className="flex flex-col">
                          <span className="font-semibold text-foreground truncate max-w-[190px]">
                            {student.name}
                          </span>
                          <span className="text-xs font-mono text-muted-foreground">
                            {student.roll || "No Roll"}
                          </span>
                        </div>
                      </td>

                      {/* Section */}
                      <td className="px-3 py-3 text-xs text-muted-foreground">
                        {student.sectionName}
                      </td>

                      {/* Assignment Cells */}
                      {data.assignments.map((assignment) => {
                        const cell = student.cells[assignment.id];
                        return (
                          <GradebookCell
                            key={assignment.id}
                            cell={cell}
                            assignment={assignment}
                            offeringId={data.offeringId}
                          />
                        );
                      })}

                      {/* Total Earned Marks */}
                      <td className="px-4 py-3 font-mono text-xs bg-muted/20">
                        <div className="flex items-baseline gap-1">
                          <span className="font-semibold text-foreground">
                            {student.totalFinalMarks}
                          </span>
                          <span className="text-muted-foreground">
                            / {student.totalMaxMarks}
                          </span>
                        </div>
                      </td>

                      {/* Overall Percentage */}
                      <td className="px-4 py-3 text-right pr-5 font-mono text-xs bg-muted/30">
                        {student.percentage !== null ? (
                          <span
                            className={`inline-block px-2 py-0.5 rounded-md font-semibold ${
                              student.percentage < 40
                                ? "bg-destructive/15 text-destructive font-bold"
                                : student.percentage >= 80
                                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                                : "text-foreground"
                            }`}
                          >
                            {student.percentage}%
                          </span>
                        ) : (
                          <span className="text-muted-foreground font-normal">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Gradebook Settings Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-card border border-border rounded-xl shadow-xl max-w-md w-full p-6 space-y-5">
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <h3 className="text-lg font-bold text-foreground">Gradebook Evaluation Settings</h3>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="text-muted-foreground hover:text-foreground text-sm font-semibold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-sm">
              {/* Setting 1: Treat missing as zero */}
              <div className="flex items-start justify-between gap-4 p-3 rounded-lg border border-border bg-muted/30">
                <div>
                  <h4 className="font-semibold text-foreground">Treat missing submissions as 0</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    When enabled, unsubmitted assignments are assigned 0 marks and included in total scores and percentage. When disabled, missing assignments are excluded from the denominator.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={isUpdatingSettings}
                  onClick={handleToggleTreatMissing}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    data.treatMissingAsZero ? "bg-primary" : "bg-muted-foreground/30"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      data.treatMissingAsZero ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {/* Setting 2: Show class average to students */}
              <div className="flex items-start justify-between gap-4 p-3 rounded-lg border border-border bg-muted/30">
                <div>
                  <h4 className="font-semibold text-foreground">Show class average to students</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Allow enrolled students to view the overall course average and assignment-specific average marks in their Grades tab.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={isUpdatingSettings}
                  onClick={handleToggleShowClassAverage}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    data.showClassAverageToStudents ? "bg-primary" : "bg-muted-foreground/30"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      data.showClassAverageToStudents ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setShowSettingsModal(false)}
                className="px-4 py-2 text-sm font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-lg transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function GradebookCell({
  cell,
  assignment,
  offeringId,
}: {
  cell: GradebookStudentRowData["cells"][string] | undefined;
  assignment: GradebookAssignmentColumn;
  offeringId: string;
}) {
  const router = useRouter();

  // If student did not submit
  if (!cell || cell.isMissing || cell.status === "not_submitted") {
    const isQuiz = assignment.type === "QUIZ";
    return (
      <td
        onClick={() => {
          if (isQuiz) {
            router.push(`/teach/${offeringId}/quizzes/${assignment.id}/results`);
          } else {
            router.push(`/teach/${offeringId}/assignments/${assignment.id}/submissions`);
          }
        }}
        title={
          isQuiz
            ? "Unattempted Quiz (Excluded from total). Click to view quiz results."
            : "Unsubmitted / Missing (Excluded from total). Click to view assignment submissions roster."
        }
        className="px-3.5 py-3 border-r border-border/40 font-mono text-center text-muted-foreground hover:bg-muted/60 cursor-pointer transition-colors"
      >
        <span className="font-bold text-muted-foreground/50 select-none">—</span>
      </td>
    );
  }

  // If quiz with score
  if (assignment.type === "QUIZ") {
    return (
      <td
        onClick={() => {
          if (cell.submissionId) {
            router.push(`/teach/${offeringId}/quizzes/${assignment.id}/attempts/${cell.submissionId}`);
          } else {
            router.push(`/teach/${offeringId}/quizzes/${assignment.id}/results`);
          }
        }}
        title={`Quiz Score: ${cell.finalMarks} / ${assignment.maxMarks} (${assignment.gradingMethod || "BEST"}). Click to view attempt details.`}
        className="px-3.5 py-3 border-r border-border/40 font-mono text-xs hover:bg-purple-500/10 cursor-pointer transition-colors"
      >
        <div className="flex items-center justify-between gap-1.5">
          <div className="flex items-baseline gap-1">
            <span className="font-bold text-foreground">{cell.finalMarks}</span>
            <span className="text-muted-foreground text-[11px]">/ {assignment.maxMarks}</span>
          </div>
        </div>
      </td>
    );
  }

  // If submitted but not graded yet (assignments only)
  if (cell.finalMarks === null || cell.rawMarks === null) {
    const isLate = cell.isLate;
    return (
      <td
        onClick={() => {
          if (cell.submissionId) {
            router.push(`/teach/${offeringId}/submissions/${cell.submissionId}`);
          }
        }}
        title={
          isLate
            ? "Submitted late, awaiting evaluation. Click to grade."
            : "Submitted on time, awaiting evaluation. Click to grade."
        }
        className="px-3.5 py-3 border-r border-border/40 font-mono text-xs hover:bg-primary/5 cursor-pointer transition-colors"
      >
        <div className="flex items-center justify-between gap-1">
          <span className="text-xs text-amber-600 dark:text-amber-400 font-sans font-medium">
            Ungraded
          </span>
          {isLate && (
            <span title="Submitted late">
              <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            </span>
          )}
        </div>
      </td>
    );
  }

  // Graded assignment cell
  const hasLateDeduction = cell.isLate && cell.lateDeduction > 0;
  const tooltipText = hasLateDeduction
    ? `Raw Marks: ${cell.rawMarks} / ${assignment.maxMarks}\nLate Penalty: ${assignment.latePenaltyPercent}% (-${cell.lateDeduction})\nFinal Marks: ${cell.finalMarks}\nClick to view or edit grade.`
    : `Final Marks: ${cell.finalMarks} / ${assignment.maxMarks}\nClick to view or edit grade.`;

  return (
    <td
      onClick={() => {
        if (cell.submissionId) {
          router.push(`/teach/${offeringId}/submissions/${cell.submissionId}`);
        }
      }}
      title={tooltipText}
      className={`px-3.5 py-3 border-r border-border/40 font-mono text-xs hover:bg-primary/10 cursor-pointer transition-colors relative ${
        hasLateDeduction ? "bg-amber-500/5" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex items-baseline gap-1">
          <span className="font-bold text-foreground">{cell.finalMarks}</span>
          <span className="text-muted-foreground text-[11px]">/ {assignment.maxMarks}</span>
        </div>

        {hasLateDeduction && (
          <span
            className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30 shrink-0"
            title={`Raw: ${cell.rawMarks}, Late deduction: -${cell.lateDeduction}`}
          >
            <Clock className="w-2.5 h-2.5" />
            <span>-{cell.lateDeduction}</span>
          </span>
        )}
      </div>
    </td>
  );
}

function SortIcon({
  currentField,
  field,
  currentDir,
}: {
  currentField: SortField;
  field: SortField;
  currentDir: SortDirection;
}) {
  if (currentField !== field) {
    return <ArrowUpDown className="w-3 h-3 text-muted-foreground/40 shrink-0" />;
  }

  return currentDir === "asc" ? (
    <ArrowUp className="w-3.5 h-3.5 text-primary shrink-0" />
  ) : (
    <ArrowDown className="w-3.5 h-3.5 text-primary shrink-0" />
  );
}
