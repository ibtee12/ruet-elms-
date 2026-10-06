"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import {
  StudentOfferingAssignmentsData,
  StudentAssignmentItemData,
} from "@/services/assignments";
import { DeadlineChip } from "@/components/shared/deadline-chip";
import { StatusChip } from "@/components/shared/status-chip";
import {
  FileCheck2,
  Paperclip,
  Search,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface StudentOfferingAssignmentsViewProps {
  data: StudentOfferingAssignmentsData;
}

export function StudentOfferingAssignmentsView({
  data,
}: StudentOfferingAssignmentsViewProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTab, setFilterTab] = useState<
    "all" | "pending" | "submitted" | "graded"
  >("all");

  const counts = useMemo(() => {
    let pending = 0;
    let submitted = 0;
    let graded = 0;

    data.assignments.forEach((a) => {
      if (a.statusChipType === "graded") {
        graded++;
      } else if (
        a.statusChipType === "submitted" ||
        a.statusChipType === "submitted_late"
      ) {
        submitted++;
      } else {
        pending++;
      }
    });

    return {
      all: data.assignments.length,
      pending,
      submitted,
      graded,
    };
  }, [data.assignments]);

  const filteredAssignments = useMemo(() => {
    return data.assignments.filter((a) => {
      // Tab filter
      if (filterTab === "pending") {
        if (
          a.statusChipType === "submitted" ||
          a.statusChipType === "submitted_late" ||
          a.statusChipType === "graded"
        ) {
          return false;
        }
      } else if (filterTab === "submitted") {
        if (
          a.statusChipType !== "submitted" &&
          a.statusChipType !== "submitted_late"
        ) {
          return false;
        }
      } else if (filterTab === "graded") {
        if (a.statusChipType !== "graded") {
          return false;
        }
      }

      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchTitle = a.title.toLowerCase().includes(query);
        const matchDesc = a.description?.toLowerCase().includes(query);
        if (!matchTitle && !matchDesc) {
          return false;
        }
      }

      return true;
    });
  }, [data.assignments, filterTab, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
                {data.code}
              </span>
              <span className="text-xs text-muted-foreground">
                {data.term} • {data.academicYear}
              </span>
            </div>
            <h1 className="text-2xl font-bold text-foreground mt-2 tracking-tight">
              Course Assignments
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Complete homework, review instructions, and submit assignments
              before deadlines.
            </p>
          </div>

          {/* Quick Metrics */}
          <div className="flex items-center gap-3">
            <div className="px-3 py-2 rounded-lg bg-surface-muted border border-border text-center min-w-[70px]">
              <div className="text-xs text-muted-foreground">Total</div>
              <div className="text-lg font-bold text-foreground">
                {counts.all}
              </div>
            </div>
            <div className="px-3 py-2 rounded-lg bg-warning/10 border border-warning/20 text-center min-w-[70px]">
              <div className="text-xs text-warning-text font-medium">
                Pending
              </div>
              <div className="text-lg font-bold text-warning-text">
                {counts.pending}
              </div>
            </div>
            <div className="px-3 py-2 rounded-lg bg-primary/10 border border-primary/20 text-center min-w-[70px]">
              <div className="text-xs text-primary font-medium">Submitted</div>
              <div className="text-lg font-bold text-primary">
                {counts.submitted}
              </div>
            </div>
            <div className="px-3 py-2 rounded-lg bg-success/10 border border-success/20 text-center min-w-[70px]">
              <div className="text-xs text-success-text font-medium">Graded</div>
              <div className="text-lg font-bold text-success-text">
                {counts.graded}
              </div>
            </div>
          </div>
        </div>

        {/* Filter Tabs and Search Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-6 pt-5 border-t border-border">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            <button
              type="button"
              onClick={() => setFilterTab("all")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap",
                filterTab === "all"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-surface-muted text-muted-foreground hover:text-foreground hover:bg-surface-muted/80"
              )}
            >
              All ({counts.all})
            </button>
            <button
              type="button"
              onClick={() => setFilterTab("pending")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap",
                filterTab === "pending"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-surface-muted text-muted-foreground hover:text-foreground hover:bg-surface-muted/80"
              )}
            >
              Pending ({counts.pending})
            </button>
            <button
              type="button"
              onClick={() => setFilterTab("submitted")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap",
                filterTab === "submitted"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-surface-muted text-muted-foreground hover:text-foreground hover:bg-surface-muted/80"
              )}
            >
              Submitted ({counts.submitted})
            </button>
            <button
              type="button"
              onClick={() => setFilterTab("graded")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap",
                filterTab === "graded"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-surface-muted text-muted-foreground hover:text-foreground hover:bg-surface-muted/80"
              )}
            >
              Graded ({counts.graded})
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
              placeholder="Search assignments..."
              className="w-full pl-9 pr-3 py-1.5 rounded-lg text-xs bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/40 transition-colors"
            />
          </div>
        </div>
      </div>

      {/* Assignment List */}
      {filteredAssignments.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center shadow-sm">
          <div className="w-12 h-12 rounded-full bg-surface-muted flex items-center justify-center mx-auto text-muted-foreground mb-3">
            <FileCheck2 className="w-6 h-6" />
          </div>
          <h3 className="text-base font-semibold text-foreground">
            No assignments found
          </h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
            {searchQuery
              ? `No assignments match your search query "${searchQuery}".`
              : filterTab !== "all"
              ? `There are no ${filterTab} assignments right now.`
              : "No assignments have been published for this course offering yet."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredAssignments.map((assignment) => (
            <AssignmentCard
              key={assignment.id}
              assignment={assignment}
              offeringId={data.offeringId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AssignmentCard({
  assignment,
  offeringId,
}: {
  assignment: StudentAssignmentItemData;
  offeringId: string;
}) {
  const isOverdue = assignment.statusChipType === "overdue";
  const isGraded = assignment.statusChipType === "graded";
  const isSubmitted =
    assignment.statusChipType === "submitted" ||
    assignment.statusChipType === "submitted_late";

  return (
    <Link
      href={`/courses/${offeringId}/assignments/${assignment.id}`}
      className="group block bg-card hover:bg-surface-muted/40 border border-border hover:border-primary/40 rounded-xl p-5 transition-all shadow-sm hover:shadow"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Main Details */}
        <div className="space-y-2 flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip status={assignment.statusChipType} />
            <DeadlineChip deadline={assignment.deadline} />
            <span className="px-2 py-0.5 rounded-[8px] text-[12px] font-medium bg-surface-muted text-muted-foreground border border-border">
              {assignment.maxMarks} Marks
            </span>
            {assignment.attachments.length > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[8px] text-[12px] text-muted-foreground bg-surface-muted border border-border">
                <Paperclip className="w-3 h-3" />
                <span>{assignment.attachments.length} files</span>
              </span>
            )}
            {assignment.lateAllowed ? (
              <span className="px-2 py-0.5 rounded-[8px] text-[11px] font-medium bg-warning/10 text-[#854D0E] dark:text-warning border border-warning/20">
                Late allowed (-{assignment.latePenaltyPercent}%)
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-[8px] text-[11px] text-muted-foreground bg-surface-muted/60 border border-border">
                No late submissions
              </span>
            )}
          </div>

          <h3 className="text-base font-semibold text-foreground group-hover:text-primary transition-colors flex items-center gap-2">
            <span>{assignment.title}</span>
          </h3>

          {/* Submission status snippet */}
          {assignment.submission && (
            <div className="text-xs text-muted-foreground flex items-center gap-3 pt-1">
              <span>
                Version {assignment.submission.latestVersionNo || 1} submitted
              </span>
              {isGraded && assignment.submission.marksAwarded !== null && (
                <span className="font-semibold text-success-text">
                  Score: {assignment.submission.marksAwarded} /{" "}
                  {assignment.maxMarks}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Action Button */}
        <div className="flex items-center gap-2 text-xs font-semibold text-primary group-hover:translate-x-0.5 transition-transform self-end md:self-center">
          <span>
            {isGraded
              ? "View Grade & Feedback"
              : isSubmitted
              ? "View Submission"
              : isOverdue && !assignment.lateAllowed
              ? "View Details"
              : "Submit Assignment"}
          </span>
          <ArrowRight className="w-4 h-4" />
        </div>
      </div>
    </Link>
  );
}
