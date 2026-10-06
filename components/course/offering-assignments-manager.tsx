"use client";

import * as React from "react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  TeacherOfferingAssignmentsData,
  TeacherAssignmentItemData,
  AssignmentAttachmentData,
} from "@/services/assignments";
import {
  createAssignmentAction,
  updateAssignmentAction,
  toggleAssignmentPublishedAction,
  deleteAssignmentAction,
  uploadAssignmentAttachmentAction,
  AttachmentInput,
} from "@/actions/assignments";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { formatDhaka, dhakaLocalToUtc, utcToDhakaInputFormat, getDeadlineUrgency } from "@/lib/datetime";
import { toast } from "sonner";
import {
  FileCheck2,
  Plus,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  Calendar,
  Clock,
  Users,
  CheckCircle,
  Paperclip,
  Upload,
  X,
  AlertTriangle,
  FileText,
  Lock,
  Loader2,
  ShieldAlert,
} from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";

const FILE_TYPE_OPTIONS = [
  { id: "pdf", label: "PDF Documents (.pdf)", extensions: ["pdf"] },
  { id: "docx", label: "Word Documents (.docx, .doc)", extensions: ["docx", "doc"] },
  { id: "zip", label: "Archives (.zip, .rar, .7z)", extensions: ["zip", "rar", "7z"] },
  { id: "images", label: "Images (.png, .jpg, .jpeg)", extensions: ["png", "jpg", "jpeg", "webp"] },
  { id: "code", label: "Source Code (.c, .cpp, .py, .java, .js, .ts)", extensions: ["c", "cpp", "py", "java", "js", "ts", "html", "css", "sql"] },
];

interface OfferingAssignmentsManagerProps {
  initialData: TeacherOfferingAssignmentsData;
}

export function OfferingAssignmentsManager({ initialData }: OfferingAssignmentsManagerProps) {
  const router = useRouter();
  const [data, setData] = useState<TeacherOfferingAssignmentsData>(initialData);
  const [isPending, startTransition] = useTransition();

  // Create / Edit Modal state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<TeacherAssignmentItemData | null>(null);

  // Form Fields
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [deadlineLocal, setDeadlineLocal] = useState("");
  const [maxMarks, setMaxMarks] = useState<number>(100);
  const [selectedTypeCategories, setSelectedTypeCategories] = useState<string[]>([
    "pdf",
    "docx",
    "zip",
  ]);
  const [maxSizeMb, setMaxSizeMb] = useState<number>(50);
  const [lateAllowed, setLateAllowed] = useState(false);
  const [latePenaltyPercent, setLatePenaltyPercent] = useState<number>(10);
  const [published, setPublished] = useState(false);
  const [attachments, setAttachments] = useState<AttachmentInput[]>([]);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Delete modal state
  const [deletingAssignment, setDeletingAssignment] = useState<TeacherAssignmentItemData | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleOpenCreate = () => {
    setEditingAssignment(null);
    setTitle("");
    setDescription("");
    // Default deadline: tomorrow at 11:59 PM Dhaka time
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const tomorrowDhaka = utcToDhakaInputFormat(tomorrow).slice(0, 10);
    setDeadlineLocal(`${tomorrowDhaka}T23:59`);
    setMaxMarks(100);
    setSelectedTypeCategories(["pdf", "docx", "zip"]);
    setMaxSizeMb(Math.min(50, data.globalMaxFileSizeMb));
    setLateAllowed(false);
    setLatePenaltyPercent(10);
    setPublished(false);
    setAttachments([]);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (assignment: TeacherAssignmentItemData) => {
    setEditingAssignment(assignment);
    setTitle(assignment.title);
    setDescription(assignment.description || "");
    setDeadlineLocal(utcToDhakaInputFormat(assignment.deadline));
    setMaxMarks(assignment.maxMarks);

    // Map existing allowedTypes to category IDs
    const currentTypes = new Set(assignment.allowedTypes.map((t) => t.toLowerCase()));
    const activeCategories = FILE_TYPE_OPTIONS.filter((opt) =>
      opt.extensions.some((ext) => currentTypes.has(ext))
    ).map((opt) => opt.id);
    setSelectedTypeCategories(activeCategories.length > 0 ? activeCategories : ["pdf"]);

    setMaxSizeMb(assignment.maxSizeMb);
    setLateAllowed(assignment.lateAllowed);
    setLatePenaltyPercent(assignment.latePenaltyPercent);
    setPublished(assignment.published);
    setAttachments(
      assignment.attachments.map((a) => ({
        fileKey: a.fileKey,
        originalName: a.originalName,
        mime: a.mime,
        sizeBytes: a.sizeBytes,
      }))
    );
    setIsFormOpen(true);
  };

  const handleToggleCategory = (catId: string) => {
    setSelectedTypeCategories((prev) =>
      prev.includes(catId) ? prev.filter((id) => id !== catId) : [...prev, catId]
    );
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingAttachment(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await uploadAssignmentAttachmentAction(data.offeringId, formData);
      if (res.success && res.attachment) {
        setAttachments((prev) => [...prev, res.attachment]);
        toast.success(`Attachment "${res.attachment.originalName}" uploaded`);
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to upload attachment");
    } finally {
      setIsUploadingAttachment(false);
      e.target.value = "";
    }
  };

  const handleRemoveAttachment = (fileKey: string) => {
    setAttachments((prev) => prev.filter((a) => a.fileKey !== fileKey));
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Please provide an assignment title.");
      return;
    }
    if (!deadlineLocal) {
      toast.error("Please specify a submission deadline.");
      return;
    }

    // Convert local Dhaka datetime to UTC Date
    const deadlineUtc = dhakaLocalToUtc(deadlineLocal);
    if (isNaN(deadlineUtc.getTime())) {
      toast.error("Invalid deadline date or time format.");
      return;
    }

    if (published && deadlineUtc.getTime() <= Date.now()) {
      toast.error("Deadline must be in the future when publishing an assignment.");
      return;
    }

    if (maxMarks <= 0) {
      toast.error("Maximum marks must be greater than 0.");
      return;
    }

    // Collect allowed file extensions from selected categories
    const allAllowedExts = Array.from(
      new Set(
        selectedTypeCategories.flatMap(
          (catId) =>
            FILE_TYPE_OPTIONS.find((opt) => opt.id === catId)?.extensions || []
        )
      )
    );

    setIsSaving(true);
    try {
      if (editingAssignment) {
        const res = await updateAssignmentAction({
          assignmentId: editingAssignment.id,
          title: title.trim(),
          description,
          deadline: deadlineUtc,
          maxMarks,
          allowedTypes: allAllowedExts,
          maxSizeMb,
          lateAllowed,
          latePenaltyPercent,
          published,
          attachments,
        });
        if (res.success) {
          toast.success("Assignment updated successfully");
          setIsFormOpen(false);
          router.refresh();
        }
      } else {
        const res = await createAssignmentAction({
          offeringId: data.offeringId,
          title: title.trim(),
          description,
          deadline: deadlineUtc,
          maxMarks,
          allowedTypes: allAllowedExts,
          maxSizeMb,
          lateAllowed,
          latePenaltyPercent,
          published,
          attachments,
        });
        if (res.success) {
          toast.success("Assignment created successfully");
          setIsFormOpen(false);
          router.refresh();
        }
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save assignment");
    } finally {
      setIsSaving(false);
    }
  };

  const handleTogglePublished = async (assignment: TeacherAssignmentItemData) => {
    const nextPublished = !assignment.published;
    if (nextPublished && assignment.deadline.getTime() <= Date.now()) {
      toast.error(
        "Cannot publish an assignment with an expired deadline. Please edit the deadline first."
      );
      return;
    }

    try {
      const res = await toggleAssignmentPublishedAction(assignment.id, nextPublished);
      if (res.success) {
        toast.success(
          nextPublished
            ? `Assignment "${assignment.title}" published`
            : `Assignment "${assignment.title}" unpublished (set to draft)`
        );
        router.refresh();
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update publish state");
    }
  };

  const handleDeleteAssignment = async () => {
    if (!deletingAssignment) return;

    setIsDeleting(true);
    try {
      const res = await deleteAssignmentAction(deletingAssignment.id);
      if (res.success) {
        toast.success(`Assignment "${deletingAssignment.title}" deleted`);
        setDeletingAssignment(null);
        router.refresh();
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to delete assignment");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Header Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
        <div>
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <FileCheck2 className="w-5 h-5 text-primary" />
            <span>Course Assignments</span>
          </h2>
          <p className="text-xs text-muted mt-0.5">
            Manage assignment parameters, deadlines (Asia/Dhaka), submission limits, and review grading status.
          </p>
        </div>

        {data.canManage && (
          <div className="flex items-center gap-2.5">
            <Button
              onClick={handleOpenCreate}
              size="sm"
              className="font-semibold text-xs inline-flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Create Assignment</span>
            </Button>
          </div>
        )}
      </div>

      {/* 2. Archived Banner if Applicable */}
      {data.isArchived && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-xs text-amber-800 dark:text-amber-200 flex items-center gap-3">
          <Lock className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>
            This course offering is archived. All assignment parameters and submissions are locked in read-only mode.
          </span>
        </div>
      )}

      {/* 3. Assignments List */}
      {data.assignments.length === 0 ? (
        <EmptyState
          icon={FileCheck2}
          title="No Assignments Created Yet"
          description="Create problem sets, homework assignments, or lab reports for enrolled students."
          action={
            data.canManage
              ? {
                  label: "Create First Assignment",
                  onClick: handleOpenCreate,
                }
              : undefined
          }
          className="bg-surface py-16 border border-border"
        />
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {data.assignments.map((assignment) => {
            const urgency = getDeadlineUrgency(assignment.deadline);
            const isOverdue = assignment.deadline.getTime() <= Date.now();

            return (
              <div
                key={assignment.id}
                className="rounded-2xl border border-border bg-surface p-5 shadow-2xs hover:border-primary/30 transition-all flex flex-col md:flex-row md:items-center justify-between gap-5"
              >
                {/* Left Side: Details */}
                <div className="space-y-2.5 min-w-0 flex-1">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    {/* Published status badge */}
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                        assignment.published
                          ? "bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/20"
                          : "bg-surface-muted text-muted border-border"
                      }`}
                    >
                      {assignment.published ? (
                        <>
                          <Eye className="w-3 h-3 text-teal-600 dark:text-teal-400" />
                          <span>Published</span>
                        </>
                      ) : (
                        <>
                          <EyeOff className="w-3 h-3 text-muted" />
                          <span>Draft (Unpublished)</span>
                        </>
                      )}
                    </span>

                    {/* Deadline Badge */}
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                        urgency === "danger" || isOverdue
                          ? "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20"
                          : urgency === "warning"
                          ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20"
                          : "bg-surface-muted text-foreground border-border"
                      }`}
                      title={`Deadline in Asia/Dhaka: ${formatDhaka(assignment.deadline, "full")}`}
                    >
                      <Calendar className="w-3 h-3" />
                      <span>Due: {formatDhaka(assignment.deadline, "short")}</span>
                    </span>

                    {/* Max Marks */}
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 font-semibold">
                      {assignment.maxMarks} Marks
                    </span>

                    {/* Late policy badge */}
                    {assignment.lateAllowed ? (
                      <span className="text-xs px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20">
                        Late Allowed (-{assignment.latePenaltyPercent}%)
                      </span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-md bg-surface-muted text-muted border border-border">
                        No Late Submission
                      </span>
                    )}
                  </div>

                  {/* Title & Description */}
                  <div>
                    <h3 className="text-base font-bold text-foreground">
                      {assignment.title}
                    </h3>
                    {assignment.description && (
                      <p className="text-xs text-muted line-clamp-2 mt-1 leading-relaxed">
                        {assignment.description.replace(/<[^>]+>/g, " ")}
                      </p>
                    )}
                  </div>

                  {/* Stats & Attachments Row */}
                  <div className="flex items-center gap-4 text-xs text-muted flex-wrap pt-1">
                    {/* Submissions count */}
                    <div className="flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-muted" />
                      <span className="font-semibold text-foreground">
                        {assignment.submissionsCount} / {data.enrolledStudentsCount}
                      </span>
                      <span>Submissions</span>
                    </div>

                    {/* Graded count */}
                    <div className="flex items-center gap-1.5">
                      <CheckCircle className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                      <span className="font-semibold text-foreground">
                        {assignment.gradedCount}
                      </span>
                      <span>Graded</span>
                    </div>

                    {/* Attachments */}
                    {assignment.attachments.length > 0 && (
                      <div className="flex items-center gap-1.5 text-primary">
                        <Paperclip className="w-3.5 h-3.5" />
                        <span>
                          {assignment.attachments.length}{" "}
                          {assignment.attachments.length === 1 ? "file" : "files"}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Side: Action Buttons */}
                <div className="flex items-center gap-2 shrink-0 md:self-center border-t md:border-t-0 pt-3 md:pt-0 border-border">
                  {/* View Submissions Link */}
                  <Link
                    href={`/teach/${data.offeringId}/assignments/${assignment.id}/submissions`}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary-hover shadow-xs transition-colors flex items-center gap-1.5"
                  >
                    <FileCheck2 className="w-3.5 h-3.5" />
                    <span>Submissions</span>
                  </Link>

                  {data.canManage && (
                    <>
                      {/* Publish Toggle Button */}
                    <button
                      type="button"
                      onClick={() => handleTogglePublished(assignment)}
                      aria-label={
                        assignment.published ? "Unpublish assignment" : "Publish assignment"
                      }
                      title={
                        assignment.published
                          ? "Published (click to unpublish)"
                          : "Draft (click to publish)"
                      }
                      className={`p-2 rounded-lg border transition-colors ${
                        assignment.published
                          ? "bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/20 hover:bg-teal-500/20"
                          : "bg-surface-muted text-muted border-border hover:bg-border"
                      }`}
                    >
                      {assignment.published ? (
                        <Eye className="w-4 h-4" />
                      ) : (
                        <EyeOff className="w-4 h-4" />
                      )}
                    </button>

                    {/* Edit Button */}
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleOpenEdit(assignment)}
                      className="inline-flex items-center gap-1 text-xs"
                    >
                      <Pencil className="w-3.5 h-3.5 text-muted" />
                      <span>Edit</span>
                    </Button>

                    {/* Delete Button */}
                    <button
                      type="button"
                      onClick={() => setDeletingAssignment(assignment)}
                      aria-label={`Delete ${assignment.title}`}
                      title={
                        assignment.submissionsCount > 0
                          ? "Cannot delete (submissions exist). Click for details."
                          : "Delete assignment"
                      }
                      className="p-2 rounded-lg border border-border text-muted hover:text-danger hover:bg-danger/10 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 4. Create / Edit Assignment Modal */}
      <DialogPrimitive.Root open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs animate-in fade-in" />
          <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-surface p-6 shadow-xl animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <DialogPrimitive.Title className="text-base font-bold text-foreground flex items-center gap-2">
                <FileCheck2 className="w-4 h-4 text-primary" />
                <span>
                  {editingAssignment ? "Edit Assignment" : "Create New Assignment"}
                </span>
              </DialogPrimitive.Title>
              <DialogPrimitive.Close asChild>
                <button
                  type="button"
                  className="rounded-lg p-1 text-muted hover:text-foreground hover:bg-surface-muted"
                >
                  <X className="w-4 h-4" />
                </button>
              </DialogPrimitive.Close>
            </div>

            <form onSubmit={handleSubmitForm} className="space-y-4 pt-4">
              {/* Title */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  Assignment Title *
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Assignment 1: Entity-Relationship Modeling & Schema Design"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-foreground text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  Instructions & Description
                </label>
                <textarea
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Provide detailed instructions, submission guidelines, or problem statement..."
                  className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-foreground text-xs leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary font-mono text-[11px]"
                />
                <p className="text-[11px] text-muted">
                  Supports safe text formatting and basic HTML markup.
                </p>
              </div>

              {/* Deadline & Max Marks Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Deadline (Asia/Dhaka) */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                    <span>Deadline (Asia/Dhaka) *</span>
                    <span className="text-[10px] text-muted font-normal">UTC+6</span>
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={deadlineLocal}
                    onChange={(e) => setDeadlineLocal(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-foreground text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  />
                  <div className="flex items-center gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        const baseDate = deadlineLocal ? deadlineLocal.slice(0, 10) : new Date().toISOString().slice(0, 10);
                        setDeadlineLocal(`${baseDate}T23:59`);
                      }}
                      className="text-[10px] text-primary hover:underline font-medium"
                    >
                      Set to 11:59 PM
                    </button>
                  </div>
                </div>

                {/* Max Marks */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">
                    Maximum Marks *
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="1"
                    max="1000"
                    required
                    value={maxMarks}
                    onChange={(e) => setMaxMarks(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-foreground text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  />
                </div>
              </div>

              {/* Allowed File Formats */}
              <div className="space-y-2 pt-1 border-t border-border">
                <label className="text-xs font-semibold text-foreground block">
                  Allowed Student Submission Types
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {FILE_TYPE_OPTIONS.map((opt) => (
                    <label
                      key={opt.id}
                      className="flex items-center gap-2 p-2 rounded-lg border border-border bg-surface-muted/40 hover:bg-surface-muted cursor-pointer text-xs"
                    >
                      <input
                        type="checkbox"
                        checked={selectedTypeCategories.includes(opt.id)}
                        onChange={() => handleToggleCategory(opt.id)}
                        className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                      />
                      <span className="text-foreground text-xs">{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Max File Size & Late Policy */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1 border-t border-border">
                {/* Max File Size */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                    <span>Max Submission Size (MB)</span>
                    <span className="text-[10px] text-muted">
                      Max: {data.globalMaxFileSizeMb} MB
                    </span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    max={data.globalMaxFileSizeMb}
                    value={maxSizeMb}
                    onChange={(e) =>
                      setMaxSizeMb(
                        Math.min(
                          data.globalMaxFileSizeMb,
                          Math.max(1, parseInt(e.target.value) || 1)
                        )
                      )
                    }
                    className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-foreground text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  />
                </div>

                {/* Late Submission Policy */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-foreground block">
                    Late Submission Policy
                  </label>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer text-xs">
                      <input
                        type="checkbox"
                        checked={lateAllowed}
                        onChange={(e) => setLateAllowed(e.target.checked)}
                        className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                      />
                      <span className="text-foreground">Allow late submissions</span>
                    </label>

                    {lateAllowed && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted">Penalty per day:</span>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={latePenaltyPercent}
                          onChange={(e) =>
                            setLatePenaltyPercent(
                              Math.min(100, Math.max(0, parseInt(e.target.value) || 0))
                            )
                          }
                          className="w-20 px-2 py-1 rounded border border-border bg-surface text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                        />
                        <span className="text-xs text-muted">%</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Attachments Upload Pipeline */}
              <div className="space-y-2 pt-1 border-t border-border">
                <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                  <span>Instructor Attachments (Problem Sets, Code Templates)</span>
                  <span className="text-[10px] text-muted">Storage Pipeline</span>
                </label>

                {/* Uploaded attachments list */}
                {attachments.length > 0 && (
                  <div className="space-y-1.5 pb-2">
                    {attachments.map((att) => (
                      <div
                        key={att.fileKey}
                        className="flex items-center justify-between gap-2 p-2 rounded-lg border border-border bg-surface-muted text-xs"
                      >
                        <div className="flex items-center gap-2 truncate">
                          <Paperclip className="w-3.5 h-3.5 text-primary shrink-0" />
                          <span className="truncate text-foreground font-medium">
                            {att.originalName}
                          </span>
                          <span className="text-muted text-[11px] shrink-0">
                            ({(att.sizeBytes / 1024).toFixed(0)} KB)
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveAttachment(att.fileKey)}
                          className="p-1 rounded text-muted hover:text-danger hover:bg-danger/10"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Upload Input */}
                <div className="flex items-center gap-2">
                  <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-surface text-foreground hover:bg-surface-muted text-xs font-medium transition-colors shadow-2xs">
                    {isUploadingAttachment ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                    ) : (
                      <Upload className="w-3.5 h-3.5 text-primary" />
                    )}
                    <span>{isUploadingAttachment ? "Uploading..." : "Add Attachment"}</span>
                    <input
                      type="file"
                      disabled={isUploadingAttachment}
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                  <span className="text-[11px] text-muted">
                    Files validated via allowlist & magic byte inspection.
                  </span>
                </div>
              </div>

              {/* Publish Toggle */}
              <div className="pt-2 border-t border-border flex items-center gap-2.5">
                <input
                  type="checkbox"
                  id="assignmentPublishToggle"
                  checked={published}
                  onChange={(e) => setPublished(e.target.checked)}
                  className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                />
                <label
                  htmlFor="assignmentPublishToggle"
                  className="text-xs text-foreground cursor-pointer font-medium select-none"
                >
                  Publish immediately (notifies enrolled students via ACADEMIC notification)
                </label>
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-border flex items-center justify-end gap-2.5">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setIsFormOpen(false)}
                  disabled={isSaving}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSaving || isUploadingAttachment}>
                  {isSaving ? "Saving..." : editingAssignment ? "Save Changes" : "Create Assignment"}
                </Button>
              </div>
            </form>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      {/* 5. Delete Confirmation / Submission Warning Dialog */}
      {deletingAssignment && deletingAssignment.submissionsCount > 0 ? (
        <DialogPrimitive.Root
          open={deletingAssignment !== null}
          onOpenChange={(open) => !open && setDeletingAssignment(null)}
        >
          <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs animate-in fade-in" />
            <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-surface p-6 shadow-xl animate-in zoom-in-95">
              <div className="flex items-center gap-3 text-amber-600 dark:text-amber-400 pb-3 border-b border-border">
                <ShieldAlert className="w-5 h-5 shrink-0" />
                <h3 className="text-base font-bold text-foreground">
                  Cannot Delete Assignment
                </h3>
              </div>
              <p className="text-xs text-muted leading-relaxed pt-3">
                <strong className="text-foreground">{deletingAssignment.title}</strong> has{" "}
                <strong className="text-foreground">
                  {deletingAssignment.submissionsCount} student submission(s)
                </strong>
                . For academic integrity and gradebook consistency, assignments with existing submissions cannot be deleted.
              </p>
              <p className="text-xs text-muted pt-2">
                You can unpublish the assignment instead so that it is hidden from students.
              </p>
              <div className="pt-4 mt-3 border-t border-border flex items-center justify-end gap-2">
                <Button variant="secondary" onClick={() => setDeletingAssignment(null)}>
                  Close
                </Button>
                {deletingAssignment.published && (
                  <Button
                    onClick={async () => {
                      await handleTogglePublished(deletingAssignment);
                      setDeletingAssignment(null);
                    }}
                  >
                    Unpublish Now
                  </Button>
                )}
              </div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
      ) : (
        <ConfirmDialog
          open={deletingAssignment !== null && deletingAssignment.submissionsCount === 0}
          onOpenChange={(open) => !open && setDeletingAssignment(null)}
          title="Delete Assignment"
          description={`Are you sure you want to permanently delete "${deletingAssignment?.title}"? This action cannot be undone.`}
          confirmLabel={isDeleting ? "Deleting..." : "Delete"}
          isDestructive={true}
          isLoading={isDeleting}
          onConfirm={handleDeleteAssignment}
        />
      )}
    </div>
  );
}
