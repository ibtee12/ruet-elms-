"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Megaphone,
  Plus,
  Edit2,
  Trash2,
  Loader2,
  Send,
  X,
  Building2,
} from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { SafeHtml } from "@/lib/sanitize";
import { formatDhaka } from "@/lib/datetime";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import {
  createDepartmentAnnouncementAction,
  updateAnnouncementAction,
  deleteAnnouncementAction,
} from "@/actions/announcements";
import { toast } from "sonner";

export interface DeptAnnouncementItem {
  id: string;
  title: string;
  body: string;
  createdAt: Date;
  author: {
    name: string;
    role: string;
  };
}

interface DeptAnnouncementsManagerProps {
  departmentId: string;
  departmentCode: string;
  departmentName: string;
  initialAnnouncements: DeptAnnouncementItem[];
}

export function DeptAnnouncementsManager({
  departmentId,
  departmentCode,
  departmentName,
  initialAnnouncements,
}: DeptAnnouncementsManagerProps) {
  const router = useRouter();
  const [announcements, setAnnouncements] = React.useState<DeptAnnouncementItem[]>(initialAnnouncements);

  React.useEffect(() => {
    setAnnouncements(initialAnnouncements);
  }, [initialAnnouncements]);

  // Create Modal State
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const [createTitle, setCreateTitle] = React.useState("");
  const [createBody, setCreateBody] = React.useState("");
  const [notifyUsers, setNotifyUsers] = React.useState(true);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Edit Modal State
  const [editingAnnouncement, setEditingAnnouncement] = React.useState<DeptAnnouncementItem | null>(null);
  const [editTitle, setEditTitle] = React.useState("");
  const [editBody, setEditBody] = React.useState("");
  const [isEditing, setIsEditing] = React.useState(false);

  // Delete State
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createTitle.trim() || !createBody.trim()) {
      toast.error("Please provide both a title and notice content.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await createDepartmentAnnouncementAction(departmentId, {
        title: createTitle,
        body: createBody,
        notifyUsers,
      });

      if (res.success) {
        toast.success(
          notifyUsers
            ? "Department notice published and notifications sent to department students & faculty"
            : "Department notice published successfully"
        );
        setIsCreateOpen(false);
        setCreateTitle("");
        setCreateBody("");
        router.refresh();
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to publish department notice");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartEdit = (ann: DeptAnnouncementItem) => {
    setEditingAnnouncement(ann);
    setEditTitle(ann.title);
    setEditBody(ann.body);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAnnouncement) return;

    setIsEditing(true);
    try {
      const res = await updateAnnouncementAction(editingAnnouncement.id, {
        title: editTitle,
        body: editBody,
      });

      if (res.success) {
        toast.success("Notice updated successfully");
        setEditingAnnouncement(null);
        router.refresh();
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update notice");
    } finally {
      setIsEditing(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingId) return;

    setIsDeleting(true);
    try {
      const res = await deleteAnnouncementAction(deletingId);
      if (res.success) {
        toast.success("Notice deleted");
        setDeletingId(null);
        router.refresh();
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to delete notice");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-primary" />
            <span className="text-xs font-bold text-primary font-mono uppercase">
              {departmentCode}
            </span>
          </div>
          <h2 className="text-lg font-bold text-foreground">
            {departmentName} Announcements
          </h2>
          <p className="text-xs text-muted">
            Official department notices visible to all enrolled students and faculty members.
          </p>
        </div>

        <Button onClick={() => setIsCreateOpen(true)} className="gap-1.5">
          <Plus className="w-4 h-4" />
          <span>Post Department Notice</span>
        </Button>
      </div>

      {/* Announcements List */}
      {announcements.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No Department Notices"
          description="Publish department-wide administrative notices, exam schedules, and holiday announcements."
          action={{
            label: "Create First Notice",
            onClick: () => setIsCreateOpen(true),
          }}
          className="bg-surface py-12"
        />
      ) : (
        <div className="space-y-4">
          {announcements.map((ann) => (
            <div
              key={ann.id}
              className="rounded-2xl border border-border bg-surface p-5 sm:p-6 shadow-xs space-y-3.5 hover:border-primary/30 transition-colors"
            >
              <div className="flex flex-wrap items-start justify-between gap-2.5">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20">
                      Dept. Notice ({departmentCode})
                    </span>
                    <span className="text-xs text-muted">
                      • {formatDhaka(ann.createdAt, "full")}
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-foreground tracking-tight">
                    {ann.title}
                  </h3>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleStartEdit(ann)}
                    aria-label="Edit notice"
                    className="p-1.5 rounded-lg border border-border bg-surface-muted hover:bg-border text-foreground transition-colors"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setDeletingId(ann.id)}
                    aria-label="Delete notice"
                    className="p-1.5 rounded-lg border border-border bg-surface-muted hover:bg-danger/10 hover:text-danger hover:border-danger/20 text-muted transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="text-xs sm:text-sm text-foreground/90 leading-relaxed bg-surface-muted/30 p-4 rounded-xl border border-border/60">
                <SafeHtml html={ann.body} />
              </div>

              <div className="flex items-center justify-between text-xs text-muted pt-2 border-t border-border/80">
                <span className="font-medium">
                  Published by: <span className="text-foreground">{ann.author.name}</span>
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      <DialogPrimitive.Root open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs animate-in fade-in" />
          <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-xl -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-surface p-6 shadow-xl animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <DialogPrimitive.Title className="text-base font-bold text-foreground flex items-center gap-2">
                <Megaphone className="w-4 h-4 text-primary" />
                <span>Post Department Notice</span>
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

            <form onSubmit={handleCreate} className="space-y-4 pt-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  Notice Title
                </label>
                <input
                  type="text"
                  required
                  value={createTitle}
                  onChange={(e) => setCreateTitle(e.target.value)}
                  placeholder="e.g., Notice: Academic Calendar for Even Term 2026"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-foreground text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  Notice Body
                </label>
                <textarea
                  rows={6}
                  required
                  value={createBody}
                  onChange={(e) => setCreateBody(e.target.value)}
                  placeholder="Enter official department notice content..."
                  className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-foreground text-xs leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="notifyDeptUsers"
                  checked={notifyUsers}
                  onChange={(e) => setNotifyUsers(e.target.checked)}
                  className="w-4 h-4 rounded border border-border text-primary focus:ring-primary"
                />
                <label
                  htmlFor="notifyDeptUsers"
                  className="text-xs text-foreground cursor-pointer font-medium select-none"
                >
                  Notify all students and faculty in {departmentCode}
                </label>
              </div>

              <div className="pt-3 border-t border-border flex items-center justify-end gap-2.5">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsCreateOpen(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting} className="gap-1.5">
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Publishing...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      <span>Publish Notice</span>
                    </>
                  )}
                </Button>
              </div>
            </form>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      {/* Edit Modal */}
      <DialogPrimitive.Root
        open={editingAnnouncement !== null}
        onOpenChange={(open) => !open && setEditingAnnouncement(null)}
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs animate-in fade-in" />
          <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-xl -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-surface p-6 shadow-xl animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <DialogPrimitive.Title className="text-base font-bold text-foreground flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-primary" />
                <span>Edit Department Notice</span>
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

            <form onSubmit={handleUpdate} className="space-y-4 pt-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  Notice Title
                </label>
                <input
                  type="text"
                  required
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-foreground text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  Notice Body
                </label>
                <textarea
                  rows={6}
                  required
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-foreground text-xs leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
              </div>

              <div className="pt-3 border-t border-border flex items-center justify-end gap-2.5">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditingAnnouncement(null)}
                  disabled={isEditing}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isEditing}>
                  {isEditing ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>Save Changes</span>
                  )}
                </Button>
              </div>
            </form>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deletingId !== null}
        onOpenChange={(open) => !open && setDeletingId(null)}
        title="Delete Notice"
        description="Are you sure you want to permanently delete this department notice?"
        confirmLabel="Delete"
        isDestructive={true}
        isLoading={isDeleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
