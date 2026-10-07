"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Mail, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { requestPasswordResetAction } from "@/actions/auth";

export default function ForgotPasswordPage() {
  const [email, setEmail] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [submittedMessage, setSubmittedMessage] = React.useState<string | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setErrorMessage("Please enter your institutional email address.");
      return;
    }

    setIsLoading(true);

    try {
      const result = await requestPasswordResetAction(trimmedEmail);
      if (!result.success && "error" in result && result.error) {
        setErrorMessage(result.error);
        return;
      }
      setSubmittedMessage(
        result.message ||
          "If an account exists with that email address, you will receive password reset instructions shortly."
      );
    } catch {
      // Even on unexpected errors, preserve constant generic response
      setSubmittedMessage(
        "If an account exists with that email address, you will receive password reset instructions shortly."
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex flex-col justify-between p-6 sm:p-10 bg-background text-foreground">
      {/* Top bar with RUET ELMS branding & Theme toggle */}
      <header className="flex items-center justify-between w-full max-w-xl mx-auto">
        <Link href="/login" className="flex items-center gap-3 group">
          <div className="relative w-8 h-10 shrink-0 transition-transform group-hover:scale-105">
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

      {/* Main card */}
      <div className="w-full max-w-md mx-auto my-auto py-8">
        <div className="p-8 rounded-2xl border border-border bg-surface shadow-sm text-left">
          <div className="mb-6">
            <h1 className="text-2xl font-bold tracking-tight text-foreground mb-2">
              Forgot your password?
            </h1>
            <p className="text-sm text-muted">
              Enter your registered institutional email. We will send you a single-use link to reset your password.
            </p>
          </div>

          {submittedMessage ? (
            <div className="space-y-6">
              <div
                role="alert"
                className="p-4 rounded-xl border border-success/30 bg-success/10 text-foreground flex items-start gap-3"
              >
                <CheckCircle2 className="w-5 h-5 text-success shrink-0 mt-0.5" />
                <div className="space-y-1 text-sm">
                  <span className="font-semibold block text-success">
                    Instructions Sent
                  </span>
                  <p className="text-xs text-muted leading-relaxed">
                    {submittedMessage}
                  </p>
                  <p className="text-xs text-muted pt-1">
                    Please check your inbox (and spam folder). The link will expire in <strong>30 minutes</strong>.
                  </p>
                </div>
              </div>

              <Link
                href="/login"
                className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-lg bg-surface-muted hover:bg-border text-foreground text-sm font-semibold border border-border transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Return to Sign In</span>
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
              {errorMessage && (
                <div
                  role="alert"
                  className="p-3.5 rounded-xl border border-danger/30 bg-danger/10 text-danger text-sm flex items-center gap-2"
                >
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <div className="space-y-1.5 text-left">
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-foreground"
                >
                  Institutional Email <span className="text-danger">*</span>
                </label>
                <div className="relative">
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="e.g., student@ruet.ac.bd"
                    disabled={isLoading}
                    className="w-full rounded-[10px] border border-border bg-surface pl-10 pr-3.5 py-2.5 text-base sm:text-sm text-foreground placeholder:text-muted/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  <Mail className="w-4 h-4 text-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
                <p className="text-xs text-muted">
                  Use your official university email (e.g., @ruet.ac.bd or @student.ruet.ac.bd).
                </p>
              </div>

              <Button
                type="submit"
                variant="primary"
                isLoading={isLoading}
                className="w-full min-h-[44px] text-sm font-semibold tracking-wide shadow-sm mt-2"
              >
                Send Reset Link
              </Button>

              <div className="pt-4 text-center border-t border-border">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary-hover hover:underline"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to Sign In</span>
                </Link>
              </div>
            </form>
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
