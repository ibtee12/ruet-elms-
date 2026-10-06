"use client";

import * as React from "react";
import {
  Building2,
  Plus,
  Search,
  Pencil,
  Trash2,
  Power,
  Users,
  GraduationCap,
  BookOpen,
  X,
  CheckCircle2,
} from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable, Column } from "@/components/shared/data-table";
import { StatusChip } from "@/components/shared/status-chip";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { StatCard } from "@/components/shared/stat-card";
import { toast } from "@/lib/toast";
import {
  createDepartmentAction,
  updateDepartmentAction,
  toggleDepartmentStatusAction,
  deleteDepartmentAction,
} from "@/actions/departments";

export interface DepartmentRow {
  id: string;
  name: string;
  code: string;
  description: string | null;
  isActive: boolean;
  _count: {
    teacherProfiles: number;
    studentProfiles: number;
    courses: number;
  };
}

interface DepartmentsManagerProps {
  initialDepartments: DepartmentRow[];
}

export function DepartmentsManager({ initialDepartments }: DepartmentsManagerProps) {
  const [departments, setDepartments] = React.useState<DepartmentRow[]>(initialDepartments);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");

  // Dialog State: Create / Edit
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [editingDept, setEditingDept] = React.useState<DepartmentRow | null>(null);
  const [formData, setFormData] = React.useState({
    name: "",
    code: "",
    description: "",
  });
  const [formErrors, setFormErrors] = React.useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Confirmation Dialog State: Deactivate / Delete
  const [confirmDialog, setConfirmDialog] = React.useState<{
    isOpen: boolean;
    type: "delete" | "toggle-status";
    dept: DepartmentRow | null;
    targetActive?: boolean;
    hasDependencies?: boolean;
  }>({
    isOpen: false,
    type: "delete",
    dept: null,
  });
  const [isActionLoading, setIsActionLoading] = React.useState(false);

  // Sync state when initialDepartments change
  React.useEffect(() => {
    setDepartments(initialDepartments);
  }, [initialDepartments]);

  // Open Create Dialog
  const handleOpenCreate = () => {
    setEditingDept(null);
    setFormData({ name: "", code: "", description: "" });
    setFormErrors({});
    setIsDialogOpen(true);
  };

  // Open Edit Dialog
  const handleOpenEdit = (dept: DepartmentRow) => {
    setEditingDept(dept);
    setFormData({
      name: dept.name,
      code: dept.code,
      description: dept.description || "",
    });
    setFormErrors({});
    setIsDialogOpen(true);
  };

  // Submit Create / Edit
  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErrors({});
    setIsSubmitting(true);

    try {
      const codeUpper = formData.code.toUpperCase().trim();
      if (editingDept) {
        // Update
        const res = await updateDepartmentAction(editingDept.id, {
          name: formData.name,
          code: codeUpper,
          description: formData.description || undefined,
        });

        if (!res.success || !res.department) {
          if (res.fieldErrors) setFormErrors(res.fieldErrors);
          toast.error(res.error || "Failed to update department");
          return;
        }

        const updatedDept = res.department;
        toast.success("Department updated", `${codeUpper} updated successfully.`);
        setDepartments((prev) =>
          prev.map((d) =>
            d.id === editingDept.id
              ? {
                  ...d,
                  name: updatedDept.name,
                  code: updatedDept.code,
                  description: updatedDept.description,
                }
              : d
          )
        );
        setIsDialogOpen(false);
      } else {
        // Create
        const res = await createDepartmentAction({
          name: formData.name,
          code: codeUpper,
          description: formData.description || undefined,
        });

        if (!res.success || !res.department) {
          if (res.fieldErrors) setFormErrors(res.fieldErrors);
          toast.error(res.error || "Failed to create department");
          return;
        }

        const createdDept = res.department;
        toast.success("Department created", `${codeUpper} has been created.`);
        setDepartments((prev) => [
          ...prev,
          {
            ...createdDept,
            _count: { teacherProfiles: 0, studentProfiles: 0, courses: 0 },
          },
        ]);
        setIsDialogOpen(false);
      }
    } catch {
      toast.error("An unexpected error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Deactivate / Activate
  const handleToggleStatus = (dept: DepartmentRow) => {
    const nextStatus = !dept.isActive;
    setConfirmDialog({
      isOpen: true,
      type: "toggle-status",
      dept,
      targetActive: nextStatus,
    });
  };

  // Handle Delete Request
  const handleDeleteRequest = (dept: DepartmentRow) => {
    const totalUsersAndCourses =
      dept._count.teacherProfiles + dept._count.studentProfiles + dept._count.courses;
    const hasDependencies = totalUsersAndCourses > 0;

    setConfirmDialog({
      isOpen: true,
      type: "delete",
      dept,
      hasDependencies,
    });
  };

  // Execute Action from Confirmation Dialog
  const handleConfirmAction = async () => {
    const { type, dept, targetActive, hasDependencies } = confirmDialog;
    if (!dept) return;

    setIsActionLoading(true);
    try {
      if (type === "toggle-status" || (type === "delete" && hasDependencies)) {
        // Deactivate action
        const newStatus = type === "toggle-status" ? Boolean(targetActive) : false;
        const res = await toggleDepartmentStatusAction(dept.id, newStatus);
        if (!res.success) {
          toast.error(res.error || "Failed to change department status");
          return;
        }
        setDepartments((prev) =>
          prev.map((d) => (d.id === dept.id ? { ...d, isActive: newStatus } : d))
        );
        toast.success(
          newStatus ? "Department activated" : "Department deactivated",
          `${dept.code} is now ${newStatus ? "active" : "inactive"}.`
        );
      } else if (type === "delete") {
        // Delete action for department with 0 dependencies
        const res = await deleteDepartmentAction(dept.id);
        if (!res.success) {
          toast.error(res.error || "Failed to delete department");
          return;
        }
        setDepartments((prev) => prev.filter((d) => d.id !== dept.id));
        toast.success("Department deleted", `${dept.code} has been deleted.`);
      }
    } catch {
      toast.error("Operation failed. Please try again.");
    } finally {
      setIsActionLoading(false);
      setConfirmDialog({ isOpen: false, type: "delete", dept: null });
    }
  };

  // Filtering
  const filteredDepartments = React.useMemo(() => {
    return departments.filter((d) => {
      // Status filter
      if (statusFilter === "ACTIVE" && !d.isActive) return false;
      if (statusFilter === "INACTIVE" && d.isActive) return false;

      // Query filter
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return (
        d.code.toLowerCase().includes(q) ||
        d.name.toLowerCase().includes(q) ||
        (d.description && d.description.toLowerCase().includes(q))
      );
    });
  }, [departments, searchQuery, statusFilter]);

  // Statistics
  const stats = React.useMemo(() => {
    const total = departments.length;
    const active = departments.filter((d) => d.isActive).length;
    const totalCourses = departments.reduce((acc, d) => acc + d._count.courses, 0);
    const totalTeachers = departments.reduce((acc, d) => acc + d._count.teacherProfiles, 0);
    return { total, active, totalCourses, totalTeachers };
  }, [departments]);

  // Columns for DataTable
  const columns: Column<DepartmentRow>[] = [
    {
      key: "code",
      header: "Code",
      sortable: true,
      render: (dept) => (
        <span className="font-mono font-bold text-xs uppercase px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20">
          {dept.code}
        </span>
      ),
    },
    {
      key: "name",
      header: "Department Name",
      sortable: true,
      render: (dept) => (
        <div>
          <div className="font-medium text-foreground text-sm">{dept.name}</div>
          {dept.description ? (
            <p className="text-xs text-muted truncate max-w-sm" title={dept.description}>
              {dept.description}
            </p>
          ) : (
            <p className="text-xs text-muted/60 italic">No description</p>
          )}
        </div>
      ),
    },
    {
      key: "teachers",
      header: "Teachers",
      sortable: true,
      align: "center",
      render: (dept) => (
        <div className="inline-flex items-center gap-1.5 text-xs text-muted">
          <Users className="w-3.5 h-3.5 text-muted/80" />
          <span className="font-semibold text-foreground">{dept._count.teacherProfiles}</span>
        </div>
      ),
    },
    {
      key: "students",
      header: "Students",
      sortable: true,
      align: "center",
      render: (dept) => (
        <div className="inline-flex items-center gap-1.5 text-xs text-muted">
          <GraduationCap className="w-3.5 h-3.5 text-muted/80" />
          <span className="font-semibold text-foreground">{dept._count.studentProfiles}</span>
        </div>
      ),
    },
    {
      key: "courses",
      header: "Courses",
      sortable: true,
      align: "center",
      render: (dept) => (
        <div className="inline-flex items-center gap-1.5 text-xs text-muted">
          <BookOpen className="w-3.5 h-3.5 text-muted/80" />
          <span className="font-semibold text-foreground">{dept._count.courses}</span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      align: "center",
      render: (dept) => (
        <StatusChip status={dept.isActive ? "active" : "archived"} />
      ),
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (dept) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              handleOpenEdit(dept);
            }}
            title="Edit department"
            aria-label={`Edit ${dept.code}`}
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
              handleToggleStatus(dept);
            }}
            title={dept.isActive ? "Deactivate department" : "Activate department"}
            aria-label={dept.isActive ? `Deactivate ${dept.code}` : `Activate ${dept.code}`}
            className={`h-8 w-8 p-0 ${
              dept.isActive
                ? "text-muted hover:text-warning"
                : "text-muted hover:text-success"
            }`}
          >
            <Power className="w-4 h-4" />
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              handleDeleteRequest(dept);
            }}
            title="Delete department"
            aria-label={`Delete ${dept.code}`}
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
      {/* Overview Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Departments"
          value={stats.total}
          icon={Building2}
          subtext="Academic departments"
        />
        <StatCard
          label="Active Status"
          value={`${stats.active} / ${stats.total}`}
          icon={CheckCircle2}
          subtext="Currently active"
        />
        <StatCard
          label="Faculty Members"
          value={stats.totalTeachers}
          icon={Users}
          subtext="Across all departments"
        />
        <StatCard
          label="Catalog Courses"
          value={stats.totalCourses}
          icon={BookOpen}
          subtext="Approved courses"
        />
      </div>

      {/* Control Bar: Search, Filters, and New Department Action */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-surface p-4 rounded-[10px] border border-border shadow-xs">
        <div className="flex flex-1 items-center gap-3">
          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
            <input
              type="text"
              placeholder="Search by code, department name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-10 pl-9 pr-8 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring text-foreground placeholder:text-muted"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-foreground p-0.5"
                aria-label="Clear search query"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Status Quick Filter */}
          <div className="hidden md:flex items-center gap-1 border-l border-border pl-3">
            <button
              type="button"
              onClick={() => setStatusFilter("ALL")}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                statusFilter === "ALL"
                  ? "bg-primary text-white"
                  : "text-muted hover:text-foreground hover:bg-surface-muted"
              }`}
            >
              All ({departments.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("ACTIVE")}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                statusFilter === "ACTIVE"
                  ? "bg-primary text-white"
                  : "text-muted hover:text-foreground hover:bg-surface-muted"
              }`}
            >
              Active ({stats.active})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("INACTIVE")}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                statusFilter === "INACTIVE"
                  ? "bg-primary text-white"
                  : "text-muted hover:text-foreground hover:bg-surface-muted"
              }`}
            >
              Inactive ({departments.length - stats.active})
            </button>
          </div>
        </div>

        {/* Create Button */}
        <Button
          type="button"
          onClick={handleOpenCreate}
          className="shrink-0 flex items-center justify-center gap-1.5"
        >
          <Plus className="w-4 h-4" />
          <span>New Department</span>
        </Button>
      </div>

      {/* Main Table */}
      <DataTable
        columns={columns}
        data={filteredDepartments}
        keyExtractor={(item) => item.id}
        emptyTitle={
          searchQuery
            ? "No departments match your query"
            : "No academic departments found"
        }
        emptyDescription={
          searchQuery
            ? `No records found matching "${searchQuery}". Try a different keyword.`
            : "Get started by adding your first department."
        }
        emptyAction={
          searchQuery
            ? {
                label: "Clear Search",
                onClick: () => setSearchQuery(""),
              }
            : {
                label: "Add Department",
                onClick: handleOpenCreate,
              }
        }
      />

      {/* Dialog: Create or Edit Department */}
      <DialogPrimitive.Root open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs transition-opacity" />
          <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-[10px] border border-border bg-surface p-6 shadow-xl focus:outline-none">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-primary" />
                <DialogPrimitive.Title className="text-lg font-semibold text-foreground">
                  {editingDept ? `Edit Department (${editingDept.code})` : "Create New Department"}
                </DialogPrimitive.Title>
              </div>
              <DialogPrimitive.Close asChild>
                <button
                  type="button"
                  aria-label="Close dialog"
                  className="w-8 h-8 rounded-md text-muted hover:text-foreground flex items-center justify-center transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </DialogPrimitive.Close>
            </div>

            <form onSubmit={handleSubmitForm} className="space-y-4 pt-4">
              {/* Department Name */}
              <div>
                <label
                  htmlFor="dept-name"
                  className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1.5"
                >
                  Department Name <span className="text-danger">*</span>
                </label>
                <Input
                  id="dept-name"
                  type="text"
                  placeholder="e.g., Computer Science & Engineering"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, name: e.target.value }))
                  }
                  error={formErrors.name}
                  disabled={isSubmitting}
                  required
                />
                <p className="text-xs text-muted mt-1">
                  Full official name (3 to 100 characters).
                </p>
              </div>

              {/* Department Code */}
              <div>
                <label
                  htmlFor="dept-code"
                  className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1.5"
                >
                  Department Code <span className="text-danger">*</span>
                </label>
                <Input
                  id="dept-code"
                  type="text"
                  placeholder="e.g., CSE"
                  maxLength={6}
                  value={formData.code}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      code: e.target.value.toUpperCase().replace(/[^A-Z]/g, ""),
                    }))
                  }
                  error={formErrors.code}
                  disabled={isSubmitting}
                  required
                />
                <p className="text-xs text-muted mt-1">
                  2 to 6 uppercase letters (must be unique across RUET).
                </p>
              </div>

              {/* Description */}
              <div>
                <label
                  htmlFor="dept-description"
                  className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1.5"
                >
                  Description (Optional)
                </label>
                <textarea
                  id="dept-description"
                  rows={3}
                  placeholder="Brief summary or mission statement of the department..."
                  value={formData.description}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, description: e.target.value }))
                  }
                  disabled={isSubmitting}
                  className="w-full text-sm rounded-md border border-border bg-background p-2.5 text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-ring"
                />
                {formErrors.description && (
                  <p className="text-xs text-danger mt-1">{formErrors.description}</p>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setIsDialogOpen(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button type="submit" isLoading={isSubmitting}>
                  {editingDept ? "Save Changes" : "Create Department"}
                </Button>
              </div>
            </form>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      {/* Confirmation Dialog: Deactivate / Delete */}
      <ConfirmDialog
        open={confirmDialog.isOpen}
        onOpenChange={(open) =>
          setConfirmDialog((prev) => ({ ...prev, isOpen: open }))
        }
        title={
          confirmDialog.type === "toggle-status"
            ? confirmDialog.targetActive
              ? `Activate Department (${confirmDialog.dept?.code})?`
              : `Deactivate Department (${confirmDialog.dept?.code})?`
            : confirmDialog.hasDependencies
            ? `Cannot Delete ${confirmDialog.dept?.code}`
            : `Delete Department (${confirmDialog.dept?.code})?`
        }
        description={
          confirmDialog.type === "toggle-status"
            ? confirmDialog.targetActive
              ? `Are you sure you want to reactivate ${confirmDialog.dept?.name}? It will become available for new course offerings.`
              : `Are you sure you want to deactivate ${confirmDialog.dept?.name}? Existing courses and enrolled users will remain intact, but new offerings will be hidden.`
            : confirmDialog.hasDependencies
            ? `This department currently contains ${confirmDialog.dept?._count.teacherProfiles} teacher(s), ${confirmDialog.dept?._count.studentProfiles} student(s), and ${confirmDialog.dept?._count.courses} catalog course(s). Academic departments with recorded history cannot be deleted. Would you like to deactivate it instead?`
            : `Are you sure you want to permanently delete ${confirmDialog.dept?.name}? This action cannot be reversed.`
        }
        confirmLabel={
          confirmDialog.type === "toggle-status"
            ? confirmDialog.targetActive
              ? "Activate Department"
              : "Deactivate Department"
            : confirmDialog.hasDependencies
            ? "Deactivate Instead"
            : "Delete Department"
        }
        isDestructive={
          confirmDialog.type === "delete" && !confirmDialog.hasDependencies
        }
        isLoading={isActionLoading}
        onConfirm={handleConfirmAction}
      />
    </div>
  );
}
