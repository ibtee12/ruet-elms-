"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import {
  TeacherAssignmentSubmissionsData,
  StudentSubmissionRowData,
} from "@/services/grading";
import { StatusChip } from "@/components/shared/status-chip";
import { DeadlineChip } from "@/components/shared/deadline-chip";
import { formatDhaka, formatRelative } from "@/lib/datetime";
import {
  ArrowLeft,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileCheck2,
  ArrowUpDown,
  ExternalLink,
  Users,
  Award,
  ChevronRight,
  Lock,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface TeacherAssignmentSubmissionsViewProps {
  data: TeacherAssignmentSubmissionsData;
}

type FilterStatus = "all" | "not_submitted" | "submitted" | "late" | "graded";
type SortField = "name" | "roll" | "status" | "date" | "marks";
type SortOrder = "asc" | "desc";

export function TeacherAssignmentSubmissionsView({
  data,
}: TeacherAssignmentSubmissionsViewProps) {
  const [statusFilter, setStatusFilter] = useState<FilterStatus>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("roll");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");

  const { assignment, stats, rows } = data;

  const filteredAndSortedRows = useMemo(() => {
    return rows
      .filter((row) => {
        // Status filter
        if (statusFilter === "not_submitted" && row.status !== "not_submitted") {
          return false;
        }
        if (
          statusFilter === "submitted" &&
          row.status !== "submitted" &&
          row.status !== "submitted_late"
        ) {
          return false;
        }
        if (statusFilter === "late" && !row.isLate) {
          return false;
        }
        if (statusFilter === "graded" && row.status !== "graded") {
          return false;
        }

        // Search query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchName = row.name.toLowerCase().includes(q);
          const matchEmail = row.email.toLowerCase().includes(q);
          const matchRoll = row.roll ? row.roll.toLowerCase().includes(q) : false;
          const matchSection = row.sectionName.toLowerCase().includes(q);
          if (!matchName && !matchEmail && !matchRoll && !matchSection) {
            return false;
          }
        }

        return true;
      })
      .sort((a, b) => {
        let cmp = 0;
        if (sortField === "name") {
          cmp = a.name.localeCompare(b.name);
        } else if (sortField === "roll") {
          const rollA = a.roll || "";
          const rollB = b.roll || "";
          cmp = rollA.localeCompare(rollB, undefined, { numeric: true });
        } else if (sortField === "status") {
          cmp = a.status.localeCompare(b.status);
        } else if (sortField === "date") {
          const dateA = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
          const dateB = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;
          cmp = dateA - dateB;
        } else if (sortField === "marks") {
          const marksA = a.finalMarks ?? -1;
          const marksB = b.finalMarks ?? -1;
          cmp = marksA - marksB;
        }

        return sortOrder === "asc" ? cmp : -cmp;
      });
  }, [rows, statusFilter, searchQuery, sortField, sortOrder]);

  const handleToggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  return (
    <div className="space-y-6">
      {/* Back button */}
      <div>
        <Link
          href={`/teach/${data.offeringId}/assignments`}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors group"
        >
          <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
          <span>Back to Assignments</span>
        </Link>
      </div>

      {/* Top Header Card */}
      <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
                {data.courseCode}
              </span>
              <span className="text-xs text-muted-foreground">
                {data.term} • {data.academicYear}
              </span>
            </div>
            <h1 className="text-2xl font-bold text-foreground mt-2 tracking-tight">
              {assignment.title} — Student Submissions
            </h1>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <DeadlineChip deadline={assignment.deadline} />
              <span className="px-2 py-0.5 rounded-[8px] text-[12px] bg-surface-muted text-muted-foreground border border-border">
                {assignment.maxMarks} Max Marks
              </span>
              {assignment.lateAllowed ? (
                <span className="px-2 py-0.5 rounded-[8px] text-[12px] bg-warning/10 text-[#854D0E] dark:text-warning border border-warning/20">
                  Late allowed (-{assignment.latePenaltyPercent}%)
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-[8px] text-[12px] text-muted-foreground bg-surface-muted border border-border">
                  No late submissions
                </span>
              )}
            </div>
          </div>

          {/* Metric Badges */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 shrink-0">
            <div className="px-3 py-2 rounded-lg bg-surface-muted border border-border text-center">
              <div className="text-[11px] text-muted-foreground">Enrolled</div>
              <div className="text-lg font-bold text-foreground">
                {stats.totalEnrolled}
              </div>
            </div>
            <div className="px-3 py-2 rounded-lg bg-primary/10 border border-primary/20 text-center">
              <div className="text-[11px] text-primary font-medium">Submitted</div>
              <div className="text-lg font-bold text-primary">
                {stats.submittedCount}
              </div>
            </div>
            <div className="px-3 py-2 rounded-lg bg-success/10 border border-success/20 text-center">
              <div className="text-[11px] text-success-text font-medium">Graded</div>
              <div className="text-lg font-bold text-success-text">
                {stats.gradedCount}
              </div>
            </div>
            <div className="px-3 py-2 rounded-lg bg-warning/10 border border-warning/20 text-center">
              <div className="text-[11px] text-[#854D0E] dark:text-warning font-medium">
                Average
              </div>
              <div className="text-lg font-bold text-[#854D0E] dark:text-warning">
                {stats.avgScore !== null ? `${stats.avgScore}` : "-"}
              </div>
            </div>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-6 pt-5 border-t border-border">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap",
                statusFilter === "all"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-surface-muted text-muted-foreground hover:text-foreground hover:bg-surface-muted/80"
              )}
            >
              All ({rows.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("not_submitted")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap",
                statusFilter === "not_submitted"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-surface-muted text-muted-foreground hover:text-foreground hover:bg-surface-muted/80"
              )}
            >
              Not Submitted ({rows.length - stats.submittedCount})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("submitted")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap",
                statusFilter === "submitted"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-surface-muted text-muted-foreground hover:text-foreground hover:bg-surface-muted/80"
              )}
            >
              Submitted ({stats.submittedCount})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("late")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap",
                statusFilter === "late"
                  ? "bg-warning text-white shadow-sm"
                  : "bg-surface-muted text-muted-foreground hover:text-foreground hover:bg-surface-muted/80"
              )}
            >
              Late ({stats.lateCount})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("graded")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap",
                statusFilter === "graded"
                  ? "bg-success text-white shadow-sm"
                  : "bg-surface-muted text-muted-foreground hover:text-foreground hover:bg-surface-muted/80"
              )}
            >
              Graded ({stats.gradedCount})
            </button>
          </div>

          <div className="relative w-full sm:w-64">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search student or roll..."
              className="w-full pl-9 pr-3 py-1.5 rounded-lg text-xs bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/40 transition-colors"
            />
          </div>
        </div>
      </div>

      {/* Submissions Table */}
      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-surface-muted/60 border-b border-border text-muted-foreground font-semibold">
                <th
                  scope="col"
                  onClick={() => handleToggleSort("roll")}
                  className="py-3 px-4 cursor-pointer hover:text-foreground select-none"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Roll / ID</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th
                  scope="col"
                  onClick={() => handleToggleSort("name")}
                  className="py-3 px-4 cursor-pointer hover:text-foreground select-none"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Student</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th
                  scope="col"
                  onClick={() => handleToggleSort("status")}
                  className="py-3 px-4 cursor-pointer hover:text-foreground select-none"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Status</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th
                  scope="col"
                  onClick={() => handleToggleSort("date")}
                  className="py-3 px-4 cursor-pointer hover:text-foreground select-none"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Submission</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th
                  scope="col"
                  onClick={() => handleToggleSort("marks")}
                  className="py-3 px-4 cursor-pointer hover:text-foreground select-none"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Marks (Final / Raw)</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th scope="col" className="py-3 px-4 text-right">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredAndSortedRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-muted-foreground">
                    No student submissions found matching the criteria.
                  </td>
                </tr>
              ) : (
                filteredAndSortedRows.map((row) => {
                  const isGraded = row.status === "graded";
                  const isSubmitted =
                    row.status === "submitted" || row.status === "submitted_late";

                  return (
                    <tr
                      key={row.studentId}
                      className="hover:bg-surface-muted/30 transition-colors"
                    >
                      {/* Roll */}
                      <td className="py-3 px-4 font-mono font-medium text-foreground">
                        {row.roll || "—"}
                      </td>

                      {/* Student info */}
                      <td className="py-3 px-4">
                        <div className="font-semibold text-foreground">
                          {row.name}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {row.email} • {row.sectionName}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4">
                        <StatusChip status={row.status} />
                      </td>

                      {/* Submission details */}
                      <td className="py-3 px-4 text-muted-foreground">
                        {row.submittedAt ? (
                          <div>
                            <span className="font-medium text-foreground">
                              Version {row.latestVersionNo}
                            </span>
                            <div className="text-[11px]">
                              {formatDhaka(row.submittedAt, "short")}
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted italic">Unsubmitted</span>
                        )}
                      </td>

                      {/* Marks */}
                      <td className="py-3 px-4">
                        {isGraded ? (
                          <div>
                            <div className="font-bold text-success-text">
                              {row.finalMarks} / {assignment.maxMarks}
                            </div>
                            {row.finalMarks !== row.rawMarks && (
                              <div className="text-[10px] text-muted-foreground">
                                Raw: {row.rawMarks} (Late penalty)
                              </div>
                            )}
                          </div>
                        ) : isSubmitted ? (
                          <span className="text-warning-text font-medium text-[11px]">
                            Needs grading
                          </span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>

                      {/* Action link */}
                      <td className="py-3 px-4 text-right">
                        {row.submissionId ? (
                          <Link
                            href={`/teach/${data.offeringId}/submissions/${row.submissionId}`}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary-hover shadow-xs transition-colors"
                          >
                            <span>{isGraded ? "Edit Grade" : "Grade"}</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </Link>
                        ) : (
                          <span className="text-muted text-[11px] italic">
                            No submission
                          </span>
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
    </div>
  );
}
