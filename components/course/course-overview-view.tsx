"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Layers,
  Users,
  FileText,
  FileCheck2,
  HelpCircle,
  Megaphone,
  GraduationCap,
  Mail,
  Edit3,
  Calendar,
  Lock,
  Loader2,
  X,
} from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { CourseOverviewData } from "@/services/announcements";
import { SafeHtml } from "@/lib/sanitize";
import { formatDhaka, formatRelative } from "@/lib/datetime";
import { updateOfferingOverviewAction } from "@/actions/announcements";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface CourseOverviewViewProps {
  data: CourseOverviewData;
  portal: "student" | "teacher";
}

export function CourseOverviewView({ data, portal }: CourseOverviewViewProps) {
  const router = useRouter();
  const [isEditOpen, setIsEditOpen] = React.useState(false);
  const [description, setDescription] = React.useState(data.description || "");
  const [syllabus, setSyllabus] = React.useState(data.syllabus || "");
  const [isSaving, setIsSaving] = React.useState(false);

  // Sync state if data changes
  React.useEffect(() => {
    setDescription(data.description || "");
    setSyllabus(data.syllabus || "");
  }, [data.description, data.syllabus]);

  const handleSaveOverview = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const res = await updateOfferingOverviewAction({
        offeringId: data.offeringId,
        description,
        syllabus,
      });

      if (res.success) {
        toast.success("Course overview updated successfully");
        setIsEditOpen(false);
        router.refresh();
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update course overview");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Key Counts Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        <div className="rounded-xl border border-border bg-surface p-3.5 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] text-muted font-medium">Sections</p>
            <p className="text-lg font-bold text-foreground leading-tight">
              {data.counts.sections}
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface p-3.5 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] text-muted font-medium">Enrolled</p>
            <p className="text-lg font-bold text-foreground leading-tight">
              {data.counts.students}
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface p-3.5 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] text-muted font-medium">Materials</p>
            <p className="text-lg font-bold text-foreground leading-tight">
              {data.counts.materials}
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface p-3.5 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <FileCheck2 className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] text-muted font-medium">Assignments</p>
            <p className="text-lg font-bold text-foreground leading-tight">
              {data.counts.assignments}
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface p-3.5 shadow-xs flex items-center gap-3 col-span-2 sm:col-span-1">
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
            <HelpCircle className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] text-muted font-medium">Quizzes</p>
            <p className="text-lg font-bold text-foreground leading-tight">
              {data.counts.quizzes}
            </p>
          </div>
        </div>
      </div>

      {/* 2. Main Content Grid: Description & Syllabus on Left, Teachers & Announcements on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 cols): Course Description & Syllabus */}
        <div className="lg:col-span-2 space-y-6">
          {/* Description Card */}
          <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" />
                <span>Course Description</span>
              </h2>

              {data.canEdit && (
                <button
                  type="button"
                  onClick={() => setIsEditOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-surface-muted hover:bg-border text-foreground text-xs font-semibold transition-colors"
                >
                  <Edit3 className="w-3.5 h-3.5 text-muted" />
                  <span>Edit Overview</span>
                </button>
              )}
            </div>

            {data.description ? (
              <SafeHtml
                html={data.description}
                className="text-xs sm:text-sm text-foreground/90 leading-relaxed whitespace-pre-line"
              />
            ) : (
              <p className="text-xs text-muted italic">
                No catalog description provided for this course yet.
              </p>
            )}
          </div>

          {/* Syllabus Card */}
          <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6 shadow-xs space-y-3">
            <h2 className="text-base font-bold text-foreground flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary" />
              <span>Syllabus &amp; Course Outline</span>
            </h2>

            {data.syllabus ? (
              <div className="text-xs sm:text-sm text-foreground/90 leading-relaxed bg-surface-muted/40 p-4 rounded-xl border border-border/60">
                <SafeHtml html={data.syllabus} />
              </div>
            ) : (
              <p className="text-xs text-muted italic">
                No course syllabus or lesson plan outline published for this term offering.
              </p>
            )}
          </div>
        </div>

        {/* Right Column (1 col): Teachers & Latest Announcements */}
        <div className="space-y-6">
          {/* Faculty / Instructors Card */}
          <div className="rounded-2xl border border-border bg-surface p-5 shadow-xs space-y-3">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <GraduationCap className="w-4 h-4 text-primary" />
              <span>Teaching Faculty</span>
            </h2>

            {data.teachers.length === 0 ? (
              <p className="text-xs text-muted italic">No teachers assigned yet.</p>
            ) : (
              <div className="space-y-3">
                {data.teachers.map((t) => (
                  <div
                    key={t.id}
                    className="p-3 rounded-xl border border-border/80 bg-surface-muted/50 flex flex-col gap-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-foreground truncate">
                        {t.name}
                      </span>
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                          t.role === "INSTRUCTOR"
                            ? "bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/20"
                            : "bg-surface text-muted border-border"
                        }`}
                      >
                        {t.role === "INSTRUCTOR" ? "Instructor" : "TA"}
                      </span>
                    </div>

                    <p className="text-[11px] text-muted">{t.designation}</p>

                    <div className="flex items-center gap-1.5 text-[11px] text-muted/80 pt-0.5">
                      <Mail className="w-3 h-3 text-muted shrink-0" />
                      <span className="truncate">{t.email}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Latest Announcements Card */}
          <div className="rounded-2xl border border-border bg-surface p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Megaphone className="w-4 h-4 text-primary" />
                <span>Latest Announcements</span>
              </h2>

              {portal === "teacher" && (
                <button
                  type="button"
                  onClick={() => router.push(`/teach/${data.offeringId}/announcements`)}
                  className="text-[11px] font-semibold text-primary hover:text-primary-hover transition-colors"
                >
                  Manage
                </button>
              )}
            </div>

            {data.announcements.length === 0 ? (
              <p className="text-xs text-muted italic">
                No announcements published for this course yet.
              </p>
            ) : (
              <div className="space-y-3">
                {data.announcements.map((ann) => (
                  <div
                    key={ann.id}
                    className="p-3.5 rounded-xl border border-border/80 bg-surface-muted/30 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-xs font-bold text-foreground line-clamp-2 leading-snug">
                        {ann.title}
                      </h3>
                      {ann.isDepartmentLevel ? (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20 shrink-0 font-medium">
                          Dept.
                        </span>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 shrink-0 font-medium">
                          Course
                        </span>
                      )}
                    </div>

                    <SafeHtml
                      html={ann.body}
                      className="text-xs text-muted leading-relaxed line-clamp-3"
                    />

                    <div className="pt-2 border-t border-border/60 flex items-center justify-between text-[10px] text-muted">
                      <span>{ann.authorName}</span>
                      <span>{formatDhaka(ann.createdAt, "short")}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3. Edit Description & Syllabus Modal (Teacher only, rejected if ARCHIVED) */}
      <DialogPrimitive.Root open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs animate-in fade-in" />
          <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-xl -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-surface p-6 shadow-xl animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <DialogPrimitive.Title className="text-base font-bold text-foreground flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-primary" />
                <span>Edit Course Overview &amp; Syllabus</span>
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

            {data.isArchived ? (
              <div className="p-4 my-4 rounded-xl border border-warning/30 bg-warning/10 text-foreground flex items-center gap-3 text-xs">
                <Lock className="w-4 h-4 text-warning shrink-0" />
                <span>
                  This offering is ARCHIVED. Modifying the description or syllabus is permanently locked.
                </span>
              </div>
            ) : (
              <form onSubmit={handleSaveOverview} className="space-y-4 pt-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">
                    Catalog Course Description
                  </label>
                  <textarea
                    rows={4}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Enter comprehensive description of course objectives, learning outcomes, and prerequisites..."
                    className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-foreground text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary leading-relaxed"
                  />
                  <p className="text-[11px] text-muted">
                    Shared description for {data.code}.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">
                    Term Offering Syllabus &amp; Outline
                  </label>
                  <textarea
                    rows={6}
                    value={syllabus}
                    onChange={(e) => setSyllabus(e.target.value)}
                    placeholder="Enter syllabus modules, textbook references, and assessment policies..."
                    className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-foreground text-xs font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary leading-relaxed"
                  />
                  <p className="text-[11px] text-muted">
                    Supports safe formatting tags (&lt;p&gt;, &lt;b&gt;, &lt;ul&gt;, &lt;li&gt;, &lt;code&gt;). Script content is stripped automatically.
                  </p>
                </div>

                <div className="pt-3 border-t border-border flex items-center justify-end gap-2.5">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsEditOpen(false)}
                    disabled={isSaving}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isSaving}>
                    {isSaving ? (
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
            )}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </div>
  );
}
