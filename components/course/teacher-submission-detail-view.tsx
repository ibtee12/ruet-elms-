"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  TeacherSubmissionDetailData,
  SubmissionVersionItemData,
} from "@/services/grading";
import { saveGradeAction, reopenSubmissionAction } from "@/actions/grades";
import { calcFinalMarks } from "@/lib/grading";
import { StatusChip } from "@/components/shared/status-chip";
import { formatDhaka, formatRelative } from "@/lib/datetime";
import { toast } from "sonner";
import {
  ArrowLeft,
  Download,
  FileCheck2,
  FileIcon,
  Clock,
  History,
  Unlock,
  CheckCircle2,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Save,
  Lock,
  CornerDownRight,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface TeacherSubmissionDetailViewProps {
  data: TeacherSubmissionDetailData;
}

function formatBytes(bytes: number, decimals = 2) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

export function TeacherSubmissionDetailView({
  data,
}: TeacherSubmissionDetailViewProps) {
  const router = useRouter();

  const {
    offeringId,
    courseCode,
    assignment,
    student,
    submission,
    versions,
    grade,
    histories,
    canGrade,
    prevSubmissionId,
    nextSubmissionId,
  } = data;

  // Selected version for inspection (default is latest version)
  const [selectedVersionId, setSelectedVersionId] = useState<string>(
    versions[0]?.id || ""
  );

  const selectedVersion =
    versions.find((v) => v.id === selectedVersionId) || versions[0] || null;

  // Grading form state
  const isExistingGrade = grade !== null;
  const [marksInput, setMarksInput] = useState<string>(
    grade !== null ? String(grade.marks) : ""
  );
  const [feedbackInput, setFeedbackInput] = useState<string>(
    grade?.feedback || ""
  );
  const [changeReasonInput, setChangeReasonInput] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [isReopening, setIsReopening] = useState(false);

  // Compute live final marks preview
  const numMarks = parseFloat(marksInput);
  const isValidMarksNum = !isNaN(numMarks) && numMarks >= 0;
  const liveFinalMarks = isValidMarksNum
    ? calcFinalMarks(
        numMarks,
        assignment.maxMarks,
        selectedVersion?.isLate ?? false,
        assignment.latePenaltyPercent
      )
    : null;

  const handleSaveGrade = useCallback(
    async (navigateNext = false) => {
      if (!canGrade) {
        toast.error("You are not authorized to grade this submission.");
        return;
      }

      if (marksInput.trim() === "" || isNaN(numMarks)) {
        toast.error("Please enter a valid numeric grade.");
        return;
      }

      if (numMarks < 0 || numMarks > assignment.maxMarks) {
        toast.error(
          `Marks must be between 0 and ${assignment.maxMarks}.`
        );
        return;
      }

      if (isExistingGrade && !changeReasonInput.trim()) {
        toast.error("A reason is required when modifying an already assigned grade.");
        return;
      }

      setIsSaving(true);
      try {
        const res = await saveGradeAction(submission.id, {
          marks: numMarks,
          feedback: feedbackInput,
          changeReason: changeReasonInput,
        });

        if (res.success) {
          toast.success(
            isExistingGrade
              ? "Grade successfully updated and recorded in history."
              : "Grade saved and student notified!"
          );
          setChangeReasonInput("");

          if (navigateNext && nextSubmissionId) {
            router.push(`/teach/${offeringId}/submissions/${nextSubmissionId}`);
          } else {
            router.refresh();
          }
        }
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : "Failed to save grade.";
        toast.error(msg);
      } finally {
        setIsSaving(false);
      }
    },
    [
      canGrade,
      marksInput,
      numMarks,
      assignment.maxMarks,
      isExistingGrade,
      changeReasonInput,
      submission.id,
      feedbackInput,
      nextSubmissionId,
      offeringId,
      router,
    ]
  );

  // Ctrl+Enter or Cmd+Enter keyboard shortcut saves grade
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        handleSaveGrade(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleSaveGrade]);

  const handleReopen = async () => {
    if (!canGrade) return;

    setIsReopening(true);
    try {
      const res = await reopenSubmissionAction(submission.id);
      if (res.success) {
        toast.success(
          `Submission unlocked for ${student.name}. The student can now turn in an updated version.`
        );
        router.refresh();
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to reopen submission.";
      toast.error(msg);
    } finally {
      setIsReopening(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top navigation row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <Link
          href={`/teach/${offeringId}/assignments/${assignment.id}/submissions`}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors group"
        >
          <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
          <span>Back to Submissions Roster</span>
        </Link>

        {/* Previous / Next student quick switcher */}
        <div className="flex items-center gap-2 self-end sm:self-auto">
          {prevSubmissionId ? (
            <Link
              href={`/teach/${offeringId}/submissions/${prevSubmissionId}`}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-border bg-card hover:bg-surface-muted text-foreground transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Previous</span>
            </Link>
          ) : (
            <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-border bg-surface-muted/40 text-muted cursor-not-allowed">
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Previous</span>
            </span>
          )}

          {nextSubmissionId ? (
            <Link
              href={`/teach/${offeringId}/submissions/${nextSubmissionId}`}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-border bg-card hover:bg-surface-muted text-foreground transition-colors"
            >
              <span>Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          ) : (
            <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-border bg-surface-muted/40 text-muted cursor-not-allowed">
              <span>Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </span>
          )}
        </div>
      </div>

      {/* Student & Assignment Summary Card */}
      <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
                {courseCode}
              </span>
              <span className="text-xs text-muted-foreground">
                {assignment.title}
              </span>
            </div>
            <h1 className="text-2xl font-bold text-foreground mt-2 tracking-tight">
              {student.name}
            </h1>
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mt-1">
              <span className="font-mono font-medium text-foreground">
                Roll: {student.roll || "N/A"}
              </span>
              <span>•</span>
              <span>{student.email}</span>
              {student.sectionName && (
                <>
                  <span>•</span>
                  <span>Section {student.sectionName}</span>
                </>
              )}
            </div>
          </div>

          {/* Submission and Reopen Status */}
          <div className="flex flex-wrap items-center gap-2 self-start md:self-center">
            <StatusChip
              status={
                grade !== null
                  ? "graded"
                  : selectedVersion?.isLate
                  ? "submitted_late"
                  : "submitted"
              }
            />
            {submission.reopened && (
              <span className="px-2.5 py-1 rounded-[8px] text-[12px] font-medium bg-info/10 text-info border border-info/20">
                Reopened for Resubmission
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Main 2-Column Responsive Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 Cols): Version Selector, File Details, Preview, Histories */}
        <div className="lg:col-span-2 space-y-6">
          {/* Version Selector Card */}
          <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider flex items-center gap-2">
                <FileCheck2 className="w-4 h-4 text-primary" />
                <span>Submitted Versions ({versions.length})</span>
              </h2>
              <span className="text-xs text-muted-foreground">
                Latest shown by default
              </span>
            </div>

            {/* Version Pills / Radio Bar */}
            <div className="flex flex-wrap gap-2">
              {versions.map((ver, idx) => {
                const isSelected = ver.id === selectedVersion?.id;
                const isLatest = idx === 0;

                return (
                  <button
                    key={ver.id}
                    type="button"
                    onClick={() => setSelectedVersionId(ver.id)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1.5",
                      isSelected
                        ? "bg-primary text-primary-foreground border-primary shadow-xs"
                        : "bg-surface-muted hover:bg-surface-muted/80 text-foreground border-border"
                    )}
                  >
                    <span>Version {ver.versionNo}</span>
                    {isLatest && (
                      <span
                        className={cn(
                          "px-1.5 py-0.2 rounded text-[10px] font-semibold",
                          isSelected
                            ? "bg-white/20 text-white"
                            : "bg-primary/20 text-primary"
                        )}
                      >
                        Latest
                      </span>
                    )}
                    {ver.isLate && (
                      <span
                        className={cn(
                          "px-1 py-0.2 rounded text-[10px]",
                          isSelected
                            ? "bg-warning/30 text-white"
                            : "bg-warning/15 text-[#854D0E] dark:text-warning"
                        )}
                      >
                        Late
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Active Version Info & Download */}
            {selectedVersion && (
              <div className="p-4 rounded-xl border border-border bg-surface-muted/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <FileIcon className="w-4 h-4 text-primary shrink-0" />
                    <span className="text-xs font-bold text-foreground truncate">
                      {selectedVersion.originalName}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      ({formatBytes(selectedVersion.sizeBytes)})
                    </span>
                  </div>
                  <div className="text-[11px] text-muted-foreground flex items-center gap-2">
                    <span>
                      Submitted {formatDhaka(selectedVersion.submittedAt, "full")}
                    </span>
                    {selectedVersion.isLate ? (
                      <span className="font-semibold text-warning-text">
                        • Turned in Late
                      </span>
                    ) : (
                      <span className="text-success-text">• On time</span>
                    )}
                  </div>
                </div>

                <a
                  href={`/api/submissions/versions/${selectedVersion.id}/download`}
                  download
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-background hover:bg-surface-muted text-foreground border border-border shadow-xs transition-colors shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Solution</span>
                </a>
              </div>
            )}
          </div>

          {/* Reopen Action Card */}
          <div className="bg-card border border-border rounded-xl p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                <Unlock className="w-3.5 h-3.5 text-primary" />
                <span>Resubmission Permissions</span>
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {submission.reopened
                  ? "The student has been granted permission to resubmit an updated file."
                  : "Allow student to turn in an updated solution after evaluation or grading."}
              </p>
            </div>

            <button
              type="button"
              onClick={handleReopen}
              disabled={isReopening || !canGrade || submission.reopened}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-surface-muted hover:bg-surface-muted/80 disabled:opacity-50 text-foreground border border-border shadow-xs transition-colors shrink-0"
            >
              {isReopening ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Unlocking...</span>
                </>
              ) : (
                <>
                  <Unlock className="w-3.5 h-3.5" />
                  <span>
                    {submission.reopened ? "Resubmission Active" : "Reopen for Student"}
                  </span>
                </>
              )}
            </button>
          </div>

          {/* Grade Change History Table */}
          {histories.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-primary" />
                <span>Grade History & Audit Log ({histories.length})</span>
              </h3>

              <div className="divide-y divide-border border border-border rounded-lg overflow-hidden text-xs">
                {histories.map((h) => (
                  <div
                    key={h.id}
                    className="p-3 bg-surface-muted/20 hover:bg-surface-muted/40 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground">
                          {h.oldMarks !== null ? `${h.oldMarks} → ` : ""}
                          {h.newMarks} Marks
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          by {h.changedByName}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground italic">
                        &ldquo;{h.reason}&rdquo;
                      </p>
                    </div>

                    <div className="text-[11px] text-muted-foreground shrink-0">
                      {formatDhaka(h.changedAt, "short")}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Column (1 Col): Grading Panel */}
        <div className="space-y-6">
          <div className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <h2 className="text-sm font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                <FileCheck2 className="w-4 h-4 text-primary" />
                <span>Evaluation & Score</span>
              </h2>
              <span className="text-xs text-muted-foreground">
                Max: {assignment.maxMarks}
              </span>
            </div>

            {!canGrade ? (
              <div className="p-4 rounded-lg bg-surface-muted border border-border text-xs text-muted-foreground space-y-1">
                <div className="flex items-center gap-1.5 text-danger font-semibold">
                  <Lock className="w-3.5 h-3.5" />
                  <span>Grading Locked</span>
                </div>
                <p>
                  Teaching Assistants are not permitted to grade this offering
                  unless allowed by the instructor.
                </p>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSaveGrade(false);
                }}
                className="space-y-4"
              >
                {/* Marks Input */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="marks-input"
                    className="block text-xs font-semibold text-foreground"
                  >
                    Raw Marks (0 to {assignment.maxMarks})
                  </label>
                  <input
                    id="marks-input"
                    type="number"
                    step="0.01"
                    min="0"
                    max={assignment.maxMarks}
                    value={marksInput}
                    onChange={(e) => setMarksInput(e.target.value)}
                    placeholder={`e.g. ${Math.round(assignment.maxMarks * 0.8)}`}
                    className="w-full px-3 py-2 rounded-lg text-sm bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/40 font-mono font-bold"
                  />
                </div>

                {/* Live Final Marks Calculation Preview */}
                {isValidMarksNum && (
                  <div className="p-3.5 rounded-lg border border-border bg-surface-muted/40 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Raw Score:</span>
                      <span className="font-mono font-semibold text-foreground">
                        {numMarks} / {assignment.maxMarks}
                      </span>
                    </div>

                    {selectedVersion?.isLate && assignment.latePenaltyPercent > 0 ? (
                      <div className="flex items-center justify-between text-xs text-[#854D0E] dark:text-warning">
                        <span>Late Penalty (-{assignment.latePenaltyPercent}%):</span>
                        <span className="font-mono font-semibold">
                          -
                          {(
                            (assignment.maxMarks *
                              assignment.latePenaltyPercent) /
                            100
                          ).toFixed(2)}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Late Penalty:</span>
                        <span className="font-mono text-success-text">None</span>
                      </div>
                    )}

                    <div className="pt-2 border-t border-border flex items-center justify-between text-xs">
                      <span className="font-bold text-foreground">
                        Calculated Final Marks:
                      </span>
                      <span className="font-mono font-extrabold text-base text-success-text">
                        {liveFinalMarks} / {assignment.maxMarks}
                      </span>
                    </div>
                  </div>
                )}

                {/* Feedback Textarea */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="feedback-input"
                    className="block text-xs font-semibold text-foreground"
                  >
                    Teacher Feedback (Visible to student)
                  </label>
                  <textarea
                    id="feedback-input"
                    rows={4}
                    value={feedbackInput}
                    onChange={(e) => setFeedbackInput(e.target.value)}
                    placeholder="Provide constructive feedback, critique, or observations..."
                    className="w-full px-3 py-2 rounded-lg text-xs bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/40 leading-relaxed"
                  />
                </div>

                {/* Reason for change (strictly required when modifying grade) */}
                {isExistingGrade && (
                  <div className="space-y-1.5 p-3 rounded-lg border border-warning/30 bg-warning/5">
                    <label
                      htmlFor="reason-input"
                      className="block text-xs font-semibold text-[#854D0E] dark:text-warning flex items-center gap-1.5"
                    >
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>Reason for Grade Modification (Required)</span>
                    </label>
                    <input
                      id="reason-input"
                      type="text"
                      value={changeReasonInput}
                      onChange={(e) => setChangeReasonInput(e.target.value)}
                      placeholder="e.g. Rechecked problem 3, corrected rubric calculation..."
                      className="w-full px-3 py-2 rounded-lg text-xs bg-background border border-border focus:outline-none focus:ring-2 focus:ring-warning/40"
                    />
                  </div>
                )}

                {/* Action Buttons */}
                <div className="space-y-2 pt-2">
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary-hover disabled:opacity-50 shadow-sm transition-all"
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Saving Grade...</span>
                      </>
                    ) : (
                      <>
                        <Save className="w-3.5 h-3.5" />
                        <span>{isExistingGrade ? "Update Grade" : "Save Grade"}</span>
                      </>
                    )}
                  </button>

                  {nextSubmissionId && (
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => handleSaveGrade(true)}
                      className="w-full flex items-center justify-center gap-1.5 py-2 px-4 rounded-lg text-xs font-semibold bg-surface-muted hover:bg-surface-muted/80 text-foreground border border-border disabled:opacity-50 transition-colors"
                    >
                      <span>Save and Next</span>
                      <CornerDownRight className="w-3.5 h-3.5" />
                    </button>
                  )}

                  <div className="text-[11px] text-muted-foreground text-center pt-1">
                    Press <kbd className="px-1 py-0.5 rounded bg-surface-muted border border-border text-[10px] font-mono">Ctrl+Enter</kbd> to save grade
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
