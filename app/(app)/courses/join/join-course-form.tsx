"use client";

import * as React from "react";
import Link from "next/link";
import { KeyRound, ArrowRight, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { joinByCodeAction } from "@/actions/enrollment";
import { toast } from "@/lib/toast";

export function JoinCourseForm() {
  const [code, setCode] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [successResult, setSuccessResult] = React.useState<{
    offeringId: string;
    courseCode: string;
    courseTitle: string;
    sectionName: string;
  } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) {
      setError("Please enter a valid join code.");
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      const res = await joinByCodeAction(trimmed);
      if (!res.success) {
        setError(res.error);
        toast.error("Could not join course", res.error);
        return;
      }

      setSuccessResult(res);
      toast.success(`Enrolled in ${res.courseCode}!`, `You are assigned to ${res.sectionName}.`);
    } catch {
      setError("An unexpected error occurred. Please try again later.");
    } finally {
      setIsLoading(false);
    }
  };

  if (successResult) {
    return (
      <div className="p-8 rounded-2xl border border-success/30 bg-success/5 shadow-xs text-center space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-success/10 text-success flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-8 h-8" />
        </div>

        <div className="space-y-1">
          <h2 className="text-xl font-bold text-foreground">Enrollment Successful!</h2>
          <p className="text-xs text-muted">
            You are now actively enrolled in this course offering.
          </p>
        </div>

        <div className="p-4 rounded-xl border border-border bg-surface max-w-sm mx-auto text-left space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-mono font-bold text-sm text-primary">
              {successResult.courseCode}
            </span>
            <span className="text-xs px-2 py-0.5 rounded bg-surface-muted border border-border font-medium">
              {successResult.sectionName}
            </span>
          </div>
          <div className="text-xs font-semibold text-foreground">
            {successResult.courseTitle}
          </div>
        </div>

        <div className="pt-2 flex items-center justify-center gap-3">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              setSuccessResult(null);
              setCode("");
            }}
            className="text-xs"
          >
            Join Another Course
          </Button>

          <Link
            href="/courses"
            className="inline-flex items-center justify-center min-h-[36px] px-4 py-1.5 rounded-lg bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-semibold transition-colors shadow-xs"
          >
            <span>View My Courses</span>
            <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="p-6 rounded-2xl border border-border bg-surface shadow-xs space-y-5"
    >
      <div className="flex items-start gap-3.5">
        <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <KeyRound className="w-5 h-5" />
        </div>
        <div className="space-y-1">
          <h2 className="text-base font-bold text-foreground">Course Invitation Code</h2>
          <p className="text-xs text-muted leading-relaxed">
            Course instructors provide a unique code (e.g., <code className="font-mono font-semibold text-foreground">RUET-3FA9C1</code> or <code className="font-mono font-semibold text-foreground">DBMS-2026-EVEN</code>) to allow student self-enrollment.
          </p>
        </div>
      </div>

      {error && (
        <div
          id="join-code-error"
          role="alert"
          aria-live="assertive"
          className="p-3.5 rounded-xl border border-danger/20 bg-danger/10 text-danger text-xs flex items-center gap-2.5"
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="space-y-1.5">
        <label htmlFor="join-code-input" className="text-xs font-semibold text-foreground block">
          Enter Join Code
        </label>
        <Input
          id="join-code-input"
          type="text"
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase());
            setError(null);
          }}
          placeholder="e.g. RUET-3205"
          className="h-11 font-mono text-sm tracking-wider uppercase bg-surface"
          disabled={isLoading}
          autoFocus
          maxLength={32}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "join-code-error join-code-helper" : "join-code-helper"}
        />
        <p id="join-code-helper" className="text-[11px] text-muted">
          Codes are case-insensitive. Too many failed attempts will temporarily lock self-enrollment.
        </p>
      </div>

      <div className="pt-2 flex items-center justify-between">
        <Link
          href="/courses"
          className="text-xs text-muted hover:text-foreground font-medium transition-colors"
        >
          Cancel
        </Link>
        <Button
          type="submit"
          disabled={isLoading || !code.trim()}
          className="text-xs font-semibold px-5"
        >
          {isLoading ? "Validating & Joining..." : "Join Course"}
        </Button>
      </div>
    </form>
  );
}
