"use client";

import * as React from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  GraduationCap,
  Eye,
  EyeOff,
  AlertCircle,
  BookOpen,
  FileCheck2,
  Bell,
  UserCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/shared/theme-toggle";

export default function LoginPage() {
  return (
    <React.Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      }
    >
      <LoginForm />
    </React.Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/";

  const [identifier, setIdentifier] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  // Check if NextAuth passed an error in the query string
  React.useEffect(() => {
    const errorParam = searchParams.get("error");
    if (errorParam) {
      if (
        errorParam.toLowerCase().includes("rate") ||
        errorParam.toLowerCase().includes("lockout")
      ) {
        setErrorMessage(
          "Too many failed login attempts. Please try again in 15 minutes."
        );
      } else {
        setErrorMessage("Incorrect ID or password");
      }
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedId = identifier.trim();
    if (!trimmedId || !password) {
      setErrorMessage("Incorrect ID or password");
      return;
    }

    setIsLoading(true);

    try {
      const result = await signIn("credentials", {
        identifier: trimmedId,
        password,
        redirect: false,
      });

      if (!result || result.error) {
        // Clear password on failed attempt
        setPassword("");

        if (
          result?.error?.includes("Too many failed") ||
          result?.error?.includes("RATE_LIMIT")
        ) {
          setErrorMessage(
            "Too many failed login attempts. Please try again in 15 minutes."
          );
        } else {
          setErrorMessage("Incorrect ID or password");
        }
        setIsLoading(false);
        return;
      }

      // Successful login
      router.push(callbackUrl);
      router.refresh();
    } catch {
      setErrorMessage("Incorrect ID or password");
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen grid grid-cols-1 lg:grid-cols-12 bg-background">
      {/* LEFT PANEL: Academic Brand & Institution Identity (Desktop 5 cols) */}
      <aside className="hidden lg:flex lg:col-span-5 bg-[#0F2A4A] dark:bg-[#0A1B33] text-white flex-col justify-between p-10 xl:p-14 relative overflow-hidden border-r border-[#1E3A5F]">
        {/* Subtle academic background pattern */}
        <div className="absolute inset-0 opacity-5 pointer-events-none bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:20px_20px]" />

        {/* Top Header */}
        <div className="relative z-10">
          <div className="flex items-center gap-3.5 mb-8">
            <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center text-white shadow-md">
              <GraduationCap className="w-7 h-7" />
            </div>
            <div>
              <span className="text-xs uppercase tracking-widest text-teal-300 font-semibold block">
                Rajshahi University of Eng. & Tech.
              </span>
              <span className="text-xl font-bold tracking-tight text-white block">
                RUET ELMS
              </span>
            </div>
          </div>

          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-[#163860] text-teal-200 border border-teal-500/30 mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" />
            <span>Academic Portal • Even Term 2026</span>
          </div>

          <h2 className="text-2xl xl:text-3xl font-bold text-white tracking-tight leading-snug mb-4">
            Unified digital workspace for learning, teaching, and academic
            excellence.
          </h2>
          <p className="text-slate-300 text-sm xl:text-base leading-relaxed">
            Access your course materials, submit assignments, take objective
            quizzes, and interact with departmental faculty members.
          </p>
        </div>

        {/* Middle Feature Highlights */}
        <div className="relative z-10 space-y-4 my-8">
          <div className="flex items-start gap-3.5 p-3 rounded-lg bg-white/5 border border-white/10">
            <div className="p-2 rounded-md bg-teal-500/20 text-teal-300 shrink-0">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">
                Course Materials &amp; Modules
              </h3>
              <p className="text-xs text-slate-300">
                Synchronized syllabus, lecture notes, and media modules.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3.5 p-3 rounded-lg bg-white/5 border border-white/10">
            <div className="p-2 rounded-md bg-teal-500/20 text-teal-300 shrink-0">
              <FileCheck2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">
                Assignments &amp; Deadlines
              </h3>
              <p className="text-xs text-slate-300">
                Reliable deadline tracking with server-authoritative submission
                logging.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3.5 p-3 rounded-lg bg-white/5 border border-white/10">
            <div className="p-2 rounded-md bg-teal-500/20 text-teal-300 shrink-0">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">
                Departmental Notices
              </h3>
              <p className="text-xs text-slate-300">
                Official notices verified by department administrators.
              </p>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div className="relative z-10 pt-6 border-t border-white/10 flex items-center justify-between text-xs text-slate-400">
          <span>Kazla, Rajshahi-6204, Bangladesh</span>
          <span>Founded 1964</span>
        </div>
      </aside>

      {/* RIGHT PANEL: Sign-in Form (7 cols on desktop, full on mobile) */}
      <section className="lg:col-span-7 flex flex-col justify-between p-6 sm:p-10 lg:p-12 xl:p-16">
        {/* Top utility row: mobile branding + Theme toggle */}
        <div className="flex items-center justify-between w-full max-w-md mx-auto">
          <div className="flex lg:hidden items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center text-white shadow-sm">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div>
              <span className="text-base font-bold text-foreground block leading-tight">
                RUET ELMS
              </span>
              <span className="text-[10px] text-muted block">
                Academic Portal
              </span>
            </div>
          </div>

          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </div>

        {/* Main form container (centered) */}
        <div className="w-full max-w-md mx-auto my-auto py-8">
          <div className="mb-8">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground mb-2">
              Sign in to your account
            </h1>
            <p className="text-sm text-muted">
              Enter your Institutional Email or Student ID to continue.
            </p>
          </div>

          {/* Error Alert Banner */}
          {errorMessage && (
            <div
              role="alert"
              aria-live="polite"
              className="mb-6 p-4 rounded-xl border border-danger/30 bg-danger/10 text-danger flex items-start gap-3 transition-all animate-in fade-in duration-200"
            >
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="space-y-0.5 text-sm">
                <span className="font-semibold block">{errorMessage}</span>
                {errorMessage.includes("15 minutes") && (
                  <span className="text-xs text-foreground/80 block">
                    Security lock active. Too many consecutive failed attempts.
                  </span>
                )}
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            {/* Student ID or Email Input */}
            <div className="space-y-1.5 text-left">
              <label
                htmlFor="identifier"
                className="block text-sm font-medium text-foreground"
              >
                Student ID or Email <span className="text-danger">*</span>
              </label>
              <input
                id="identifier"
                name="identifier"
                type="text"
                autoComplete="username"
                required
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="e.g., 2203001 or name@ruet.ac.bd"
                disabled={isLoading}
                className="w-full rounded-[10px] border border-border bg-surface px-3.5 py-2.5 text-base sm:text-sm text-foreground placeholder:text-muted/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              />
              <p className="text-xs text-muted">
                Students can use their 7-digit ID (e.g., 2203001) or university
                email.
              </p>
            </div>

            {/* Password Input with Show/Hide toggle */}
            <div className="space-y-1.5 text-left">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-foreground"
                >
                  Password <span className="text-danger">*</span>
                </label>
                <Link
                  href="/forgot-password"
                  className="text-xs font-medium text-primary hover:text-primary-hover hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  disabled={isLoading}
                  className="w-full rounded-[10px] border border-border bg-surface pl-3.5 pr-11 py-2.5 text-base sm:text-sm text-foreground placeholder:text-muted/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={isLoading}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              variant="primary"
              isLoading={isLoading}
              className="w-full min-h-[44px] text-sm font-semibold tracking-wide shadow-sm mt-2"
            >
              Sign in
            </Button>
          </form>

          {/* Quick seeded credential hints (dev convenience) */}
          <div className="mt-8 pt-6 border-t border-border">
            <details className="text-xs text-muted group cursor-pointer">
              <summary className="font-medium hover:text-foreground list-none flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5 text-primary" />
                  <span>View seeded demo credentials</span>
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-muted border border-border">
                  Dev Seeds
                </span>
              </summary>
              <div className="mt-3 p-3 rounded-lg bg-surface-muted border border-border/70 space-y-2 text-foreground/90 font-mono text-[11px]">
                <div className="flex justify-between">
                  <span className="text-muted">Student:</span>
                  <span>2203001 (or 2203001@student.ruet.ac.bd)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Teacher:</span>
                  <span>arahman@cse.ruet.ac.bd</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Admin:</span>
                  <span>admin@ruet.ac.bd</span>
                </div>
                <div className="flex justify-between border-t border-border pt-1.5 text-primary font-semibold">
                  <span>Password:</span>
                  <span>Password123!</span>
                </div>
              </div>
            </details>
          </div>
        </div>

        {/* Bottom copyright footer */}
        <div className="w-full max-w-md mx-auto text-center text-xs text-muted pt-6">
          <p>
            © {new Date().getFullYear()} Rajshahi University of Engineering
            &amp; Technology
          </p>
          <p className="text-[11px] text-muted/70 mt-0.5">
            Enterprise Learning Management System • All rights reserved
          </p>
        </div>
      </section>
    </main>
  );
}
