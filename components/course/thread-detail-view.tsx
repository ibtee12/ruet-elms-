"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  MessageSquare,
  CheckCircle2,
  Lock,
  Unlock,
  Pin,
  Trash2,
  CornerDownRight,
  Send,
  EyeOff,
  UserCheck,
} from "lucide-react";
import { Role, ThreadCategory } from "@prisma/client";
import { StatusChip } from "@/components/shared/status-chip";
import { SafeHtml } from "@/lib/sanitize";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { formatDhaka, formatRelative } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import { showSuccessToast, showErrorToast } from "@/lib/toast";
import {
  createPostAction,
  togglePostAcceptedAction,
  lockThreadAction,
  pinThreadAction,
  deleteThreadAction,
  deletePostAction,
} from "@/actions/discussions";
import type { SerializedThreadDetail, SerializedPost } from "@/services/discussions";

interface ThreadDetailViewProps {
  offeringId: string;
  courseCode: string;
  thread: SerializedThreadDetail;
  currentUserId: string;
  currentUserRole?: Role;
  isModerator: boolean;
  portal: "student" | "teacher";
}

const CATEGORY_CHIP_MAP: Record<ThreadCategory, string> = {
  QUESTION: "category_question",
  DISCUSSION: "category_discussion",
  DOUBT: "category_doubt",
  RESOURCE: "category_resource",
};

export function ThreadDetailView({
  offeringId,
  courseCode,
  thread,
  currentUserId,
  isModerator,
  portal,
}: ThreadDetailViewProps) {
  const router = useRouter();

  // Reply composer
  const [replyContent, setReplyContent] = React.useState("");
  const [replyIsAnonymous, setReplyIsAnonymous] = React.useState(false);
  const [activeParentPostId, setActiveParentPostId] = React.useState<string | null>(null);
  const [isSubmittingReply, setIsSubmittingReply] = React.useState(false);

  // Deletion confirm dialog
  const [deleteTarget, setDeleteTarget] = React.useState<
    { type: "thread"; id: string } | { type: "post"; id: string } | null
  >(null);
  const [isDeleting, setIsDeleting] = React.useState(false);

  const isThreadAuthor = thread.authorId === currentUserId;
  const canMarkAccepted = isModerator || isThreadAuthor;
  const backHref =
    portal === "teacher"
      ? `/teach/${offeringId}/discussions`
      : `/courses/${offeringId}/discussions`;

  async function handlePostReply(e: React.FormEvent) {
    e.preventDefault();
    if (!replyContent.trim()) {
      showErrorToast("Reply cannot be empty.");
      return;
    }

    setIsSubmittingReply(true);
    try {
      const res = await createPostAction(
        {
          threadId: thread.id,
          parentId: activeParentPostId,
          content: replyContent.trim(),
          isAnonymous: replyIsAnonymous,
        },
        offeringId
      );

      if (res.success) {
        showSuccessToast("Reply posted successfully!");
        setReplyContent("");
        setActiveParentPostId(null);
        setReplyIsAnonymous(false);
        router.refresh();
      }
    } catch (err: unknown) {
      showErrorToast((err as Error).message || "Failed to post reply.");
    } finally {
      setIsSubmittingReply(false);
    }
  }

  async function handleToggleAccepted(post: SerializedPost) {
    try {
      await togglePostAcceptedAction(post.id, offeringId, thread.id);
      showSuccessToast(
        post.isAccepted ? "Accepted answer unmarked." : "Marked as accepted answer!"
      );
      router.refresh();
    } catch (err: unknown) {
      showErrorToast((err as Error).message || "Failed to update accepted status.");
    }
  }

  async function handleToggleLock() {
    try {
      const nextLock = !thread.isLocked;
      await lockThreadAction(thread.id, nextLock, offeringId);
      showSuccessToast(nextLock ? "Thread locked." : "Thread unlocked.");
      router.refresh();
    } catch (err: unknown) {
      showErrorToast((err as Error).message || "Failed to update lock status.");
    }
  }

  async function handleTogglePin() {
    try {
      const nextPin = !thread.isPinned;
      await pinThreadAction(thread.id, nextPin, offeringId);
      showSuccessToast(nextPin ? "Thread pinned." : "Thread unpinned.");
      router.refresh();
    } catch (err: unknown) {
      showErrorToast((err as Error).message || "Failed to update pin status.");
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      if (deleteTarget.type === "thread") {
        await deleteThreadAction(deleteTarget.id, offeringId);
        showSuccessToast("Thread deleted.");
        router.push(backHref);
      } else {
        await deletePostAction(deleteTarget.id, offeringId, thread.id);
        showSuccessToast("Reply deleted.");
        setDeleteTarget(null);
        router.refresh();
      }
    } catch (err: unknown) {
      showErrorToast((err as Error).message || "Failed to delete.");
    } finally {
      setIsDeleting(false);
    }
  }

  const threadAuthorDisplay = thread.isAnonymous
    ? isModerator && thread.author
      ? `Anonymous student (${thread.author.name})`
      : "Anonymous student"
    : thread.author?.name || "Participant";

  return (
    <div className="space-y-6 max-w-4xl pb-24 md:pb-8">
      {/* Back button */}
      <div>
        <Link
          href={backHref}
          className="inline-flex items-center gap-2 text-xs font-semibold text-muted hover:text-foreground transition-colors py-1"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to [{courseCode}] Discussions</span>
        </Link>
      </div>

      {/* Main Thread Card */}
      <div className="bg-surface border border-border rounded-2xl p-5 sm:p-7 shadow-xs space-y-5">
        {/* Header with Badges & Moderation */}
        <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-border">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <StatusChip status={CATEGORY_CHIP_MAP[thread.category]} />
              {thread.isPinned && <StatusChip status="thread_pinned" />}
              {thread.isLocked && <StatusChip status="thread_locked" />}
              {thread.isAnswered ? (
                <StatusChip status="thread_answered" />
              ) : (
                <StatusChip status="thread_unanswered" />
              )}
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">
              {thread.title}
            </h1>
          </div>

          {/* Teacher / Author Moderation Bar */}
          {(isModerator || isThreadAuthor) && (
            <div className="flex items-center gap-1.5 shrink-0 bg-surface-muted/60 p-1 rounded-xl border border-border">
              {isModerator && (
                <>
                  <button
                    onClick={handleTogglePin}
                    title={thread.isPinned ? "Unpin thread" : "Pin thread"}
                    className={cn(
                      "p-2 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors",
                      thread.isPinned
                        ? "text-primary bg-primary/10"
                        : "text-muted hover:text-foreground hover:bg-surface"
                    )}
                  >
                    <Pin className={cn("w-4 h-4", thread.isPinned && "fill-primary")} />
                    <span className="hidden sm:inline">
                      {thread.isPinned ? "Pinned" : "Pin"}
                    </span>
                  </button>
                  <button
                    onClick={handleToggleLock}
                    title={thread.isLocked ? "Unlock replies" : "Lock replies"}
                    className={cn(
                      "p-2 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors",
                      thread.isLocked
                        ? "text-warning bg-warning/10"
                        : "text-muted hover:text-foreground hover:bg-surface"
                    )}
                  >
                    {thread.isLocked ? (
                      <>
                        <Unlock className="w-4 h-4" />
                        <span className="hidden sm:inline">Unlock</span>
                      </>
                    ) : (
                      <>
                        <Lock className="w-4 h-4" />
                        <span className="hidden sm:inline">Lock</span>
                      </>
                    )}
                  </button>
                </>
              )}
              <button
                onClick={() => setDeleteTarget({ type: "thread", id: thread.id })}
                title="Delete thread"
                className="p-2 rounded-lg text-xs font-semibold text-danger hover:bg-danger/10 transition-colors flex items-center gap-1"
              >
                <Trash2 className="w-4 h-4" />
                <span className="hidden sm:inline">Delete</span>
              </button>
            </div>
          )}
        </div>

        {/* Author & Timestamp */}
        <div className="flex items-center gap-3 text-xs sm:text-sm text-muted">
          <div className="w-8 h-8 rounded-full bg-surface-muted flex items-center justify-center border border-border text-foreground font-bold shrink-0">
            {thread.isAnonymous ? (
              <EyeOff className="w-4 h-4 text-muted" />
            ) : (
              <UserCheck className="w-4 h-4 text-primary" />
            )}
          </div>
          <div>
            <div className="font-semibold text-foreground flex items-center gap-1.5">
              <span>{threadAuthorDisplay}</span>
              {thread.author?.role === Role.TEACHER && (
                <span className="text-[10px] uppercase font-extrabold px-1.5 py-0.5 rounded bg-primary/15 text-primary">
                  Instructor
                </span>
              )}
            </div>
            <div className="text-xs text-muted">
              Posted {formatDhaka(thread.createdAt, "full")} ({formatRelative(thread.createdAt)})
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="text-sm sm:text-base text-foreground leading-relaxed pt-2">
          <SafeHtml html={thread.content} />
        </div>
      </div>

      {/* Replies Section Header */}
      <div className="flex items-center justify-between pt-2">
        <h2 className="text-base sm:text-lg font-bold text-foreground flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-primary" />
          <span>Responses ({thread.replyCount})</span>
        </h2>
      </div>

      {/* Replies List */}
      {thread.posts.length === 0 ? (
        <div className="p-8 text-center bg-surface border border-dashed border-border rounded-2xl">
          <MessageSquare className="w-8 h-8 text-muted mx-auto mb-2 opacity-50" />
          <p className="text-sm font-semibold text-foreground">No replies yet</p>
          <p className="text-xs text-muted mt-0.5">
            Be the first to share an answer or participate in this discussion!
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {thread.posts.map((post) => {
            const isAcceptedAnswer = post.isAccepted;
            const postAuthorDisplay = post.isAnonymous
              ? isModerator && post.author
                ? `Anonymous student (${post.author.name})`
                : "Anonymous student"
              : post.author?.name || "Participant";

            const isOwnPost = post.authorId === currentUserId;

            return (
              <div
                key={post.id}
                className={cn(
                  "p-4 sm:p-5 rounded-2xl border transition-all space-y-4",
                  isAcceptedAnswer
                    ? "border-2 border-success/80 bg-success/[0.04] shadow-xs"
                    : "border-border bg-surface"
                )}
              >
                {/* Accepted Answer Badge */}
                {isAcceptedAnswer && (
                  <div className="flex items-center gap-1.5 text-xs font-bold text-success-text dark:text-success pb-2 border-b border-success/20">
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-success" />
                    <span>Accepted Answer (Endorsed Solution)</span>
                  </div>
                )}

                {/* Reply Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full bg-surface-muted flex items-center justify-center border border-border text-foreground font-bold shrink-0 text-xs">
                      {post.isAnonymous ? (
                        <EyeOff className="w-3.5 h-3.5 text-muted" />
                      ) : (
                        <UserCheck className="w-3.5 h-3.5 text-primary" />
                      )}
                    </div>
                    <div>
                      <div className="text-xs sm:text-sm font-semibold text-foreground flex items-center gap-1.5">
                        <span>{postAuthorDisplay}</span>
                        {post.author?.role === Role.TEACHER && (
                          <span className="text-[10px] uppercase font-extrabold px-1.5 py-0.2 rounded bg-primary/15 text-primary">
                            Instructor
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-muted">
                        {formatRelative(post.createdAt)} • {formatDhaka(post.createdAt, "short")}
                      </div>
                    </div>
                  </div>

                  {/* Actions for Reply */}
                  <div className="flex items-center gap-1.5">
                    {/* Mark Accepted Answer Button */}
                    {canMarkAccepted && !thread.isLocked && (
                      <button
                        onClick={() => handleToggleAccepted(post)}
                        title={
                          isAcceptedAnswer
                            ? "Unmark as accepted answer"
                            : "Mark as accepted answer"
                        }
                        className={cn(
                          "px-2.5 py-1 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors border",
                          isAcceptedAnswer
                            ? "bg-success text-success-foreground border-success hover:bg-success/90"
                            : "bg-surface border-border text-muted hover:text-success hover:border-success/40"
                        )}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">
                          {isAcceptedAnswer ? "Accepted" : "Mark Accepted"}
                        </span>
                      </button>
                    )}

                    {/* Delete reply for moderator or author */}
                    {(isModerator || isOwnPost) && (
                      <button
                        onClick={() => setDeleteTarget({ type: "post", id: post.id })}
                        title="Delete reply"
                        className="p-1.5 rounded-lg text-muted hover:text-danger hover:bg-danger/10 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Reply Body */}
                <div className="text-xs sm:text-sm text-foreground leading-relaxed pl-1">
                  <SafeHtml html={post.content} />
                </div>

                {/* Reply To Post Action (1 level nesting) */}
                {!thread.isLocked && (
                  <div className="pt-1">
                    <button
                      onClick={() => {
                        setActiveParentPostId(
                          activeParentPostId === post.id ? null : post.id
                        );
                      }}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary-hover transition-colors"
                    >
                      <CornerDownRight className="w-3.5 h-3.5" />
                      <span>
                        {activeParentPostId === post.id ? "Cancel Reply" : "Reply to this answer"}
                      </span>
                    </button>
                  </div>
                )}

                {/* Nested Replies (Level 1) */}
                {post.replies && post.replies.length > 0 && (
                  <div className="space-y-3 pt-2 pl-3 sm:pl-6 border-l-2 border-border/80">
                    {post.replies.map((child) => {
                      const childAuthorDisplay = child.isAnonymous
                        ? isModerator && child.author
                          ? `Anonymous student (${child.author.name})`
                          : "Anonymous student"
                        : child.author?.name || "Participant";

                      const isOwnChild = child.authorId === currentUserId;

                      return (
                        <div
                          key={child.id}
                          className="p-3 sm:p-3.5 rounded-xl bg-surface-muted/50 border border-border/60 space-y-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-foreground">
                                {childAuthorDisplay}
                              </span>
                              {child.author?.role === Role.TEACHER && (
                                <span className="text-[9px] uppercase font-extrabold px-1.5 py-0.2 rounded bg-primary/15 text-primary">
                                  Instructor
                                </span>
                              )}
                              <span className="text-[11px] text-muted">
                                • {formatRelative(child.createdAt)}
                              </span>
                            </div>

                            {(isModerator || isOwnChild) && (
                              <button
                                onClick={() =>
                                  setDeleteTarget({ type: "post", id: child.id })
                                }
                                title="Delete response"
                                className="p-1 rounded text-muted hover:text-danger transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                          <div className="text-xs sm:text-sm text-foreground">
                            <SafeHtml html={child.content} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Reply Composer - Pinned to bottom on mobile per Design Guide */}
      {thread.isLocked ? (
        <div className="p-4 rounded-2xl bg-surface-muted border border-border text-center text-xs sm:text-sm text-muted flex items-center justify-center gap-2">
          <Lock className="w-4 h-4 text-warning" />
          <span>This discussion thread is locked. No new replies can be submitted.</span>
        </div>
      ) : (
        <div className="fixed bottom-0 left-0 right-0 p-3 bg-surface/95 backdrop-blur-md border-t border-border z-30 md:static md:p-0 md:bg-transparent md:border-0 md:mt-8">
          <div className="max-w-4xl mx-auto bg-surface border border-border md:rounded-2xl p-4 shadow-lg md:shadow-xs space-y-3">
            {activeParentPostId && (
              <div className="flex items-center justify-between text-xs bg-primary/10 text-primary px-3 py-1.5 rounded-lg font-medium">
                <span className="flex items-center gap-1.5">
                  <CornerDownRight className="w-3.5 h-3.5" />
                  Replying to thread response
                </span>
                <button
                  type="button"
                  onClick={() => setActiveParentPostId(null)}
                  className="hover:underline font-bold"
                >
                  Cancel
                </button>
              </div>
            )}

            <form onSubmit={handlePostReply} className="space-y-3">
              <div className="relative">
                <textarea
                  required
                  rows={3}
                  maxLength={5000}
                  placeholder={
                    activeParentPostId
                      ? "Write a nested follow-up reply..."
                      : "Contribute to this discussion or propose a solution..."
                  }
                  value={replyContent}
                  onChange={(e) => setReplyContent(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl text-sm bg-surface border border-border text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/40 resize-y"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={replyIsAnonymous}
                      onChange={(e) => setReplyIsAnonymous(e.target.checked)}
                      className="w-3.5 h-3.5 rounded text-primary focus:ring-primary border-border"
                    />
                    <span className="text-xs text-muted hover:text-foreground font-medium">
                      Reply anonymously
                    </span>
                  </label>
                  <span className="text-[11px] text-muted">
                    {replyContent.length}/5,000
                  </span>
                </div>

                <button
                  type="submit"
                  disabled={isSubmittingReply || !replyContent.trim()}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary-hover shadow-xs transition-colors disabled:opacity-50 shrink-0"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isSubmittingReply ? "Posting..." : "Post Reply"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        title={
          deleteTarget?.type === "thread"
            ? "Delete Discussion Thread?"
            : "Delete Reply?"
        }
        description={
          deleteTarget?.type === "thread"
            ? "This will soft delete the thread and remove all replies from student view."
            : "This will soft delete this reply from the discussion thread."
        }
        confirmLabel="Confirm Delete"
        variant="danger"
        isLoading={isDeleting}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
