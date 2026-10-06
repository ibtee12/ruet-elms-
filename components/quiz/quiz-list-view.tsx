"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { QuizListItem, QuizStatus } from "@/services/quizzes";
import { formatDhaka } from "@/lib/datetime";
import { toggleQuizPublishAction, deleteQuizAction } from "@/actions/quizzes";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import {
  HelpCircle,
  Plus,
  Clock,
  Calendar,
  AlertCircle,
  Users,
  Search,
  Trash2,
  Edit,
  Lock,
  BarChart3,
} from "lucide-react";

interface QuizListViewProps {
  offeringId: string;
  quizzes: QuizListItem[];
  isArchived: boolean;
  canManage: boolean;
}

export function QuizListView({
  offeringId,
  quizzes,
  isArchived,
  canManage,
}: QuizListViewProps) {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = React.useState("");
  const [selectedStatus, setSelectedStatus] = React.useState<string>("ALL");
  const [isDeleting, setIsDeleting] = React.useState<string | null>(null);
  const [isPublishing, setIsPublishing] = React.useState<string | null>(null);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);
  const [quizToDelete, setQuizToDelete] = React.useState<QuizListItem | null>(null);

  // Filter quizzes
  const filteredQuizzes = quizzes.filter((q) => {
    const matchesSearch =
      q.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (q.description && q.description.toLowerCase().includes(searchTerm.toLowerCase()));

    if (!matchesSearch) return false;
    if (selectedStatus === "ALL") return true;
    return q.status === selectedStatus;
  });

  const statusBadge = (status: QuizStatus) => {
    switch (status) {
      case "DRAFT":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20">
            Draft
          </span>
        );
      case "SCHEDULED":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20">
            <Clock className="w-3 h-3" /> Scheduled
          </span>
        );
      case "OPEN":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping mr-0.5" />
            Open Now
          </span>
        );
      case "CLOSED":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-surface-muted text-muted border border-border">
            <Lock className="w-3 h-3" /> Closed
          </span>
        );
    }
  };

  const handleTogglePublish = async (quiz: QuizListItem) => {
    if (isArchived) return;
    setIsPublishing(quiz.id);
    setDeleteError(null);
    try {
      await toggleQuizPublishAction(quiz.id, offeringId, !quiz.published);
      router.refresh();
    } catch (err: unknown) {
      const error = err as { message?: string };
      setDeleteError(error.message || "Failed to update publish state.");
    } finally {
      setIsPublishing(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!quizToDelete || isArchived) return;
    setIsDeleting(quizToDelete.id);
    setDeleteError(null);
    try {
      await deleteQuizAction(quizToDelete.id, offeringId);
      setQuizToDelete(null);
      router.refresh();
    } catch (err: unknown) {
      const error = err as { message?: string };
      setDeleteError(error.message || "Failed to delete quiz.");
    } finally {
      setIsDeleting(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-primary" />
            <span>Quizzes &amp; Objective Tests</span>
          </h2>
          <p className="text-xs text-muted mt-0.5">
            Create timed quizzes, manage question banks, configure negative marking, and evaluate student attempts.
          </p>
        </div>

        {canManage && !isArchived && (
          <Link
            href={`/teach/${offeringId}/quizzes/new`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors shadow-xs shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Create Quiz</span>
          </Link>
        )}
      </div>

      {isArchived && (
        <div className="p-3.5 rounded-xl border border-amber-500/20 bg-amber-500/10 text-amber-800 dark:text-amber-200 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>
            This course offering is archived. Quizzes are read-only and cannot be created, modified, or deleted.
          </span>
        </div>
      )}

      {deleteError && (
        <div className="p-3.5 rounded-xl border border-rose-500/20 bg-rose-500/10 text-rose-800 dark:text-rose-200 text-xs flex items-center justify-between gap-2">
          <span>{deleteError}</span>
          <button
            type="button"
            onClick={() => setDeleteError(null)}
            className="text-xs font-bold hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between bg-surface p-3 rounded-xl border border-border">
        {/* Status Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          {["ALL", "DRAFT", "SCHEDULED", "OPEN", "CLOSED"].map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setSelectedStatus(status)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                selectedStatus === status
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted hover:text-foreground hover:bg-surface-muted"
              }`}
            >
              {status === "ALL" ? "All Quizzes" : status.charAt(0) + status.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search quizzes..."
            className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-border bg-surface-muted/40 text-xs text-foreground placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      {/* Quizzes List */}
      {filteredQuizzes.length === 0 ? (
        <div className="py-12 text-center rounded-2xl border border-dashed border-border bg-surface/50 p-8">
          <HelpCircle className="w-12 h-12 text-muted mx-auto mb-3" />
          <h3 className="text-base font-bold text-foreground mb-1">
            {quizzes.length === 0 ? "No Quizzes Yet" : "No Quizzes Match Filter"}
          </h3>
          <p className="text-xs text-muted max-w-sm mx-auto mb-5 leading-relaxed">
            {quizzes.length === 0
              ? "Design quizzes with single choice, multiple choice, or true/false questions, and set time windows for students."
              : "Try adjusting your search keywords or status filter."}
          </p>
          {canManage && !isArchived && quizzes.length === 0 && (
            <Link
              href={`/teach/${offeringId}/quizzes/new`}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>Create Your First Quiz</span>
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredQuizzes.map((quiz) => (
            <div
              key={quiz.id}
              className="p-5 rounded-2xl border border-border bg-surface shadow-xs hover:border-primary/40 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
            >
              <div className="space-y-2 flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  {statusBadge(quiz.status)}
                  <span className="font-mono text-xs font-bold text-primary px-2 py-0.5 rounded bg-primary/10">
                    {quiz.durationMin} mins
                  </span>
                  <span className="text-xs font-medium text-muted">
                    {quiz.questionsCount} {quiz.questionsCount === 1 ? "question" : "questions"} ({quiz.totalMarks} marks)
                  </span>
                  {Number(quiz.negativeMarkPerWrong) > 0 && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/20">
                      -{Number(quiz.negativeMarkPerWrong)} / wrong
                    </span>
                  )}
                </div>

                <div>
                  <Link
                    href={`/teach/${offeringId}/quizzes/${quiz.id}`}
                    className="text-base font-bold text-foreground hover:text-primary transition-colors line-clamp-1"
                  >
                    {quiz.title}
                  </Link>
                  {quiz.description && (
                    <p className="text-xs text-muted line-clamp-1 mt-0.5">
                      {quiz.description}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted pt-1">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-muted" />
                    <span>
                      Window: {formatDhaka(quiz.startAt, "short")} – {formatDhaka(quiz.endAt, "short")}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 font-medium text-foreground">
                    <Users className="w-3.5 h-3.5 text-muted" />
                    <span>
                      {quiz.attemptsCount} {quiz.attemptsCount === 1 ? "attempt" : "attempts"}
                    </span>
                  </div>
                  <div className="text-[11px] text-muted">
                    Max attempts: {quiz.maxAttempts}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-2 md:pt-0 border-t md:border-t-0 border-border/60 shrink-0">
                {canManage && !isArchived && (
                  <>
                    <button
                      type="button"
                      disabled={isPublishing === quiz.id}
                      onClick={() => handleTogglePublish(quiz)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${
                        quiz.published
                          ? "bg-surface-muted hover:bg-surface-muted/80 text-foreground border-border"
                          : "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600"
                      }`}
                    >
                      {isPublishing === quiz.id
                        ? "Saving..."
                        : quiz.published
                        ? "Unpublish"
                        : "Publish"}
                    </button>

                    <Link
                      href={`/teach/${offeringId}/quizzes/${quiz.id}`}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-surface-muted hover:bg-surface-muted/80 text-foreground text-xs font-semibold border border-border transition-colors"
                    >
                      <Edit className="w-3.5 h-3.5" />
                      <span>Edit</span>
                    </Link>

                    <Link
                      href={`/teach/${offeringId}/quizzes/${quiz.id}/results`}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-xs font-semibold border border-primary/20 transition-colors"
                    >
                      <BarChart3 className="w-3.5 h-3.5" />
                      <span>Results</span>
                    </Link>

                    <button
                      type="button"
                      disabled={quiz.attemptsCount > 0}
                      onClick={() => setQuizToDelete(quiz)}
                      title={
                        quiz.attemptsCount > 0
                          ? "Cannot delete quiz with student attempts"
                          : "Delete quiz"
                      }
                      className="p-1.5 rounded-lg text-muted hover:text-rose-600 hover:bg-rose-500/10 transition-colors disabled:opacity-40 disabled:hover:text-muted disabled:hover:bg-transparent"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={quizToDelete !== null}
        onOpenChange={(open) => !open && setQuizToDelete(null)}
        onConfirm={handleConfirmDelete}
        title={`Delete Quiz: "${quizToDelete?.title}"`}
        description="Are you sure you want to delete this quiz? All configured questions and options will be permanently removed. This action cannot be undone."
        confirmLabel={isDeleting ? "Deleting..." : "Delete Quiz"}
        isLoading={isDeleting !== null}
        isDestructive
      />
    </div>
  );
}
