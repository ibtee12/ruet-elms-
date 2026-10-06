"use client";

import * as React from "react";
import {
  Users,
  Plus,
  Search,
  Upload,
  Download,
  KeyRound,
  Pencil,
  Power,
  Copy,
  Check,
  X,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  Award,
} from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable, Column } from "@/components/shared/data-table";
import { StatusChip } from "@/components/shared/status-chip";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { toast } from "@/lib/toast";
import { Role } from "@prisma/client";
import {
  getUsersAction,
  createUserAction,
  updateUserAction,
  toggleUserActiveAction,
  resetUserPasswordAction,
  importUsersCsvAction,
} from "@/actions/users";
import {
  generateStudentTemplateCsv,
  generateTeacherTemplateCsv,
  parseUsersCsv,
  ParsedCsvRow,
} from "@/lib/csv/user-import";
import { CreateUserInput, EditUserInput } from "@/lib/validations/user";
import { formatDhaka } from "@/lib/datetime";

export interface UserRow {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  mustChangePassword: boolean;
  lastActiveAt: Date | null;
  createdAt: Date;
  studentProfile: {
    studentId: string;
    batch: string;
    level: number;
    term: number;
    department: { id: string; name: string; code: string };
  } | null;
  teacherProfile: {
    employeeId: string;
    designation: string;
    department: { id: string; name: string; code: string };
  } | null;
}

interface DepartmentOption {
  id: string;
  name: string;
  code: string;
}

interface UsersManagerProps {
  initialUsers: UserRow[];
  initialTotal: number;
  departments: DepartmentOption[];
  callerRole: Role;
  callerDeptId?: string;
  currentUserId: string;
  initialRoleFilter?: Role;
}

export function UsersManager({
  initialUsers,
  initialTotal,
  departments,
  callerRole,
  callerDeptId,
  currentUserId,
  initialRoleFilter,
}: UsersManagerProps) {
  // Query State
  const [users, setUsers] = React.useState<UserRow[]>(initialUsers);
  const [total, setTotal] = React.useState(initialTotal);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(10);
  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [roleFilter, setRoleFilter] = React.useState<string>(
    initialRoleFilter || "ALL"
  );
  const [deptFilter, setDeptFilter] = React.useState<string>(
    callerDeptId || "ALL"
  );
  const [activeFilter, setActiveFilter] = React.useState<string>("ALL");
  const [isLoading, setIsLoading] = React.useState(false);

  // Modal States
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const [isEditOpen, setIsEditOpen] = React.useState(false);
  const [isCsvModalOpen, setIsCsvModalOpen] = React.useState(false);
  const [tempPasswordModal, setTempPasswordModal] = React.useState<{
    isOpen: boolean;
    title: string;
    password: string;
    email: string;
  }>({
    isOpen: false,
    title: "",
    password: "",
    email: "",
  });
  const [hasCopied, setHasCopied] = React.useState(false);

  // Edit / Action targets
  const [selectedUser, setSelectedUser] = React.useState<UserRow | null>(null);
  const [confirmDialog, setConfirmDialog] = React.useState<{
    isOpen: boolean;
    type: "toggle-active" | "reset-password";
    user: UserRow | null;
  }>({
    isOpen: false,
    type: "toggle-active",
    user: null,
  });
  const [actionLoading, setActionLoading] = React.useState(false);

  // Single User Form State
  const [formData, setFormData] = React.useState({
    name: "",
    email: "",
    role: (callerRole === Role.DEPT_ADMIN ? Role.STUDENT : Role.STUDENT) as Role,
    departmentId: callerDeptId || departments[0]?.id || "",
    studentId: "",
    batch: "2022",
    level: 1,
    term: 1,
    employeeId: "",
    designation: "Lecturer",
    sendWelcomeEmail: false,
  });
  const [formErrors, setFormErrors] = React.useState<Record<string, string>>({});
  const [formSubmitting, setFormSubmitting] = React.useState(false);

  // CSV Stepper State
  const [csvStep, setCsvStep] = React.useState<1 | 2 | 3 | 4>(1);
  const [csvRole, setCsvRole] = React.useState<"STUDENT" | "TEACHER">("STUDENT");
  const [csvRawText, setCsvRawText] = React.useState("");
  const [csvParsedRows, setCsvParsedRows] = React.useState<ParsedCsvRow[]>([]);
  const [csvValidCount, setCsvValidCount] = React.useState(0);
  const [csvErrorCount, setCsvErrorCount] = React.useState(0);
  const [csvSkipInvalid, setCsvSkipInvalid] = React.useState(true);
  const [csvResultData, setCsvResultData] = React.useState<{
    importedCount: number;
    skippedCount: number;
    resultCsv: string;
  } | null>(null);

  // Debounce search input
  React.useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [search]);

  // Fetch users on filter or pagination changes
  const fetchUsers = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await getUsersAction({
        page,
        pageSize,
        search: debouncedSearch,
        role: roleFilter !== "ALL" ? (roleFilter as Role) : undefined,
        departmentId: deptFilter !== "ALL" ? deptFilter : undefined,
        isActive:
          activeFilter === "ACTIVE"
            ? true
            : activeFilter === "INACTIVE"
            ? false
            : undefined,
      });

      setUsers(res.users as UserRow[]);
      setTotal(res.total);
    } catch {
      toast.error("Failed to load users list.");
    } finally {
      setIsLoading(false);
    }
  }, [page, pageSize, debouncedSearch, roleFilter, deptFilter, activeFilter]);

  React.useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Open Create Modal
  const handleOpenCreate = () => {
    setFormData({
      name: "",
      email: "",
      role: Role.STUDENT,
      departmentId: callerDeptId || departments[0]?.id || "",
      studentId: "",
      batch: "2022",
      level: 1,
      term: 1,
      employeeId: "",
      designation: "Lecturer",
      sendWelcomeEmail: false,
    });
    setFormErrors({});
    setIsCreateOpen(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (user: UserRow) => {
    setSelectedUser(user);
    setFormData({
      name: user.name,
      email: user.email,
      role: user.role,
      departmentId:
        user.studentProfile?.department.id ||
        user.teacherProfile?.department.id ||
        departments[0]?.id ||
        "",
      studentId: user.studentProfile?.studentId || "",
      batch: user.studentProfile?.batch || "2022",
      level: user.studentProfile?.level || 1,
      term: user.studentProfile?.term || 1,
      employeeId: user.teacherProfile?.employeeId || "",
      designation: user.teacherProfile?.designation || "Lecturer",
      sendWelcomeEmail: false,
    });
    setFormErrors({});
    setIsEditOpen(true);
  };

  // Submit Single User Create
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErrors({});
    setFormSubmitting(true);

    try {
      const payload: CreateUserInput = {
        name: formData.name,
        email: formData.email,
        role: formData.role,
        sendWelcomeEmail: formData.sendWelcomeEmail,
      };

      if (formData.role === Role.STUDENT) {
        payload.studentProfile = {
          studentId: formData.studentId,
          departmentId: formData.departmentId,
          batch: formData.batch,
          level: Number(formData.level),
          term: Number(formData.term),
        };
      } else if (
        formData.role === Role.TEACHER ||
        formData.role === Role.DEPT_ADMIN
      ) {
        payload.teacherProfile = {
          employeeId: formData.employeeId,
          departmentId: formData.departmentId,
          designation: formData.designation,
        };
      }

      const res = await createUserAction(payload);
      if (!res.success) {
        if (res.fieldErrors) setFormErrors(res.fieldErrors);
        toast.error(res.error || "Failed to create user.");
        return;
      }

      setIsCreateOpen(false);
      fetchUsers();
      toast.success("User created successfully");

      // Show temporary password modal
      if (res.tempPassword) {
        setTempPasswordModal({
          isOpen: true,
          title: "Temporary Password Generated",
          password: res.tempPassword,
          email: formData.email,
        });
      }
    } catch {
      toast.error("An unexpected error occurred.");
    } finally {
      setFormSubmitting(false);
    }
  };

  // Submit Single User Edit
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    setFormErrors({});
    setFormSubmitting(true);

    try {
      const payload: EditUserInput = {
        name: formData.name,
        email: formData.email,
      };

      if (selectedUser.role === Role.STUDENT) {
        payload.studentProfile = {
          studentId: formData.studentId,
          departmentId: formData.departmentId,
          batch: formData.batch,
          level: Number(formData.level),
          term: Number(formData.term),
        };
      } else if (
        selectedUser.role === Role.TEACHER ||
        selectedUser.role === Role.DEPT_ADMIN
      ) {
        payload.teacherProfile = {
          employeeId: formData.employeeId,
          departmentId: formData.departmentId,
          designation: formData.designation,
        };
      }

      const res = await updateUserAction(selectedUser.id, payload);
      if (!res.success) {
        if (res.fieldErrors) {
          const errors: Record<string, string> = {};
          Object.entries(res.fieldErrors).forEach(([k, v]) => {
            errors[k] = Array.isArray(v) ? v[0] : String(v);
          });
          setFormErrors(errors);
        }
        toast.error(res.error || "Failed to update user.");
        return;
      }

      setIsEditOpen(false);
      fetchUsers();
      toast.success("User updated successfully");
    } catch {
      toast.error("An error occurred while updating user.");
    } finally {
      setFormSubmitting(false);
    }
  };

  // Confirm Dialog Action Handler
  const handleConfirmAction = async () => {
    const { type, user } = confirmDialog;
    if (!user) return;

    setActionLoading(true);
    try {
      if (type === "toggle-active") {
        const nextActive = !user.isActive;
        const res = await toggleUserActiveAction(user.id, nextActive);
        if (!res.success) {
          toast.error(res.error || "Failed to change user status.");
          return;
        }
        toast.success(
          nextActive ? "User activated" : "User deactivated",
          `${user.name} is now ${nextActive ? "active" : "inactive"}.`
        );
        fetchUsers();
      } else if (type === "reset-password") {
        const res = await resetUserPasswordAction(user.id);
        if (!res.success) {
          toast.error("Failed to reset password.");
          return;
        }
        toast.success("Password reset successfully");
        if (res.tempPassword) {
          setTempPasswordModal({
            isOpen: true,
            title: "New Temporary Password",
            password: res.tempPassword,
            email: user.email,
          });
        }
      }
    } catch {
      toast.error("Action failed.");
    } finally {
      setActionLoading(false);
      setConfirmDialog({ isOpen: false, type: "toggle-active", user: null });
    }
  };

  // Copy password to clipboard
  const handleCopyPassword = () => {
    navigator.clipboard.writeText(tempPasswordModal.password);
    setHasCopied(true);
    toast.success("Password copied to clipboard");
    setTimeout(() => setHasCopied(false), 2000);
  };

  // CSV Stepper Handlers
  const handleDownloadTemplate = (role: "STUDENT" | "TEACHER") => {
    const csvContent =
      role === "STUDENT"
        ? generateStudentTemplateCsv()
        : generateTeacherTemplateCsv();
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute(
      "download",
      `ruet_elms_${role.toLowerCase()}_template.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setCsvRawText(content);

      // Perform client validation for instant preview
      const deptCodeMap = new Map(departments.map((d) => [d.code, d.id]));
      const callerDeptCode = departments.find((d) => d.id === callerDeptId)?.code;

      const parsed = parseUsersCsv(content, csvRole, {
        existingEmails: new Set(users.map((u) => u.email.toLowerCase())),
        existingStudentIds: new Set(
          users
            .filter((u) => u.studentProfile)
            .map((u) => u.studentProfile!.studentId)
        ),
        existingEmployeeIds: new Set(
          users
            .filter((u) => u.teacherProfile)
            .map((u) => u.teacherProfile!.employeeId)
        ),
        departmentCodeToId: deptCodeMap,
        allowedDepartmentCode:
          callerRole === Role.DEPT_ADMIN ? callerDeptCode : undefined,
      });

      setCsvParsedRows(parsed.rows);
      setCsvValidCount(parsed.validCount);
      setCsvErrorCount(parsed.errorCount);
      setCsvStep(3); // Go to Preview step
    };
    reader.readAsText(file);
  };

  const handleExecuteCsvImport = async () => {
    if (!csvRawText) return;
    setIsLoading(true);

    try {
      const res = await importUsersCsvAction(
        csvRawText,
        csvRole,
        csvSkipInvalid
      );

      if (!res.success) {
        toast.error(res.error || "Batch import failed.");
        if (res.rows) {
          setCsvParsedRows(res.rows);
          setCsvErrorCount(res.errorCount);
          setCsvValidCount(res.validCount);
        }
        return;
      }

      setCsvResultData({
        importedCount: res.importedCount || 0,
        skippedCount: res.skippedCount || 0,
        resultCsv: res.resultCsv || "",
      });
      setCsvStep(4);
      fetchUsers();
      toast.success(
        `Batch import finished: ${res.importedCount} users created.`
      );
    } catch {
      toast.error("Import execution failed.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadResultCsv = () => {
    if (!csvResultData?.resultCsv) return;
    const blob = new Blob([csvResultData.resultCsv], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute(
      "download",
      `ruet_elms_import_results_${Date.now()}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Columns definition
  const columns: Column<UserRow>[] = [
    {
      key: "name",
      header: "User Details",
      sortable: true,
      render: (u) => (
        <div>
          <div className="font-semibold text-foreground text-sm flex items-center gap-1.5">
            <span>{u.name}</span>
            {u.id === currentUserId && (
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-surface-muted text-muted font-medium">
                (You)
              </span>
            )}
          </div>
          <div className="text-xs text-muted font-mono">{u.email}</div>
        </div>
      ),
    },
    {
      key: "role",
      header: "Role",
      sortable: true,
      render: (u) => {
        const colors: Record<Role, string> = {
          SUPER_ADMIN: "bg-danger/10 text-danger border-danger/20",
          DEPT_ADMIN: "bg-warning/10 text-warning border-warning/20",
          TEACHER: "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20",
          STUDENT: "bg-primary/10 text-primary border-primary/20",
        };
        return (
          <span
            className={`font-mono text-xs uppercase px-2 py-0.5 rounded-md font-semibold border ${colors[u.role]}`}
          >
            {u.role.replace("_", " ")}
          </span>
        );
      },
    },
    {
      key: "identifier",
      header: "ID / Batch",
      render: (u) => {
        if (u.studentProfile) {
          return (
            <div className="text-xs">
              <span className="font-mono font-bold text-foreground">
                {u.studentProfile.studentId}
              </span>
              <span className="text-muted block text-[11px]">
                Batch {u.studentProfile.batch} (L-{u.studentProfile.level}, T-{u.studentProfile.term})
              </span>
            </div>
          );
        }
        if (u.teacherProfile) {
          return (
            <div className="text-xs">
              <span className="font-mono font-bold text-foreground">
                {u.teacherProfile.employeeId}
              </span>
              <span className="text-muted block text-[11px]">
                {u.teacherProfile.designation}
              </span>
            </div>
          );
        }
        return <span className="text-xs text-muted/60">—</span>;
      },
    },
    {
      key: "department",
      header: "Department",
      render: (u) => {
        const dept =
          u.studentProfile?.department || u.teacherProfile?.department;
        return dept ? (
          <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-surface-muted text-foreground border border-border">
            {dept.code}
          </span>
        ) : (
          <span className="text-xs text-muted/60">Institutional</span>
        );
      },
    },
    {
      key: "status",
      header: "Status",
      align: "center",
      render: (u) => (
        <StatusChip status={u.isActive ? "active" : "archived"} />
      ),
    },
    {
      key: "lastActive",
      header: "Last Active",
      render: (u) => (
        <span className="text-xs text-muted font-mono">
          {u.lastActiveAt ? formatDhaka(u.lastActiveAt, "short") : "Never"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (u) => {
        const isSelf = u.id === currentUserId;
        const isProtectedAdmin =
          callerRole === Role.DEPT_ADMIN &&
          (u.role === Role.SUPER_ADMIN || u.role === Role.DEPT_ADMIN);

        if (isProtectedAdmin) {
          return <span className="text-xs text-muted italic">Protected</span>;
        }

        return (
          <div className="flex items-center justify-end gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handleOpenEdit(u);
              }}
              title="Edit User"
              aria-label={`Edit ${u.name}`}
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
                setConfirmDialog({
                  isOpen: true,
                  type: "reset-password",
                  user: u,
                });
              }}
              title="Reset Password"
              aria-label={`Reset password for ${u.name}`}
              className="h-8 w-8 p-0 text-muted hover:text-primary"
            >
              <KeyRound className="w-4 h-4" />
            </Button>

            {!isSelf && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmDialog({
                    isOpen: true,
                    type: "toggle-active",
                    user: u,
                  });
                }}
                title={u.isActive ? "Deactivate user" : "Activate user"}
                aria-label={u.isActive ? `Deactivate ${u.name}` : `Activate ${u.name}`}
                className={`h-8 w-8 p-0 ${
                  u.isActive
                    ? "text-muted hover:text-warning"
                    : "text-muted hover:text-success"
                }`}
              >
                <Power className="w-4 h-4" />
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      {/* Search and Action Toolbar */}
      <div className="flex flex-col gap-4 bg-surface p-4 rounded-[10px] border border-border shadow-xs">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
            <input
              type="text"
              placeholder="Search by name, email, ID..."
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

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setCsvStep(1);
                setCsvParsedRows([]);
                setCsvRawText("");
                setCsvResultData(null);
                setIsCsvModalOpen(true);
              }}
              className="flex items-center gap-1.5"
            >
              <Upload className="w-4 h-4" />
              <span>Import CSV</span>
            </Button>

            <Button
              type="button"
              onClick={handleOpenCreate}
              className="flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Add User</span>
            </Button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-border text-xs">
          {/* Role Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-muted font-medium">Role:</span>
            <select
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value);
                setPage(1);
              }}
              className="h-8 px-2.5 rounded-md border border-border bg-background text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="ALL">All Roles</option>
              {callerRole === Role.SUPER_ADMIN && (
                <>
                  <option value="SUPER_ADMIN">Super Admin</option>
                  <option value="DEPT_ADMIN">Dept Admin</option>
                </>
              )}
              <option value="TEACHER">Teacher</option>
              <option value="STUDENT">Student</option>
            </select>
          </div>

          {/* Department Filter (Hidden for DEPT_ADMIN who are locked to their own dept) */}
          {callerRole === Role.SUPER_ADMIN && (
            <div className="flex items-center gap-1.5">
              <span className="text-muted font-medium">Department:</span>
              <select
                value={deptFilter}
                onChange={(e) => {
                  setDeptFilter(e.target.value);
                  setPage(1);
                }}
                className="h-8 px-2.5 rounded-md border border-border bg-background text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-ring"
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

          {/* Status Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-muted font-medium">Status:</span>
            <select
              value={activeFilter}
              onChange={(e) => {
                setActiveFilter(e.target.value);
                setPage(1);
              }}
              className="h-8 px-2.5 rounded-md border border-border bg-background text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="ALL">All Status</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </div>

          {/* Records count */}
          <div className="ml-auto text-muted">
            Showing <span className="font-semibold text-foreground">{users.length}</span> of{" "}
            <span className="font-semibold text-foreground">{total}</span> users
          </div>
        </div>
      </div>

      {/* Main Table */}
      <DataTable
        columns={columns}
        data={users}
        keyExtractor={(u) => u.id}
        isLoading={isLoading}
        emptyTitle="No users found"
        emptyDescription={
          search
            ? `No records found matching "${search}".`
            : "No users exist under the selected filters."
        }
        emptyAction={
          search
            ? {
                label: "Clear Search",
                onClick: () => setSearch(""),
              }
            : undefined
        }
      />

      {/* Pagination Controls */}
      <div className="flex items-center justify-between px-2 text-xs text-muted">
        <div className="flex items-center gap-2">
          <span>Rows per page:</span>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
            className="h-8 px-2 rounded-md border border-border bg-surface text-foreground"
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
          </select>
        </div>

        <div className="flex items-center gap-3">
          <span>
            Page <strong className="text-foreground">{page}</strong> of{" "}
            <strong className="text-foreground">
              {Math.max(1, Math.ceil(total / pageSize))}
            </strong>
          </span>

          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={page <= 1 || isLoading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="h-8 w-8 p-0"
              aria-label="Previous page"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={page >= Math.ceil(total / pageSize) || isLoading}
              onClick={() => setPage((p) => p + 1)}
              className="h-8 w-8 p-0"
              aria-label="Next page"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Dialog: Create User */}
      <DialogPrimitive.Root open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs" />
          <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-[10px] border border-border bg-surface p-6 shadow-xl focus:outline-none max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                <DialogPrimitive.Title className="text-lg font-semibold text-foreground">
                  Create University User
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

            <form onSubmit={handleCreateSubmit} className="space-y-4 pt-4 text-xs">
              {/* Common Fields: Name & Email */}
              <div>
                <label className="block font-semibold uppercase text-muted mb-1">
                  Full Name <span className="text-danger">*</span>
                </label>
                <Input
                  type="text"
                  placeholder="e.g. Farhan Ahmed"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, name: e.target.value }))
                  }
                  error={formErrors.name}
                  required
                />
              </div>

              <div>
                <label className="block font-semibold uppercase text-muted mb-1">
                  Email Address <span className="text-danger">*</span>
                </label>
                <Input
                  type="email"
                  placeholder="e.g. fahmed@cse.ruet.ac.bd"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, email: e.target.value }))
                  }
                  error={formErrors.email}
                  required
                />
              </div>

              {/* Role Selection */}
              <div>
                <label className="block font-semibold uppercase text-muted mb-1">
                  User Role <span className="text-danger">*</span>
                </label>
                <select
                  value={formData.role}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      role: e.target.value as Role,
                    }))
                  }
                  className="w-full h-10 px-3 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value={Role.STUDENT}>Student</option>
                  <option value={Role.TEACHER}>Teacher / Faculty</option>
                  {callerRole === Role.SUPER_ADMIN && (
                    <>
                      <option value={Role.DEPT_ADMIN}>
                        Department Administrator
                      </option>
                      <option value={Role.SUPER_ADMIN}>Super Administrator</option>
                    </>
                  )}
                </select>
              </div>

              {/* Department Selection */}
              {(formData.role === Role.STUDENT ||
                formData.role === Role.TEACHER ||
                formData.role === Role.DEPT_ADMIN) && (
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
              )}

              {/* Role-Specific Fields: Student */}
              {formData.role === Role.STUDENT && (
                <div className="p-3 rounded-xl bg-surface-muted/60 border border-border space-y-3">
                  <span className="font-semibold text-foreground block">
                    Student Academic Profile
                  </span>
                  <div>
                    <label className="block text-muted font-medium mb-1">
                      Student ID <span className="text-danger">*</span>
                    </label>
                    <Input
                      type="text"
                      placeholder="e.g. 2203099"
                      value={formData.studentId}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          studentId: e.target.value,
                        }))
                      }
                      error={formErrors["studentProfile.studentId"]}
                      required
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-muted font-medium mb-1">
                        Batch
                      </label>
                      <Input
                        type="text"
                        value={formData.batch}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            batch: e.target.value,
                          }))
                        }
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-muted font-medium mb-1">
                        Level
                      </label>
                      <select
                        value={formData.level}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            level: Number(e.target.value),
                          }))
                        }
                        className="w-full h-10 px-2 rounded-md border border-border bg-background text-foreground"
                      >
                        <option value={1}>1</option>
                        <option value={2}>2</option>
                        <option value={3}>3</option>
                        <option value={4}>4</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-muted font-medium mb-1">
                        Term
                      </label>
                      <select
                        value={formData.term}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            term: Number(e.target.value),
                          }))
                        }
                        className="w-full h-10 px-2 rounded-md border border-border bg-background text-foreground"
                      >
                        <option value={1}>1</option>
                        <option value={2}>2</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* Role-Specific Fields: Teacher / Dept Admin */}
              {(formData.role === Role.TEACHER ||
                formData.role === Role.DEPT_ADMIN) && (
                <div className="p-3 rounded-xl bg-surface-muted/60 border border-border space-y-3">
                  <span className="font-semibold text-foreground block">
                    Faculty Profile
                  </span>
                  <div>
                    <label className="block text-muted font-medium mb-1">
                      Employee ID <span className="text-danger">*</span>
                    </label>
                    <Input
                      type="text"
                      placeholder="e.g. EMP501"
                      value={formData.employeeId}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          employeeId: e.target.value,
                        }))
                      }
                      error={formErrors["teacherProfile.employeeId"]}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-muted font-medium mb-1">
                      Designation
                    </label>
                    <Input
                      type="text"
                      placeholder="e.g. Assistant Professor"
                      value={formData.designation}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          designation: e.target.value,
                        }))
                      }
                      required
                    />
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="sendWelcome"
                  checked={formData.sendWelcomeEmail}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      sendWelcomeEmail: e.target.checked,
                    }))
                  }
                  className="rounded border-border"
                />
                <label htmlFor="sendWelcome" className="text-muted cursor-pointer">
                  Send welcome email with credentials
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setIsCreateOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" isLoading={formSubmitting}>
                  Create User
                </Button>
              </div>
            </form>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      {/* Dialog: Edit User */}
      <DialogPrimitive.Root open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs" />
          <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-[10px] border border-border bg-surface p-6 shadow-xl focus:outline-none max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Pencil className="w-5 h-5 text-primary" />
                <DialogPrimitive.Title className="text-lg font-semibold text-foreground">
                  Edit User Profile
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

            <form onSubmit={handleEditSubmit} className="space-y-4 pt-4 text-xs">
              <div>
                <label className="block font-semibold uppercase text-muted mb-1">
                  Full Name
                </label>
                <Input
                  type="text"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, name: e.target.value }))
                  }
                  required
                />
              </div>

              <div>
                <label className="block font-semibold uppercase text-muted mb-1">
                  Email Address
                </label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, email: e.target.value }))
                  }
                  required
                />
              </div>

              {selectedUser?.studentProfile && (
                <div className="p-3 rounded-xl bg-surface-muted/60 border border-border space-y-3">
                  <span className="font-semibold text-foreground block">
                    Student Details
                  </span>
                  <div>
                    <label className="block text-muted font-medium mb-1">
                      Student ID
                    </label>
                    <Input
                      type="text"
                      value={formData.studentId}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          studentId: e.target.value,
                        }))
                      }
                      required
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-muted font-medium mb-1">
                        Batch
                      </label>
                      <Input
                        type="text"
                        value={formData.batch}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            batch: e.target.value,
                          }))
                        }
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-muted font-medium mb-1">
                        Level
                      </label>
                      <select
                        value={formData.level}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            level: Number(e.target.value),
                          }))
                        }
                        className="w-full h-10 px-2 rounded-md border border-border bg-background text-foreground"
                      >
                        <option value={1}>1</option>
                        <option value={2}>2</option>
                        <option value={3}>3</option>
                        <option value={4}>4</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-muted font-medium mb-1">
                        Term
                      </label>
                      <select
                        value={formData.term}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            term: Number(e.target.value),
                          }))
                        }
                        className="w-full h-10 px-2 rounded-md border border-border bg-background text-foreground"
                      >
                        <option value={1}>1</option>
                        <option value={2}>2</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {selectedUser?.teacherProfile && (
                <div className="p-3 rounded-xl bg-surface-muted/60 border border-border space-y-3">
                  <span className="font-semibold text-foreground block">
                    Faculty Details
                  </span>
                  <div>
                    <label className="block text-muted font-medium mb-1">
                      Employee ID
                    </label>
                    <Input
                      type="text"
                      value={formData.employeeId}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          employeeId: e.target.value,
                        }))
                      }
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-muted font-medium mb-1">
                      Designation
                    </label>
                    <Input
                      type="text"
                      value={formData.designation}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          designation: e.target.value,
                        }))
                      }
                      required
                    />
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setIsEditOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" isLoading={formSubmitting}>
                  Save Changes
                </Button>
              </div>
            </form>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      {/* Dialog: One-Time Temporary Password Display */}
      <DialogPrimitive.Root
        open={tempPasswordModal.isOpen}
        onOpenChange={(open) =>
          setTempPasswordModal((prev) => ({ ...prev, isOpen: open }))
        }
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs" />
          <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-[10px] border border-border bg-surface p-6 shadow-xl focus:outline-none">
            <div className="w-12 h-12 rounded-full bg-success/10 text-success flex items-center justify-center mx-auto mb-4">
              <KeyRound className="w-6 h-6" />
            </div>

            <DialogPrimitive.Title className="text-lg font-bold text-center text-foreground mb-1">
              {tempPasswordModal.title}
            </DialogPrimitive.Title>
            <p className="text-xs text-center text-muted mb-4">
              Credentials for <strong className="text-foreground">{tempPasswordModal.email}</strong>.
              This temporary password will be displayed <strong>only once</strong>.
            </p>

            <div className="p-3.5 rounded-lg bg-surface-muted border border-border flex items-center justify-between gap-3 mb-4">
              <span className="font-mono font-bold text-sm tracking-wider text-foreground select-all">
                {tempPasswordModal.password}
              </span>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleCopyPassword}
                className="shrink-0 flex items-center gap-1"
              >
                {hasCopied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-success" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy</span>
                  </>
                )}
              </Button>
            </div>

            <p className="text-[11px] text-warning bg-warning/10 p-2.5 rounded border border-warning/20 mb-5">
              ⚠️ The user will be required to choose a new password upon first login.
            </p>

            <Button
              type="button"
              className="w-full"
              onClick={() =>
                setTempPasswordModal((prev) => ({ ...prev, isOpen: false }))
              }
            >
              Done &amp; Dismiss
            </Button>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      {/* Modal: CSV Stepper Import */}
      <DialogPrimitive.Root open={isCsvModalOpen} onOpenChange={setIsCsvModalOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs" />
          <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-[10px] border border-border bg-surface p-6 shadow-xl focus:outline-none max-h-[90vh] overflow-y-auto">
            {/* Header with Stepper Indicator */}
            <div className="pb-4 border-b border-border">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-primary" />
                  <DialogPrimitive.Title className="text-lg font-bold text-foreground">
                    Batch Import Users via CSV
                  </DialogPrimitive.Title>
                </div>
                <DialogPrimitive.Close asChild>
                  <button
                    type="button"
                    className="w-8 h-8 rounded text-muted hover:text-foreground flex items-center justify-center"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </DialogPrimitive.Close>
              </div>

              {/* Steps Progress Indicator */}
              <div className="grid grid-cols-4 gap-2 text-center text-xs">
                <div
                  className={`p-2 rounded-md font-medium ${
                    csvStep === 1
                      ? "bg-primary text-white"
                      : "bg-surface-muted text-muted"
                  }`}
                >
                  1. Template
                </div>
                <div
                  className={`p-2 rounded-md font-medium ${
                    csvStep === 2
                      ? "bg-primary text-white"
                      : "bg-surface-muted text-muted"
                  }`}
                >
                  2. Upload
                </div>
                <div
                  className={`p-2 rounded-md font-medium ${
                    csvStep === 3
                      ? "bg-primary text-white"
                      : "bg-surface-muted text-muted"
                  }`}
                >
                  3. Preview
                </div>
                <div
                  className={`p-2 rounded-md font-medium ${
                    csvStep === 4
                      ? "bg-primary text-white"
                      : "bg-surface-muted text-muted"
                  }`}
                >
                  4. Results
                </div>
              </div>
            </div>

            {/* Stepper Content */}
            <div className="py-6 text-xs space-y-4">
              {/* Step 1: Choose Role & Download Template */}
              {csvStep === 1 && (
                <div className="space-y-4">
                  <div>
                    <label className="block font-semibold uppercase text-muted mb-1.5">
                      Select Target Role
                    </label>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => setCsvRole("STUDENT")}
                        className={`flex-1 p-4 rounded-xl border text-center transition-all ${
                          csvRole === "STUDENT"
                            ? "border-primary bg-primary/5 text-primary font-bold shadow-xs"
                            : "border-border bg-surface hover:bg-surface-muted text-muted"
                        }`}
                      >
                        <GraduationCap className="w-6 h-6 mx-auto mb-2" />
                        <span>Students Import</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setCsvRole("TEACHER")}
                        className={`flex-1 p-4 rounded-xl border text-center transition-all ${
                          csvRole === "TEACHER"
                            ? "border-primary bg-primary/5 text-primary font-bold shadow-xs"
                            : "border-border bg-surface hover:bg-surface-muted text-muted"
                        }`}
                      >
                        <Award className="w-6 h-6 mx-auto mb-2" />
                        <span>Teachers / Faculty Import</span>
                      </button>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-surface-muted/60 border border-border space-y-2">
                    <span className="font-semibold text-foreground block">
                      Instructions &amp; Template
                    </span>
                    <p className="text-muted leading-relaxed">
                      Download the official CSV template below. Fill in the user
                      information without changing the column headers. Maximum
                      1,000 rows per batch.
                    </p>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => handleDownloadTemplate(csvRole)}
                      className="inline-flex items-center gap-2 mt-2"
                    >
                      <Download className="w-4 h-4" />
                      <span>Download {csvRole} Template (.csv)</span>
                    </Button>
                  </div>

                  <div className="flex justify-end pt-3">
                    <Button type="button" onClick={() => setCsvStep(2)}>
                      Next: Upload CSV
                    </Button>
                  </div>
                </div>
              )}

              {/* Step 2: Upload CSV */}
              {csvStep === 2 && (
                <div className="space-y-4">
                  <div className="p-8 border-2 border-dashed border-border rounded-2xl bg-surface-muted/30 text-center flex flex-col items-center justify-center">
                    <Upload className="w-10 h-10 text-muted mb-3" />
                    <span className="font-bold text-foreground text-sm mb-1">
                      Choose CSV file to upload
                    </span>
                    <p className="text-muted mb-4 max-w-xs">
                      Select your prepared {csvRole.toLowerCase()} spreadsheet (.csv format)
                    </p>
                    <label className="cursor-pointer inline-flex items-center justify-center px-4 py-2 rounded-lg bg-primary hover:bg-primary-hover text-white text-xs font-semibold shadow-xs transition-colors">
                      <span>Browse File</span>
                      <input
                        type="file"
                        accept=".csv"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                    </label>
                  </div>

                  <div className="flex justify-between pt-3">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setCsvStep(1)}
                    >
                      Back
                    </Button>
                  </div>
                </div>
              )}

              {/* Step 3: Preview with per-row validation */}
              {csvStep === 3 && (
                <div className="space-y-4">
                  {/* Summary bar */}
                  <div className="flex items-center justify-between p-3 rounded-xl border border-border bg-surface-muted/60">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1.5 text-success font-semibold">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>{csvValidCount} Valid Rows</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-danger font-semibold">
                        <AlertCircle className="w-4 h-4" />
                        <span>{csvErrorCount} Errors</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="skipInvalid"
                        checked={csvSkipInvalid}
                        onChange={(e) => setCsvSkipInvalid(e.target.checked)}
                        className="rounded border-border"
                      />
                      <label htmlFor="skipInvalid" className="cursor-pointer text-muted">
                        Skip invalid rows and import valid ones
                      </label>
                    </div>
                  </div>

                  {/* Row by row preview table */}
                  <div className="max-h-60 overflow-y-auto border border-border rounded-lg">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-surface-muted border-b border-border sticky top-0">
                        <tr>
                          <th className="p-2 w-12">#</th>
                          <th className="p-2">Name</th>
                          <th className="p-2">Email</th>
                          <th className="p-2">ID</th>
                          <th className="p-2">Dept</th>
                          <th className="p-2">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border font-mono">
                        {csvParsedRows.map((r) => (
                          <tr
                            key={r.rowNumber}
                            className={r.isValid ? "bg-surface" : "bg-danger/5"}
                          >
                            <td className="p-2 text-muted">{r.rowNumber}</td>
                            <td className="p-2 font-sans">{r.data["name"]}</td>
                            <td className="p-2">{r.data["email"]}</td>
                            <td className="p-2">
                              {r.data["studentid"] || r.data["employeeid"]}
                            </td>
                            <td className="p-2">{r.data["departmentcode"]}</td>
                            <td className="p-2 font-sans">
                              {r.isValid ? (
                                <span className="text-success font-semibold flex items-center gap-1">
                                  <Check className="w-3.5 h-3.5" /> Valid
                                </span>
                              ) : (
                                <span
                                  className="text-danger font-semibold block text-[11px]"
                                  title={r.errors.join(", ")}
                                >
                                  {r.errors[0]}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-border">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setCsvStep(2)}
                    >
                      Back to Upload
                    </Button>
                    <Button
                      type="button"
                      disabled={csvValidCount === 0 || (!csvSkipInvalid && csvErrorCount > 0)}
                      onClick={handleExecuteCsvImport}
                    >
                      Confirm &amp; Import ({csvSkipInvalid ? csvValidCount : csvParsedRows.length} Rows)
                    </Button>
                  </div>
                </div>
              )}

              {/* Step 4: Results & Download Passwords File */}
              {csvStep === 4 && csvResultData && (
                <div className="space-y-4 text-center py-4">
                  <div className="w-14 h-14 rounded-full bg-success/10 text-success flex items-center justify-center mx-auto mb-2">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  <h3 className="text-base font-bold text-foreground">
                    Import Completed Successfully!
                  </h3>
                  <p className="text-xs text-muted max-w-md mx-auto leading-relaxed">
                    Successfully imported <strong className="text-foreground">{csvResultData.importedCount}</strong>{" "}
                    users ({csvResultData.skippedCount} skipped). You can now download
                    the generated passwords file for institutional records.
                  </p>

                  <div className="pt-3">
                    <Button
                      type="button"
                      onClick={handleDownloadResultCsv}
                      className="inline-flex items-center gap-2"
                    >
                      <Download className="w-4 h-4" />
                      <span>Download Passwords &amp; Results CSV</span>
                    </Button>
                  </div>

                  <div className="pt-4 border-t border-border">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setIsCsvModalOpen(false)}
                    >
                      Close Window
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      {/* Confirmation Dialog: Toggle Active / Reset Password */}
      <ConfirmDialog
        open={confirmDialog.isOpen}
        onOpenChange={(open) =>
          setConfirmDialog((prev) => ({ ...prev, isOpen: open }))
        }
        title={
          confirmDialog.type === "reset-password"
            ? `Reset Password for ${confirmDialog.user?.name}?`
            : confirmDialog.user?.isActive
            ? `Deactivate ${confirmDialog.user?.name}?`
            : `Reactivate ${confirmDialog.user?.name}?`
        }
        description={
          confirmDialog.type === "reset-password"
            ? "A new secure temporary password will be generated and existing sessions will be invalidated."
            : confirmDialog.user?.isActive
            ? "The user will be immediately blocked from signing into RUET ELMS."
            : "The user will be restored to active status and able to sign in."
        }
        confirmLabel={
          confirmDialog.type === "reset-password"
            ? "Reset Password"
            : confirmDialog.user?.isActive
            ? "Deactivate User"
            : "Reactivate User"
        }
        isDestructive={
          confirmDialog.type === "toggle-active" &&
          Boolean(confirmDialog.user?.isActive)
        }
        isLoading={actionLoading}
        onConfirm={handleConfirmAction}
      />
    </div>
  );
}
