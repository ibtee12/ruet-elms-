"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  FolderPlus,
  Plus,
  Upload,
  Link as LinkIcon,
  Video,
  FileText,
  FileArchive,
  FileCode,
  Image as ImageIcon,
  File,
  Eye,
  EyeOff,
  MoreVertical,
  ChevronUp,
  ChevronDown,
  Edit2,
  Trash2,
  Download,
  Lock,
  Loader2,
  X,
  ExternalLink,
  Tag,
  Check,
} from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { OfferingMaterialsData, ModuleItemData, MaterialItemData } from "@/services/materials";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import {
  createModuleAction,
  renameModuleAction,
  reorderModulesAction,
  deleteModuleAction,
  uploadMaterialFileAction,
  createMaterialLinkAction,
  updateMaterialAction,
  toggleMaterialPublishedAction,
  deleteMaterialAction,
  reorderMaterialsAction,
} from "@/actions/materials";
import { toast } from "sonner";

interface OfferingMaterialsManagerProps {
  data: OfferingMaterialsData;
}

export function OfferingMaterialsManager({ data }: OfferingMaterialsManagerProps) {
  const router = useRouter();
  const [modules, setModules] = React.useState<ModuleItemData[]>(data.modules);

  React.useEffect(() => {
    setModules(data.modules);
  }, [data.modules]);

  // Create Module State
  const [isCreateModuleOpen, setIsCreateModuleOpen] = React.useState(false);
  const [newModuleTitle, setNewModuleTitle] = React.useState("");
  const [isCreatingModule, setIsCreatingModule] = React.useState(false);

  // Rename Module State
  const [renamingModule, setRenamingModule] = React.useState<ModuleItemData | null>(null);
  const [renameTitle, setRenameTitle] = React.useState("");
  const [isRenamingModule, setIsRenamingModule] = React.useState(false);

  // Delete Module State
  const [deletingModule, setDeletingModule] = React.useState<ModuleItemData | null>(null);
  const [isDeletingModule, setIsDeletingModule] = React.useState(false);

  // Material Creation State
  const [activeModuleForMaterial, setActiveModuleForMaterial] = React.useState<ModuleItemData | null>(null);
  const [materialKind, setMaterialKind] = React.useState<"FILE" | "LINK" | "VIDEO">("FILE");
  const [matTitle, setMatTitle] = React.useState("");
  const [matDescription, setMatDescription] = React.useState("");
  const [matUrl, setMatUrl] = React.useState("");
  const [matTopicId, setMatTopicId] = React.useState("");
  const [matNewTopic, setMatNewTopic] = React.useState("");
  const [matPublished, setMatPublished] = React.useState(true);
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [isUploading, setIsUploading] = React.useState(false);

  // Edit Material State
  const [editingMaterial, setEditingMaterial] = React.useState<MaterialItemData | null>(null);
  const [editMatTitle, setEditMatTitle] = React.useState("");
  const [editMatDescription, setEditMatDescription] = React.useState("");
  const [editMatUrl, setEditMatUrl] = React.useState("");
  const [isUpdatingMaterial, setIsUpdatingMaterial] = React.useState(false);

  // Delete Material State
  const [deletingMaterialId, setDeletingMaterialId] = React.useState<string | null>(null);
  const [isDeletingMaterial, setIsDeletingMaterial] = React.useState(false);

  // -------------------------------------------------------------------------
  // MODULE HANDLERS
  // -------------------------------------------------------------------------
  const handleCreateModule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newModuleTitle.trim()) return;

    setIsCreatingModule(true);
    try {
      const res = await createModuleAction(data.offeringId, newModuleTitle);
      if (res?.success) {
        toast.success(`Module "${newModuleTitle}" created`);
        setIsCreateModuleOpen(false);
        setNewModuleTitle("");
        router.refresh();
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to create module");
    } finally {
      setIsCreatingModule(false);
    }
  };

  const handleRenameModule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renamingModule || !renameTitle.trim()) return;

    setIsRenamingModule(true);
    try {
      const res = await renameModuleAction(renamingModule.id, renameTitle);
      if (res?.success) {
        toast.success("Module renamed");
        setRenamingModule(null);
        router.refresh();
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to rename module");
    } finally {
      setIsRenamingModule(false);
    }
  };

  const handleMoveModule = async (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= modules.length) return;

    const newOrder = [...modules];
    const temp = newOrder[index];
    newOrder[index] = newOrder[targetIndex];
    newOrder[targetIndex] = temp;
    setModules(newOrder);

    try {
      await reorderModulesAction(
        data.offeringId,
        newOrder.map((m) => m.id)
      );
      toast.success("Module order updated");
      router.refresh();
    } catch (err: unknown) {
      toast.error("Failed to reorder modules");
      setModules(data.modules);
    }
  };

  const handleDeleteModule = async () => {
    if (!deletingModule) return;

    setIsDeletingModule(true);
    try {
      const res = await deleteModuleAction(deletingModule.id, true);
      if (res.success) {
        toast.success("Module removed");
        setDeletingModule(null);
        router.refresh();
      } else {
        toast.error(res.error || "Failed to delete module");
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to delete module");
    } finally {
      setIsDeletingModule(false);
    }
  };

  // -------------------------------------------------------------------------
  // MATERIAL HANDLERS
  // -------------------------------------------------------------------------
  const handleOpenAddMaterial = (moduleItem: ModuleItemData, kind: "FILE" | "LINK" | "VIDEO") => {
    setActiveModuleForMaterial(moduleItem);
    setMaterialKind(kind);
    setMatTitle("");
    setMatDescription("");
    setMatUrl("");
    setMatTopicId("");
    setMatNewTopic("");
    setSelectedFile(null);
    setMatPublished(true);
  };

  const handleCreateMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeModuleForMaterial) return;

    setIsUploading(true);
    try {
      if (materialKind === "FILE") {
        if (!selectedFile) {
          toast.error("Please select a file to upload.");
          setIsUploading(false);
          return;
        }

        const formData = new FormData();
        formData.append("offeringId", data.offeringId);
        formData.append("moduleId", activeModuleForMaterial.id);
        formData.append("title", matTitle);
        if (matDescription) formData.append("description", matDescription);
        if (matTopicId) formData.append("topicId", matTopicId);
        if (matNewTopic) formData.append("newTopicName", matNewTopic);
        formData.append("published", matPublished ? "true" : "false");
        formData.append("file", selectedFile);

        const res = await uploadMaterialFileAction(formData);
        if (res.success) {
          toast.success("Material uploaded successfully");
          setActiveModuleForMaterial(null);
          router.refresh();
        } else {
          toast.error(res.error || "Upload failed");
        }
      } else {
        if (!matUrl.trim()) {
          toast.error("Please provide a valid URL.");
          setIsUploading(false);
          return;
        }

        const res = await createMaterialLinkAction({
          offeringId: data.offeringId,
          moduleId: activeModuleForMaterial.id,
          title: matTitle,
          description: matDescription,
          url: matUrl,
          type: materialKind,
          topicId: matTopicId || undefined,
          newTopicName: matNewTopic || undefined,
          published: matPublished,
        });

        if (res.success) {
          toast.success(`${materialKind === "VIDEO" ? "Video" : "Link"} added successfully`);
          setActiveModuleForMaterial(null);
          router.refresh();
        } else {
          toast.error(res.error || "Failed to add link");
        }
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to add material");
    } finally {
      setIsUploading(false);
    }
  };

  const handleTogglePublish = async (materialId: string) => {
    try {
      const res = await toggleMaterialPublishedAction(materialId);
      if (res.success) {
        toast.success(res.published ? "Material published" : "Material unpublished");
        router.refresh();
      }
    } catch (err: unknown) {
      toast.error("Failed to update status");
    }
  };

  const handleStartEditMaterial = (mat: MaterialItemData) => {
    setEditingMaterial(mat);
    setEditMatTitle(mat.title);
    setEditMatDescription(mat.description || "");
    setEditMatUrl(mat.url || "");
  };

  const handleUpdateMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMaterial) return;

    setIsUpdatingMaterial(true);
    try {
      const res = await updateMaterialAction(editingMaterial.id, {
        title: editMatTitle,
        description: editMatDescription,
        url: editMatUrl || undefined,
      });

      if (res.success) {
        toast.success("Material updated");
        setEditingMaterial(null);
        router.refresh();
      } else {
        toast.error(res.error || "Failed to update material");
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update material");
    } finally {
      setIsUpdatingMaterial(false);
    }
  };

  const handleDeleteMaterial = async () => {
    if (!deletingMaterialId) return;

    setIsDeletingMaterial(true);
    try {
      const res = await deleteMaterialAction(deletingMaterialId);
      if (res.success) {
        toast.success("Material deleted");
        setDeletingMaterialId(null);
        router.refresh();
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to delete material");
    } finally {
      setIsDeletingMaterial(false);
    }
  };

  const handleMoveMaterial = async (
    moduleIndex: number,
    materialIndex: number,
    direction: "up" | "down"
  ) => {
    const mod = modules[moduleIndex];
    const targetIndex = direction === "up" ? materialIndex - 1 : materialIndex + 1;
    if (targetIndex < 0 || targetIndex >= mod.materials.length) return;

    const newMats = [...mod.materials];
    const temp = newMats[materialIndex];
    newMats[materialIndex] = newMats[targetIndex];
    newMats[targetIndex] = temp;

    const newModules = [...modules];
    newModules[moduleIndex] = { ...mod, materials: newMats };
    setModules(newModules);

    try {
      await reorderMaterialsAction(
        mod.id,
        newMats.map((m) => m.id)
      );
      toast.success("Material order updated");
      router.refresh();
    } catch {
      toast.error("Failed to reorder materials");
      setModules(data.modules);
    }
  };

  // Helper for material icons
  const getMaterialIcon = (mat: MaterialItemData) => {
    if (mat.type === "VIDEO") return <Video className="w-4 h-4 text-purple-500" />;
    if (mat.type === "LINK") return <LinkIcon className="w-4 h-4 text-blue-500" />;

    const ext = mat.fileKey ? mat.fileKey.split(".").pop()?.toLowerCase() : "";
    if (ext === "pdf") return <FileText className="w-4 h-4 text-rose-500" />;
    if (["zip", "tar", "gz", "7z", "rar"].includes(ext || ""))
      return <FileArchive className="w-4 h-4 text-amber-500" />;
    if (["c", "cpp", "java", "py", "js", "ts", "html", "css", "sql"].includes(ext || ""))
      return <FileCode className="w-4 h-4 text-emerald-500" />;
    if (["png", "jpg", "jpeg", "gif", "webp"].includes(ext || ""))
      return <ImageIcon className="w-4 h-4 text-cyan-500" />;
    return <File className="w-4 h-4 text-primary" />;
  };

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-foreground">Course Content &amp; Modules</h2>
          <p className="text-xs text-muted">
            Organize lecture slides, documents, external links, and problem sets into sequential learning modules.
          </p>
        </div>

        {data.canManage && !data.isArchived && (
          <Button onClick={() => setIsCreateModuleOpen(true)} className="gap-1.5">
            <FolderPlus className="w-4 h-4" />
            <span>Create Module</span>
          </Button>
        )}
      </div>

      {data.isArchived && (
        <div className="p-4 rounded-xl border border-warning/30 bg-warning/10 text-foreground flex items-center gap-3 text-xs">
          <Lock className="w-5 h-5 text-warning shrink-0" />
          <div>
            <span className="font-bold block">Course Offering Archived</span>
            <span>
              This offering is archived. Modifying, uploading, or deleting materials and modules is permanently disabled.
            </span>
          </div>
        </div>
      )}

      {/* Modules List */}
      {modules.length === 0 ? (
        <EmptyState
          icon={FolderPlus}
          title="No Learning Modules Yet"
          description="Create your first module (e.g. 'Module 1: Introduction & Basic Concepts') to begin uploading course materials."
          action={
            data.canManage && !data.isArchived
              ? {
                  label: "Create First Module",
                  onClick: () => setIsCreateModuleOpen(true),
                }
              : undefined
          }
          className="bg-surface py-12"
        />
      ) : (
        <div className="space-y-6">
          {modules.map((mod, modIdx) => (
            <div
              key={mod.id}
              className="rounded-2xl border border-border bg-surface overflow-hidden shadow-xs"
            >
              {/* Module Header Bar */}
              <div className="bg-surface-muted/60 p-4 border-b border-border flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="font-mono text-xs font-bold text-primary px-2 py-0.5 rounded bg-primary/10 border border-primary/20">
                    #{modIdx + 1}
                  </span>
                  <h3 className="text-sm font-bold text-foreground">{mod.title}</h3>
                  <span className="text-xs text-muted">
                    ({mod.materials.length} item{mod.materials.length === 1 ? "" : "s"})
                  </span>
                </div>

                {data.canManage && !data.isArchived && (
                  <div className="flex items-center gap-1">
                    {/* Accessible Up/Down Reorder Buttons */}
                    <button
                      type="button"
                      disabled={modIdx === 0}
                      onClick={() => handleMoveModule(modIdx, "up")}
                      aria-label={`Move ${mod.title} up`}
                      className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-surface disabled:opacity-30 disabled:pointer-events-none transition-colors"
                    >
                      <ChevronUp className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      disabled={modIdx === modules.length - 1}
                      onClick={() => handleMoveModule(modIdx, "down")}
                      aria-label={`Move ${mod.title} down`}
                      className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-surface disabled:opacity-30 disabled:pointer-events-none transition-colors"
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>

                    {/* Add Content Button */}
                    <button
                      type="button"
                      onClick={() => handleOpenAddMaterial(mod, "FILE")}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface border border-border text-foreground hover:bg-surface-muted text-xs font-semibold shadow-2xs transition-colors ml-1"
                    >
                      <Plus className="w-3.5 h-3.5 text-primary" />
                      <span>Add Material</span>
                    </button>

                    {/* Rename Module Button */}
                    <button
                      type="button"
                      onClick={() => {
                        setRenamingModule(mod);
                        setRenameTitle(mod.title);
                      }}
                      aria-label={`Rename ${mod.title}`}
                      title="Rename module"
                      className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-surface transition-colors"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>

                    {/* Delete Module Button */}
                    <button
                      type="button"
                      onClick={() => setDeletingModule(mod)}
                      aria-label={`Delete ${mod.title}`}
                      title="Delete module"
                      className="p-1.5 rounded-lg text-muted hover:text-danger hover:bg-danger/10 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Module Materials List */}
              {mod.materials.length === 0 ? (
                <div className="p-8 text-center text-xs text-muted italic">
                  No materials inside this module yet. Click &ldquo;Add Material&rdquo; above to upload files or links.
                </div>
              ) : (
                <div className="divide-y divide-border/60">
                  {mod.materials.map((mat, matIdx) => (
                    <div
                      key={mat.id}
                      className="p-4 flex flex-wrap items-center justify-between gap-3 hover:bg-surface-muted/20 transition-colors"
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-surface-muted border border-border flex items-center justify-center shrink-0 mt-0.5">
                          {getMaterialIcon(mat)}
                        </div>

                        <div className="space-y-0.5 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-bold text-foreground truncate">
                              {mat.title}
                            </span>
                            {mat.topicName && (
                              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-surface-muted text-muted border border-border">
                                <Tag className="w-2.5 h-2.5" />
                                <span>{mat.topicName}</span>
                              </span>
                            )}
                            <span
                              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                                mat.published
                                  ? "bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/20"
                                  : "bg-surface-muted text-muted border-border"
                              }`}
                            >
                              {mat.published ? "Published" : "Draft"}
                            </span>
                          </div>

                          {mat.description && (
                            <p className="text-xs text-muted line-clamp-1">
                              {mat.description}
                            </p>
                          )}

                          <div className="flex items-center gap-2 text-[11px] text-muted pt-0.5">
                            {mat.type === "FILE" && (
                              <>
                                <span>
                                  {mat.originalName} •{" "}
                                  {mat.sizeBytes
                                    ? `${(mat.sizeBytes / (1024 * 1024)).toFixed(1)} MB`
                                    : "File"}
                                </span>
                              </>
                            )}
                            {mat.url && (
                              <a
                                href={mat.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-primary hover:underline"
                              >
                                <span>Open link</span>
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Material Actions */}
                      <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                        {/* Download for file */}
                        {mat.fileKey && (
                          <a
                            href={`/api/materials/${mat.id}/download`}
                            aria-label={`Download ${mat.title}`}
                            className="p-1.5 rounded-lg border border-border bg-surface-muted hover:bg-border text-foreground transition-colors"
                            title="Download file"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </a>
                        )}

                        {data.canManage && !data.isArchived && (
                          <>
                            {/* Accessible Reorder Buttons for Materials */}
                            <button
                              type="button"
                              disabled={matIdx === 0}
                              onClick={() => handleMoveMaterial(modIdx, matIdx, "up")}
                              aria-label={`Move ${mat.title} up`}
                              className="p-1 rounded text-muted hover:text-foreground disabled:opacity-20 transition-colors"
                            >
                              <ChevronUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={matIdx === mod.materials.length - 1}
                              onClick={() => handleMoveMaterial(modIdx, matIdx, "down")}
                              aria-label={`Move ${mat.title} down`}
                              className="p-1 rounded text-muted hover:text-foreground disabled:opacity-20 transition-colors"
                            >
                              <ChevronDown className="w-3.5 h-3.5" />
                            </button>

                            {/* Publish toggle */}
                            <button
                              type="button"
                              onClick={() => handleTogglePublish(mat.id)}
                              aria-label={mat.published ? "Unpublish material" : "Publish material"}
                              className={`p-1.5 rounded-lg border transition-colors ${
                                mat.published
                                  ? "bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/20 hover:bg-teal-500/20"
                                  : "bg-surface-muted text-muted border-border hover:bg-border"
                              }`}
                              title={mat.published ? "Published (click to unpublish)" : "Draft (click to publish)"}
                            >
                              {mat.published ? (
                                <Eye className="w-3.5 h-3.5" />
                              ) : (
                                <EyeOff className="w-3.5 h-3.5" />
                              )}
                            </button>

                            {/* Edit material */}
                            <button
                              type="button"
                              onClick={() => handleStartEditMaterial(mat)}
                              aria-label={`Edit ${mat.title}`}
                              className="p-1.5 rounded-lg border border-border bg-surface-muted hover:bg-border text-foreground transition-colors"
                              title="Edit material"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>

                            {/* Delete material */}
                            <button
                              type="button"
                              onClick={() => setDeletingMaterialId(mat.id)}
                              aria-label={`Delete ${mat.title}`}
                              className="p-1.5 rounded-lg border border-border bg-surface-muted hover:bg-danger/10 hover:text-danger hover:border-danger/20 text-muted transition-colors"
                              title="Delete material"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* MODALS */}
      {/* ------------------------------------------------------------------- */}

      {/* 1. Create Module Modal */}
      <DialogPrimitive.Root open={isCreateModuleOpen} onOpenChange={setIsCreateModuleOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs animate-in fade-in" />
          <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-surface p-6 shadow-xl animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <DialogPrimitive.Title className="text-base font-bold text-foreground flex items-center gap-2">
                <FolderPlus className="w-4 h-4 text-primary" />
                <span>Create Learning Module</span>
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

            <form onSubmit={handleCreateModule} className="space-y-4 pt-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  Module Title
                </label>
                <input
                  type="text"
                  required
                  value={newModuleTitle}
                  onChange={(e) => setNewModuleTitle(e.target.value)}
                  placeholder="e.g., Module 1: Relational Algebra & Calculus"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-foreground text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
              </div>

              <div className="pt-3 border-t border-border flex items-center justify-end gap-2.5">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setIsCreateModuleOpen(false)}
                  disabled={isCreatingModule}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isCreatingModule}>
                  {isCreatingModule ? "Creating..." : "Create Module"}
                </Button>
              </div>
            </form>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      {/* 2. Rename Module Modal */}
      <DialogPrimitive.Root
        open={renamingModule !== null}
        onOpenChange={(open) => !open && setRenamingModule(null)}
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs animate-in fade-in" />
          <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-surface p-6 shadow-xl animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <DialogPrimitive.Title className="text-base font-bold text-foreground flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-primary" />
                <span>Rename Module</span>
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

            <form onSubmit={handleRenameModule} className="space-y-4 pt-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  Module Title
                </label>
                <input
                  type="text"
                  required
                  value={renameTitle}
                  onChange={(e) => setRenameTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-foreground text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
              </div>

              <div className="pt-3 border-t border-border flex items-center justify-end gap-2.5">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setRenamingModule(null)}
                  disabled={isRenamingModule}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isRenamingModule}>
                  {isRenamingModule ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </form>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      {/* 3. Add Material Modal (File, Link, Video) */}
      <DialogPrimitive.Root
        open={activeModuleForMaterial !== null}
        onOpenChange={(open) => !open && setActiveModuleForMaterial(null)}
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs animate-in fade-in" />
          <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-surface p-6 shadow-xl animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <DialogPrimitive.Title className="text-base font-bold text-foreground flex items-center gap-2">
                <Upload className="w-4 h-4 text-primary" />
                <span>Add Material to {activeModuleForMaterial?.title}</span>
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

            {/* Type selector tabs */}
            <div className="flex items-center gap-1.5 p-1 bg-surface-muted rounded-xl mt-4">
              <button
                type="button"
                onClick={() => setMaterialKind("FILE")}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                  materialKind === "FILE"
                    ? "bg-surface shadow-xs text-foreground"
                    : "text-muted hover:text-foreground"
                }`}
              >
                <Upload className="w-3.5 h-3.5 text-primary" />
                <span>File Upload</span>
              </button>
              <button
                type="button"
                onClick={() => setMaterialKind("LINK")}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                  materialKind === "LINK"
                    ? "bg-surface shadow-xs text-foreground"
                    : "text-muted hover:text-foreground"
                }`}
              >
                <LinkIcon className="w-3.5 h-3.5 text-blue-500" />
                <span>External Link</span>
              </button>
              <button
                type="button"
                onClick={() => setMaterialKind("VIDEO")}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                  materialKind === "VIDEO"
                    ? "bg-surface shadow-xs text-foreground"
                    : "text-muted hover:text-foreground"
                }`}
              >
                <Video className="w-3.5 h-3.5 text-purple-500" />
                <span>Video Link</span>
              </button>
            </div>

            <form onSubmit={handleCreateMaterial} className="space-y-4 pt-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  Material Title
                </label>
                <input
                  type="text"
                  required
                  value={matTitle}
                  onChange={(e) => setMatTitle(e.target.value)}
                  placeholder="e.g., Lecture 04: Normalization Techniques Slides"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-foreground text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
              </div>

              {materialKind === "FILE" ? (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">
                    Upload File (PDF, Office, Images, ZIP, Code)
                  </label>
                  <input
                    type="file"
                    required
                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                    className="w-full text-xs text-muted file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-border file:text-xs file:font-semibold file:bg-surface-muted file:text-foreground hover:file:bg-border cursor-pointer"
                  />
                  <p className="text-[11px] text-muted">
                    Max size: 50MB. Prohibited files (.exe, scripts) will be rejected.
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">
                    {materialKind === "VIDEO" ? "Video URL" : "Resource URL"} (http:// or https://)
                  </label>
                  <input
                    type="url"
                    required
                    value={matUrl}
                    onChange={(e) => setMatUrl(e.target.value)}
                    placeholder="https://example.com/lecture-recording"
                    className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-foreground text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  Description (Optional)
                </label>
                <textarea
                  rows={2}
                  value={matDescription}
                  onChange={(e) => setMatDescription(e.target.value)}
                  placeholder="Brief note or instructions for students..."
                  className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-foreground text-xs leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
              </div>

              {/* Topic grouping & inline topic creation */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  Topic Grouping (Optional)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={matTopicId}
                    onChange={(e) => {
                      setMatTopicId(e.target.value);
                      if (e.target.value) setMatNewTopic("");
                    }}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-surface text-foreground text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <option value="">Select Existing Topic...</option>
                    {data.topics.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>

                  <input
                    type="text"
                    value={matNewTopic}
                    onChange={(e) => {
                      setMatNewTopic(e.target.value);
                      if (e.target.value) setMatTopicId("");
                    }}
                    placeholder="Or enter new topic name..."
                    className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-surface text-foreground text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="matPublishedCheck"
                  checked={matPublished}
                  onChange={(e) => setMatPublished(e.target.checked)}
                  className="w-4 h-4 rounded border border-border text-primary focus:ring-primary"
                />
                <label
                  htmlFor="matPublishedCheck"
                  className="text-xs text-foreground cursor-pointer font-medium select-none"
                >
                  Publish immediately (visible to students)
                </label>
              </div>

              <div className="pt-3 border-t border-border flex items-center justify-end gap-2.5">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setActiveModuleForMaterial(null)}
                  disabled={isUploading}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isUploading}>
                  {isUploading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      <span>Processing...</span>
                    </>
                  ) : (
                    <span>Save Material</span>
                  )}
                </Button>
              </div>
            </form>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      {/* 4. Edit Material Modal */}
      <DialogPrimitive.Root
        open={editingMaterial !== null}
        onOpenChange={(open) => !open && setEditingMaterial(null)}
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs animate-in fade-in" />
          <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-surface p-6 shadow-xl animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <DialogPrimitive.Title className="text-base font-bold text-foreground flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-primary" />
                <span>Edit Material</span>
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

            <form onSubmit={handleUpdateMaterial} className="space-y-4 pt-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  Title
                </label>
                <input
                  type="text"
                  required
                  value={editMatTitle}
                  onChange={(e) => setEditMatTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-foreground text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
              </div>

              {editingMaterial?.type !== "FILE" && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">
                    URL
                  </label>
                  <input
                    type="url"
                    required
                    value={editMatUrl}
                    onChange={(e) => setEditMatUrl(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-foreground text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  Description
                </label>
                <textarea
                  rows={3}
                  value={editMatDescription}
                  onChange={(e) => setEditMatDescription(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-foreground text-xs leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
              </div>

              <div className="pt-3 border-t border-border flex items-center justify-end gap-2.5">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setEditingMaterial(null)}
                  disabled={isUpdatingMaterial}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isUpdatingMaterial}>
                  {isUpdatingMaterial ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </form>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      {/* Delete Module Confirmation Dialog */}
      <ConfirmDialog
        open={deletingModule !== null}
        onOpenChange={(open) => !open && setDeletingModule(null)}
        title="Delete Module"
        description={`Are you sure you want to delete module "${deletingModule?.title}"? Any materials inside will be safely moved to an "Unsorted" module.`}
        confirmLabel="Delete Module"
        isDestructive={true}
        isLoading={isDeletingModule}
        onConfirm={handleDeleteModule}
      />

      {/* Delete Material Confirmation Dialog */}
      <ConfirmDialog
        open={deletingMaterialId !== null}
        onOpenChange={(open) => !open && setDeletingMaterialId(null)}
        title="Delete Material"
        description="Are you sure you want to permanently delete this course material and its associated storage file?"
        confirmLabel="Delete"
        isDestructive={true}
        isLoading={isDeletingMaterial}
        onConfirm={handleDeleteMaterial}
      />
    </div>
  );
}
