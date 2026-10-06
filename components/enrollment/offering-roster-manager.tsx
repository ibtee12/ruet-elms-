"use client";

import * as React from "react";
import {
  UserPlus,
  ArrowRightLeft,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RotateCcw,
  UserMinus,
  Download,
  FileSpreadsheet,
  GraduationCap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusChip } from "@/components/shared/status-chip";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { formatDhaka, formatRelative } from "@/lib/datetime";
import { toast } from "@/lib/toast";
import {
  getRosterAction,
  previewEnrollmentAction,
  confirmEnrollmentAction,
  dropEnrollmentAction,
  reenrollAction,
  moveEnrollmentsAction,
  type RosterData,
  type EnrollPreviewResult,
} from "@/actions/enrollment";
import { ENROLL_CSV_TEMPLATE } from "@/lib/enrollment/roster-import";
import * as DialogPrimitive from "@radix-ui/react-dialog";

interface OfferingRosterManagerProps {
  offeringId: string;
  initialData: RosterData;
  canManage: boolean;
}

export function OfferingRosterManager({
  offeringId,
  initialData,
  canManage,
}: OfferingRosterManagerProps) {
  const [data, setData] = React.useState<RosterData>(initialData);
  const [selectedSection, setSelectedSection] = React.useState<string>("ALL");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<"ALL" | "ACTIVE" | "DROPPED">("ALL");
  const [selectedEnrollmentIds, setSelectedEnrollmentIds] = React.useState<string[]>([]);

  // Dialogs
  const [isAddOpen, setIsAddOpen] = React.useState(false);
  const [addMode, setAddMode] = React.useState<"paste" | "csv">("paste");
  const [rawInput, setRawInput] = React.useState("");
  const [targetDefaultSectionId, setTargetDefaultSectionId] = React.useState(
    initialData.sections[0]?.id || ""
  );
  const [previewResult, setPreviewResult] = React.useState<EnrollPreviewResult | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = React.useState(false);
  const [isConfirmLoading, setIsConfirmLoading] = React.useState(false);

  // Drop / Re-enroll confirmations
  const [actionDialog, setActionDialog] = React.useState<{
    isOpen: boolean;
    type: "drop" | "reenroll" | "move";
    targetId?: string;
    targetName?: string;
  }>({ isOpen: false, type: "drop" });
  const [isActionLoading, setIsActionLoading] = React.useState(false);
  const [moveTargetSectionId, setMoveTargetSectionId] = React.useState(
    initialData.sections[0]?.id || ""
  );
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const refreshRoster = async () => {
    setIsRefreshing(true);
    try {
      const refreshed = await getRosterAction(offeringId);
      setData(refreshed);
      setSelectedEnrollmentIds([]);
    } catch (e) {
      console.error("Failed to refresh roster:", e);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Filtered students
  const filteredStudents = React.useMemo(() => {
    return data.students.filter((st) => {
      if (selectedSection !== "ALL" && st.sectionId !== selectedSection) {
        return false;
      }
      if (statusFilter !== "ALL" && st.status !== statusFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = st.name.toLowerCase().includes(q);
        const matchEmail = st.email.toLowerCase().includes(q);
        const matchId = st.studentId?.toLowerCase().includes(q);
        const matchBatch = st.batch?.toLowerCase().includes(q);
        if (!matchName && !matchEmail && !matchId && !matchBatch) return false;
      }
      return true;
    });
  }, [data.students, selectedSection, statusFilter, searchQuery]);

  // Bulk selection handling
  const allFilteredSelected =
    filteredStudents.length > 0 &&
    filteredStudents.every((st) => selectedEnrollmentIds.includes(st.enrollmentId));

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedEnrollmentIds([]);
    } else {
      setSelectedEnrollmentIds(filteredStudents.map((st) => st.enrollmentId));
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedEnrollmentIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Handlers
  const handlePreview = async () => {
    if (!rawInput.trim()) {
      toast.error("Please enter student roll numbers or upload a CSV file.");
      return;
    }
    setIsPreviewLoading(true);
    try {
      const res = await previewEnrollmentAction(offeringId, rawInput, targetDefaultSectionId);
      if (!res.success) {
        toast.error(res.error || "Failed to parse enrollment list.");
        return;
      }
      setPreviewResult(res);
      toast.info(`Parsed ${res.rows.length} rows. Review the preview below.`);
    } catch {
      toast.error("An unexpected error occurred during preview.");
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const handleConfirmBulkEnroll = async () => {
    setIsConfirmLoading(true);
    try {
      const res = await confirmEnrollmentAction(offeringId, rawInput, targetDefaultSectionId);
      if (!res.success) {
        toast.error(res.error || "Failed to enroll students.");
        return;
      }
      toast.success(
        `Successfully enrolled ${res.enrolled} student(s)${res.reenrolled ? `, re-enrolled ${res.reenrolled}` : ""}.`
      );
      setIsAddOpen(false);
      setRawInput("");
      setPreviewResult(null);
      await refreshRoster();
    } catch {
      toast.error("Failed to commit enrollments.");
    } finally {
      setIsConfirmLoading(false);
    }
  };

  const handleExecuteAction = async () => {
    setIsActionLoading(true);
    try {
      if (actionDialog.type === "drop" && actionDialog.targetId) {
        const res = await dropEnrollmentAction(actionDialog.targetId);
        if (!res.success) {
          toast.error(res.error || "Failed to drop student.");
          return;
        }
        toast.success(`Dropped ${actionDialog.targetName || "student"}. Past coursework is preserved.`);
      } else if (actionDialog.type === "reenroll" && actionDialog.targetId) {
        const res = await reenrollAction(actionDialog.targetId);
        if (!res.success) {
          toast.error(res.error || "Failed to re-enroll student.");
          return;
        }
        toast.success(`Re-enrolled ${actionDialog.targetName || "student"}.`);
      } else if (actionDialog.type === "move" && selectedEnrollmentIds.length > 0) {
        const res = await moveEnrollmentsAction(
          offeringId,
          selectedEnrollmentIds,
          moveTargetSectionId
        );
        if (!res.success) {
          toast.error(res.error || "Failed to move students.");
          return;
        }
        toast.success(`Successfully moved ${res.moved} student(s).`);
      }
      setActionDialog({ isOpen: false, type: "drop" });
      await refreshRoster();
    } catch {
      toast.error("Operation failed.");
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleDownloadCsvTemplate = () => {
    const blob = new Blob([ENROLL_CSV_TEMPLATE], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `enrollment_template_${offeringId}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setRawInput(text || "");
      toast.info(`Loaded ${file.name}`);
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-6">
      {/* Top Controls & Action Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl border border-border bg-surface shadow-xs">
        {/* Section Tabs */}
        <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Course Sections">
          <button
            type="button"
            role="tab"
            aria-selected={selectedSection === "ALL"}
            aria-controls="roster-table-panel"
            onClick={() => setSelectedSection("ALL")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              selectedSection === "ALL"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "bg-surface-muted text-muted hover:text-foreground"
            }`}
          >
            All Sections ({data.students.filter((s) => s.status === "ACTIVE").length})
          </button>
          {data.sections.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={selectedSection === s.id}
              aria-controls="roster-table-panel"
              onClick={() => setSelectedSection(s.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                selectedSection === s.id
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "bg-surface-muted text-muted hover:text-foreground"
              }`}
            >
              {s.name} ({s.activeCount})
            </button>
          ))}
        </div>

        {/* Action Buttons */}
        {canManage && (
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            {selectedEnrollmentIds.length > 0 && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() =>
                  setActionDialog({
                    isOpen: true,
                    type: "move",
                    targetName: `${selectedEnrollmentIds.length} students`,
                  })
                }
                className="flex items-center gap-1.5 text-xs h-9"
              >
                <ArrowRightLeft className="w-3.5 h-3.5 text-primary" />
                <span>Move ({selectedEnrollmentIds.length})</span>
              </Button>
            )}

            <Button
              type="button"
              onClick={() => {
                setPreviewResult(null);
                setRawInput("");
                setIsAddOpen(true);
              }}
              className="flex items-center gap-1.5 text-xs h-9"
            >
              <UserPlus className="w-4 h-4" />
              <span>Add Students</span>
            </Button>
          </div>
        )}
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          <Input
            type="search"
            placeholder="Search by student name, ID, or batch..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 text-xs h-9 bg-surface"
            aria-label="Search roster"
          />
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="status-filter" className="text-xs text-muted flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" />
            <span>Status:</span>
          </label>
          <select
            id="status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "ALL" | "ACTIVE" | "DROPPED")}
            className="h-9 px-3 text-xs rounded-lg border border-border bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active Only</option>
            <option value="DROPPED">Dropped Only</option>
          </select>
        </div>
      </div>

      {/* Roster Table */}
      <div
        id="roster-table-panel"
        role="tabpanel"
        aria-label="Student Roster"
        className={`rounded-xl border border-border bg-surface shadow-xs overflow-hidden transition-opacity ${
          isRefreshing ? "opacity-60 pointer-events-none" : "opacity-100"
        }`}
      >
        {filteredStudents.length === 0 ? (
          <EmptyState
            icon={GraduationCap}
            title={
              data.students.length === 0
                ? "No Students Enrolled"
                : "No matching students found"
            }
            description={
              data.students.length === 0
                ? "This course offering does not have any enrolled students yet. Use the Add Students button above to paste IDs or upload a CSV."
                : "Try adjusting your search query or status filter to see other students."
            }
            action={
              data.students.length === 0 && canManage
                ? {
                    label: "Add Students",
                    onClick: () => setIsAddOpen(true),
                  }
                : undefined
            }
            className="border-none py-12"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-border bg-surface-muted/50 text-muted font-semibold uppercase tracking-wider text-[11px]">
                  {canManage && (
                    <th scope="col" className="p-3.5 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={allFilteredSelected}
                        onChange={toggleSelectAll}
                        aria-label="Select all students in table"
                        className="w-4 h-4 rounded border-border accent-primary cursor-pointer"
                      />
                    </th>
                  )}
                  <th scope="col" className="p-3.5">
                    Student Roll & Name
                  </th>
                  <th scope="col" className="p-3.5">
                    Batch
                  </th>
                  <th scope="col" className="p-3.5">
                    Section
                  </th>
                  <th scope="col" className="p-3.5">
                    Status
                  </th>
                  <th scope="col" className="p-3.5">
                    Enrolled Date
                  </th>
                  <th scope="col" className="p-3.5">
                    Last Active
                  </th>
                  {canManage && (
                    <th scope="col" className="p-3.5 text-right">
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredStudents.map((st) => {
                  const isSelected = selectedEnrollmentIds.includes(st.enrollmentId);
                  return (
                    <tr
                      key={st.enrollmentId}
                      className={`hover:bg-surface-muted/30 transition-colors ${
                        isSelected ? "bg-primary/5" : ""
                      }`}
                    >
                      {canManage && (
                        <td className="p-3.5 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectOne(st.enrollmentId)}
                            aria-label={`Select ${st.name}`}
                            className="w-4 h-4 rounded border-border accent-primary cursor-pointer"
                          />
                        </td>
                      )}
                      <td className="p-3.5">
                        <div className="font-semibold text-foreground flex items-center gap-1.5">
                          <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-surface-muted text-foreground border border-border/80">
                            {st.studentId || "N/A"}
                          </span>
                          <span>{st.name}</span>
                        </div>
                        <div className="text-[11px] text-muted">{st.email}</div>
                      </td>
                      <td className="p-3.5 text-muted font-medium">
                        {st.batch ? `Batch ${st.batch}` : "—"}
                      </td>
                      <td className="p-3.5 font-medium text-foreground">
                        <span className="px-2 py-0.5 rounded-md bg-surface-muted border border-border text-[11px]">
                          {st.sectionName}
                        </span>
                      </td>
                      <td className="p-3.5">
                        <StatusChip
                          status={st.status === "ACTIVE" ? "submitted" : "archived"}
                          customLabel={st.status === "ACTIVE" ? "Enrolled" : "Dropped"}
                        />
                      </td>
                      <td className="p-3.5 text-muted whitespace-nowrap">
                        {formatDhaka(st.enrolledAt, "date")}
                      </td>
                      <td className="p-3.5 text-muted whitespace-nowrap">
                        {st.lastActiveAt ? formatRelative(st.lastActiveAt) : "Never"}
                      </td>
                      {canManage && (
                        <td className="p-3.5 text-right whitespace-nowrap">
                          {st.status === "ACTIVE" ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setActionDialog({
                                  isOpen: true,
                                  type: "drop",
                                  targetId: st.enrollmentId,
                                  targetName: `${st.name} (${st.studentId})`,
                                })
                              }
                              className="h-7 text-xs text-danger hover:text-danger hover:bg-danger/10"
                              title="Drop student from this course offering"
                            >
                              <UserMinus className="w-3.5 h-3.5 mr-1" />
                              <span>Drop</span>
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setActionDialog({
                                  isOpen: true,
                                  type: "reenroll",
                                  targetId: st.enrollmentId,
                                  targetName: `${st.name} (${st.studentId})`,
                                })
                              }
                              className="h-7 text-xs text-primary hover:text-primary hover:bg-primary/10"
                              title="Re-enroll dropped student"
                            >
                              <RotateCcw className="w-3.5 h-3.5 mr-1" />
                              <span>Re-enroll</span>
                            </Button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ADD STUDENTS MODAL WITH STEPPER / PREVIEW */}
      <DialogPrimitive.Root open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs" />
          <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-surface p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-border">
              <div>
                <DialogPrimitive.Title className="text-lg font-bold text-foreground">
                  Enroll Students
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="text-xs text-muted">
                  Add registered students by roll number or CSV. You can preview validation before committing.
                </DialogPrimitive.Description>
              </div>
              <DialogPrimitive.Close asChild>
                <button
                  type="button"
                  aria-label="Close dialog"
                  className="w-8 h-8 rounded-lg text-muted hover:text-foreground flex items-center justify-center transition-colors"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </DialogPrimitive.Close>
            </div>

            <div className="space-y-4 pt-4">
              {/* Default Section Picker */}
              <div>
                <label htmlFor="target-default-section" className="text-xs font-semibold text-foreground block mb-1">
                  Target Section for Enrolled Students
                </label>
                <select
                  id="target-default-section"
                  value={targetDefaultSectionId}
                  onChange={(e) => setTargetDefaultSectionId(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg border border-border bg-surface text-foreground text-xs"
                >
                  {data.sections.map((sec) => (
                    <option key={sec.id} value={sec.id}>
                      {sec.name}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-muted mt-1">
                  If your CSV specifies a section column, that takes precedence. Otherwise this default is assigned.
                </p>
              </div>

              {/* Mode Toggle */}
              <div className="flex items-center gap-2 border-b border-border pb-2">
                <button
                  type="button"
                  onClick={() => setAddMode("paste")}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                    addMode === "paste"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  Paste Student Roll Numbers
                </button>
                <button
                  type="button"
                  onClick={() => setAddMode("csv")}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                    addMode === "csv"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  Upload CSV File
                </button>
              </div>

              {addMode === "paste" ? (
                <div>
                  <label htmlFor="paste-input" className="text-xs text-muted block mb-1.5">
                    Paste student roll numbers separated by commas, spaces, or newlines:
                  </label>
                  <textarea
                    id="paste-input"
                    rows={6}
                    value={rawInput}
                    onChange={(e) => {
                      setRawInput(e.target.value);
                      setPreviewResult(null);
                    }}
                    placeholder={"2203001\n2203002\n2203003"}
                    className="w-full p-3 rounded-lg border border-border bg-surface text-foreground font-mono text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted">Upload CSV with studentId column:</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleDownloadCsvTemplate}
                      className="text-xs h-7 text-primary"
                    >
                      <Download className="w-3.5 h-3.5 mr-1" />
                      <span>Download Sample Template</span>
                    </Button>
                  </div>
                  <label
                    htmlFor="csv-file-upload"
                    className="flex flex-col items-center justify-center p-6 rounded-xl border border-dashed border-border hover:border-primary cursor-pointer bg-surface-muted/30 transition-colors"
                  >
                    <FileSpreadsheet className="w-8 h-8 text-primary mb-2" />
                    <span className="text-xs font-medium text-foreground">Click to select CSV</span>
                    <span className="text-[11px] text-muted">Supports headers: studentId, section</span>
                    <input
                      id="csv-file-upload"
                      type="file"
                      aria-label="Upload enrollment CSV file"
                      accept=".csv,text/csv"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                  {rawInput && (
                    <div className="text-[11px] text-muted font-mono bg-surface-muted p-2 rounded max-h-24 overflow-y-auto">
                      {rawInput.slice(0, 300)}...
                    </div>
                  )}
                </div>
              )}

              {/* Preview Button */}
              <div className="flex items-center justify-between pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handlePreview}
                  disabled={isPreviewLoading || !rawInput.trim()}
                  className="text-xs"
                >
                  {isPreviewLoading ? "Analyzing..." : "Preview Validation"}
                </Button>

                {previewResult && (
                  <span className="text-xs font-medium text-foreground">
                    Ready to Enroll: {previewResult.summary.ready + previewResult.summary.reenroll} of{" "}
                    {previewResult.summary.total}
                  </span>
                )}
              </div>

              {/* Preview Table & Breakdown */}
              {previewResult && (
                <div className="space-y-3 pt-2 border-t border-border">
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 text-center text-xs">
                    <div className="p-2 rounded-lg bg-success/10 text-success border border-success/20">
                      <div className="font-bold">{previewResult.summary.ready}</div>
                      <div className="text-[10px]">New Enroll</div>
                    </div>
                    <div className="p-2 rounded-lg bg-primary/10 text-primary border border-primary/20">
                      <div className="font-bold">{previewResult.summary.reenroll}</div>
                      <div className="text-[10px]">Re-enroll</div>
                    </div>
                    <div className="p-2 rounded-lg bg-warning/10 text-warning border border-warning/20">
                      <div className="font-bold">{previewResult.summary.alreadyEnrolled}</div>
                      <div className="text-[10px]">Already Active</div>
                    </div>
                    <div className="p-2 rounded-lg bg-danger/10 text-danger border border-danger/20">
                      <div className="font-bold">{previewResult.summary.notFound}</div>
                      <div className="text-[10px]">Not Found</div>
                    </div>
                    <div className="p-2 rounded-lg bg-surface-muted text-muted border border-border">
                      <div className="font-bold">{previewResult.summary.invalid}</div>
                      <div className="text-[10px]">Invalid</div>
                    </div>
                  </div>

                  <div className="max-h-56 overflow-y-auto rounded-lg border border-border bg-surface text-xs">
                    <table className="w-full text-left">
                      <thead className="bg-surface-muted text-muted font-medium uppercase text-[10px] sticky top-0">
                        <tr>
                          <th className="p-2">Roll</th>
                          <th className="p-2">Name</th>
                          <th className="p-2">Target Section</th>
                          <th className="p-2">Validation Result</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {previewResult.rows.map((row, idx) => (
                          <tr key={idx} className="hover:bg-surface-muted/30">
                            <td className="p-2 font-mono font-medium">{row.studentId}</td>
                            <td className="p-2 text-muted">{row.name || "—"}</td>
                            <td className="p-2">{row.sectionName || "Default"}</td>
                            <td className="p-2">
                              {row.status === "READY" ? (
                                <span className="inline-flex items-center gap-1 text-success font-medium">
                                  <CheckCircle2 className="w-3.5 h-3.5" /> Ready
                                </span>
                              ) : row.status === "REENROLL" ? (
                                <span className="inline-flex items-center gap-1 text-primary font-medium">
                                  <RotateCcw className="w-3.5 h-3.5" /> Re-activate
                                </span>
                              ) : row.status === "ALREADY_ENROLLED" ? (
                                <span className="inline-flex items-center gap-1 text-warning">
                                  <AlertTriangle className="w-3.5 h-3.5" /> Already Active
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-danger">
                                  <XCircle className="w-3.5 h-3.5" /> {row.message}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Commit Action */}
                  <div className="flex items-center justify-end gap-2 pt-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsAddOpen(false)}
                      disabled={isConfirmLoading}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleConfirmBulkEnroll}
                      disabled={
                        isConfirmLoading ||
                        previewResult.summary.ready + previewResult.summary.reenroll === 0
                      }
                      className="bg-primary text-primary-foreground font-semibold"
                    >
                      {isConfirmLoading
                        ? "Enrolling..."
                        : `Confirm & Enroll (${
                            previewResult.summary.ready + previewResult.summary.reenroll
                          }) Students`}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      {/* CONFIRM ACTION DIALOG (Drop, Re-enroll, Move) */}
      <ConfirmDialog
        open={actionDialog.isOpen}
        onOpenChange={(open) =>
          setActionDialog((prev) => ({ ...prev, isOpen: open }))
        }
        title={
          actionDialog.type === "drop"
            ? "Drop Student from Offering?"
            : actionDialog.type === "reenroll"
            ? "Re-enroll Student?"
            : "Move Students to Another Section?"
        }
        description={
          actionDialog.type === "drop"
            ? `Are you sure you want to drop ${actionDialog.targetName}? Their status will change to DROPPED, and they will lose access to course materials, but past grades and submissions will be safely preserved.`
            : actionDialog.type === "reenroll"
            ? `Re-enroll ${actionDialog.targetName}? Their status will return to ACTIVE, restoring course access.`
            : `Move ${selectedEnrollmentIds.length} selected student(s) to a different section:`
        }
        confirmLabel={
          actionDialog.type === "drop"
            ? "Drop Student"
            : actionDialog.type === "reenroll"
            ? "Re-enroll"
            : "Move Students"
        }
        isDestructive={actionDialog.type === "drop"}
        isLoading={isActionLoading}
        onConfirm={handleExecuteAction}
      >
        {actionDialog.type === "move" && (
          <div className="my-3">
            <label htmlFor="move-destination-section" className="text-xs font-semibold text-foreground block mb-1">
              Select Destination Section:
            </label>
            <select
              id="move-destination-section"
              value={moveTargetSectionId}
              onChange={(e) => setMoveTargetSectionId(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-border bg-surface text-foreground text-xs"
            >
              {data.sections.map((sec) => (
                <option key={sec.id} value={sec.id}>
                  {sec.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </ConfirmDialog>
    </div>
  );
}
