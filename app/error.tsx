"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/shared/theme-toggle";

export default function RootErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="min-h-screen flex flex-col justify-between p-6 sm:p-10 bg-background text-foreground">
      {/* Top Header */}
      <header className="flex items-center justify-between w-full max-w-xl mx-auto">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="relative w-8 h-10 shrink-0">
            <Image
              src="/images/ruet-logo.webp"
              alt="RUET Logo"
              fill
              className="object-contain"
            />
          </div>
          <div>
            <span className="text-xs uppercase tracking-widest text-primary font-semibold block leading-tight">
              Rajshahi University of Eng. & Tech.
            </span>
            <span className="text-base font-bold text-foreground block">
              RUET ELMS
            </span>
          </div>
        </Link>
        <ThemeToggle />
      </header>

      {/* Main 500 Error Card */}
      <div className="w-full max-w-md mx-auto my-auto py-8">
        <div className="p-8 rounded-2xl border border-border bg-surface shadow-sm text-center">
          <div className="w-16 h-16 rounded-full bg-danger/10 text-danger flex items-center justify-center mx-auto mb-5">
            <AlertTriangle className="w-8 h-8" />
          </div>

          <span className="text-xs font-mono uppercase tracking-widest text-danger font-semibold block mb-1">
            HTTP 500 • Internal Error
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-foreground mb-2">
            Something went wrong
          </h1>
          <p className="text-xs text-muted leading-relaxed mb-6">
            An unexpected error occurred while processing your request. Please try reloading the page, or return to the dashboard.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() => reset()}
              className="w-full sm:w-auto min-h-[44px]"
            >
              <RotateCcw className="w-4 h-4 mr-1.5" />
              <span>Try Again</span>
            </Button>
            <Link
              href="/dashboard"
              className="w-full sm:w-auto min-h-[44px] px-5 inline-flex items-center justify-center gap-2 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-semibold shadow-xs transition-colors"
            >
              <Home className="w-4 h-4" />
              <span>Go to Dashboard</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="w-full max-w-md mx-auto text-center text-xs text-muted pt-6">
        <p>© {new Date().getFullYear()} Rajshahi University of Engineering &amp; Technology</p>
      </footer>
    </main>
  );
}
