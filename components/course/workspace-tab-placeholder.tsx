import * as React from "react";
import { type LucideIcon, Sparkles } from "lucide-react";

interface WorkspaceTabPlaceholderProps {
  title: string;
  description: string;
  icon: LucideIcon;
  badge?: string;
  actionHint?: string;
}

export function WorkspaceTabPlaceholder({
  title,
  description,
  icon: Icon,
  badge = "Feature in Development",
  actionHint,
}: WorkspaceTabPlaceholderProps) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-surface/50 p-8 sm:p-12 text-center flex flex-col items-center justify-center min-h-[320px] transition-colors">
      <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-4 ring-8 ring-primary/5">
        <Icon className="w-7 h-7" aria-hidden="true" />
      </div>

      <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-primary/10 text-primary border border-primary/20 mb-3">
        <Sparkles className="w-3 h-3" />
        <span>{badge}</span>
      </div>

      <h2 className="text-lg font-bold text-foreground mb-1.5">{title}</h2>
      <p className="text-xs sm:text-sm text-muted max-w-md mb-4 leading-relaxed">
        {description}
      </p>

      {actionHint && (
        <p className="text-xs text-muted/80 bg-surface-muted/60 px-3.5 py-1.5 rounded-lg border border-border/60">
          {actionHint}
        </p>
      )}
    </div>
  );
}
