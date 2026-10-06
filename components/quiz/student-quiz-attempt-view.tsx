"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { QuizAttemptSessionData } from "@/services/quiz-attempts";
import { QuestionType } from "@prisma/client";
import {
  saveAttemptAnswerAction,
  submitQuizAttemptAction,
  resyncQuizTimerAction,
} from "@/actions/quiz-attempts";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import {
  Clock,
  Flag,
  ArrowLeft,
  ArrowRight,
  Send,
  Loader2,
  Check,
} from "lucide-react";

interface StudentQuizAttemptViewProps {
  offeringId: string;
  session: QuizAttemptSessionData;
}

export function StudentQuizAttemptView({
  offeringId,
  session,
}: StudentQuizAttemptViewProps) {
  const router = useRouter();

  // 1. Current Question index
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const currentQuestion = session.questions[currentIndex];

  // 2. Answers State: Map questionId -> string[]
  const [answers, setAnswers] = React.useState<Record<string, string[]>>(() => {
    const map: Record<string, string[]> = {};
    for (const a of session.savedAnswers) {
      map[a.questionId] = a.selectedOptionIds;
    }
    return map;
  });

  // 3. Flags State: Set of questionIds flagged for review
  const [flaggedIds, setFlaggedIds] = React.useState<Set<string>>(new Set());

  // 4. Autosave Status: "saved" | "saving" | "error"
  const [saveStatus, setSaveStatus] = React.useState<"saved" | "saving" | "error">("saved");

  // 5. Timer State (server-driven countdown)
  const deadlineMs = new Date(session.serverDeadline).getTime();
  const [secondsRemaining, setSecondsRemaining] = React.useState(() => {
    const diff = Math.max(0, Math.floor((deadlineMs - Date.now()) / 1000));
    return diff;
  });

  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  // Debounced autosave ref
  const saveTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  const handleAutoSubmit = React.useCallback(async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await submitQuizAttemptAction(session.attemptId, offeringId, session.quizId);
      router.push(
        `/courses/${offeringId}/quizzes/${session.quizId}/results/${session.attemptId}`
      );
    } catch (err: unknown) {
      const error = err as { message?: string };
      setSubmitError(error.message || "Auto-submit completed.");
      router.push(`/courses/${offeringId}/quizzes/${session.quizId}`);
    }
  }, [isSubmitting, session.attemptId, offeringId, session.quizId, router]);

  // 6. Countdown Timer effect
  React.useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const diff = Math.max(0, Math.floor((deadlineMs - now) / 1000));
      setSecondsRemaining(diff);

      if (diff <= 0) {
        clearInterval(interval);
        // Time expired! Auto-submit
        handleAutoSubmit();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [deadlineMs, handleAutoSubmit]);

  // Periodic server timer resync (every 30 seconds)
  React.useEffect(() => {
    const resyncInterval = setInterval(async () => {
      try {
        const sync = await resyncQuizTimerAction(session.attemptId);
        if (sync.success) {
          setSecondsRemaining(sync.remainingSeconds);
          if (sync.isExpired) {
            handleAutoSubmit();
          }
        }
      } catch {
        // network hiccups don't break the client countdown
      }
    }, 30000);

    return () => clearInterval(resyncInterval);
  }, [session.attemptId, handleAutoSubmit]);

  const handleManualSubmit = async () => {
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      await submitQuizAttemptAction(session.attemptId, offeringId, session.quizId);
      router.push(
        `/courses/${offeringId}/quizzes/${session.quizId}/results/${session.attemptId}`
      );
    } catch (err: unknown) {
      const error = err as { message?: string };
      setSubmitError(error.message || "Failed to submit quiz attempt.");
      setIsSubmitting(false);
      setShowSubmitConfirm(false);
    }
  };

  // Answer selection handler
  const handleSelectOption = (questionId: string, optionId: string, type: QuestionType) => {
    setSaveStatus("saving");

    let updatedSelection: string[] = [];

    if (type === QuestionType.SINGLE || type === QuestionType.TRUE_FALSE) {
      updatedSelection = [optionId];
    } else if (type === QuestionType.MULTIPLE) {
      const current = answers[questionId] || [];
      if (current.includes(optionId)) {
        updatedSelection = current.filter((id) => id !== optionId);
      } else {
        updatedSelection = [...current, optionId];
      }
    }

    setAnswers((prev) => ({
      ...prev,
      [questionId]: updatedSelection,
    }));

    // Debounced autosave to server
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await saveAttemptAnswerAction(
          session.attemptId,
          questionId,
          updatedSelection
        );
        if (res.saved) {
          setSaveStatus("saved");
        } else {
          setSaveStatus("error");
        }
      } catch {
        setSaveStatus("error");
      }
    }, 400);
  };

  // Flag toggle
  const toggleFlag = (questionId: string) => {
    setFlaggedIds((prev) => {
      const next = new Set(prev);
      if (next.has(questionId)) next.delete(questionId);
      else next.add(questionId);
      return next;
    });
  };

  // Formatting remaining time (MM:SS)
  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Unanswered calculation
  const unansweredIndices: number[] = [];
  session.questions.forEach((q, idx) => {
    const ans = answers[q.id];
    if (!ans || ans.length === 0) {
      unansweredIndices.push(idx + 1);
    }
  });

  const isTimeCritical = secondsRemaining <= 60;
  const isTimeWarning = secondsRemaining <= 300 && !isTimeCritical;

  return (
    <div className="fixed inset-0 z-50 bg-background text-foreground flex flex-col overflow-y-auto">
      {/* 1. Header Bar: Distraction-free (NO SIDEBAR) */}
      <header className="sticky top-0 z-40 bg-surface/95 backdrop-blur-md border-b border-border px-4 py-3 sm:px-6 flex items-center justify-between gap-4 shadow-xs">
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-mono text-xs font-bold text-primary px-2 py-0.5 rounded bg-primary/10 shrink-0">
            {session.courseCode}
          </span>
          <h1 className="text-sm font-bold text-foreground truncate max-w-xs sm:max-w-md">
            {session.quizTitle}
          </h1>
        </div>

        {/* Center: Timer */}
        <div
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl font-mono text-sm font-black border transition-colors ${
            isTimeCritical
              ? "bg-rose-500/15 border-rose-500/30 text-rose-600 dark:text-rose-400 animate-pulse"
              : isTimeWarning
              ? "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400"
              : "bg-surface-muted/60 border-border text-foreground"
          }`}
        >
          <Clock className="w-4 h-4 shrink-0" />
          <span>{formatTimer(secondsRemaining)}</span>
        </div>

        {/* Right: Autosave status & Submit button */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted">
            {saveStatus === "saving" ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-muted" />
                <span>Saving...</span>
              </>
            ) : saveStatus === "saved" ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span className="text-emerald-700 dark:text-emerald-400 font-medium">Saved</span>
              </>
            ) : (
              <span className="text-rose-600 text-xs">Save error</span>
            )}
          </div>

          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => setShowSubmitConfirm(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold shadow-xs transition-colors"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Finish &amp; Submit</span>
          </button>
        </div>
      </header>

      {submitError && (
        <div className="bg-rose-500/10 border-b border-rose-500/20 px-6 py-2.5 text-rose-800 dark:text-rose-200 text-xs flex items-center justify-between">
          <span>{submitError}</span>
          <button
            type="button"
            onClick={() => setSubmitError(null)}
            className="font-bold hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* 2. Main Content Area */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Question Card (1 question per screen on mobile) */}
        <div className="lg:col-span-8 space-y-4">
          <div className="rounded-2xl border border-border bg-surface p-5 sm:p-7 shadow-xs space-y-6">
            {/* Question Header */}
            <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-4">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-muted uppercase tracking-wider">
                  Question {currentIndex + 1} of {session.questions.length}
                </span>
                <span
                  className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${
                    currentQuestion.type === QuestionType.SINGLE
                      ? "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20"
                      : currentQuestion.type === QuestionType.MULTIPLE
                      ? "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20"
                      : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20"
                  }`}
                >
                  {currentQuestion.type === QuestionType.SINGLE
                    ? "Single Choice"
                    : currentQuestion.type === QuestionType.MULTIPLE
                    ? "Multiple Choice"
                    : "True / False"}
                </span>
                <span className="text-xs font-bold text-muted">
                  ({currentQuestion.marks} marks)
                </span>
              </div>

              {/* Flag button */}
              <button
                type="button"
                onClick={() => toggleFlag(currentQuestion.id)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                  flaggedIds.has(currentQuestion.id)
                    ? "bg-amber-500/15 border-amber-500/30 text-amber-700 dark:text-amber-300"
                    : "border-border text-muted hover:text-foreground hover:bg-surface-muted"
                }`}
              >
                <Flag
                  className={`w-3.5 h-3.5 ${
                    flaggedIds.has(currentQuestion.id)
                      ? "fill-amber-500 text-amber-500"
                      : ""
                  }`}
                />
                <span>{flaggedIds.has(currentQuestion.id) ? "Flagged" : "Flag"}</span>
              </button>
            </div>

            {/* Question Prompt */}
            <div className="text-sm sm:text-base font-semibold text-foreground leading-relaxed whitespace-pre-line">
              {currentQuestion.text}
            </div>

            {/* Answer Options */}
            <div className="space-y-2.5 pt-2">
              <span className="text-xs text-muted block mb-1">
                {currentQuestion.type === QuestionType.MULTIPLE
                  ? "Select all that apply:"
                  : "Select one answer:"}
              </span>

              {currentQuestion.options.map((opt) => {
                const isSelected = (answers[currentQuestion.id] || []).includes(opt.id);

                return (
                  <label
                    key={opt.id}
                    onClick={() =>
                      handleSelectOption(currentQuestion.id, opt.id, currentQuestion.type)
                    }
                    className={`flex items-center gap-3.5 p-3.5 rounded-xl border cursor-pointer transition-all ${
                      isSelected
                        ? "bg-primary/10 border-primary shadow-xs"
                        : "bg-surface-muted/20 border-border hover:bg-surface-muted/50"
                    }`}
                  >
                    {currentQuestion.type === QuestionType.MULTIPLE ? (
                      <div
                        className={`w-5 h-5 rounded-md flex items-center justify-center border shrink-0 transition-colors ${
                          isSelected
                            ? "bg-primary border-primary text-primary-foreground"
                            : "border-border bg-surface"
                        }`}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      </div>
                    ) : (
                      <div
                        className={`w-5 h-5 rounded-full flex items-center justify-center border shrink-0 transition-colors ${
                          isSelected
                            ? "border-primary"
                            : "border-border bg-surface"
                        }`}
                      >
                        {isSelected && (
                          <div className="w-2.5 h-2.5 rounded-full bg-primary" />
                        )}
                      </div>
                    )}

                    <span className="text-xs sm:text-sm font-medium text-foreground leading-normal">
                      {opt.text}
                    </span>
                  </label>
                );
              })}
            </div>

            {/* Question Footer: Prev / Next Buttons */}
            <div className="flex items-center justify-between pt-4 border-t border-border/60">
              <button
                type="button"
                disabled={currentIndex === 0}
                onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold border border-border text-foreground hover:bg-surface-muted disabled:opacity-30 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Previous</span>
              </button>

              <button
                type="button"
                disabled={currentIndex === session.questions.length - 1}
                onClick={() =>
                  setCurrentIndex((prev) =>
                    Math.min(session.questions.length - 1, prev + 1)
                  )
                }
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-surface-muted hover:bg-surface-muted/80 text-foreground border border-border disabled:opacity-30 transition-colors"
              >
                <span>Next</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Right: Question Navigator Grid & Progress */}
        <div className="lg:col-span-4 space-y-4">
          <div className="rounded-2xl border border-border bg-surface p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted">
                Questions Navigator
              </h3>
              <span className="text-xs font-semibold text-primary">
                {session.questions.length - unansweredIndices.length} /{" "}
                {session.questions.length} answered
              </span>
            </div>

            {/* Question Grid */}
            <div className="grid grid-cols-5 gap-2">
              {session.questions.map((q, idx) => {
                const isAnswered =
                  answers[q.id] && answers[q.id].length > 0;
                const isCurrent = idx === currentIndex;
                const isFlagged = flaggedIds.has(q.id);

                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => setCurrentIndex(idx)}
                    className={`relative h-10 rounded-xl font-mono text-xs font-bold flex items-center justify-center transition-all ${
                      isCurrent
                        ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
                        : ""
                    } ${
                      isAnswered
                        ? "bg-primary text-primary-foreground shadow-xs"
                        : "bg-surface-muted/60 text-muted hover:bg-surface-muted hover:text-foreground border border-border/80"
                    }`}
                  >
                    <span>{idx + 1}</span>
                    {isFlagged && (
                      <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-500 ring-2 ring-background" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Legend */}
            <div className="pt-3 border-t border-border/60 text-[11px] text-muted space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded bg-primary" />
                <span>Answered</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded bg-surface-muted border border-border" />
                <span>Unanswered</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded bg-amber-500" />
                <span>Flagged for Review</span>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* 3. Confirm Submit Dialog */}
      <ConfirmDialog
        open={showSubmitConfirm}
        onOpenChange={setShowSubmitConfirm}
        onConfirm={handleManualSubmit}
        title="Submit Quiz Attempt?"
        description={
          unansweredIndices.length > 0
            ? `You have ${unansweredIndices.length} unanswered question${
                unansweredIndices.length === 1 ? "" : "s"
              } (#${unansweredIndices.join(", #")}). Once submitted, answers cannot be modified.`
            : `You have answered all ${session.questions.length} questions. Are you ready to submit your attempt?`
        }
        confirmLabel={isSubmitting ? "Submitting..." : "Submit & Grade"}
        isLoading={isSubmitting}
        isDestructive={false}
      />
    </div>
  );
}
