"use client";

import * as React from "react";
import Link from "next/link";
import {
  Layers,
  ArrowLeft,
  Users,
  KeyRound,
  Plus,
  Trash2,
  Pencil,
  Copy,
  Check,
  Archive,
  Send,
  AlertTriangle,
  X,
} from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusChip } from "@/components/shared/status-chip";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { toast } from "@/lib/toast";
import {
  CourseOfferingStatus,
  OfferingTeacherRole,
  Role,
} from "@prisma/client";
import {
  updateOfferingStatusAction,
  addSectionAction,
  renameSectionAction,
  removeSectionAction,
  assignOfferingTeacherAction,
  removeOfferingTeacherAction,
  generateJoinCodeAction,
  disableJoinCodeAction,
  setJoinDeptRestrictionAction,
} from "@/actions/offerings";
import { OfferingRosterManager } from "@/components/enrollment/offering-roster-manager";
import type { RosterData } from "@/actions/enrollment";

export interface OfferingDetail {
  id: string;
  term: string;
  academicYear: string;
  status: CourseOfferingStatus;
  syllabus: string | null;
  joinCode: string | null;
  joinRequiresDeptMatch: boolean;
  course: {
    id: string;
    code: string;
    title: string;
    description: string | null;
    department: { id: string; name: string; code: string };
  };
  sections: Array<{
    id: string;
    name: string;
    _count: { enrollments: number };
  }>;
  offeringTeachers: Array<{
    id: string;
    userId: string;
    role: OfferingTeacherRole;
    user: {
      id: string;
      name: string;
      email: string;
      teacherProfile: { designation: string; employeeId: string } | null;
    };
  }>;
}

interface TeacherOption {
  id: string;
  name: string;
  email: string;
  designation?: string;
}

interface OfferingDetailManagerProps {
  initialOffering: OfferingDetail;
  departmentTeachers: TeacherOption[];
  callerRole: Role;
  initialRoster?: RosterData;
}

export function OfferingDetailManager({
  initialOffering,
  departmentTeachers,
  initialRoster,
}: OfferingDetailManagerProps) {
  const [offering, setOffering] = React.useState<OfferingDetail>(initialOffering);
  const [activeTab, setActiveTab] = React.useState<"overview" | "roster">("overview");
  const [hasCopiedCode, setHasCopiedCode] = React.useState(false);

  // Section Modal State
  const [sectionModal, setSectionModal] = React.useState<{
    isOpen: boolean;
    mode: "add" | "rename";
    sectionId?: string;
    name: string;
  }>({
    isOpen: false,
    mode: "add",
    name: "",
  });
  const [isSectionSubmitting, setIsSectionSubmitting] = React.useState(false);

  // Teacher Assign Modal State
  const [teacherModal, setTeacherModal] = React.useState<{
    isOpen: boolean;
    userId: string;
    role: OfferingTeacherRole;
  }>({
    isOpen: false,
    userId: departmentTeachers[0]?.id || "",
    role: OfferingTeacherRole.INSTRUCTOR,
  });
  const [isTeacherSubmitting, setIsTeacherSubmitting] = React.useState(false);

  // Confirm Dialog State (Status change or Deletions)
  const [confirmDialog, setConfirmDialog] = React.useState<{
    isOpen: boolean;
    type: "publish" | "archive" | "delete-section" | "remove-teacher";
    targetId?: string;
    title: string;
    description: string;
  }>({
    isOpen: false,
    type: "publish",
    title: "",
    description: "",
  });
  const [actionLoading, setActionLoading] = React.useState(false);

  const isArchived = offering.status === CourseOfferingStatus.ARCHIVED;

  // Handle Publish / Archive
  const handleConfirmAction = async () => {
    setActionLoading(true);
    try {
      if (confirmDialog.type === "publish") {
        const res = await updateOfferingStatusAction(
          offering.id,
          CourseOfferingStatus.PUBLISHED
        );
        if (!res.success) {
          toast.error(res.error || "Cannot publish offering.");
          return;
        }
        setOffering((prev) => ({
          ...prev,
          status: CourseOfferingStatus.PUBLISHED,
        }));
        toast.success(
          "Offering Published",
          "Course offering is now published and visible to enrolled students."
        );
      } else if (confirmDialog.type === "archive") {
        const res = await updateOfferingStatusAction(
          offering.id,
          CourseOfferingStatus.ARCHIVED
        );
        if (!res.success) {
          toast.error(res.error || "Cannot archive offering.");
          return;
        }
        setOffering((prev) => ({
          ...prev,
          status: CourseOfferingStatus.ARCHIVED,
        }));
        toast.success(
          "Offering Archived",
          "Course offering is now read-only forever."
        );
      } else if (confirmDialog.type === "delete-section" && confirmDialog.targetId) {
        const res = await removeSectionAction(confirmDialog.targetId);
        if (!res.success) {
          toast.error(res.error || "Failed to remove section.");
          return;
        }
        setOffering((prev) => ({
          ...prev,
          sections: prev.sections.filter((s) => s.id !== confirmDialog.targetId),
        }));
        toast.success("Section removed");
      } else if (confirmDialog.type === "remove-teacher" && confirmDialog.targetId) {
        const res = await removeOfferingTeacherAction(
          offering.id,
          confirmDialog.targetId
        );
        if (!res.success) {
          toast.error("Failed to remove teacher.");
          return;
        }
        setOffering((prev) => ({
          ...prev,
          offeringTeachers: prev.offeringTeachers.filter(
            (t) => t.userId !== confirmDialog.targetId
          ),
        }));
        toast.success("Teacher assignment removed");
      }
    } catch {
      toast.error("Operation failed.");
    } finally {
      setActionLoading(false);
      setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
    }
  };

  // Section Save
  const handleSaveSection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sectionModal.name.trim()) return;
    setIsSectionSubmitting(true);

    try {
      if (sectionModal.mode === "add") {
        const res = await addSectionAction(offering.id, sectionModal.name);
        if (!res.success || !res.section) {
          toast.error(res.error || "Failed to add section.");
          return;
        }
        const createdSection = res.section;
        setOffering((prev) => ({
          ...prev,
          sections: [
            ...prev.sections,
            { id: createdSection.id, name: createdSection.name, _count: { enrollments: 0 } },
          ],
        }));
        toast.success("Section added");
      } else if (sectionModal.mode === "rename" && sectionModal.sectionId) {
        const res = await renameSectionAction(
          sectionModal.sectionId,
          sectionModal.name
        );
        if (!res.success || !res.section) {
          toast.error(res.error || "Failed to rename section.");
          return;
        }
        const updatedSection = res.section;
        setOffering((prev) => ({
          ...prev,
          sections: prev.sections.map((s) =>
            s.id === sectionModal.sectionId
              ? { ...s, name: updatedSection.name }
              : s
          ),
        }));
        toast.success("Section renamed");
      }
      setSectionModal((prev) => ({ ...prev, isOpen: false }));
    } catch {
      toast.error("An error occurred.");
    } finally {
      setIsSectionSubmitting(false);
    }
  };

  // Teacher Assign
  const handleAssignTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teacherModal.userId) return;
    setIsTeacherSubmitting(true);

    try {
      const res = await assignOfferingTeacherAction(
        offering.id,
        teacherModal.userId,
        teacherModal.role
      );
      if (!res.success || !res.teacher) {
        toast.error("Failed to assign teacher.");
        return;
      }
      const newTeacher = res.teacher;
      setOffering((prev) => {
        const filtered = prev.offeringTeachers.filter(
          (t) => t.userId !== teacherModal.userId
        );
        return {
          ...prev,
          offeringTeachers: [...filtered, newTeacher],
        };
      });
      toast.success(
        `Assigned as ${teacherModal.role === "INSTRUCTOR" ? "Instructor" : "Teaching Assistant"}`
      );
      setTeacherModal((prev) => ({ ...prev, isOpen: false }));
    } catch {
      toast.error("An error occurred assigning faculty.");
    } finally {
      setIsTeacherSubmitting(false);
    }
  };

  // Join Code controls
  const handleToggleDeptRestriction = async (restricted: boolean) => {
    try {
      const res = await setJoinDeptRestrictionAction(offering.id, restricted);
      if (res.success) {
        setOffering((prev) => ({ ...prev, joinRequiresDeptMatch: restricted }));
        toast.success(
          restricted
            ? `Join code limited to ${offering.course.department.code} students`
            : "Join code open to all departments"
        );
      }
    } catch {
      toast.error("Failed to update join code restriction.");
    }
  };
  const handleGenerateJoinCode = async () => {
    try {
      const res = await generateJoinCodeAction(offering.id);
      if (res.success) {
        setOffering((prev) => ({ ...prev, joinCode: res.joinCode }));
        toast.success("Join code generated", res.joinCode);
      }
    } catch {
      toast.error("Failed to generate join code.");
    }
  };

  const handleDisableJoinCode = async () => {
    try {
      const res = await disableJoinCodeAction(offering.id);
      if (res.success) {
        setOffering((prev) => ({ ...prev, joinCode: null }));
        toast.success("Join code disabled");
      }
    } catch {
      toast.error("Failed to disable join code.");
    }
  };

  const handleCopyJoinCode = () => {
    if (!offering.joinCode) return;
    navigator.clipboard.writeText(offering.joinCode);
    setHasCopiedCode(true);
    toast.success("Join code copied to clipboard");
    setTimeout(() => setHasCopiedCode(false), 2000);
  };

  const statusMap: Record<CourseOfferingStatus, "draft" | "active" | "archived"> = {
    DRAFT: "draft",
    PUBLISHED: "active",
    ARCHIVED: "archived",
  };

  return (
    <div className="space-y-6">
      {/* Back button */}
      <div>
        <Link
          href="/dept/offerings"
          className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-foreground font-medium transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to All Offerings</span>
        </Link>
      </div>

      {/* Archived Warning Banner */}
      {isArchived && (
        <div className="p-4 rounded-xl border border-warning/30 bg-warning/10 text-foreground flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-warning shrink-0" />
          <div className="text-xs">
            <span className="font-bold block">Offering Archived (Read-Only)</span>
            <span>
              This offering is archived. All modification actions (sections, instructors, join codes, syllabus) are permanently locked.
            </span>
          </div>
        </div>
      )}

      {/* Main Offering Header Card */}
      <div className="p-6 rounded-2xl border border-border bg-surface shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono font-bold text-sm uppercase px-2.5 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20">
                {offering.course.code}
              </span>
              <StatusChip status={statusMap[offering.status]} />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">
              {offering.course.title}
            </h1>
            <p className="text-xs text-muted mt-1">
              Department of {offering.course.department.name} • {offering.term} {offering.academicYear}
            </p>
          </div>

          {/* Status Controls */}
          {!isArchived && (
            <div className="flex items-center gap-2">
              {offering.status === CourseOfferingStatus.DRAFT && (
                <Button
                  type="button"
                  onClick={() =>
                    setConfirmDialog({
                      isOpen: true,
                      type: "publish",
                      title: `Publish ${offering.course.code}?`,
                      description:
                        "Publishing will make this offering active and visible to enrolled students. Requires at least one section and one instructor.",
                    })
                  }
                  className="flex items-center gap-1.5"
                >
                  <Send className="w-4 h-4" />
                  <span>Publish Offering</span>
                </Button>
              )}

              {offering.status === CourseOfferingStatus.PUBLISHED && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    setConfirmDialog({
                      isOpen: true,
                      type: "archive",
                      title: `Archive ${offering.course.code}?`,
                      description:
                        "Archiving will lock this course offering into read-only status forever. All section, instructor, and syllabus modifications will be permanently blocked.",
                    })
                  }
                  className="flex items-center gap-1.5 text-warning hover:text-warning"
                >
                  <Archive className="w-4 h-4" />
                  <span>Archive Offering</span>
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Join Code Card */}
        <div className="pt-4 border-t border-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-primary" />
            <span className="font-semibold text-foreground">Student Join Code:</span>
            {offering.joinCode ? (
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-sm tracking-wider px-2 py-0.5 rounded bg-surface-muted text-foreground border border-border select-all">
                  {offering.joinCode}
                </span>
                <button
                  type="button"
                  onClick={handleCopyJoinCode}
                  className="text-muted hover:text-foreground p-1"
                  title="Copy code"
                >
                  {hasCopiedCode ? (
                    <Check className="w-3.5 h-3.5 text-success" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            ) : (
              <span className="text-muted italic">Disabled (No active join code)</span>
            )}
          </div>

          {!isArchived && (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleGenerateJoinCode}
                className="h-8 text-xs"
              >
                {offering.joinCode ? "Regenerate" : "Generate Code"}
              </Button>
              {offering.joinCode && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleDisableJoinCode}
                  className="h-8 text-xs text-muted hover:text-danger"
                >
                  Disable
                </Button>
              )}
            </div>
          )}
        </div>
        <label className="flex items-center gap-2 text-xs text-muted cursor-pointer w-fit">
          <input
            id="join-dept-restriction"
            type="checkbox"
            className="w-4 h-4 accent-primary"
            checked={offering.joinRequiresDeptMatch}
            disabled={isArchived}
            onChange={(e) => handleToggleDeptRestriction(e.target.checked)}
          />
          <span>
            Only {offering.course.department.code} students can join with this code
          </span>
        </label>
      </div>

      {/* Tabs: Overview vs Student Roster */}
      <div className="flex items-center gap-2 border-b border-border pb-3" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "overview"}
          onClick={() => setActiveTab("overview")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
            activeTab === "overview"
              ? "bg-primary text-primary-foreground shadow-xs"
              : "text-muted hover:text-foreground hover:bg-surface-muted"
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Sections & Faculty</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "roster"}
          onClick={() => setActiveTab("roster")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
            activeTab === "roster"
              ? "bg-primary text-primary-foreground shadow-xs"
              : "text-muted hover:text-foreground hover:bg-surface-muted"
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Student Roster</span>
          {initialRoster && (
            <span
              className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${
                activeTab === "roster"
                  ? "bg-primary-foreground/20 text-primary-foreground"
                  : "bg-surface-muted text-muted border border-border"
              }`}
            >
              {initialRoster.students.filter((s) => s.status === "ACTIVE").length}
            </span>
          )}
        </button>
      </div>

      {activeTab === "roster" && initialRoster ? (
        <OfferingRosterManager
          offeringId={offering.id}
          initialData={initialRoster}
          canManage={!isArchived}
        />
      ) : (
        <>
          {/* Grid: Sections & Faculty */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sections Management */}
        <div className="p-6 rounded-2xl border border-border bg-surface shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-primary" />
              <h2 className="text-base font-bold text-foreground">Course Sections</h2>
            </div>
            {!isArchived && (
              <Button
                type="button"
                size="sm"
                onClick={() =>
                  setSectionModal({
                    isOpen: true,
                    mode: "add",
                    name: `Section ${String.fromCharCode(65 + offering.sections.length)}`,
                  })
                }
                className="h-8 text-xs flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Section</span>
              </Button>
            )}
          </div>

          <div className="space-y-2">
            {offering.sections.map((s) => (
              <div
                key={s.id}
                className="p-3 rounded-xl border border-border bg-surface-muted/40 flex items-center justify-between"
              >
                <div>
                  <span className="font-semibold text-foreground text-sm block">
                    {s.name}
                  </span>
                  <span className="text-xs text-muted">
                    {s._count.enrollments} enrolled student(s)
                  </span>
                </div>

                {!isArchived && (
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setSectionModal({
                          isOpen: true,
                          mode: "rename",
                          sectionId: s.id,
                          name: s.name,
                        })
                      }
                      className="h-8 w-8 p-0 text-muted hover:text-foreground"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setConfirmDialog({
                          isOpen: true,
                          type: "delete-section",
                          targetId: s.id,
                          title: `Delete ${s.name}?`,
                          description:
                            "Sections can only be deleted if they contain 0 student enrollments.",
                        })
                      }
                      className="h-8 w-8 p-0 text-muted hover:text-danger"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Faculty Assignments */}
        <div className="p-6 rounded-2xl border border-border bg-surface shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              <h2 className="text-base font-bold text-foreground">
                Assigned Teachers &amp; TAs
              </h2>
            </div>
            {!isArchived && (
              <Button
                type="button"
                size="sm"
                onClick={() =>
                  setTeacherModal({
                    isOpen: true,
                    userId: departmentTeachers[0]?.id || "",
                    role: OfferingTeacherRole.INSTRUCTOR,
                  })
                }
                className="h-8 text-xs flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Assign Faculty</span>
              </Button>
            )}
          </div>

          <div className="space-y-2">
            {offering.offeringTeachers.length === 0 ? (
              <div className="p-6 rounded-xl border border-dashed border-border text-center text-xs text-muted">
                No faculty assigned yet. An instructor must be assigned before publishing.
              </div>
            ) : (
              offering.offeringTeachers.map((t) => (
                <div
                  key={t.id}
                  className="p-3 rounded-xl border border-border bg-surface-muted/40 flex items-center justify-between"
                >
                  <div>
                    <span className="font-semibold text-foreground text-sm flex items-center gap-2">
                      <span>{t.user.name}</span>
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase ${
                          t.role === "INSTRUCTOR"
                            ? "bg-primary/10 text-primary border border-primary/20"
                            : "bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/20"
                        }`}
                      >
                        {t.role}
                      </span>
                    </span>
                    <span className="text-xs text-muted block mt-0.5">
                      {t.user.email} • {t.user.teacherProfile?.designation || "Faculty"}
                    </span>
                  </div>

                  {!isArchived && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setConfirmDialog({
                          isOpen: true,
                          type: "remove-teacher",
                          targetId: t.userId,
                          title: `Remove ${t.user.name}?`,
                          description:
                            "This faculty member will lose instructor permissions for this course offering.",
                        })
                      }
                      className="h-8 w-8 p-0 text-muted hover:text-danger"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Syllabus Card */}
      {offering.syllabus && (
        <div className="p-6 rounded-2xl border border-border bg-surface shadow-xs space-y-2">
          <h2 className="text-sm font-bold text-foreground">Syllabus Overview</h2>
          <p className="text-xs text-muted leading-relaxed whitespace-pre-line">
            {offering.syllabus}
          </p>
        </div>
      )}
      </>
      )}

      {/* Dialog: Add / Rename Section */}
      <DialogPrimitive.Root
        open={sectionModal.isOpen}
        onOpenChange={(open) =>
          setSectionModal((prev) => ({ ...prev, isOpen: open }))
        }
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs" />
          <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-[10px] border border-border bg-surface p-6 shadow-xl focus:outline-none">
            <div className="flex items-center justify-between pb-3 border-b border-border mb-4">
              <DialogPrimitive.Title className="text-base font-bold text-foreground">
                {sectionModal.mode === "add" ? "Add New Section" : "Rename Section"}
              </DialogPrimitive.Title>
              <DialogPrimitive.Close asChild>
                <button
                  type="button"
                  className="w-8 h-8 rounded text-muted hover:text-foreground flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </DialogPrimitive.Close>
            </div>

            <form onSubmit={handleSaveSection} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold uppercase text-muted mb-1">
                  Section Name
                </label>
                <Input
                  type="text"
                  placeholder="e.g. Section B"
                  value={sectionModal.name}
                  onChange={(e) =>
                    setSectionModal((prev) => ({ ...prev, name: e.target.value }))
                  }
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-border">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    setSectionModal((prev) => ({ ...prev, isOpen: false }))
                  }
                >
                  Cancel
                </Button>
                <Button type="submit" isLoading={isSectionSubmitting}>
                  Save Section
                </Button>
              </div>
            </form>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      {/* Dialog: Assign Faculty */}
      <DialogPrimitive.Root
        open={teacherModal.isOpen}
        onOpenChange={(open) =>
          setTeacherModal((prev) => ({ ...prev, isOpen: open }))
        }
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs" />
          <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-[10px] border border-border bg-surface p-6 shadow-xl focus:outline-none">
            <div className="flex items-center justify-between pb-3 border-b border-border mb-4">
              <DialogPrimitive.Title className="text-base font-bold text-foreground">
                Assign Teacher to Offering
              </DialogPrimitive.Title>
              <DialogPrimitive.Close asChild>
                <button
                  type="button"
                  className="w-8 h-8 rounded text-muted hover:text-foreground flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </DialogPrimitive.Close>
            </div>

            <form onSubmit={handleAssignTeacher} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold uppercase text-muted mb-1">
                  Faculty Member
                </label>
                <select
                  value={teacherModal.userId}
                  onChange={(e) =>
                    setTeacherModal((prev) => ({ ...prev, userId: e.target.value }))
                  }
                  className="w-full h-10 px-3 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  required
                >
                  {departmentTeachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.designation || "Faculty"})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold uppercase text-muted mb-1">
                  Assignment Role
                </label>
                <select
                  value={teacherModal.role}
                  onChange={(e) =>
                    setTeacherModal((prev) => ({
                      ...prev,
                      role: e.target.value as OfferingTeacherRole,
                    }))
                  }
                  className="w-full h-10 px-3 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value={OfferingTeacherRole.INSTRUCTOR}>
                    Lead Instructor (Full Course Management)
                  </option>
                  <option value={OfferingTeacherRole.TA}>
                    Teaching Assistant (TA)
                  </option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-border">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    setTeacherModal((prev) => ({ ...prev, isOpen: false }))
                  }
                >
                  Cancel
                </Button>
                <Button type="submit" isLoading={isTeacherSubmitting}>
                  Assign Faculty
                </Button>
              </div>
            </form>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      {/* Confirmation Dialog */}
      <ConfirmDialog
        open={confirmDialog.isOpen}
        onOpenChange={(open) =>
          setConfirmDialog((prev) => ({ ...prev, isOpen: open }))
        }
        title={confirmDialog.title}
        description={confirmDialog.description}
        confirmLabel="Confirm"
        isLoading={actionLoading}
        onConfirm={handleConfirmAction}
      />
    </div>
  );
}
