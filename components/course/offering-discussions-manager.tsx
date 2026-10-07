"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  MessageSquare,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  Lock,
  Unlock,
  Pin,
  Trash2,
  AlertCircle,
  HelpCircle,
  BookOpen,
  ArrowUpDown,
  UserCheck,
  EyeOff,
} from "lucide-react";
import { ThreadCategory, Role } from "@prisma/client";
import { StatusChip } from "@/components/shared/status-chip";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { formatRelative } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import { showSuccessToast, showErrorToast } from "@/lib/toast";
import {
  createThreadAction,
  lockThreadAction,
  pinThreadAction,
  deleteThreadAction,
} from "@/actions/discussions";
import type { SerializedThreadListItem } from "@/services/discussions";

interface OfferingDiscussionsManagerProps {
  offeringId: string;
  courseCode: string;
  courseTitle: string;
  initialThreads: SerializedThreadListItem[];
  currentUserId: string;
  currentUserRole: Role;
  isModerator: boolean;
  portal: "student" | "teacher";
}

const CATEGORY_CHIP_MAP: Record<ThreadCategory, string> = {
  QUESTION: "category_question",
  DISCUSSION: "category_discussion",
  DOUBT: "category_doubt",
  RESOURCE: "category_resource",
};

export function OfferingDiscussionsManager({
  offeringId,
  courseCode,
  courseTitle,
  initialThreads,
  currentUserId,
  currentUserRole,
  isModerator,
  portal,
}: OfferingDiscussionsManagerProps) {
  const router = useRouter();

  // Search & Filters
  const [search, setSearch] = React.useState("");
  const [selectedCategory, setSelectedCategory] = React.useState<ThreadCategory | "ALL">("ALL");
  const [unansweredOnly, setUnansweredOnly] = React.useState(false);
  const [sortBy, setSortBy] = React.useState<"activity" | "newest">("activity");

  // Create Modal
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const [newCategory, setNewCategory] = React.useState<ThreadCategory>(ThreadCategory.QUESTION);
  const [newTitle, setNewTitle] = React.useState("");
  const [newContent, setNewContent] = React.useState("");
  const [newIsAnonymous, setNewIsAnonymous] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Moderation state
  const [deletingThreadId, setDeletingThreadId] = React.useState<string | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);

  // Filter and sort threads locally for immediate reactivity
  const filteredThreads = React.useMemo(() => {
    return initialThreads
      .filter((t) => {
        if (selectedCategory !== "ALL" && t.category !== selectedCategory) {
          return false;
        }
        if (unansweredOnly && t.isAnswered) {
          return false;
        }
        if (search.trim()) {
          const q = search.trim().toLowerCase();
          const matchTitle = t.title.toLowerCase().includes(q);
          const matchContent = t.content.toLowerCase().includes(q);
          if (!matchTitle && !matchContent) return false;
        }
        return true;
      })
      .sort((a, b) => {
        // Pins always top
        if (a.isPinned !== b.isPinned) {
          return a.isPinned ? -1 : 1;
        }
        if (sortBy === "newest") {
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }
        return new Date(b.latestActivityAt).getTime() - new Date(a.latestActivityAt).getTime();
      });
  }, [initialThreads, selectedCategory, unansweredOnly, search, sortBy]);

  async function handleCreateThread(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim() || !newContent.trim()) {
      showErrorToast("Please enter a title and content for your thread.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await createThreadAction({
        offeringId,
        title: newTitle.trim(),
        content: newContent.trim(),
        category: newCategory,
        isAnonymous: newIsAnonymous,
      });

      if (res.success) {
        showSuccessToast("Discussion thread posted successfully!");
        setIsCreateOpen(false);
        setNewTitle("");
        setNewContent("");
        setNewIsAnonymous(false);
        router.refresh();
      }
    } catch (err: unknown) {
      const error = err as Error;
      showErrorToast(error.message || "Failed to post thread.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleToggleLock(thread: SerializedThreadListItem, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    try {
      const nextLock = !thread.isLocked;
      await lockThreadAction(thread.id, nextLock, offeringId);
      showSuccessToast(nextLock ? "Thread locked." : "Thread unlocked.");
      router.refresh();
    } catch (err: unknown) {
      showErrorToast((err as Error).message || "Failed to update lock status.");
    }
  }

  async function handleTogglePin(thread: SerializedThreadListItem, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    try {
      const nextPin = !thread.isPinned;
      await pinThreadAction(thread.id, nextPin, offeringId);
      showSuccessToast(nextPin ? "Thread pinned to top." : "Thread unpinned.");
      router.refresh();
    } catch (err: unknown) {
      showErrorToast((err as Error).message || "Failed to update pin status.");
    }
  }

  async function handleDeleteConfirm() {
    if (!deletingThreadId) return;
    setIsDeleting(true);
    try {
      await deleteThreadAction(deletingThreadId, offeringId);
      showSuccessToast("Thread deleted successfully.");
      setDeletingThreadId(null);
      router.refresh();
    } catch (err: unknown) {
      showErrorToast((err as Error).message || "Failed to delete thread.");
    } finally {
      setIsDeleting(false);
    }
  }

  const basePath = portal === "teacher" ? `/teach/${offeringId}/discussions` : `/courses/${offeringId}/discussions`;

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-border">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-primary" />
            Discussion Forum & Q&A
          </h2>
          <p className="text-xs sm:text-sm text-muted mt-0.5">
            Ask academic questions, collaborate on coursework topics, and share verified solutions.
          </p>
        </div>
        <button
          onClick={() => setIsCreateOpen(true)}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary-hover shadow-xs transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>New Thread</span>
        </button>
      </div>

      {/* Filter and Search Controls */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          {/* Search Bar */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search threads by title or content..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl text-sm bg-surface border border-border text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
            />
          </div>

          {/* Sort Selector */}
          <div className="flex items-center gap-2 shrink-0">
            <label className="text-xs text-muted font-medium flex items-center gap-1">
              <ArrowUpDown className="w-3.5 h-3.5" />
              <span>Sort:</span>
            </label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "activity" | "newest")}
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-surface border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              <option value="activity">Latest Activity</option>
              <option value="newest">Newest First</option>
            </select>
          </div>
        </div>

        {/* Category Pills & Unanswered Filter */}
        <div className="flex flex-wrap items-center gap-2 pt-1 select-none">
          <button
            onClick={() => setSelectedCategory("ALL")}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border",
              selectedCategory === "ALL"
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-surface border-border text-muted hover:text-foreground hover:bg-surface-muted"
            )}
          >
            All Categories
          </button>
          <button
            onClick={() => setSelectedCategory(ThreadCategory.QUESTION)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border inline-flex items-center gap-1.5",
              selectedCategory === ThreadCategory.QUESTION
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-surface border-border text-muted hover:text-foreground hover:bg-surface-muted"
            )}
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Questions</span>
          </button>
          <button
            onClick={() => setSelectedCategory(ThreadCategory.DISCUSSION)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border inline-flex items-center gap-1.5",
              selectedCategory === ThreadCategory.DISCUSSION
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-surface border-border text-muted hover:text-foreground hover:bg-surface-muted"
            )}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Discussions</span>
          </button>
          <button
            onClick={() => setSelectedCategory(ThreadCategory.DOUBT)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border inline-flex items-center gap-1.5",
              selectedCategory === ThreadCategory.DOUBT
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-surface border-border text-muted hover:text-foreground hover:bg-surface-muted"
            )}
          >
            <AlertCircle className="w-3.5 h-3.5" />
            <span>Doubts</span>
          </button>
          <button
            onClick={() => setSelectedCategory(ThreadCategory.RESOURCE)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border inline-flex items-center gap-1.5",
              selectedCategory === ThreadCategory.RESOURCE
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-surface border-border text-muted hover:text-foreground hover:bg-surface-muted"
            )}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Resources</span>
          </button>

          <div className="h-4 w-px bg-border mx-1 hidden sm:block" />

          {/* Unanswered Checkbox */}
          <button
            onClick={() => setUnansweredOnly(!unansweredOnly)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border inline-flex items-center gap-1.5",
              unansweredOnly
                ? "bg-warning/20 border-warning/40 text-[#854D0E] dark:text-warning"
                : "bg-surface border-border text-muted hover:text-foreground hover:bg-surface-muted"
            )}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Unanswered Only</span>
          </button>
        </div>
      </div>

      {/* Threads List */}
      {filteredThreads.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title={search ? "No matching discussions found" : "No threads in this category"}
          description={
            search
              ? "Try adjusting your search keywords or clear category filters."
              : "Be the first to start an academic discussion or ask a question!"
          }
          action={{
            label: "Create Thread",
            onClick: () => setIsCreateOpen(true),
          }}
        />
      ) : (
        <div className="space-y-3">
          {filteredThreads.map((thread) => {
            const authorDisplay = thread.isAnonymous
              ? isModerator && thread.author
                ? `Anonymous student (${thread.author.name})`
                : "Anonymous student"
              : thread.author?.name || "Participant";

            const isOwnThread = thread.authorId === currentUserId;

            return (
              <div
                key={thread.id}
                className={cn(
                  "group relative p-4 sm:p-5 rounded-2xl border transition-all duration-150 bg-surface hover:shadow-xs",
                  thread.isPinned
                    ? "border-primary/40 bg-primary/[0.02]"
                    : "border-border hover:border-border-hover"
                )}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    {/* Chips bar */}
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <StatusChip status={CATEGORY_CHIP_MAP[thread.category]} />

                      {thread.isPinned && <StatusChip status="thread_pinned" />}
                      {thread.isLocked && <StatusChip status="thread_locked" />}
                      {thread.isAnswered ? (
                        <StatusChip status="thread_answered" />
                      ) : (
                        <StatusChip status="thread_unanswered" />
                      )}
                    </div>

                    {/* Title */}
                    <Link
                      href={`${basePath}/${thread.id}`}
                      className="block text-base sm:text-lg font-bold text-foreground hover:text-primary transition-colors line-clamp-2"
                    >
                      {thread.title}
                    </Link>

                    {/* Excerpt */}
                    <p className="text-xs sm:text-sm text-muted mt-1.5 line-clamp-2 leading-relaxed">
                      {thread.content.replace(/<[^>]*>/g, "")}
                    </p>

                    {/* Metadata Footer */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted mt-3">
                      <span className="inline-flex items-center gap-1 font-medium text-foreground/80">
                        {thread.isAnonymous ? (
                          <EyeOff className="w-3.5 h-3.5 text-muted" />
                        ) : (
                          <UserCheck className="w-3.5 h-3.5 text-muted" />
                        )}
                        <span>{authorDisplay}</span>
                      </span>

                      <span>•</span>

                      <span className="inline-flex items-center gap-1">
                        <MessageSquare className="w-3.5 h-3.5 text-muted" />
                        <span className="font-semibold text-foreground/80">
                          {thread.replyCount}
                        </span>{" "}
                        {thread.replyCount === 1 ? "reply" : "replies"}
                      </span>

                      <span>•</span>

                      <span>
                        Activity {formatRelative(thread.latestActivityAt)}
                      </span>
                    </div>
                  </div>

                  {/* Actions for Moderator / Author */}
                  {(isModerator || isOwnThread) && (
                    <div className="flex items-center gap-1 shrink-0 pt-1">
                      {isModerator && (
                        <>
                          <button
                            title={thread.isPinned ? "Unpin thread" : "Pin thread"}
                            onClick={(e) => handleTogglePin(thread, e)}
                            className="p-1.5 rounded-lg text-muted hover:text-primary hover:bg-surface-muted transition-colors"
                          >
                            <Pin
                              className={cn(
                                "w-4 h-4",
                                thread.isPinned && "text-primary fill-primary"
                              )}
                            />
                          </button>
                          <button
                            title={thread.isLocked ? "Unlock thread" : "Lock thread"}
                            onClick={(e) => handleToggleLock(thread, e)}
                            className="p-1.5 rounded-lg text-muted hover:text-primary hover:bg-surface-muted transition-colors"
                          >
                            {thread.isLocked ? (
                              <Lock className="w-4 h-4 text-warning" />
                            ) : (
                              <Unlock className="w-4 h-4" />
                            )}
                          </button>
                        </>
                      )}
                      <button
                        title="Delete thread"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDeletingThreadId(thread.id);
                        }}
                        className="p-1.5 rounded-lg text-muted hover:text-danger hover:bg-danger/10 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Thread Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-surface border border-border rounded-2xl p-6 w-full max-w-xl shadow-lg space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                <Plus className="w-5 h-5 text-primary" />
                <span>Start a New Discussion</span>
              </h3>
              <button
                onClick={() => setIsCreateOpen(false)}
                className="text-muted hover:text-foreground text-sm font-semibold p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateThread} className="space-y-4">
              {/* Category Selector */}
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1.5">
                  Category
                </label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value as ThreadCategory)}
                  className="w-full px-3 py-2 rounded-xl text-sm bg-surface border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  <option value={ThreadCategory.QUESTION}>Question (Seeking an answer)</option>
                  <option value={ThreadCategory.DISCUSSION}>Discussion (Open topic discussion)</option>
                  <option value={ThreadCategory.DOUBT}>Doubt (Concept clarification)</option>
                  <option value={ThreadCategory.RESOURCE}>Resource (Sharing reference material)</option>
                </select>
              </div>

              {/* Title Input */}
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1.5">
                  Thread Title
                </label>
                <input
                  type="text"
                  required
                  minLength={3}
                  maxLength={200}
                  placeholder="Summarize your question or topic clearly..."
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl text-sm bg-surface border border-border text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>

              {/* Content Textarea */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-foreground">
                    Content & Details
                  </label>
                  <span
                    className={cn(
                      "text-[11px]",
                      newContent.length > 4800 ? "text-warning font-bold" : "text-muted"
                    )}
                  >
                    {newContent.length} / 5,000 characters
                  </span>
                </div>
                <textarea
                  required
                  rows={6}
                  maxLength={5000}
                  placeholder="Provide background, equations, problem steps, or discussion context..."
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl text-sm bg-surface border border-border text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/40 resize-y"
                />
              </div>

              {/* Ask Anonymously Toggle with Note from Design Guide */}
              <div className="p-3.5 rounded-xl bg-surface-muted border border-border/80 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={newIsAnonymous}
                    onChange={(e) => setNewIsAnonymous(e.target.checked)}
                    className="w-4 h-4 rounded text-primary focus:ring-primary border-border"
                  />
                  <span className="text-xs sm:text-sm font-semibold text-foreground">
                    Ask anonymously
                  </span>
                </label>
                <p className="text-[11px] sm:text-xs text-muted leading-relaxed pl-6">
                  Course instructors and administrators can still see your identity to maintain academic integrity and prevent abuse. Only your student peers will see you as &quot;Anonymous student&quot;.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl text-sm font-semibold text-muted hover:text-foreground hover:bg-surface-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !newTitle.trim() || !newContent.trim()}
                  className="px-5 py-2 rounded-xl text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary-hover shadow-xs transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? "Posting..." : "Post Thread"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(deletingThreadId)}
        onOpenChange={(open) => !open && setDeletingThreadId(null)}
        title="Delete Discussion Thread?"
        description="Are you sure you want to delete this thread? This will soft delete the thread and hide all replies from participants."
        confirmLabel="Delete Thread"
        isDestructive
        isLoading={isDeleting}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
}
