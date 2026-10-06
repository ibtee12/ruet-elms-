"use client";

import * as React from "react";
import Link from "next/link";
import { AttemptResultView } from "@/services/quiz-attempts";
import { formatDhaka } from "@/lib/datetime";
import {
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ArrowLeft,
  ShieldCheck,
  MinusCircle,
  Lock,
  Eye,
} from "lucide-react";

interface StudentQuizResultViewProps {
  offeringId: string;
  result: AttemptResultView;
}

export function StudentQuizResultView({
  offeringId,
  result,
}: StudentQuizResultViewProps) {
  const percentage =
    result.maxPossibleMarks > 0
      ? Math.round((result.score / result.maxPossibleMarks) * 100)
      : 0;

  const isPassing = percentage >= 50;

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-16">
      {/* 1. Header Navigation */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href={`/courses/${offeringId}/quizzes/${result.quizId}`}
            className="p-2 rounded-lg text-muted hover:text-foreground hover:bg-surface border border-border transition-colors"
            title="Back to Quiz Info"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-primary px-2 py-0.5 rounded bg-primary/10">
                {result.courseCode}
              </span>
              <span className="text-xs text-muted">Assessment Result</span>
            </div>
            <h1 className="text-xl font-bold text-foreground mt-0.5">
              {result.quizTitle}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/courses/${offeringId}/quizzes`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-border bg-surface hover:bg-surface-muted text-foreground transition-colors"
          >
            All Quizzes
          </Link>
        </div>
      </div>

      {/* 2. Hero Score Card */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-surface p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
              <ShieldCheck className="w-3.5 h-3.5" />
              Attempt Graded &amp; Recorded
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-foreground tracking-tight">
              {isPassing ? "Good Job!" : "Attempt Completed"}
            </h2>
            <p className="text-xs text-muted">
              Submitted on {formatDhaka(result.submittedAt, "full")}
            </p>
          </div>

          {/* Large Score Display */}
          <div className="flex items-baseline gap-2 bg-surface-muted/50 border border-border px-6 py-4 rounded-2xl shadow-inner self-stretch sm:self-auto justify-center">
            <span className="text-4xl sm:text-5xl font-black text-primary font-mono">
              {result.score.toFixed(1).replace(/\.0$/, "")}
            </span>
            <span className="text-lg sm:text-xl font-bold text-muted font-mono">
              / {result.maxPossibleMarks}
            </span>
            <span className="ml-3 px-2.5 py-1 rounded-md text-xs font-bold bg-primary/10 text-primary">
              {percentage}%
            </span>
          </div>
        </div>

        {/* 4 Metrics Tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-border">
          <div className="p-3.5 rounded-xl bg-surface-muted/40 border border-border/60">
            <div className="flex items-center gap-1.5 text-muted text-xs font-medium mb-1">
              <Clock className="w-3.5 h-3.5" />
              Time Taken
            </div>
            <div className="text-base font-bold text-foreground">
              {result.durationTakenMinutes} {result.durationTakenMinutes === 1 ? "min" : "mins"}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-emerald-500/5 border border-emerald-500/15">
            <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300 text-xs font-medium mb-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              Correct
            </div>
            <div className="text-base font-bold text-emerald-700 dark:text-emerald-300">
              {result.correctCount}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-rose-500/5 border border-rose-500/15">
            <div className="flex items-center gap-1.5 text-rose-700 dark:text-rose-300 text-xs font-medium mb-1">
              <XCircle className="w-3.5 h-3.5 text-rose-500" />
              Incorrect
            </div>
            <div className="text-base font-bold text-rose-700 dark:text-rose-300">
              {result.incorrectCount}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-surface-muted/40 border border-border/60">
            <div className="flex items-center gap-1.5 text-muted text-xs font-medium mb-1">
              <MinusCircle className="w-3.5 h-3.5" />
              Unanswered
            </div>
            <div className="text-base font-bold text-muted">
              {result.unansweredCount}
            </div>
          </div>
        </div>

        {result.penaltyDeducted > 0 && (
          <div className="mt-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-200 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <span>
              Negative marking applied:{" "}
              <strong>-{result.penaltyDeducted.toFixed(2)} marks</strong> deducted
              for wrong answers.
            </span>
          </div>
        )}
      </div>

      {/* 3. Review Questions Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-primary" />
            <h3 className="text-base font-bold text-foreground">
              Questions &amp; Solutions
            </h3>
          </div>
          {result.canViewAnswers ? (
            <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Answers Revealed
            </span>
          ) : (
            <span className="text-xs text-muted flex items-center gap-1">
              <Lock className="w-3.5 h-3.5" />
              Hidden
            </span>
          )}
        </div>

        {!result.canViewAnswers && (
          <div className="p-6 rounded-2xl border border-dashed border-border bg-surface text-center space-y-3">
            <div className="w-10 h-10 rounded-full bg-surface-muted flex items-center justify-center mx-auto text-muted">
              <Lock className="w-5 h-5" />
            </div>
            <h4 className="text-sm font-bold text-foreground">
              Detailed Answers are Protected
            </h4>
            <p className="text-xs text-muted max-w-md mx-auto leading-relaxed">
              To preserve academic integrity, correct answers and detailed question
              solutions are hidden while the quiz window is active.
            </p>
            {result.closeDate && (
              <p className="text-xs font-semibold text-primary">
                Solutions become available after the quiz closes on:{" "}
                {formatDhaka(result.closeDate, "full")}
              </p>
            )}
          </div>
        )}

        {result.canViewAnswers && result.reviewQuestions && (
          <div className="space-y-4">
            {result.reviewQuestions.map((q, index) => {
              return (
                <div
                  key={q.id}
                  className={`rounded-2xl border p-5 sm:p-6 transition-all ${
                    q.isCorrect
                      ? "bg-surface border-emerald-500/30"
                      : q.selectedOptionIds.length === 0
                      ? "bg-surface border-border"
                      : "bg-surface border-rose-500/30"
                  }`}
                >
                  {/* Question header */}
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-surface-muted border border-border text-foreground">
                        Q{index + 1}
                      </span>
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                        {q.type.replace("_", " ")}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {q.isCorrect ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          +{q.marksAwarded} Marks
                        </span>
                      ) : q.selectedOptionIds.length === 0 ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-surface-muted text-muted">
                          Unanswered (0)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-700 dark:text-rose-300">
                          <XCircle className="w-3.5 h-3.5" />
                          {q.marksAwarded} Marks
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Question text */}
                  <p className="text-sm font-semibold text-foreground mb-4">
                    {q.text}
                  </p>

                  {/* Options */}
                  <div className="space-y-2">
                    {q.options.map((opt) => {
                      const isSelected = q.selectedOptionIds.includes(opt.id);
                      const isOptionCorrect = opt.isCorrect;

                      let style =
                        "border-border bg-surface-muted/30 text-foreground";
                      let badge = null;

                      if (isSelected && isOptionCorrect) {
                        style =
                          "border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100 font-medium";
                        badge = (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Correct Answer
                            (Selected)
                          </span>
                        );
                      } else if (isSelected && !isOptionCorrect) {
                        style =
                          "border-rose-500/40 bg-rose-500/10 text-rose-900 dark:text-rose-100 font-medium";
                        badge = (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 dark:text-rose-300">
                            <XCircle className="w-3.5 h-3.5" /> Your Answer (Incorrect)
                          </span>
                        );
                      } else if (!isSelected && isOptionCorrect) {
                        style =
                          "border-emerald-500/40 bg-emerald-500/5 text-emerald-800 dark:text-emerald-200 border-dashed";
                        badge = (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Correct Solution
                          </span>
                        );
                      }

                      return (
                        <div
                          key={opt.id}
                          className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-3 ${style}`}
                        >
                          <span className="leading-relaxed">{opt.text}</span>
                          {badge}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
