import * as React from "react";
import { type LucideIcon, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick?: () => void;
    href?: string;
  };
  className?: string;
}

export function EmptyState({
  icon: Icon = FolderOpen,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "rounded-[10px] border border-dashed border-border bg-surface/50 p-8 sm:p-12 flex flex-col items-center justify-center text-center",
        className
      )}
    >
      <div className="w-12 h-12 rounded-full bg-surface-muted flex items-center justify-center text-muted mb-4">
        <Icon className="w-6 h-6" aria-hidden="true" />
      </div>

      <h3 className="text-base font-semibold text-foreground mb-1">{title}</h3>
      <p className="text-sm text-muted max-w-[48ch] mb-6 leading-relaxed">
        {description}
      </p>

      {action &&
        (action.href ? (
          <a
            href={action.href}
            className="inline-flex items-center justify-center min-h-[40px] px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:bg-primary-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {action.label}
          </a>
        ) : (
          <button
            type="button"
            onClick={action.onClick}
            className="inline-flex items-center justify-center min-h-[40px] px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:bg-primary-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {action.label}
          </button>
        ))}
    </div>
  );
}
