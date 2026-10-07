import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { FileQuestion, ArrowLeft, Home } from "lucide-react";
import { ThemeToggle } from "@/components/shared/theme-toggle";

export default function NotFoundPage() {
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

      {/* Main 404 Card */}
      <div className="w-full max-w-md mx-auto my-auto py-8">
        <div className="p-8 rounded-2xl border border-border bg-surface shadow-sm text-center">
          <div className="w-16 h-16 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto mb-5">
            <FileQuestion className="w-8 h-8" />
          </div>

          <span className="text-xs font-mono uppercase tracking-widest text-primary font-semibold block mb-1">
            HTTP 404 • Not Found
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-foreground mb-2">
            Page Not Found
          </h1>
          <p className="text-xs text-muted leading-relaxed mb-6">
            The page or course resource you are looking for does not exist, has been archived, or may have moved to a different address.
          </p>

          <div className="space-y-3">
            <Link
              href="/dashboard"
              className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-semibold shadow-xs transition-colors"
            >
              <Home className="w-4 h-4" />
              <span>Go to Your Dashboard</span>
            </Link>

            <Link
              href="/"
              className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-lg bg-surface-muted hover:bg-border text-foreground text-sm font-medium border border-border transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Return to Home</span>
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
