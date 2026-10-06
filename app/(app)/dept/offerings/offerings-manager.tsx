"use client";

import * as React from "react";
import Link from "next/link";
import {
  Layers,
  Plus,
  Search,
  ArrowRight,
  X,
} from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable, Column } from "@/components/shared/data-table";
import { StatusChip } from "@/components/shared/status-chip";
import { toast } from "@/lib/toast";
import { Role, CourseOfferingStatus, Prisma } from "@prisma/client";
import {
  getOfferingsAction,
  createOfferingAction,
} from "@/actions/offerings";

export interface OfferingRow {
  id: string;
  term: string;
  academicYear: string;
  status: CourseOfferingStatus;
  joinCode: string | null;
  course: {
    id: string;
    code: string;
    title: string;
    credits: number | string | Prisma.Decimal;
    department: { id: string; name: string; code: string };
  };
  sections: Array<{
    id: string;
    name: string;
    _count: { enrollments: number };
  }>;
  offeringTeachers: Array<{
    id: string;
    role: string;
    user: { id: string; name: string; email: string };
  }>;
}

interface CourseOption {
  id: string;
  code: string;
  title: string;
  departmentId: string;
}

interface OfferingsManagerProps {
  initialOfferings: OfferingRow[];
  availableCourses: CourseOption[];
  callerRole: Role;
  callerDeptId?: string;
}

export function OfferingsManager({
  initialOfferings,
  availableCourses,
}: OfferingsManagerProps) {
  const [offerings, setOfferings] = React.useState<OfferingRow[]>(initialOfferings);
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<string>("ALL");
  const [termFilter, setTermFilter] = React.useState<string>("ALL");
  const [yearFilter, setYearFilter] = React.useState<string>("ALL");
  const [isLoading, setIsLoading] = React.useState(false);

  // Create Offering State
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const [createData, setCreateData] = React.useState({
    courseId: availableCourses[0]?.id || "",
    term: "Even Term",
    academicYear: "2026",
    syllabus: "",
  });
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const fetchOfferings = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await getOfferingsAction({
        search: search.trim() || undefined,
        status:
          statusFilter !== "ALL"
            ? (statusFilter as CourseOfferingStatus)
            : undefined,
        term: termFilter !== "ALL" ? termFilter : undefined,
        academicYear: yearFilter !== "ALL" ? yearFilter : undefined,
        page: 1,
        pageSize: 50,
      });
      setOfferings(res.offerings as OfferingRow[]);
    } catch {
      toast.error("Failed to load offerings.");
    } finally {
      setIsLoading(false);
    }
  }, [search, statusFilter, termFilter, yearFilter]);

  React.useEffect(() => {
    fetchOfferings();
  }, [fetchOfferings]);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createData.courseId) {
      toast.error("Please select a catalog course.");
      return;
    }
    setIsSubmitting(true);

    try {
      const res = await createOfferingAction(createData);
      if (!res.success) {
        toast.error("Failed to create offering.");
        return;
      }
      toast.success("Offering created as DRAFT");
      setIsCreateOpen(false);
      fetchOfferings();
    } catch {
      toast.error("An error occurred creating offering.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const columns: Column<OfferingRow>[] = [
    {
      key: "course",
      header: "Course Information",
      render: (o) => (
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-xs uppercase px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20">
              {o.course.code}
            </span>
            <span className="font-semibold text-foreground text-sm">
              {o.course.title}
            </span>
          </div>
          <span className="text-xs text-muted block mt-0.5">
            Department of {o.course.department.name} ({o.course.department.code})
          </span>
        </div>
      ),
    },
    {
      key: "session",
      header: "Session & Term",
      render: (o) => (
        <span className="text-xs font-medium text-foreground">
          {o.term} {o.academicYear}
        </span>
      ),
    },
    {
      key: "sections",
      header: "Sections",
      align: "center",
      render: (o) => (
        <div className="flex flex-wrap items-center justify-center gap-1">
          {o.sections.map((s) => (
            <span
              key={s.id}
              className="text-[11px] px-1.5 py-0.5 rounded bg-surface-muted border border-border font-mono"
            >
              {s.name} ({s._count.enrollments})
            </span>
          ))}
        </div>
      ),
    },
    {
      key: "teachers",
      header: "Instructors",
      render: (o) => {
        const instructors = o.offeringTeachers.filter(
          (t) => t.role === "INSTRUCTOR"
        );
        const tas = o.offeringTeachers.filter((t) => t.role === "TA");

        return (
          <div className="text-xs space-y-0.5">
            {instructors.length > 0 ? (
              <span className="text-foreground block truncate max-w-xs">
                {instructors.map((i) => i.user.name).join(", ")}
              </span>
            ) : (
              <span className="text-warning font-semibold block text-[11px]">
                ⚠️ No Instructor Assigned
              </span>
            )}
            {tas.length > 0 && (
              <span className="text-muted text-[11px] block truncate max-w-xs">
                TA: {tas.map((t) => t.user.name).join(", ")}
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: "status",
      header: "Status",
      align: "center",
      render: (o) => {
        const statusMap: Record<CourseOfferingStatus, "draft" | "active" | "archived"> = {
          DRAFT: "draft",
          PUBLISHED: "active",
          ARCHIVED: "archived",
        };
        return <StatusChip status={statusMap[o.status]} />;
      },
    },
    {
      key: "actions",
      header: "Management",
      align: "right",
      render: (o) => (
        <Link
          href={`/dept/offerings/${o.id}`}
          className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary-hover px-2.5 py-1.5 rounded-md hover:bg-primary/10 transition-colors"
        >
          <span>Manage</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Control Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-surface p-4 rounded-[10px] border border-border shadow-xs">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
            <input
              type="text"
              placeholder="Search by code or title..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-10 pl-9 pr-8 text-sm rounded-md border border-border bg-background text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Quick Filters */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-10 px-3 rounded-md border border-border bg-background text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="ALL">All Status</option>
            <option value="DRAFT">Draft</option>
            <option value="PUBLISHED">Published</option>
            <option value="ARCHIVED">Archived</option>
          </select>

          <select
            value={termFilter}
            onChange={(e) => setTermFilter(e.target.value)}
            className="h-10 px-3 rounded-md border border-border bg-background text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="ALL">All Terms</option>
            <option value="Even Term">Even Term</option>
            <option value="Odd Term">Odd Term</option>
          </select>

          <select
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
            className="h-10 px-3 rounded-md border border-border bg-background text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="ALL">All Years</option>
            <option value="2026">2026</option>
            <option value="2025">2025</option>
            <option value="2024">2024</option>
          </select>
        </div>

        <Button
          type="button"
          onClick={() => setIsCreateOpen(true)}
          className="flex items-center gap-1.5 shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>New Offering</span>
        </Button>
      </div>

      {/* Offerings Table */}
      <DataTable
        columns={columns}
        data={offerings}
        keyExtractor={(o) => o.id}
        isLoading={isLoading}
        emptyTitle="No offerings found"
        emptyDescription="No course offerings found matching the selected term or query."
        emptyAction={{
          label: "Create Offering",
          onClick: () => setIsCreateOpen(true),
        }}
      />

      {/* Dialog: Create Offering */}
      <DialogPrimitive.Root open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs" />
          <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-[10px] border border-border bg-surface p-6 shadow-xl focus:outline-none">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-primary" />
                <DialogPrimitive.Title className="text-lg font-semibold text-foreground">
                  Create Term Offering
                </DialogPrimitive.Title>
              </div>
              <DialogPrimitive.Close asChild>
                <button
                  type="button"
                  aria-label="Close dialog"
                  className="w-8 h-8 rounded text-muted hover:text-foreground flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </DialogPrimitive.Close>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4 pt-4 text-xs">
              <div>
                <label className="block font-semibold uppercase text-muted mb-1">
                  Catalog Course <span className="text-danger">*</span>
                </label>
                <select
                  value={createData.courseId}
                  onChange={(e) =>
                    setCreateData((prev) => ({ ...prev, courseId: e.target.value }))
                  }
                  className="w-full h-10 px-3 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  required
                >
                  {availableCourses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code}: {c.title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold uppercase text-muted mb-1">
                    Academic Term
                  </label>
                  <select
                    value={createData.term}
                    onChange={(e) =>
                      setCreateData((prev) => ({ ...prev, term: e.target.value }))
                    }
                    className="w-full h-10 px-3 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="Even Term">Even Term</option>
                    <option value="Odd Term">Odd Term</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold uppercase text-muted mb-1">
                    Academic Year
                  </label>
                  <Input
                    type="text"
                    value={createData.academicYear}
                    onChange={(e) =>
                      setCreateData((prev) => ({
                        ...prev,
                        academicYear: e.target.value,
                      }))
                    }
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold uppercase text-muted mb-1">
                  Syllabus &amp; Term Objectives (Optional)
                </label>
                <textarea
                  rows={3}
                  placeholder="Outline topics, textbooks, and assessment guidelines..."
                  value={createData.syllabus}
                  onChange={(e) =>
                    setCreateData((prev) => ({ ...prev, syllabus: e.target.value }))
                  }
                  className="w-full p-2.5 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <p className="text-[11px] text-muted italic">
                ℹ️ Initial offering will be created in DRAFT status with &quot;Section A&quot;. You must assign at least one instructor before publishing.
              </p>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setIsCreateOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" isLoading={isSubmitting}>
                  Create Offering
                </Button>
              </div>
            </form>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </div>
  );
}
