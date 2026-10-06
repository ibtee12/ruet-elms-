"use client";

import * as React from "react";
import {
  Users,
  GraduationCap,
  CheckCircle,
  AlertTriangle,
  FolderOpen,
} from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { StatusChip, type StatusType } from "@/components/shared/status-chip";
import { DeadlineChip } from "@/components/shared/deadline-chip";
import { EmptyState } from "@/components/shared/empty-state";
import {
  SkeletonList,
  SkeletonTable,
} from "@/components/shared/skeleton-loaders";
import { ProgressBar } from "@/components/shared/progress-bar";
import { DataTable, type Column } from "@/components/shared/data-table";
import { FileDropzone } from "@/components/shared/file-dropzone";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Avatar } from "@/components/shared/avatar";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/lib/toast";

interface GradeRow {
  id: string;
  student: string;
  roll: string;
  a1: number | string;
  a2: number | string;
  quiz1: number | string;
  status: StatusType;
}

const SAMPLE_STUDENTS: GradeRow[] = [
  {
    id: "1",
    student: "Ibtee Rahman",
    roll: "1903001",
    a1: "18/20",
    a2: "16/20",
    quiz1: "8/10",
    status: "graded",
  },
  {
    id: "2",
    student: "Nahyan Farhan",
    roll: "1903002",
    a1: "19/20",
    a2: "17/20",
    quiz1: "9/10",
    status: "submitted",
  },
  {
    id: "3",
    student: "Sadia Afrin",
    roll: "1903003",
    a1: "14/20",
    a2: "—",
    quiz1: "6/10",
    status: "submitted_late",
  },
  {
    id: "4",
    student: "Tanvir Ahmed",
    roll: "1903004",
    a1: "—",
    a2: "—",
    quiz1: "—",
    status: "overdue",
  },
];

export default function ComponentShowcasePage() {
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [tableLoading, setTableLoading] = React.useState(false);
  const [tableEmpty, setTableEmpty] = React.useState(false);
  const [buttonLoading, setButtonLoading] = React.useState(false);

  const now = new Date();
  const deadlineFuture3Days = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const deadlineWarning12Hours = new Date(now.getTime() + 12 * 60 * 60 * 1000);
  const deadlineDanger2Hours = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const deadlineOverdue = new Date(now.getTime() - 4 * 60 * 60 * 1000);

  const allStatuses: StatusType[] = [
    "not_submitted",
    "submitted",
    "submitted_late",
    "graded",
    "overdue",
    "missed",
    "draft",
    "published",
    "archived",
    "risk_low",
    "risk_medium",
    "risk_high",
    "notif_urgent",
    "notif_academic",
    "notif_general",
    "notif_result",
  ];

  const columns: Column<GradeRow>[] = [
    {
      key: "student",
      header: "Student",
      sortable: true,
      render: (row) => (
        <div className="flex items-center gap-2.5">
          <Avatar name={row.student} size="sm" />
          <div>
            <p className="font-medium text-foreground">{row.student}</p>
            <p className="text-xs text-muted font-mono">{row.roll}</p>
          </div>
        </div>
      ),
    },
    { key: "a1", header: "Assignment 1", sortable: true },
    { key: "a2", header: "Assignment 2", sortable: true },
    { key: "quiz1", header: "Quiz 1", sortable: true },
    {
      key: "status",
      header: "Status",
      render: (row) => <StatusChip status={row.status} />,
    },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground py-8 px-4 sm:px-6 lg:px-8 max-w-[1200px] mx-auto space-y-12">
      {/* 1. Header & Theme Toggle */}
      <PageHeader
        title="RUET ELMS Design System"
        subtitle="Shared components and tokens showcasing states, accessibility, and responsive behavior (360px mobile to desktop)."
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Dev Tools" },
          { label: "Design System" },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted hidden sm:inline">Theme:</span>
            <ThemeToggle />
          </div>
        }
      />

      {/* 2. Color Palette Reference */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground border-b border-border pb-2">
          1. Color Tokens &amp; Contrast
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3 text-xs">
          <div className="p-3 rounded-lg bg-navy text-white flex flex-col justify-between h-20">
            <span className="font-semibold">Navy</span>
            <span className="opacity-80">#0F2A4A</span>
          </div>
          <div className="p-3 rounded-lg bg-primary text-primary-foreground flex flex-col justify-between h-20">
            <span className="font-semibold">Primary Teal</span>
            <span className="opacity-80">#0B7D7C</span>
          </div>
          <div className="p-3 rounded-lg bg-teal-accent text-white flex flex-col justify-between h-20">
            <span className="font-semibold">Teal Accent</span>
            <span className="opacity-80">#0EA5A4</span>
          </div>
          <div className="p-3 rounded-lg bg-warning text-[#1E293B] flex flex-col justify-between h-20">
            <span className="font-semibold">Warning</span>
            <span className="opacity-80">#F59E0B</span>
          </div>
          <div className="p-3 rounded-lg bg-success text-white flex flex-col justify-between h-20">
            <span className="font-semibold">Success</span>
            <span className="opacity-80">#16A34A</span>
          </div>
          <div className="p-3 rounded-lg bg-danger text-white flex flex-col justify-between h-20">
            <span className="font-semibold">Danger</span>
            <span className="opacity-80">#DC2626</span>
          </div>
        </div>
      </section>

      {/* 3. Buttons & Form Inputs */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground border-b border-border pb-2">
          2. Buttons &amp; Form Fields
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary">Primary Action</Button>
          <Button variant="secondary">Secondary Outline</Button>
          <Button variant="ghost">Ghost Button</Button>
          <Button variant="destructive">Destructive Action</Button>
          <Button disabled>Disabled Button</Button>
          <Button
            isLoading={buttonLoading}
            onClick={() => {
              setButtonLoading(true);
              setTimeout(() => setButtonLoading(false), 2000);
            }}
          >
            {buttonLoading ? "Saving..." : "Click to Test Loading"}
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 pt-2">
          <Input
            label="Student ID or Email"
            placeholder="e.g. 1903001 or name@ruet.ac.bd"
            helperText="Visible label and helper text under field."
          />
          <Input
            label="Course Password"
            type="password"
            defaultValue="wrong-input"
            error="The password you entered is incorrect."
          />
          <Input
            label="Disabled Field"
            disabled
            defaultValue="Non-editable department code"
            helperText="Disabled state with reduced opacity."
          />
        </div>
      </section>

      {/* 4. Status Chips & Deadlines (Always Icon + Label + Color) */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground border-b border-border pb-2">
          3. Status Chips &amp; Relative Deadlines
        </h2>
        <p className="text-xs text-muted">
          Per Design Principle 3: Status is never color alone. Every status has
          an icon, a text label, and a color.
        </p>
        <div className="flex flex-wrap gap-2.5">
          {allStatuses.map((status) => (
            <StatusChip key={status} status={status} />
          ))}
        </div>

        <div className="pt-2 space-y-2">
          <p className="text-xs font-semibold text-muted">
            Deadline Chips (Hover/Focus for Dhaka absolute time):
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <span className="text-xs text-muted block mb-1">
                &gt; 24 Hours (Normal):
              </span>
              <DeadlineChip deadline={deadlineFuture3Days} />
            </div>
            <div>
              <span className="text-xs text-muted block mb-1">
                &lt; 24 Hours (Warning):
              </span>
              <DeadlineChip deadline={deadlineWarning12Hours} />
            </div>
            <div>
              <span className="text-xs text-muted block mb-1">
                &lt; 3 Hours (Danger):
              </span>
              <DeadlineChip deadline={deadlineDanger2Hours} />
            </div>
            <div>
              <span className="text-xs text-muted block mb-1">
                Overdue (Danger):
              </span>
              <DeadlineChip deadline={deadlineOverdue} />
            </div>
          </div>
        </div>
      </section>

      {/* 5. Stat Cards */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground border-b border-border pb-2">
          4. Analytical Stat Cards
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Total Students"
            value="128"
            subtext="Enrolled in Section A & B"
            icon={Users}
            trend={{ value: "+4 this week", isPositive: true }}
          />
          <StatCard
            label="Average Quiz Score"
            value="78%"
            subtext="Quiz 01 · Database Normalization"
            icon={GraduationCap}
          />
          <StatCard
            label="Submission Rate"
            value="92%"
            subtext="118 / 128 submissions"
            icon={CheckCircle}
            trend={{ value: "+8% vs A1", isPositive: true }}
          />
          <StatCard
            label="Needs Attention"
            value="6"
            subtext="At-risk students requiring follow-up"
            icon={AlertTriangle}
            trend={{ value: "2 high risk", isPositive: false }}
          />
        </div>
      </section>

      {/* 6. Progress Bars */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground border-b border-border pb-2">
          5. Accessible Progress Bars
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <ProgressBar label="DBMS Syllabus Covered" value={78} />
          <ProgressBar label="Operating Systems Lab" value={45} />
          <ProgressBar
            label="Low Progress Warning"
            value={15}
            barClassName="bg-warning"
          />
          <ProgressBar
            label="Completed Course"
            value={100}
            barClassName="bg-success"
          />
        </div>
      </section>

      {/* 7. Data Table */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border pb-2">
          <h2 className="text-lg font-semibold text-foreground">
            6. Compact &amp; Sortable Data Table
          </h2>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setTableLoading(!tableLoading)}
            >
              Toggle Skeleton ({tableLoading ? "Loading" : "Normal"})
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setTableEmpty(!tableEmpty)}
            >
              Toggle Empty ({tableEmpty ? "Empty" : "Data"})
            </Button>
          </div>
        </div>

        <DataTable
          columns={columns}
          data={tableEmpty ? [] : SAMPLE_STUDENTS}
          keyExtractor={(row) => row.id}
          stickyFirstColumn
          isLoading={tableLoading}
          emptyTitle="No students found"
          emptyDescription="No student records match the active criteria."
          emptyAction={{
            label: "Reset Filters",
            onClick: () => setTableEmpty(false),
          }}
        />
      </section>

      {/* 8. File Dropzone */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground border-b border-border pb-2">
          7. File Uploader / Dropzone
        </h2>
        <FileDropzone
          allowedExtensions={["pdf", "docx", "zip"]}
          maxSizeMB={10}
          multiple
        />
      </section>

      {/* 9. Dialogs, Toasts, and Avatars */}
      <section className="space-y-6">
        <h2 className="text-lg font-semibold text-foreground border-b border-border pb-2">
          8. Modals, Toasts &amp; Avatars
        </h2>

        <div className="flex flex-wrap items-center gap-3">
          <Button variant="destructive" onClick={() => setIsDialogOpen(true)}>
            Trigger Confirm Dialog
          </Button>

          <Button
            variant="secondary"
            onClick={() =>
              toast.success("Assignment submission recorded as version 2.")
            }
          >
            Success Toast
          </Button>

          <Button
            variant="secondary"
            onClick={() => toast.warning("Deadline approaching in 3 hours.")}
          >
            Warning Toast
          </Button>

          <Button
            variant="secondary"
            onClick={() => toast.error("File upload failed. Server timed out.")}
          >
            Error Toast
          </Button>
        </div>

        {/* Avatars */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted">
            Deterministic Initial Avatars (High Contrast Contrast Tints):
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <Avatar name="Dr. A. Rahman" size="lg" />
            <Avatar name="Ibtee Rahman" size="md" />
            <Avatar name="Nahyan Khan" size="md" />
            <Avatar name="Sadia Afrin" size="sm" />
            <Avatar name="Super Admin" size="sm" />
          </div>
        </div>

        {/* Skeleton Loaders Showcase */}
        <div className="space-y-4 pt-4">
          <p className="text-xs font-semibold text-muted">
            Standalone Skeleton Shimmer:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SkeletonList count={2} />
            <SkeletonTable rows={2} columns={3} />
          </div>
        </div>

        {/* Empty State Showcase */}
        <div className="pt-4">
          <EmptyState
            icon={FolderOpen}
            title="No assignments posted yet"
            description="When assignments are created for this course offering, they will appear here with instructions and deadlines."
            action={{
              label: "Create First Assignment",
              onClick: () =>
                toast.info("Create assignment modal placeholder clicked."),
            }}
          />
        </div>
      </section>

      {/* Destructive Confirm Dialog */}
      <ConfirmDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        title="Delete 'Assignment 03 · Normalization'?"
        description="This will permanently delete the assignment, worksheet materials, and 12 existing student submissions. This action cannot be undone."
        confirmLabel="Delete Assignment"
        isDestructive
        onConfirm={() => {
          toast.success("Assignment 03 was deleted.");
        }}
      />
    </div>
  );
}
