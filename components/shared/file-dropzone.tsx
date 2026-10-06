"use client";

import * as React from "react";
import { UploadCloud, FileText, X, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { ProgressBar } from "@/components/shared/progress-bar";

export interface SelectedFile {
  id: string;
  file: File;
  name: string;
  size: number;
  progress: number;
  error?: string;
}

export interface FileDropzoneProps {
  allowedExtensions?: string[]; // e.g. ["pdf", "docx", "zip"]
  maxSizeMB?: number; // e.g. 10
  multiple?: boolean;
  value?: SelectedFile[];
  onChange?: (files: SelectedFile[]) => void;
  className?: string;
  disabled?: boolean;
}

export function FileDropzone({
  allowedExtensions = ["pdf", "docx", "zip"],
  maxSizeMB = 10,
  multiple = false,
  value,
  onChange,
  className,
  disabled = false,
}: FileDropzoneProps) {
  const [internalFiles, setInternalFiles] = React.useState<SelectedFile[]>([]);
  const files = value ?? internalFiles;

  const [isDragOver, setIsDragOver] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  const allowedExtFormatted = allowedExtensions
    .map((e) => e.toUpperCase().replace(/^\./, ""))
    .join(", ");

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleFiles = (incomingFiles: FileList | File[]) => {
    if (disabled) return;

    const newSelected: SelectedFile[] = [];

    Array.from(incomingFiles).forEach((file) => {
      const ext = file.name.split(".").pop()?.toLowerCase() || "";
      const isAllowed = allowedExtensions.some(
        (allowed) => allowed.toLowerCase().replace(/^\./, "") === ext
      );

      let error: string | undefined;
      if (!isAllowed) {
        error = `Invalid format. Allowed: ${allowedExtFormatted}.`;
      } else if (file.size > maxSizeBytes) {
        error = `File size is ${(file.size / (1024 * 1024)).toFixed(1)} MB. Max allowed is ${maxSizeMB} MB.`;
      }

      newSelected.push({
        id: `${file.name}-${file.lastModified}-${Math.random()}`,
        file,
        name: file.name,
        size: file.size,
        progress: error ? 0 : 100, // Ready or error
        error,
      });
    });

    const updated = multiple ? [...files, ...newSelected] : newSelected;
    if (onChange) {
      onChange(updated);
    } else {
      setInternalFiles(updated);
    }
  };

  const handleRemove = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = files.filter((f) => f.id !== id);
    if (onChange) {
      onChange(updated);
    } else {
      setInternalFiles(updated);
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setIsDragOver(true);
  };

  const onDragLeave = () => {
    setIsDragOver(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  return (
    <div className={cn("w-full space-y-4", className)}>
      {/* Drop area */}
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (!disabled && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={cn(
          "w-full rounded-[10px] border-2 border-dashed p-6 sm:p-8 flex flex-col items-center justify-center text-center transition-colors cursor-pointer select-none",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          isDragOver
            ? "border-primary bg-primary/5 dark:bg-primary/10"
            : "border-border bg-surface hover:border-muted/60",
          disabled && "opacity-50 cursor-not-allowed pointer-events-none"
        )}
      >
        <input
          ref={inputRef}
          type="file"
          multiple={multiple}
          onChange={(e) => {
            if (e.target.files) handleFiles(e.target.files);
            e.target.value = "";
          }}
          className="hidden"
          accept={allowedExtensions
            .map((ext) => `.${ext.replace(/^\./, "")}`)
            .join(",")}
        />

        <div className="w-12 h-12 rounded-full bg-surface-muted flex items-center justify-center text-muted mb-3">
          <UploadCloud className="w-6 h-6 text-primary" aria-hidden="true" />
        </div>

        <p className="text-sm font-medium text-foreground">
          <span className="text-primary hover:underline">Click to upload</span>{" "}
          or drag and drop
        </p>

        <p className="mt-1 text-xs text-muted">
          Allowed:{" "}
          <span className="font-medium text-foreground">
            {allowedExtFormatted}
          </span>{" "}
          · Max:{" "}
          <span className="font-medium text-foreground">{maxSizeMB} MB</span>
        </p>
      </div>

      {/* Selected file list */}
      {files.length > 0 && (
        <ul className="space-y-2.5" aria-label="Selected files">
          {files.map((item) => (
            <li
              key={item.id}
              className={cn(
                "rounded-[10px] border p-3 bg-surface flex flex-col gap-2 transition-colors",
                item.error ? "border-danger/40 bg-danger/5" : "border-border"
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                      item.error
                        ? "bg-danger/10 text-danger"
                        : "bg-surface-muted text-muted"
                    )}
                  >
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="truncate">
                    <p className="text-sm font-medium text-foreground truncate font-mono">
                      {item.name}
                    </p>
                    <p className="text-xs text-muted tabular-nums">
                      {formatFileSize(item.size)}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={(e) => handleRemove(item.id, e)}
                  aria-label={`Remove ${item.name}`}
                  className="w-8 h-8 rounded-md text-muted hover:text-danger hover:bg-surface-muted flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {item.error ? (
                <p className="flex items-center gap-1.5 text-xs text-danger font-medium">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{item.error}</span>
                </p>
              ) : (
                <ProgressBar
                  value={item.progress}
                  showPercent={false}
                  barClassName="bg-primary"
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
