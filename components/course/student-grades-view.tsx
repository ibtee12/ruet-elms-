"use client";

import * as React from "react";
import Link from "next/link";
import { StudentGradebookData, StudentAssignmentGradeRow } from "@/services/gradebook";
import {
  Award,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileText,
  MessageSquare,
  TrendingUp,
  Info,
  ExternalLink,
} from "lucide-react";

interface StudentGradesViewProps {
  data: StudentGradebookData;
}

export function StudentGradesView({ data }: StudentGradesViewProps) {
  const gradedAssignments = data.assignments.filter((a) => a.status === "graded");

  return (
    <div className="space-y-6">
      {/* Header & Course Performance Overview */}
      <div className="bg-card border border-border rounded-xl p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-border">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                My Academic Evaluation & Grades
              </h1>
              <span className="text-xs px-2.5 py-0.5 rounded-full font-medium bg-primary/10 text-primary border border-primary/20">
                {data.courseCode}
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Continuous assessment scores, instructor feedback, and term evaluation summary for {data.term} Term {data.academicYear}.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs px-3 py-1 rounded-full font-medium bg-muted text-muted-foreground border border-border">
              {gradedAssignments.length} of {data.assignments.length} Graded
            </span>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-6">
          {/* Total Marks */}
          <div className="bg-muted/40 border border-border/80 rounded-lg p-4">
            <div className="flex items-center justify-between text-muted-foreground mb-1.5">
              <span className="text-xs font-medium uppercase tracking-wider">Total Marks</span>
              <Award className="w-4 h-4 text-primary" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold text-foreground">
                {data.totalFinalMarks}
              </span>
              <span className="text-sm text-muted-foreground font-mono">
                / {data.totalMaxMarks}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Earned across evaluated assignments
            </p>
          </div>

          {/* Overall Percentage */}
          <div className="bg-muted/40 border border-border/80 rounded-lg p-4">
            <div className="flex items-center justify-between text-muted-foreground mb-1.5">
              <span className="text-xs font-medium uppercase tracking-wider">Overall Score</span>
              <TrendingUp className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold text-foreground font-mono">
                {data.percentage !== null ? `${data.percentage}%` : "—"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {data.percentage !== null && data.percentage >= 80
                ? "Excellent academic standing"
                : data.percentage !== null && data.percentage >= 60
                ? "Satisfactory performance"
                : "Continuous assessment in progress"}
            </p>
          </div>

          {/* Class Average (if enabled by teacher) */}
          <div className="bg-muted/40 border border-border/80 rounded-lg p-4">
            <div className="flex items-center justify-between text-muted-foreground mb-1.5">
              <span className="text-xs font-medium uppercase tracking-wider">Class Average</span>
              <Award className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="flex items-baseline gap-1.5">
              {data.showClassAverageToStudents && data.classAveragePercentage !== null ? (
                <span className="text-2xl font-bold text-foreground font-mono">
                  {data.classAveragePercentage}%
                </span>
              ) : (
                <span className="text-2xl font-bold text-muted-foreground/60 font-mono">
                  —
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {data.showClassAverageToStudents
                ? "Class-wide benchmark average"
                : "Class average withheld by instructor"}
            </p>
          </div>
        </div>

        {/* Policy Explainer Note */}
        <div className="flex items-center gap-2.5 mt-5 p-3 rounded-lg bg-primary/5 border border-primary/10 text-xs text-muted-foreground">
          <Info className="w-4 h-4 text-primary shrink-0" />
          <span>
            {data.treatMissingAsZero ? (
              <strong>Unsubmitted assignments are assigned 0 marks and calculated in total scores.</strong>
            ) : (
              <span>
                <strong>Unsubmitted assignments (—) are excluded from total marks & percentage.</strong> Your current grade reflects only completed and evaluated work.
              </span>
            )}
          </span>
        </div>
      </div>

      {/* Assignments Grade Breakdown Table */}
      <div className="border border-border rounded-xl bg-card shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-border bg-muted/20">
          <h2 className="text-base font-bold text-foreground">Assessment Breakdown</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Detailed marks, submission status, and feedback per assignment.
          </p>
        </div>

        {data.assignments.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            No published assignments found for this course yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead className="bg-muted/50 border-b border-border text-xs font-medium text-muted-foreground uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3.5">Assignment</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-4 py-3.5 font-mono">My Score</th>
                  {data.showClassAverageToStudents && (
                    <th className="px-4 py-3.5 font-mono">Class Avg</th>
                  )}
                  <th className="px-5 py-3.5">Instructor Feedback</th>
                  <th className="px-4 py-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {data.assignments.map((assignment) => {
                  return (
                    <tr key={assignment.assignmentId} className="hover:bg-muted/30 transition-colors">
                      {/* Title & Max Marks */}
                      <td className="px-5 py-4">
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-foreground">
                              {assignment.assignmentTitle}
                            </span>
                            {assignment.type === "QUIZ" && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20">
                                Quiz
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground font-mono">
                            Max marks: {assignment.maxMarks}
                            {assignment.latePenaltyPercent > 0 && ` • ${assignment.latePenaltyPercent}% late penalty`}
                          </span>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-4">
                        <StatusBadge
                          status={assignment.status}
                          isLate={assignment.isLate}
                        />
                      </td>

                      {/* Score / Marks */}
                      <td className="px-4 py-4 font-mono text-sm">
                        {assignment.finalMarks !== null ? (
                          <div className="flex flex-col">
                            <div className="flex items-baseline gap-1">
                              <span className="font-bold text-foreground text-base">
                                {assignment.finalMarks}
                              </span>
                              <span className="text-muted-foreground text-xs">
                                / {assignment.maxMarks}
                              </span>
                            </div>
                            {assignment.isLate && assignment.lateDeduction > 0 && (
                              <span className="text-[11px] text-amber-600 dark:text-amber-400 font-sans">
                                Raw: {assignment.rawMarks} (-{assignment.lateDeduction} late)
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground font-sans font-medium text-xs">
                            {assignment.status === "not_submitted" ? "— (Not submitted)" : "Pending evaluation"}
                          </span>
                        )}
                      </td>

                      {/* Class Average (if enabled) */}
                      {data.showClassAverageToStudents && (
                        <td className="px-4 py-4 font-mono text-xs text-muted-foreground">
                          {assignment.classAverageMarks !== null ? (
                            <span>
                              <span className="font-semibold text-foreground">
                                {assignment.classAverageMarks}
                              </span>{" "}
                              / {assignment.maxMarks}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                      )}

                      {/* Feedback */}
                      <td className="px-5 py-4 max-w-xs">
                        {assignment.feedback ? (
                          <div className="flex items-start gap-1.5 p-2 rounded-md bg-muted/50 border border-border/80 text-xs text-foreground">
                            <MessageSquare className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                            <p className="line-clamp-2 leading-relaxed">{assignment.feedback}</p>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">
                            No feedback provided
                          </span>
                        )}
                      </td>

                      {/* Action Link */}
                      <td className="px-4 py-4 text-right">
                        <Link
                          href={
                            assignment.type === "QUIZ"
                              ? `/courses/${data.offeringId}/quizzes/${assignment.assignmentId}`
                              : `/courses/${data.offeringId}/assignments/${assignment.assignmentId}`
                          }
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 rounded-md transition-colors"
                        >
                          <span>View</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({
  status,
  isLate,
}: {
  status: StudentAssignmentGradeRow["status"];
  isLate: boolean;
}) {
  switch (status) {
    case "graded":
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
          <CheckCircle2 className="w-3 h-3" />
          <span>{isLate ? "Graded (Late)" : "Graded"}</span>
        </span>
      );
    case "submitted_late":
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30">
          <Clock className="w-3 h-3" />
          <span>Submitted Late</span>
        </span>
      );
    case "submitted":
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/15 text-blue-700 dark:text-blue-400 border border-blue-500/30">
          <FileText className="w-3 h-3" />
          <span>Submitted</span>
        </span>
      );
    case "not_submitted":
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/30">
          <AlertCircle className="w-3 h-3" />
          <span>Not Submitted</span>
        </span>
      );
  }
}
