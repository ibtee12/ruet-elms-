"use client";

import React, { useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { StudentAssignmentDetailData } from "@/services/assignments";
import { DeadlineChip } from "@/components/shared/deadline-chip";
import { StatusChip } from "@/components/shared/status-chip";
import { SafeHtml } from "@/lib/sanitize";
import { submitAssignmentAction } from "@/actions/submissions";
import { formatDhaka } from "@/lib/datetime";
import { toast } from "sonner";
import {
  ArrowLeft,
  FileCheck2,
  Paperclip,
  Upload,
  Download,
  AlertTriangle,
  FileText,
  Loader2,
  X,
  FileIcon,
  ShieldCheck,
  History,
  Lock,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface StudentAssignmentDetailViewProps {
  data: StudentAssignmentDetailData;
}

function formatBytes(bytes: number, decimals = 2) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

export function StudentAssignmentDetailView({
  data,
}: StudentAssignmentDetailViewProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const { assignment, submission, canSubmit, blockReason, isOverdue } = data;
  const currentVersionNo = submission?.versions[0]?.versionNo ?? 0;
  const nextVersionNo = currentVersionNo + 1;

  // Handle drag and drop
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const validateAndSetFile = (file: File) => {
    // Check max size
    const maxBytes = assignment.maxSizeMb * 1024 * 1024;
    if (file.size > maxBytes) {
      toast.error(
        `File size (${formatBytes(file.size)}) exceeds maximum allowed ${
          assignment.maxSizeMb
        } MB.`
      );
      return;
    }

    // Check extension if allowedTypes configured
    if (assignment.allowedTypes.length > 0) {
      const parts = file.name.split(".");
      const ext = parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
      const allowedSet = new Set(
        assignment.allowedTypes.map((t) => t.toLowerCase().replace(/^\./, ""))
      );
      if (!allowedSet.has(ext)) {
        toast.error(
          `File type .${ext} is not allowed. Allowed types: ${assignment.allowedTypes.join(
            ", "
          )}`
        );
        return;
      }
    }

    setSelectedFile(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      toast.error("Please select a file to submit.");
      return;
    }

    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const res = await submitAssignmentAction(
        data.offeringId,
        assignment.id,
        formData
      );

      if (res.success) {
        toast.success(
          res.isLate
            ? `Assignment submitted late (Version ${res.versionNo}).`
            : `Assignment successfully submitted (Version ${res.versionNo})!`
        );
        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        router.refresh();
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to submit assignment.";
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Back button */}
      <div>
        <Link
          href={`/courses/${data.offeringId}/assignments`}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors group"
        >
          <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
          <span>Back to Assignments</span>
        </Link>
      </div>

      {/* Main Header Card */}
      <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <StatusChip status={data.statusChipType} />
          <DeadlineChip deadline={assignment.deadline} />
          <span className="px-2.5 py-0.5 rounded-[8px] text-[12px] font-medium bg-surface-muted text-muted-foreground border border-border">
            {assignment.maxMarks} Marks
          </span>
          {assignment.lateAllowed ? (
            <span className="px-2.5 py-0.5 rounded-[8px] text-[12px] font-medium bg-warning/10 text-[#854D0E] dark:text-warning border border-warning/20">
              Late Submissions Allowed (-{assignment.latePenaltyPercent}% penalty)
            </span>
          ) : (
            <span className="px-2.5 py-0.5 rounded-[8px] text-[12px] text-muted-foreground bg-surface-muted/60 border border-border">
              Late Submissions Prohibited
            </span>
          )}
        </div>

        <h1 className="text-2xl font-bold text-foreground tracking-tight">
          {assignment.title}
        </h1>
        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
          <span>{data.code} • {data.courseTitle}</span>
          <span>•</span>
          <span>Due {formatDhaka(assignment.deadline, "full")}</span>
        </div>
      </div>

      {/* 2-Column Responsive Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 Cols on lg) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Instructions / Description */}
          <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              <span>Instructions & Problem Statement</span>
            </h2>

            {assignment.description ? (
              <div className="text-sm text-foreground/90 leading-relaxed">
                <SafeHtml html={assignment.description} />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                No detailed text instructions provided by the instructor.
              </p>
            )}
          </div>

          {/* Teacher Attachments */}
          {assignment.attachments.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
              <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
                <Paperclip className="w-4 h-4 text-primary" />
                <span>Reference Materials & Attachments ({assignment.attachments.length})</span>
              </h2>

              <div className="space-y-2">
                {assignment.attachments.map((att) => (
                  <div
                    key={att.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-border bg-surface-muted/40 hover:bg-surface-muted transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                        <FileIcon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-foreground truncate">
                          {att.originalName}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {formatBytes(att.sizeBytes)}
                        </p>
                      </div>
                    </div>

                    <a
                      href={`/api/assignments/attachments/${att.id}/download`}
                      download
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-background hover:bg-surface-muted text-foreground border border-border shadow-xs transition-colors shrink-0"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download</span>
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Version History List */}
          {submission && submission.versions.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider flex items-center gap-2">
                  <History className="w-4 h-4 text-primary" />
                  <span>Submission Version History ({submission.versions.length}/10)</span>
                </h2>
                <span className="text-xs text-muted-foreground">
                  Latest version evaluated by default
                </span>
              </div>

              <div className="divide-y divide-border border border-border rounded-lg overflow-hidden">
                {submission.versions.map((ver, idx) => {
                  const isLatest = idx === 0;
                  return (
                    <div
                      key={ver.id}
                      className={cn(
                        "p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors",
                        isLatest ? "bg-primary/5" : "bg-card hover:bg-surface-muted/30"
                      )}
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-foreground">
                            Version {ver.versionNo}
                          </span>
                          {isLatest && (
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-primary text-primary-foreground">
                              Latest
                            </span>
                          )}
                          {ver.isLate ? (
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-warning/15 text-[#854D0E] dark:text-warning border border-warning/30">
                              Late
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-success/15 text-success-text border border-success/30">
                              On Time
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-foreground font-medium truncate">
                          {ver.originalName}
                        </p>

                        <p className="text-[11px] text-muted-foreground flex items-center gap-2">
                          <span>{formatDhaka(ver.submittedAt, "full")}</span>
                          <span>•</span>
                          <span>{formatBytes(ver.sizeBytes)}</span>
                        </p>
                      </div>

                      {/* Download via access-checked signed URL */}
                      <a
                        href={`/api/submissions/versions/${ver.id}/download`}
                        download
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-background hover:bg-surface-muted text-foreground border border-border shadow-xs transition-colors self-start sm:self-center shrink-0"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download</span>
                      </a>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right Column (1 Col on lg) */}
        <div className="space-y-6">
          {/* Grade and Evaluation Card (If Graded) */}
          {submission?.grade && (
            <div className="bg-success/5 border border-success/30 rounded-xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-success-text flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-success" />
                  <span>Evaluation & Grade</span>
                </span>
                <span className="text-[11px] text-muted-foreground">
                  Graded by {submission.grade.gradedByName}
                </span>
              </div>

              <div className="mt-2 text-center p-4 bg-background/80 rounded-lg border border-success/20">
                <div className="text-3xl font-extrabold text-success-text">
                  {submission.grade.finalMarks}
                  <span className="text-base font-normal text-muted-foreground ml-1">
                    / {assignment.maxMarks}
                  </span>
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  Final Evaluated Marks
                </div>

                {submission.grade.finalMarks !== submission.grade.marks && (
                  <div className="mt-2 pt-2 border-t border-border/50 text-[11px] text-muted-foreground flex items-center justify-between">
                    <span>Raw Marks:</span>
                    <span className="font-semibold text-foreground">
                      {submission.grade.marks} / {assignment.maxMarks} (-{assignment.latePenaltyPercent}% late penalty)
                    </span>
                  </div>
                )}
              </div>

              {submission.grade.feedback && (
                <div className="mt-4 pt-3 border-t border-success/20">
                  <div className="text-xs font-semibold text-foreground mb-1">
                    Teacher Feedback:
                  </div>
                  <p className="text-xs text-muted-foreground italic bg-background/50 p-3 rounded border border-border">
                    &ldquo;{submission.grade.feedback}&rdquo;
                  </p>
                </div>
              )}

              {submission.gradeHistories && submission.gradeHistories.length > 0 && (
                <div className="mt-4 pt-3 border-t border-success/20 space-y-2">
                  <div className="text-xs font-semibold text-foreground">
                    Grade Update History ({submission.gradeHistories.length})
                  </div>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                    {submission.gradeHistories.map((h) => (
                      <div
                        key={h.id}
                        className="text-[11px] p-2 rounded bg-background/60 border border-border/60 flex items-center justify-between"
                      >
                        <span className="text-muted-foreground">
                          {formatDhaka(h.changedAt, "short")}
                        </span>
                        <span className="font-medium text-foreground">
                          {h.oldMarks !== null ? `${h.oldMarks} → ` : ""}{h.newMarks} Marks
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Submission Box */}
          <div className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-4">
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider flex items-center gap-2">
              <Upload className="w-4 h-4 text-primary" />
              <span>
                {submission ? "Resubmit Assignment" : "Submit Your Solution"}
              </span>
            </h2>

            {/* If blocked from submitting */}
            {!canSubmit ? (
              <div className="p-4 rounded-lg bg-surface-muted border border-border text-xs text-muted-foreground space-y-2">
                <div className="flex items-center gap-2 text-danger font-semibold">
                  <Lock className="w-4 h-4" />
                  <span>Submission Locked</span>
                </div>
                <p>{blockReason || "Submissions are currently not accepted."}</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Late warning notice if currently overdue */}
                {isOverdue && assignment.lateAllowed && (
                  <div className="p-3 rounded-lg bg-warning/15 border border-warning/30 text-xs text-[#854D0E] dark:text-warning flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>
                      Deadline has passed. Your submission will be marked as{" "}
                      <strong>Late</strong> with a{" "}
                      <strong>{assignment.latePenaltyPercent}% penalty</strong>.
                    </span>
                  </div>
                )}

                {/* File Dropzone */}
                <div
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    "border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all",
                    dragActive
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50 bg-surface-muted/30 hover:bg-surface-muted/50"
                  )}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={handleFileChange}
                  />

                  <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto mb-2">
                    <Upload className="w-5 h-5" />
                  </div>

                  <p className="text-xs font-semibold text-foreground">
                    Click to choose file or drag & drop
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Max size: {assignment.maxSizeMb} MB
                  </p>
                </div>

                {/* Selected File Preview */}
                {selectedFile && (
                  <div className="p-3 rounded-lg border border-primary/30 bg-primary/5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <FileIcon className="w-4 h-4 text-primary shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-foreground truncate">
                          {selectedFile.name}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {formatBytes(selectedFile.size)}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedFile(null);
                        if (fileInputRef.current) fileInputRef.current.value = "";
                      }}
                      className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-muted transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* Submission Rules Snippet */}
                <div className="space-y-1 text-[11px] text-muted-foreground pt-1">
                  <div className="flex items-center justify-between">
                    <span>Allowed formats:</span>
                    <span className="font-medium text-foreground">
                      {assignment.allowedTypes.length > 0
                        ? assignment.allowedTypes.map((t) => `.${t}`).join(", ")
                        : "PDF, DOCX, ZIP, Code, Images"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Submission version:</span>
                    <span className="font-medium text-foreground">
                      Version {nextVersionNo} of 10
                    </span>
                  </div>
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={!selectedFile || isSubmitting}
                  className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-all"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Submitting Solution...</span>
                    </>
                  ) : (
                    <>
                      <FileCheck2 className="w-4 h-4" />
                      <span>
                        {submission
                          ? `Submit Version ${nextVersionNo}`
                          : "Turn In Assignment"}
                      </span>
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
