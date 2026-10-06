"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import {
  StudentGlobalAssignmentsData,
  StudentAssignmentItemData,
} from "@/services/assignments";
import { DeadlineChip } from "@/components/shared/deadline-chip";
import { StatusChip } from "@/components/shared/status-chip";
import {
  FileCheck2,
  Search,
  ArrowRight,
  AlertCircle,
  Clock,
  Calendar,
  CheckCircle2,
  Award,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface StudentGlobalAssignmentsViewProps {
  data: StudentGlobalAssignmentsData;
}

type TabType = "all" | "overdue" | "dueSoon" | "upcoming" | "submitted" | "graded";

export function StudentGlobalAssignmentsView({
  data,
}: StudentGlobalAssignmentsViewProps) {
  const [activeTab, setActiveTab] = useState<TabType>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const counts = {
    all: data.totalCount,
    overdue: data.overdue.length,
    dueSoon: data.dueSoon.length,
    upcoming: data.upcoming.length,
    submitted: data.submitted.length,
    graded: data.graded.length,
  };

  const filteredOverdue = useMemo(() => {
    if (!searchQuery.trim()) return data.overdue;
    const q = searchQuery.toLowerCase();
    return data.overdue.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.courseCode.toLowerCase().includes(q) ||
        item.courseTitle.toLowerCase().includes(q)
    );
  }, [data.overdue, searchQuery]);

  const filteredDueSoon = useMemo(() => {
    if (!searchQuery.trim()) return data.dueSoon;
    const q = searchQuery.toLowerCase();
    return data.dueSoon.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.courseCode.toLowerCase().includes(q) ||
        item.courseTitle.toLowerCase().includes(q)
    );
  }, [data.dueSoon, searchQuery]);

  const filteredUpcoming = useMemo(() => {
    if (!searchQuery.trim()) return data.upcoming;
    const q = searchQuery.toLowerCase();
    return data.upcoming.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.courseCode.toLowerCase().includes(q) ||
        item.courseTitle.toLowerCase().includes(q)
    );
  }, [data.upcoming, searchQuery]);

  const filteredSubmitted = useMemo(() => {
    if (!searchQuery.trim()) return data.submitted;
    const q = searchQuery.toLowerCase();
    return data.submitted.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.courseCode.toLowerCase().includes(q) ||
        item.courseTitle.toLowerCase().includes(q)
    );
  }, [data.submitted, searchQuery]);

  const filteredGraded = useMemo(() => {
    if (!searchQuery.trim()) return data.graded;
    const q = searchQuery.toLowerCase();
    return data.graded.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.courseCode.toLowerCase().includes(q) ||
        item.courseTitle.toLowerCase().includes(q)
    );
  }, [data.graded, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight flex items-center gap-2.5">
              <FileCheck2 className="w-6 h-6 text-primary" />
              <span>Assignments</span>
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              All coursework, homework deadlines, and submission history across
              your enrolled courses.
            </p>
          </div>

          {/* Metrics summary */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
            {counts.overdue > 0 && (
              <div className="px-3 py-2 rounded-lg bg-danger/10 border border-danger/20 text-center min-w-[70px]">
                <div className="text-xs text-danger font-medium">Overdue</div>
                <div className="text-lg font-bold text-danger">
                  {counts.overdue}
                </div>
              </div>
            )}
            <div className="px-3 py-2 rounded-lg bg-warning/10 border border-warning/20 text-center min-w-[70px]">
              <div className="text-xs text-[#854D0E] dark:text-warning font-medium">
                Due Soon
              </div>
              <div className="text-lg font-bold text-[#854D0E] dark:text-warning">
                {counts.dueSoon}
              </div>
            </div>
            <div className="px-3 py-2 rounded-lg bg-surface-muted border border-border text-center min-w-[70px]">
              <div className="text-xs text-muted-foreground">Upcoming</div>
              <div className="text-lg font-bold text-foreground">
                {counts.upcoming}
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

        {/* Tab filters and search */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-6 pt-5 border-t border-border">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            <button
              type="button"
              onClick={() => setActiveTab("all")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap",
                activeTab === "all"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-surface-muted text-muted-foreground hover:text-foreground hover:bg-surface-muted/80"
              )}
            >
              All ({counts.all})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("overdue")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap",
                activeTab === "overdue"
                  ? "bg-danger text-white shadow-sm"
                  : "bg-surface-muted text-muted-foreground hover:text-foreground hover:bg-surface-muted/80"
              )}
            >
              Overdue ({counts.overdue})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("dueSoon")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap",
                activeTab === "dueSoon"
                  ? "bg-warning text-white shadow-sm"
                  : "bg-surface-muted text-muted-foreground hover:text-foreground hover:bg-surface-muted/80"
              )}
            >
              Due Soon ({counts.dueSoon})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("upcoming")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap",
                activeTab === "upcoming"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-surface-muted text-muted-foreground hover:text-foreground hover:bg-surface-muted/80"
              )}
            >
              Upcoming ({counts.upcoming})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("submitted")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap",
                activeTab === "submitted"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-surface-muted text-muted-foreground hover:text-foreground hover:bg-surface-muted/80"
              )}
            >
              Submitted ({counts.submitted})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("graded")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap",
                activeTab === "graded"
                  ? "bg-success text-white shadow-sm"
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
              placeholder="Search by title or course..."
              className="w-full pl-9 pr-3 py-1.5 rounded-lg text-xs bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/40 transition-colors"
            />
          </div>
        </div>
      </div>

      {/* Grouped / Filtered Content */}
      {data.totalCount === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center shadow-sm">
          <div className="w-12 h-12 rounded-full bg-surface-muted flex items-center justify-center mx-auto text-muted-foreground mb-3">
            <FileCheck2 className="w-6 h-6" />
          </div>
          <h3 className="text-base font-semibold text-foreground">
            No assignments yet
          </h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
            You don&apos;t have any published assignments across your enrolled courses right now.
          </p>
        </div>
      ) : activeTab === "all" ? (
        /* All: Grouped by Category */
        <div className="space-y-8">
          {/* Overdue Section */}
          {filteredOverdue.length > 0 && (
            <AssignmentSection
              title="Overdue Assignments"
              description="Deadlines have passed and require attention"
              items={filteredOverdue}
              badgeCount={filteredOverdue.length}
              badgeClass="bg-danger/10 text-danger border-danger/20"
              icon={AlertCircle}
            />
          )}

          {/* Due Soon Section */}
          {filteredDueSoon.length > 0 && (
            <AssignmentSection
              title="Due Soon"
              description="Due within the next 48 hours"
              items={filteredDueSoon}
              badgeCount={filteredDueSoon.length}
              badgeClass="bg-warning/10 text-[#854D0E] dark:text-warning border-warning/20"
              icon={Clock}
            />
          )}

          {/* Upcoming Section */}
          {filteredUpcoming.length > 0 && (
            <AssignmentSection
              title="Upcoming Assignments"
              description="Future assignments you can work on"
              items={filteredUpcoming}
              badgeCount={filteredUpcoming.length}
              badgeClass="bg-surface-muted text-foreground border-border"
              icon={Calendar}
            />
          )}

          {/* Submitted Section */}
          {filteredSubmitted.length > 0 && (
            <AssignmentSection
              title="Submitted (Awaiting Grading)"
              description="Submissions uploaded and pending instructor evaluation"
              items={filteredSubmitted}
              badgeCount={filteredSubmitted.length}
              badgeClass="bg-primary/10 text-primary border-primary/20"
              icon={CheckCircle2}
            />
          )}

          {/* Graded Section */}
          {filteredGraded.length > 0 && (
            <AssignmentSection
              title="Graded Assignments"
              description="Evaluated submissions with instructor feedback and scores"
              items={filteredGraded}
              badgeCount={filteredGraded.length}
              badgeClass="bg-success/10 text-success-text border-success/20"
              icon={Award}
            />
          )}

          {filteredOverdue.length === 0 &&
            filteredDueSoon.length === 0 &&
            filteredUpcoming.length === 0 &&
            filteredSubmitted.length === 0 &&
            filteredGraded.length === 0 && (
              <div className="p-8 text-center text-xs text-muted-foreground bg-card border border-border rounded-xl">
                No assignments match your search &ldquo;{searchQuery}&rdquo;.
              </div>
            )}
        </div>
      ) : (
        /* Specific Tab Selected */
        <div>
          {activeTab === "overdue" && (
            <TabSection
              title="Overdue Assignments"
              items={filteredOverdue}
              emptyMessage="No overdue assignments. Great job staying on schedule!"
            />
          )}
          {activeTab === "dueSoon" && (
            <TabSection
              title="Due Soon"
              items={filteredDueSoon}
              emptyMessage="No assignments due within the next 48 hours."
            />
          )}
          {activeTab === "upcoming" && (
            <TabSection
              title="Upcoming Assignments"
              items={filteredUpcoming}
              emptyMessage="No upcoming assignments right now."
            />
          )}
          {activeTab === "submitted" && (
            <TabSection
              title="Submitted Assignments"
              items={filteredSubmitted}
              emptyMessage="No pending un-graded submissions."
            />
          )}
          {activeTab === "graded" && (
            <TabSection
              title="Graded Assignments"
              items={filteredGraded}
              emptyMessage="No graded assignments yet."
            />
          )}
        </div>
      )}
    </div>
  );
}

function AssignmentSection({
  title,
  description,
  items,
  badgeCount,
  badgeClass,
  icon: Icon,
}: {
  title: string;
  description: string;
  items: StudentAssignmentItemData[];
  badgeCount: number;
  badgeClass: string;
  icon: React.ElementType;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-primary shrink-0" />
          <h2 className="text-base font-bold text-foreground">{title}</h2>
          <span
            className={cn(
              "px-2 py-0.5 rounded-full text-xs font-semibold border",
              badgeClass
            )}
          >
            {badgeCount}
          </span>
        </div>
        <span className="text-xs text-muted-foreground hidden sm:inline">
          {description}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {items.map((item) => (
          <GlobalAssignmentCard key={item.id} assignment={item} />
        ))}
      </div>
    </div>
  );
}

function TabSection({
  title,
  items,
  emptyMessage,
}: {
  title: string;
  items: StudentAssignmentItemData[];
  emptyMessage: string;
}) {
  if (items.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-12 text-center shadow-sm">
        <p className="text-xs text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="text-base font-bold text-foreground mb-3">{title}</h2>
      <div className="grid grid-cols-1 gap-3">
        {items.map((item) => (
          <GlobalAssignmentCard key={item.id} assignment={item} />
        ))}
      </div>
    </div>
  );
}

function GlobalAssignmentCard({
  assignment,
}: {
  assignment: StudentAssignmentItemData;
}) {
  const isGraded = assignment.statusChipType === "graded";
  const isSubmitted =
    assignment.statusChipType === "submitted" ||
    assignment.statusChipType === "submitted_late";

  return (
    <Link
      href={`/courses/${assignment.offeringId}/assignments/${assignment.id}`}
      className="group block bg-card hover:bg-surface-muted/40 border border-border hover:border-primary/40 rounded-xl p-4 transition-all shadow-sm hover:shadow"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="space-y-1.5 flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2 py-0.5 rounded-[6px] text-[11px] font-semibold bg-primary/10 text-primary border border-primary/20">
              {assignment.courseCode}
            </span>
            <span className="text-xs text-muted-foreground truncate max-w-[200px]">
              {assignment.courseTitle}
            </span>
            <StatusChip status={assignment.statusChipType} />
            <DeadlineChip deadline={assignment.deadline} />
          </div>

          <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors flex items-center gap-2">
            <span>{assignment.title}</span>
          </h3>

          {/* Submission and grade summary */}
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
            <span>{assignment.maxMarks} Marks</span>
            {assignment.submission?.latestVersionNo && (
              <>
                <span>•</span>
                <span>Version {assignment.submission.latestVersionNo}</span>
              </>
            )}
            {isGraded && assignment.submission?.marksAwarded !== null && (
              <>
                <span>•</span>
                <span className="font-semibold text-success-text">
                  Score: {assignment.submission?.marksAwarded} / {assignment.maxMarks}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-xs font-semibold text-primary group-hover:translate-x-0.5 transition-transform self-end md:self-center shrink-0">
          <span>{isGraded ? "View Grade" : isSubmitted ? "View Submission" : "Submit"}</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </div>
      </div>
    </Link>
  );
}
