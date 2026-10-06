"use client";

import * as React from "react";
import Link from "next/link";
import { ShieldAlert, AlertTriangle, RotateCcw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isForbidden =
    error.message?.includes("Forbidden") ||
    error.message?.includes("Access denied") ||
    error.message?.includes("403") ||
    error.name === "ForbiddenError";

  if (isForbidden) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-4">
        <div className="w-full max-w-md p-8 rounded-2xl border border-border bg-surface shadow-sm text-center">
          <div className="w-16 h-16 rounded-full bg-danger/10 text-danger flex items-center justify-center mx-auto mb-5">
            <ShieldAlert className="w-8 h-8" />
          </div>

          <span className="text-xs font-mono uppercase tracking-widest text-danger font-semibold block mb-1">
            HTTP 403 • Forbidden
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-foreground mb-2">
            Access Denied
          </h1>
          <p className="text-xs text-muted leading-relaxed mb-6">
            {error.message ||
              "Your user role does not have authorization to view this resource. If you believe this is an error, please contact your department administrator."}
          </p>

          <div className="space-y-3">
            <Link
              href="/dashboard"
              className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-semibold shadow-xs transition-colors"
            >
              <Home className="w-4 h-4" />
              <span>Return to Dashboard</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-4">
      <div className="w-full max-w-md p-8 rounded-2xl border border-border bg-surface shadow-sm text-center">
        <div className="w-16 h-16 rounded-full bg-warning/10 text-warning flex items-center justify-center mx-auto mb-5">
          <AlertTriangle className="w-8 h-8" />
        </div>

        <h1 className="text-xl font-bold tracking-tight text-foreground mb-2">
          Something went wrong
        </h1>
        <p className="text-xs text-muted leading-relaxed mb-6">
          An unexpected error occurred while loading this page. Our technical team has been notified.
        </p>

        <div className="flex items-center justify-center gap-3">
          <Button type="button" variant="secondary" onClick={() => reset()}>
            <RotateCcw className="w-4 h-4 mr-1.5" />
            <span>Try Again</span>
          </Button>
          <Link
            href="/dashboard"
            className="min-h-[40px] px-4 inline-flex items-center justify-center gap-1.5 rounded-md bg-primary hover:bg-primary-hover text-white text-sm font-medium transition-colors"
          >
            <Home className="w-4 h-4" />
            <span>Dashboard</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
