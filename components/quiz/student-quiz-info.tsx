"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { StudentQuizInfo } from "@/services/quiz-attempts";
import { formatDhaka } from "@/lib/datetime";
import { startQuizAttemptAction } from "@/actions/quiz-attempts";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import {
  Clock,
  CheckCircle2,
  AlertTriangle,
  Play,
  ArrowLeft,
  Award,
  ArrowRight,
  RotateCcw,
} from "lucide-react";

interface StudentQuizInfoViewProps {
  offeringId: string;
  quiz: StudentQuizInfo;
}

export function StudentQuizInfoView({
  offeringId,
  quiz,
}: StudentQuizInfoViewProps) {
  const router = useRouter();
  const [isStarting, setIsStarting] = React.useState(false);
  const [showConfirm, setShowConfirm] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const handleStartAttempt = async () => {
    setIsStarting(true);
    setErrorMsg(null);
    try {
      const res = await startQuizAttemptAction(quiz.id, offeringId);
      if (res.success && res.attempt) {
        router.push(
          `/courses/${offeringId}/quizzes/${quiz.id}/attempt/${res.attempt.attemptId}`
        );
      }
    } catch (err: unknown) {
      const error = err as { message?: string };
      setErrorMsg(error.message || "Failed to start quiz attempt.");
      setIsStarting(false);
      setShowConfirm(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      {/* Top Bar */}
      <div className="flex items-center gap-3">
        <Link
          href={`/courses/${offeringId}/quizzes`}
          className="p-2 rounded-lg text-muted hover:text-foreground hover:bg-surface border border-border transition-colors"
          title="Back to Quizzes"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <span className="font-mono text-xs font-bold text-primary px-2 py-0.5 rounded bg-primary/10">
            {quiz.courseCode}
          </span>
          <h1 className="text-xl font-bold text-foreground mt-0.5">
            {quiz.title}
          </h1>
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-xl border border-rose-500/20 bg-rose-500/10 text-rose-800 dark:text-rose-200 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="text-xs font-bold hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Description / Instructions */}
      {quiz.description && (
        <div className="p-5 rounded-2xl border border-border bg-surface shadow-xs space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted">
            Instructions &amp; Overview
          </h3>
          <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">
            {quiz.description}
          </p>
        </div>
      )}

      {/* Rules & Parameters Grid */}
      <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6 shadow-xs space-y-4">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
          <Clock className="w-4 h-4 text-primary" />
          <span>Quiz Rules &amp; Assessment Policies</span>
        </h3>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-3.5 rounded-xl border border-border/80 bg-surface-muted/30">
            <span className="text-[11px] text-muted block mb-0.5">Duration</span>
            <span className="text-base font-extrabold text-foreground">
              {quiz.durationMin} mins
            </span>
          </div>

          <div className="p-3.5 rounded-xl border border-border/80 bg-surface-muted/30">
            <span className="text-[11px] text-muted block mb-0.5">Total Marks</span>
            <span className="text-base font-extrabold text-foreground">
              {quiz.totalMarks} marks
            </span>
          </div>

          <div className="p-3.5 rounded-xl border border-border/80 bg-surface-muted/30">
            <span className="text-[11px] text-muted block mb-0.5">Questions</span>
            <span className="text-base font-extrabold text-foreground">
              {quiz.questionsCount} items
            </span>
          </div>

          <div className="p-3.5 rounded-xl border border-border/80 bg-surface-muted/30">
            <span className="text-[11px] text-muted block mb-0.5">Attempts Allowed</span>
            <span className="text-base font-extrabold text-foreground">
              {quiz.maxAttempts} max
            </span>
          </div>
        </div>

        <div className="divide-y divide-border/60 text-xs text-muted pt-2">
          <div className="py-2.5 flex items-center justify-between">
            <span>Availability Window:</span>
            <span className="font-medium text-foreground">
              {formatDhaka(quiz.startAt, "short")} – {formatDhaka(quiz.endAt, "short")}
            </span>
          </div>

          <div className="py-2.5 flex items-center justify-between">
            <span>Negative Marking Policy:</span>
            <span className="font-medium text-foreground">
              {quiz.negativeMarkPerWrong > 0
                ? `-${quiz.negativeMarkPerWrong} mark per incorrect answer`
                : "None (no penalty for wrong answers)"}
            </span>
          </div>

          <div className="py-2.5 flex items-center justify-between">
            <span>Question &amp; Option Ordering:</span>
            <span className="font-medium text-foreground">
              {quiz.shuffleQuestions || quiz.shuffleOptions
                ? "Randomized per student attempt"
                : "Standard sequential order"}
            </span>
          </div>

          <div className="py-2.5 flex items-center justify-between">
            <span>Answers Revelation:</span>
            <span className="font-medium text-foreground">
              {quiz.showAnswersAfterClose
                ? "Revealed after the quiz window closes"
                : "Hidden after submission"}
            </span>
          </div>
        </div>
      </div>

      {/* Completed Attempts History */}
      {quiz.completedAttempts.length > 0 && (
        <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6 shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Award className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>Your Submitted Attempts ({quiz.completedAttempts.length} of {quiz.maxAttempts})</span>
          </h3>

          <div className="space-y-2.5">
            {quiz.completedAttempts.map((att, idx) => (
              <div
                key={att.id}
                className="p-4 rounded-xl border border-border/80 bg-surface-muted/30 flex items-center justify-between gap-4"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs text-foreground">
                      Attempt #{idx + 1}
                    </span>
                    <span className="text-[11px] text-muted">
                      • {formatDhaka(att.submittedAt, "short")}
                    </span>
                  </div>
                  <span className="text-[11px] text-muted">
                    Time taken: ~{att.durationMinutes} minutes
                  </span>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <span className="text-base font-black text-foreground">
                      {att.score} / {quiz.totalMarks}
                    </span>
                    <span className="block text-[10px] text-muted">score</span>
                  </div>

                  <Link
                    href={`/courses/${offeringId}/quizzes/${quiz.id}/results/${att.id}`}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-surface hover:bg-surface-muted text-xs font-semibold border border-border text-foreground transition-colors shadow-xs"
                  >
                    Results <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Start / Resume Action Card */}
      <div className="rounded-2xl border border-border bg-surface p-6 shadow-xs text-center space-y-4">
        {quiz.hasInProgressAttempt ? (
          <div>
            <h3 className="text-base font-bold text-foreground">
              You Have an In-Progress Attempt
            </h3>
            <p className="text-xs text-muted max-w-md mx-auto mt-1 mb-4 leading-relaxed">
              Your previous test session is still active. Resume now to continue answering questions before your timer expires.
            </p>
            <button
              type="button"
              disabled={isStarting}
              onClick={handleStartAttempt}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold shadow-md transition-all"
            >
              <RotateCcw className="w-4 h-4" />
              <span>{isStarting ? "Resuming..." : "Resume Quiz Attempt"}</span>
            </button>
          </div>
        ) : quiz.canStartNewAttempt ? (
          <div>
            <h3 className="text-base font-bold text-foreground">
              Ready to Take the Quiz?
            </h3>
            <p className="text-xs text-muted max-w-md mx-auto mt-1 mb-4 leading-relaxed">
              Once you start, the countdown timer will begin immediately ({quiz.durationMin} minutes). Ensure you have a stable network connection before starting.
            </p>
            <button
              type="button"
              disabled={isStarting}
              onClick={() => setShowConfirm(true)}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-bold shadow-md transition-all"
            >
              <Play className="w-4 h-4" />
              <span>{isStarting ? "Preparing..." : "Start Attempt"}</span>
            </button>
          </div>
        ) : quiz.isUpcoming ? (
          <div className="py-2">
            <Clock className="w-8 h-8 text-blue-500 mx-auto mb-2" />
            <h3 className="text-sm font-bold text-foreground">
              Quiz Has Not Started Yet
            </h3>
            <p className="text-xs text-muted mt-1">
              Opens on {formatDhaka(quiz.startAt, "short")}.
            </p>
          </div>
        ) : quiz.isClosed ? (
          <div className="py-2">
            <CheckCircle2 className="w-8 h-8 text-muted mx-auto mb-2" />
            <h3 className="text-sm font-bold text-foreground">
              Quiz Window Has Closed
            </h3>
            <p className="text-xs text-muted mt-1">
              Closed on {formatDhaka(quiz.endAt, "short")}. No further attempts can be started.
            </p>
          </div>
        ) : (
          <div className="py-2">
            <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
            <h3 className="text-sm font-bold text-foreground">
              All Attempts Completed
            </h3>
            <p className="text-xs text-muted mt-1">
              You have completed all {quiz.maxAttempts} allowed attempts for this quiz.
            </p>
          </div>
        )}
      </div>

      {/* Start Confirmation Dialog */}
      <ConfirmDialog
        open={showConfirm}
        onOpenChange={setShowConfirm}
        onConfirm={handleStartAttempt}
        title={`Start Quiz: "${quiz.title}"`}
        description={`You are about to start your attempt (${quiz.attemptsUsed + 1} of ${quiz.maxAttempts}). You will have ${quiz.durationMin} minutes to answer ${quiz.questionsCount} questions. Are you ready to begin?`}
        confirmLabel={isStarting ? "Starting..." : "Begin Now"}
        isLoading={isStarting}
        isDestructive={false}
      />
    </div>
  );
}
