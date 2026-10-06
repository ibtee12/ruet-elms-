"use client";

import * as React from "react";
import { useState, useTransition } from "react";
import {
  StudentOfferingMaterialsData,
  StudentModuleItemData,
  StudentMaterialItemData,
} from "@/services/materials";
import { toggleMaterialProgressAction } from "@/actions/materials";
import { ProgressBar } from "@/components/shared/progress-bar";
import { EmptyState } from "@/components/shared/empty-state";
import { toast } from "sonner";
import {
  BookOpen,
  FolderOpen,
  ChevronDown,
  ChevronUp,
  FileText,
  Video,
  ExternalLink,
  Download,
  CheckCircle2,
  Circle,
  Tag,
  Code,
  Image as ImageIcon,
  Archive,
  File,
  Clock,
  Sparkles,
  Layers,
} from "lucide-react";

interface StudentMaterialsViewProps {
  initialData: StudentOfferingMaterialsData;
}

export function StudentMaterialsView({ initialData }: StudentMaterialsViewProps) {
  const [data, setData] = useState<StudentOfferingMaterialsData>(initialData);
  const [isPending, startTransition] = useTransition();

  // First module open by default
  const [openModuleIds, setOpenModuleIds] = useState<Set<string>>(() => {
    const set = new Set<string>();
    if (initialData.modules.length > 0) {
      set.add(initialData.modules[0].id);
    }
    return set;
  });

  const toggleModuleAccordion = (moduleId: string) => {
    setOpenModuleIds((prev) => {
      const next = new Set(prev);
      if (next.has(moduleId)) {
        next.delete(moduleId);
      } else {
        next.add(moduleId);
      }
      return next;
    });
  };

  const handleToggleComplete = async (material: StudentMaterialItemData) => {
    const previousData = data;
    const newCompleted = !material.isCompleted;

    // 1. Optimistic UI update
    setData((current) => {
      let totalCompleted = 0;
      let totalPublished = 0;

      const updatedModules = current.modules.map((mod) => {
        const updatedMaterials = mod.materials.map((m) => {
          if (m.id === material.id) {
            return {
              ...m,
              isCompleted: newCompleted,
              completedAt: newCompleted ? new Date() : null,
            };
          }
          return m;
        });

        const modPublished = updatedMaterials.length;
        const modCompleted = updatedMaterials.filter((m) => m.isCompleted).length;
        const modPercentage =
          modPublished > 0 ? Math.round((modCompleted / modPublished) * 100) : 0;

        totalPublished += modPublished;
        totalCompleted += modCompleted;

        return {
          ...mod,
          materials: updatedMaterials,
          publishedCount: modPublished,
          completedCount: modCompleted,
          progressPercentage: modPercentage,
        };
      });

      const totalPercentage =
        totalPublished > 0 ? Math.round((totalCompleted / totalPublished) * 100) : 0;

      return {
        ...current,
        modules: updatedModules,
        totalPublishedCount: totalPublished,
        totalCompletedCount: totalCompleted,
        totalPercentage,
      };
    });

    // 2. Call server action with rollback on failure
    startTransition(async () => {
      try {
        const res = await toggleMaterialProgressAction(material.id, newCompleted);
        if (!res.success) {
          setData(previousData);
          toast.error("Failed to update progress.");
        }
      } catch (err: unknown) {
        setData(previousData);
        toast.error(
          err instanceof Error ? err.message : "Failed to update material completion status."
        );
      }
    });
  };

  const renderMaterialIcon = (mat: StudentMaterialItemData) => {
    const mime = mat.mime?.toLowerCase() || "";
    const name = (mat.originalName || mat.title).toLowerCase();

    if (mat.type === "VIDEO") {
      return (
        <div className="w-9 h-9 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 flex items-center justify-center shrink-0">
          <Video className="w-4 h-4" />
        </div>
      );
    }

    if (mat.type === "LINK") {
      return (
        <div className="w-9 h-9 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20 flex items-center justify-center shrink-0">
          <ExternalLink className="w-4 h-4" />
        </div>
      );
    }

    if (mime.includes("pdf") || name.endsWith(".pdf")) {
      return (
        <div className="w-9 h-9 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 flex items-center justify-center shrink-0">
          <FileText className="w-4 h-4" />
        </div>
      );
    }

    if (
      mime.includes("image") ||
      name.endsWith(".png") ||
      name.endsWith(".jpg") ||
      name.endsWith(".jpeg")
    ) {
      return (
        <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center justify-center shrink-0">
          <ImageIcon className="w-4 h-4" />
        </div>
      );
    }

    if (mime.includes("zip") || name.endsWith(".zip")) {
      return (
        <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 flex items-center justify-center shrink-0">
          <Archive className="w-4 h-4" />
        </div>
      );
    }

    if (
      name.endsWith(".c") ||
      name.endsWith(".cpp") ||
      name.endsWith(".py") ||
      name.endsWith(".java") ||
      name.endsWith(".js") ||
      name.endsWith(".ts")
    ) {
      return (
        <div className="w-9 h-9 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 flex items-center justify-center shrink-0">
          <Code className="w-4 h-4" />
        </div>
      );
    }

    return (
      <div className="w-9 h-9 rounded-xl bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20 flex items-center justify-center shrink-0">
        <File className="w-4 h-4" />
      </div>
    );
  };

  const hasAnyPublishedMaterials = data.totalPublishedCount > 0;

  if (!hasAnyPublishedMaterials) {
    return (
      <div className="space-y-6">
        <EmptyState
          icon={FolderOpen}
          title="No Course Materials Published Yet"
          description="Your instructors have not published any lecture slides, notes, or resources for this course offering yet. Check back soon!"
          className="bg-surface py-16 border border-border"
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. Overall Progress Header Card */}
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
                <Sparkles className="w-3 h-3" />
                <span>Overall Learning Progress</span>
              </span>
              {data.totalPercentage === 100 && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  All Completed 🎉
                </span>
              )}
            </div>
            <h2 className="text-lg font-bold text-foreground">
              {data.totalCompletedCount} of {data.totalPublishedCount} Materials Completed
            </h2>
          </div>

          <div className="text-right sm:shrink-0">
            <span className="text-3xl font-extrabold tracking-tight tabular-nums text-primary">
              {data.totalPercentage}%
            </span>
          </div>
        </div>

        <ProgressBar
          value={data.totalPercentage}
          showPercent={false}
          className="h-2.5"
          barClassName="bg-gradient-to-r from-primary to-teal-500"
        />
      </div>

      {/* 2. Modules Accordion List */}
      <div className="space-y-4">
        {data.modules.map((mod, modIdx) => {
          const isOpen = openModuleIds.has(mod.id);
          const hasMaterials = mod.materials.length > 0;

          return (
            <div
              key={mod.id}
              className="rounded-2xl border border-border bg-surface shadow-2xs overflow-hidden transition-all"
            >
              {/* Accordion Header */}
              <button
                type="button"
                onClick={() => toggleModuleAccordion(mod.id)}
                aria-expanded={isOpen}
                aria-controls={`module-content-${mod.id}`}
                className="w-full text-left p-4 sm:p-5 flex items-center justify-between gap-4 hover:bg-surface-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-surface-muted border border-border flex items-center justify-center shrink-0 text-muted">
                    <Layers className="w-4 h-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-muted">
                        Module {modIdx + 1}
                      </span>
                      <span className="text-muted text-xs">•</span>
                      <span className="text-xs text-muted">
                        {mod.publishedCount} {mod.publishedCount === 1 ? "item" : "items"}
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-foreground truncate mt-0.5">
                      {mod.title}
                    </h3>
                  </div>
                </div>

                <div className="flex items-center gap-3 sm:gap-5 shrink-0">
                  {/* Module Mini Progress */}
                  <div className="hidden sm:flex flex-col items-end gap-1 w-32">
                    <span className="text-xs text-muted tabular-nums">
                      {mod.completedCount} / {mod.publishedCount} completed
                    </span>
                    <ProgressBar
                      value={mod.progressPercentage}
                      showPercent={false}
                      className="w-full h-1.5"
                    />
                  </div>

                  <div className="p-1 rounded-lg text-muted hover:text-foreground">
                    {isOpen ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </div>
                </div>
              </button>

              {/* Accordion Content */}
              {isOpen && (
                <div
                  id={`module-content-${mod.id}`}
                  className="px-4 pb-4 sm:px-5 sm:pb-5 pt-1 border-t border-border/70 space-y-2.5 animate-in fade-in-50"
                >
                  {!hasMaterials ? (
                    <div className="py-6 text-center text-xs text-muted">
                      No materials published in this module yet.
                    </div>
                  ) : (
                    mod.materials.map((mat) => (
                      <div
                        key={mat.id}
                        className={`group rounded-xl border p-3.5 flex items-start gap-3 sm:gap-4 transition-all ${
                          mat.isCompleted
                            ? "bg-surface border-border/70 opacity-95"
                            : "bg-surface border-border hover:border-primary/30 hover:shadow-2xs"
                        }`}
                      >
                        {/* Checkbox: Mark as Completed */}
                        <div className="pt-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleToggleComplete(mat)}
                            aria-label={`Mark ${mat.title} as ${
                              mat.isCompleted ? "incomplete" : "completed"
                            }`}
                            className={`p-1 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                              mat.isCompleted
                                ? "text-teal-600 dark:text-teal-400 hover:text-muted"
                                : "text-muted hover:text-primary"
                            }`}
                            title={
                              mat.isCompleted
                                ? "Marked as completed (click to undo)"
                                : "Mark as completed"
                            }
                          >
                            {mat.isCompleted ? (
                              <CheckCircle2 className="w-5 h-5 fill-teal-500/10" />
                            ) : (
                              <Circle className="w-5 h-5" />
                            )}
                          </button>
                        </div>

                        {/* Material Icon */}
                        {renderMaterialIcon(mat)}

                        {/* Content details */}
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4
                              className={`text-sm font-semibold leading-snug transition-colors ${
                                mat.isCompleted
                                  ? "text-muted line-through"
                                  : "text-foreground group-hover:text-primary"
                              }`}
                            >
                              {mat.title}
                            </h4>

                            {/* Topic chip */}
                            {mat.topicName && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-primary/10 text-primary border border-primary/20">
                                <Tag className="w-3 h-3" />
                                <span>{mat.topicName}</span>
                              </span>
                            )}
                          </div>

                          {mat.description && (
                            <p className="text-xs text-muted leading-relaxed line-clamp-2">
                              {mat.description}
                            </p>
                          )}

                          <div className="flex items-center gap-3 text-[11px] text-muted pt-0.5">
                            {mat.sizeBytes && (
                              <span>
                                {(mat.sizeBytes / (1024 * 1024)).toFixed(1)} MB
                              </span>
                            )}
                            {mat.isCompleted && mat.completedAt && (
                              <span className="inline-flex items-center gap-1 text-teal-600 dark:text-teal-400">
                                <Clock className="w-3 h-3" />
                                <span>Completed</span>
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Open / Download Action Button */}
                        <div className="shrink-0 pt-0.5">
                          <a
                            href={`/api/materials/${mat.id}/download`}
                            target={mat.type === "FILE" ? undefined : "_blank"}
                            rel={mat.type === "FILE" ? undefined : "noopener noreferrer"}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-surface text-foreground hover:bg-surface-muted text-xs font-medium transition-colors shadow-2xs"
                            title={
                              mat.type === "FILE"
                                ? `Download ${mat.title}`
                                : mat.type === "VIDEO"
                                ? `Watch ${mat.title}`
                                : `Open ${mat.title}`
                            }
                          >
                            {mat.type === "FILE" ? (
                              <>
                                <Download className="w-3.5 h-3.5 text-primary" />
                                <span className="hidden sm:inline">Download</span>
                              </>
                            ) : mat.type === "VIDEO" ? (
                              <>
                                <Video className="w-3.5 h-3.5 text-purple-500" />
                                <span className="hidden sm:inline">Watch</span>
                              </>
                            ) : (
                              <>
                                <ExternalLink className="w-3.5 h-3.5 text-sky-500" />
                                <span className="hidden sm:inline">Open</span>
                              </>
                            )}
                          </a>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
