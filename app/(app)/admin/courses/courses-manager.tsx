"use client";

import * as React from "react";
import {
  BookOpen,
  Plus,
  Search,
  Pencil,
  Trash2,
  X,
  Layers,
} from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable, Column } from "@/components/shared/data-table";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { toast } from "@/lib/toast";
import { Role } from "@prisma/client";
import {
  getCoursesAction,
  createCourseAction,
  updateCourseAction,
  deleteCourseAction,
} from "@/actions/courses";

export interface CourseRow {
  id: string;
  code: string;
  title: string;
  credits: number;
  description: string | null;
  department: {
    id: string;
    name: string;
    code: string;
  };
  _count: {
    offerings: number;
  };
}

interface DepartmentOption {
  id: string;
  name: string;
  code: string;
}

interface CoursesManagerProps {
  initialCourses: CourseRow[];
  initialTotal: number;
  departments: DepartmentOption[];
  callerRole: Role;
  callerDeptId?: string;
}

export function CoursesManager({
  initialCourses,
  initialTotal,
  departments,
  callerRole,
  callerDeptId,
}: CoursesManagerProps) {
  const [courses, setCourses] = React.useState<CourseRow[]>(initialCourses);
  const [total, setTotal] = React.useState(initialTotal);
  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [deptFilter, setDeptFilter] = React.useState<string>(
    callerDeptId || "ALL"
  );
  const [isLoading, setIsLoading] = React.useState(false);

  // Dialog State
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [editingCourse, setEditingCourse] = React.useState<CourseRow | null>(null);
  const [formData, setFormData] = React.useState({
    code: "",
    title: "",
    credits: 3.0,
    departmentId: callerDeptId || departments[0]?.id || "",
    description: "",
  });
  const [formErrors, setFormErrors] = React.useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Delete Confirm State
  const [confirmDialog, setConfirmDialog] = React.useState<{
    isOpen: boolean;
    course: CourseRow | null;
  }>({
    isOpen: false,
    course: null,
  });
  const [isDeleting, setIsDeleting] = React.useState(false);

  // Search debounce
  React.useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(handler);
  }, [search]);

  // Fetch courses
  const fetchCourses = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await getCoursesAction({
        search: debouncedSearch,
        departmentId: deptFilter,
        page: 1,
        pageSize: 50,
      });
      setCourses(res.courses as CourseRow[]);
      setTotal(res.total);
    } catch {
      toast.error("Failed to load catalog courses.");
    } finally {
      setIsLoading(false);
    }
  }, [debouncedSearch, deptFilter]);

  React.useEffect(() => {
    fetchCourses();
  }, [fetchCourses]);

  const handleOpenCreate = () => {
    setEditingCourse(null);
    setFormData({
      code: "",
      title: "",
      credits: 3.0,
      departmentId: callerDeptId || departments[0]?.id || "",
      description: "",
    });
    setFormErrors({});
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (course: CourseRow) => {
    setEditingCourse(course);
    setFormData({
      code: course.code,
      title: course.title,
      credits: course.credits,
      departmentId: course.department.id,
      description: course.description || "",
    });
    setFormErrors({});
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErrors({});
    setIsSubmitting(true);

    try {
      const payload = {
        code: formData.code.toUpperCase().trim(),
        title: formData.title.trim(),
        credits: Number(formData.credits),
        departmentId: formData.departmentId,
        description: formData.description?.trim() || undefined,
      };

      if (editingCourse) {
        const res = await updateCourseAction(editingCourse.id, payload);
        if (!res.success) {
          if (res.fieldErrors) setFormErrors(res.fieldErrors);
          toast.error(res.error || "Failed to update course.");
          return;
        }
        toast.success("Course updated successfully");
      } else {
        const res = await createCourseAction(payload);
        if (!res.success) {
          if (res.fieldErrors) setFormErrors(res.fieldErrors);
          toast.error(res.error || "Failed to create course.");
          return;
        }
        toast.success("Course created successfully");
      }

      setIsDialogOpen(false);
      fetchCourses();
    } catch {
      toast.error("An unexpected error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!confirmDialog.course) return;
    setIsDeleting(true);

    try {
      const res = await deleteCourseAction(confirmDialog.course.id);
      if (!res.success) {
        toast.error(res.error || "Failed to delete course.");
        return;
      }
      toast.success("Course deleted successfully");
      setConfirmDialog({ isOpen: false, course: null });
      fetchCourses();
    } catch {
      toast.error("Action failed.");
    } finally {
      setIsDeleting(false);
    }
  };

  const columns: Column<CourseRow>[] = [
    {
      key: "code",
      header: "Course Code",
      sortable: true,
      render: (c) => (
        <span className="font-mono font-bold text-xs uppercase px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20">
          {c.code}
        </span>
      ),
    },
    {
      key: "title",
      header: "Course Title",
      sortable: true,
      render: (c) => (
        <div>
          <span className="font-semibold text-foreground text-sm block">
            {c.title}
          </span>
          {c.description ? (
            <p className="text-xs text-muted truncate max-w-sm" title={c.description}>
              {c.description}
            </p>
          ) : (
            <span className="text-xs text-muted/60 italic">No syllabus summary</span>
          )}
        </div>
      ),
    },
    {
      key: "credits",
      header: "Credits",
      sortable: true,
      align: "center",
      render: (c) => (
        <span className="font-mono font-semibold text-xs px-2 py-0.5 rounded bg-surface-muted border border-border text-foreground">
          {c.credits.toFixed(2)}
        </span>
      ),
    },
    {
      key: "department",
      header: "Department",
      align: "center",
      render: (c) => (
        <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-surface-muted text-foreground border border-border">
          {c.department.code}
        </span>
      ),
    },
    {
      key: "offerings",
      header: "Offerings",
      sortable: true,
      align: "center",
      render: (c) => (
        <div className="inline-flex items-center gap-1.5 text-xs text-muted">
          <Layers className="w-3.5 h-3.5 text-muted/80" />
          <span className="font-semibold text-foreground">
            {c._count.offerings}
          </span>
        </div>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (c) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              handleOpenEdit(c);
            }}
            title="Edit Course"
            aria-label={`Edit ${c.code}`}
            className="h-8 w-8 p-0 text-muted hover:text-foreground"
          >
            <Pencil className="w-4 h-4" />
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              setConfirmDialog({ isOpen: true, course: c });
            }}
            title="Delete Course"
            aria-label={`Delete ${c.code}`}
            className="h-8 w-8 p-0 text-muted hover:text-danger"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Search and Action Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-surface p-4 rounded-[10px] border border-border shadow-xs">
        <div className="flex flex-1 items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
            <input
              type="text"
              placeholder="Search by course code or title..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-10 pl-9 pr-8 text-sm rounded-md border border-border bg-background text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-foreground p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Department Filter */}
          {callerRole === Role.SUPER_ADMIN && (
            <div className="hidden md:flex items-center gap-1.5 border-l border-border pl-3">
              <span className="text-xs text-muted font-medium">Department:</span>
              <select
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
                className="h-9 px-2.5 rounded-md border border-border bg-background text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="ALL">All Departments</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.code} - {d.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="hidden lg:flex items-center text-xs text-muted ml-auto pr-2">
            Total: <span className="font-semibold text-foreground ml-1">{total} courses</span>
          </div>
        </div>

        <Button
          type="button"
          onClick={handleOpenCreate}
          className="flex items-center gap-1.5 shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>New Course</span>
        </Button>
      </div>

      {/* Courses DataTable */}
      <DataTable
        columns={columns}
        data={courses}
        keyExtractor={(c) => c.id}
        isLoading={isLoading}
        emptyTitle="No courses found"
        emptyDescription={
          search
            ? `No catalog courses matching "${search}".`
            : "No courses configured for this academic department."
        }
        emptyAction={
          search
            ? {
                label: "Clear Search",
                onClick: () => setSearch(""),
              }
            : {
                label: "Add Course",
                onClick: handleOpenCreate,
              }
        }
      />

      {/* Dialog: Create / Edit Course */}
      <DialogPrimitive.Root open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs" />
          <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-[10px] border border-border bg-surface p-6 shadow-xl focus:outline-none">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-primary" />
                <DialogPrimitive.Title className="text-lg font-semibold text-foreground">
                  {editingCourse ? `Edit Course (${editingCourse.code})` : "Create Catalog Course"}
                </DialogPrimitive.Title>
              </div>
              <DialogPrimitive.Close asChild>
                <button
                  type="button"
                  aria-label="Close dialog"
                  className="w-8 h-8 rounded-md text-muted hover:text-foreground flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </DialogPrimitive.Close>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 pt-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                {/* Course Code */}
                <div>
                  <label className="block font-semibold uppercase text-muted mb-1">
                    Course Code <span className="text-danger">*</span>
                  </label>
                  <Input
                    type="text"
                    placeholder="e.g. CSE 3205"
                    value={formData.code}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))
                    }
                    error={formErrors.code}
                    required
                  />
                  <p className="text-[11px] text-muted mt-1">
                    Format: Dept letters, space, digits.
                  </p>
                </div>

                {/* Credits */}
                <div>
                  <label className="block font-semibold uppercase text-muted mb-1">
                    Credits (0.75 - 6.00) <span className="text-danger">*</span>
                  </label>
                  <Input
                    type="number"
                    step="0.25"
                    min="0.75"
                    max="6.00"
                    placeholder="3.00"
                    value={formData.credits}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        credits: parseFloat(e.target.value) || 0,
                      }))
                    }
                    error={formErrors.credits}
                    required
                  />
                </div>
              </div>

              {/* Title */}
              <div>
                <label className="block font-semibold uppercase text-muted mb-1">
                  Course Title <span className="text-danger">*</span>
                </label>
                <Input
                  type="text"
                  placeholder="e.g. Software Engineering & Information Systems"
                  value={formData.title}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, title: e.target.value }))
                  }
                  error={formErrors.title}
                  required
                />
              </div>

              {/* Department */}
              <div>
                <label className="block font-semibold uppercase text-muted mb-1">
                  Department <span className="text-danger">*</span>
                </label>
                <select
                  disabled={callerRole === Role.DEPT_ADMIN}
                  value={formData.departmentId}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      departmentId: e.target.value,
                    }))
                  }
                  className="w-full h-10 px-3 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
                >
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.code} - {d.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Description */}
              <div>
                <label className="block font-semibold uppercase text-muted mb-1">
                  Syllabus Description (Optional)
                </label>
                <textarea
                  rows={3}
                  placeholder="Course summary, learning objectives, and scope..."
                  value={formData.description}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
                  className="w-full p-2.5 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setIsDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" isLoading={isSubmitting}>
                  {editingCourse ? "Save Changes" : "Create Course"}
                </Button>
              </div>
            </form>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      {/* Confirmation Dialog: Delete */}
      <ConfirmDialog
        open={confirmDialog.isOpen}
        onOpenChange={(open) =>
          setConfirmDialog((prev) => ({ ...prev, isOpen: open }))
        }
        title={
          confirmDialog.course?._count.offerings
            ? `Cannot Delete ${confirmDialog.course?.code}`
            : `Delete ${confirmDialog.course?.code}?`
        }
        description={
          confirmDialog.course?._count.offerings
            ? `This course has ${confirmDialog.course._count.offerings} recorded term offering(s). Academic courses with offerings cannot be deleted. You can edit course information instead.`
            : `Are you sure you want to permanently delete ${confirmDialog.course?.code} (${confirmDialog.course?.title})? This action cannot be reversed.`
        }
        confirmLabel={
          confirmDialog.course?._count.offerings ? "OK" : "Delete Course"
        }
        isDestructive={!confirmDialog.course?._count.offerings}
        isLoading={isDeleting}
        onConfirm={() => {
          if (confirmDialog.course?._count.offerings) {
            setConfirmDialog({ isOpen: false, course: null });
          } else {
            handleDeleteConfirm();
          }
        }}
      />
    </div>
  );
}
