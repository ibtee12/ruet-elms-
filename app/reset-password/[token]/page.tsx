import * as React from "react";
import Link from "next/link";
import { GraduationCap, ArrowLeft, ShieldAlert } from "lucide-react";
import { validateResetToken } from "@/services/password-reset.service";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { ResetPasswordForm } from "./reset-password-form";

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function ResetPasswordPage({ params }: PageProps) {
  const { token } = await params;
  const validation = await validateResetToken(token);

  return (
    <main className="min-h-screen flex flex-col justify-between p-6 sm:p-10 bg-background text-foreground">
      {/* Header */}
      <header className="flex items-center justify-between w-full max-w-xl mx-auto">
        <Link href="/login" className="flex items-center gap-2.5 group">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-white shadow-sm transition-transform group-hover:scale-105">
            <GraduationCap className="w-6 h-6" />
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

      {/* Main Container */}
      <div className="w-full max-w-md mx-auto my-auto py-8">
        <div className="p-8 rounded-2xl border border-border bg-surface shadow-sm text-left">
          {!validation.valid ? (
            <div className="space-y-6 text-center">
              <div className="w-14 h-14 rounded-full bg-danger/10 text-danger flex items-center justify-center mx-auto">
                <ShieldAlert className="w-7 h-7" />
              </div>

              <div className="space-y-2">
                <h1 className="text-xl font-bold tracking-tight text-foreground">
                  Reset Link Unavailable
                </h1>
                <p className="text-xs text-muted leading-relaxed">
                  {validation.error ||
                    "This password reset link is invalid, has already been used, or has expired after 30 minutes."}
                </p>
              </div>

              <div className="space-y-3 pt-2">
                <Link
                  href="/forgot-password"
                  className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-semibold shadow-xs transition-colors"
                >
                  <span>Request a New Reset Link</span>
                </Link>

                <Link
                  href="/login"
                  className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-lg bg-surface-muted hover:bg-border text-foreground text-sm font-medium border border-border transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back to Sign In</span>
                </Link>
              </div>
            </div>
          ) : (
            <div>
              <div className="mb-6">
                <h1 className="text-2xl font-bold tracking-tight text-foreground mb-1.5">
                  Set a new password
                </h1>
                <p className="text-xs text-muted">
                  Choose a secure password for{" "}
                  <strong className="text-foreground">{validation.userEmail}</strong>.
                </p>
              </div>

              <ResetPasswordForm
                token={token}
                context={{
                  email: validation.userEmail,
                  studentId: validation.studentId,
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="w-full max-w-md mx-auto text-center text-xs text-muted pt-6">
        <p>© {new Date().getFullYear()} Rajshahi University of Engineering &amp; Technology</p>
      </footer>
    </main>
  );
}
