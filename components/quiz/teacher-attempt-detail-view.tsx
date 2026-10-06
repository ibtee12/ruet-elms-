"use client";

import * as React from "react";
import Link from "next/link";
import { TeacherAttemptDetailView as AttemptData } from "@/services/quiz-attempts";
import { formatDhaka } from "@/lib/datetime";
import {
  Clock,
  CheckCircle2,
  XCircle,
  ArrowLeft,
  User,
  Check,
  MinusCircle,
} from "lucide-react";

interface TeacherAttemptDetailViewProps {
  offeringId: string;
  data: AttemptData;
}

export function TeacherAttemptDetailView({
  offeringId,
  data,
}: TeacherAttemptDetailViewProps) {
  const percentage =
    data.maxPossibleMarks > 0
      ? Math.round((data.score / data.maxPossibleMarks) * 100)
      : 0;

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-16">
      {/* 1. Top Header Navigation */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href={`/teach/${offeringId}/quizzes/${data.quizId}/results`}
            className="p-2 rounded-lg text-muted hover:text-foreground hover:bg-surface border border-border transition-colors"
            title="Back to Quiz Results"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-primary px-2 py-0.5 rounded bg-primary/10">
                {data.courseCode}
              </span>
              <span className="text-xs text-muted">Individual Attempt Review</span>
            </div>
            <h1 className="text-xl font-bold text-foreground mt-0.5">
              {data.quizTitle}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/teach/${offeringId}/quizzes/${data.quizId}/results`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-border bg-surface hover:bg-surface-muted text-foreground transition-colors"
          >
            All Results
          </Link>
        </div>
      </div>

      {/* 2. Student & Attempt Summary Card */}
      <div className="rounded-2xl border border-border bg-surface p-6 sm:p-8 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 pb-6 border-b border-border">
          {/* Student Info */}
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-primary/10 text-primary border border-primary/20">
              <User className="w-3.5 h-3.5" />
              Student Submission
            </div>
            <h2 className="text-2xl font-bold text-foreground tracking-tight">
              {data.student.name}
            </h2>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
              {data.student.roll && (
                <span className="font-mono font-semibold text-foreground">
                  Roll: {data.student.roll}
                </span>
              )}
              <span>{data.student.email}</span>
              <span className="px-2 py-0.5 rounded bg-surface-muted border border-border text-foreground font-medium">
                Section: {data.student.section}
              </span>
            </div>
            <p className="text-xs text-muted pt-1">
              Submitted: {data.submittedAt ? formatDhaka(data.submittedAt, "full") : "In Progress"}
            </p>
          </div>

          {/* Large Score Display */}
          <div className="flex items-baseline gap-2 bg-surface-muted/50 border border-border px-6 py-4 rounded-2xl shadow-inner self-stretch sm:self-auto justify-center">
            <span className="text-4xl sm:text-5xl font-black text-primary font-mono">
              {data.score.toFixed(1).replace(/\.0$/, "")}
            </span>
            <span className="text-lg sm:text-xl font-bold text-muted font-mono">
              / {data.maxPossibleMarks}
            </span>
            <span className="ml-3 px-2.5 py-1 rounded-md text-xs font-bold bg-primary/10 text-primary">
              {percentage}%
            </span>
          </div>
        </div>

        {/* Attempt Stat Tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-xl bg-surface-muted/40 border border-border/60">
            <div className="flex items-center gap-1.5 text-muted text-xs font-medium mb-1">
              <Clock className="w-3.5 h-3.5" />
              Time Spent
            </div>
            <div className="text-base font-bold text-foreground">
              {data.durationTakenMinutes} {data.durationTakenMinutes === 1 ? "min" : "mins"}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-emerald-500/5 border border-emerald-500/15">
            <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300 text-xs font-medium mb-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              Correct
            </div>
            <div className="text-base font-bold text-emerald-700 dark:text-emerald-300">
              {data.correctCount} / {data.questions.length}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-rose-500/5 border border-rose-500/15">
            <div className="flex items-center gap-1.5 text-rose-700 dark:text-rose-300 text-xs font-medium mb-1">
              <XCircle className="w-3.5 h-3.5 text-rose-500" />
              Incorrect
            </div>
            <div className="text-base font-bold text-rose-700 dark:text-rose-300">
              {data.incorrectCount}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-surface-muted/40 border border-border/60">
            <div className="flex items-center gap-1.5 text-muted text-xs font-medium mb-1">
              <MinusCircle className="w-3.5 h-3.5" />
              Unanswered / Penalty
            </div>
            <div className="text-base font-bold text-foreground">
              {data.unansweredCount} / -{data.penaltyDeducted}
            </div>
          </div>
        </div>
      </div>

      {/* 3. Detailed Question Breakdown */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-foreground flex items-center gap-2">
            <span>Question Breakdown</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-surface-muted text-muted font-normal">
              {data.questions.length} Questions
            </span>
          </h3>
          <div className="text-xs text-muted flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
              Correct
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" />
              Incorrect
            </span>
          </div>
        </div>

        <div className="space-y-4">
          {data.questions.map((q, idx) => {
            const isUnanswered = q.selectedOptionIds.length === 0;

            return (
              <div
                key={q.id}
                className={`rounded-2xl border bg-surface p-5 sm:p-6 transition-all ${
                  q.isCorrect
                    ? "border-emerald-500/30 shadow-xs"
                    : isUnanswered
                    ? "border-border"
                    : "border-rose-500/30 shadow-xs"
                }`}
              >
                {/* Question Header */}
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="flex items-start gap-3">
                    <span
                      className={`flex items-center justify-center w-7 h-7 rounded-lg text-xs font-bold shrink-0 mt-0.5 ${
                        q.isCorrect
                          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20"
                          : isUnanswered
                          ? "bg-surface-muted text-muted border border-border"
                          : "bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/20"
                      }`}
                    >
                      {idx + 1}
                    </span>
                    <div>
                      <div className="flex flex-wrap items-center gap-2 mb-1.5">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                          {q.type.replace(/_/g, " ")}
                        </span>
                        {q.topicName && (
                          <span className="text-[11px] px-2 py-0.5 rounded-md bg-surface-muted text-muted border border-border">
                            {q.topicName}
                          </span>
                        )}
                        {q.difficulty && (
                          <span className="text-[11px] px-2 py-0.5 rounded-md bg-surface-muted text-muted">
                            {q.difficulty}
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-semibold text-foreground leading-relaxed whitespace-pre-wrap">
                        {q.text}
                      </p>
                    </div>
                  </div>

                  {/* Marks badge */}
                  <div className="text-right shrink-0">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-mono font-bold ${
                        q.isCorrect
                          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20"
                          : q.marksAwarded < 0
                          ? "bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/20"
                          : "bg-surface-muted text-muted border border-border"
                      }`}
                    >
                      {q.marksAwarded > 0 ? `+${q.marksAwarded}` : q.marksAwarded}{" "}
                      / {q.marks} pts
                    </span>
                  </div>
                </div>

                {/* Options List */}
                <div className="space-y-2 mt-4 pt-3 border-t border-border/50">
                  {q.options.map((opt) => {
                    const isSelected = q.selectedOptionIds.includes(opt.id);
                    const isCorrect = opt.isCorrect;

                    let rowBorder = "border-border";
                    let rowBg = "bg-surface-muted/20";
                    let rowText = "text-foreground";

                    if (isCorrect && isSelected) {
                      rowBorder = "border-emerald-500/50";
                      rowBg = "bg-emerald-500/10";
                      rowText = "text-emerald-950 dark:text-emerald-100 font-medium";
                    } else if (isCorrect && !isSelected) {
                      rowBorder = "border-emerald-500/40 border-dashed";
                      rowBg = "bg-emerald-500/5";
                      rowText = "text-emerald-900 dark:text-emerald-200";
                    } else if (!isCorrect && isSelected) {
                      rowBorder = "border-rose-500/50";
                      rowBg = "bg-rose-500/10";
                      rowText = "text-rose-950 dark:text-rose-100 font-medium";
                    }

                    return (
                      <div
                        key={opt.id}
                        className={`p-3 rounded-xl border flex items-center justify-between gap-3 text-xs transition-colors ${rowBorder} ${rowBg}`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {isSelected ? (
                            isCorrect ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                            ) : (
                              <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                            )
                          ) : isCorrect ? (
                            <Check className="w-4 h-4 text-emerald-500 shrink-0 opacity-80" />
                          ) : (
                            <div className="w-4 h-4 rounded-full border border-border shrink-0" />
                          )}
                          <span className={`break-words ${rowText}`}>
                            {opt.text}
                          </span>
                        </div>

                        {/* Badges for answer state */}
                        <div className="flex items-center gap-2 shrink-0">
                          {isSelected && (
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                isCorrect
                                  ? "bg-emerald-500/20 text-emerald-800 dark:text-emerald-200"
                                  : "bg-rose-500/20 text-rose-800 dark:text-rose-200"
                              }`}
                            >
                              Student Choice
                            </span>
                          )}
                          {isCorrect && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-800 dark:text-emerald-200 border border-emerald-500/30">
                              Correct Answer
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
