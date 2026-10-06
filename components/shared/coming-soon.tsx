import * as React from "react";
import Link from "next/link";
import { Construction, ArrowLeft, Home } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";

interface ComingSoonProps {
  title: string;
  description?: string;
  breadcrumb?: { label: string; href?: string }[];
}

export function ComingSoon({
  title,
  description = "This module is part of upcoming implementation steps and will be available soon.",
  breadcrumb,
}: ComingSoonProps) {
  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        subtitle="Module Scheduled for Future Phase"
        breadcrumbs={
          breadcrumb || [{ label: "Dashboard", href: "/dashboard" }, { label: title }]
        }
      />

      <div className="p-12 rounded-2xl border border-dashed border-border bg-surface text-center flex flex-col items-center justify-center min-h-[360px]">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-4">
          <Construction className="w-8 h-8" />
        </div>

        <h2 className="text-xl font-bold text-foreground mb-1.5">{title}</h2>
        <p className="text-sm text-muted max-w-md mb-6 leading-relaxed">
          {description}
        </p>

        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary hover:bg-primary-hover text-white text-xs font-semibold shadow-xs transition-colors"
          >
            <Home className="w-3.5 h-3.5" />
            <span>Go to Dashboard</span>
          </Link>

          <Link
            href="/profile"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-surface-muted hover:bg-border text-foreground text-xs font-medium border border-border transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>View Profile</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
