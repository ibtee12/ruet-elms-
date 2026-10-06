"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { Role } from "@prisma/client";
import {
  startOrResumeAttempt,
  saveAttemptAnswer,
  submitAttempt,
} from "@/services/quiz-attempts";

export async function startQuizAttemptAction(quizId: string, offeringId: string) {
  const caller = await requireRole(Role.STUDENT);

  const attemptSession = await startOrResumeAttempt(quizId, offeringId, caller.id);

  revalidatePath(`/courses/${offeringId}/quizzes`);
  revalidatePath(`/courses/${offeringId}/quizzes/${quizId}`);

  return { success: true, attempt: attemptSession };
}

export async function saveAttemptAnswerAction(
  attemptId: string,
  questionId: string,
  selectedOptionIds: string[]
) {
  const caller = await requireRole(Role.STUDENT);

  const result = await saveAttemptAnswer(
    attemptId,
    questionId,
    selectedOptionIds,
    caller.id
  );

  return result;
}

export async function submitQuizAttemptAction(
  attemptId: string,
  offeringId: string,
  quizId: string
) {
  const caller = await requireRole(Role.STUDENT);

  const result = await submitAttempt(attemptId, caller.id);

  revalidatePath(`/courses/${offeringId}/quizzes`);
  revalidatePath(`/courses/${offeringId}/quizzes/${quizId}`);
  revalidatePath(`/courses/${offeringId}/quizzes/${quizId}/results/${attemptId}`);

  return result;
}

export async function resyncQuizTimerAction(attemptId: string) {
  const caller = await requireRole(Role.STUDENT);
  const { prisma } = await import("@/lib/prisma");

  const attempt = await prisma.quizAttempt.findUnique({
    where: { id: attemptId },
    include: { quiz: true },
  });

  if (!attempt || attempt.studentId !== caller.id) {
    return { success: false, remainingSeconds: 0, isExpired: true };
  }

  if (attempt.submittedAt !== null) {
    return { success: false, remainingSeconds: 0, isExpired: true, isSubmitted: true };
  }

  const now = new Date();
  const deadlineMs = Math.min(
    attempt.startedAt.getTime() + attempt.quiz.durationMin * 60 * 1000,
    attempt.quiz.endAt.getTime()
  );
  const remainingSeconds = Math.max(0, Math.floor((deadlineMs - now.getTime()) / 1000));

  return {
    success: true,
    serverNow: now.toISOString(),
    remainingSeconds,
    isExpired: remainingSeconds <= 0,
  };
}

export async function updateQuizGradingMethodAction(
  quizId: string,
  offeringId: string,
  gradingMethod: "BEST" | "LATEST" | "AVERAGE"
) {
  const caller = await requireRole(Role.TEACHER, Role.SUPER_ADMIN);
  const { updateQuizGradingMethod } = await import("@/services/quiz-attempts");

  const result = await updateQuizGradingMethod(
    quizId,
    offeringId,
    gradingMethod,
    caller.id,
    caller.role
  );

  revalidatePath(`/teach/${offeringId}/quizzes/${quizId}/results`);
  revalidatePath(`/teach/${offeringId}/gradebook`);
  revalidatePath(`/courses/${offeringId}/grades`);

  return { success: true, quiz: result };
}

export async function notifyQuizResultsAction(
  quizId: string,
  offeringId: string
) {
  const caller = await requireRole(Role.TEACHER, Role.SUPER_ADMIN);
  const { notifyQuizResults } = await import("@/services/quiz-attempts");

  const result = await notifyQuizResults(
    quizId,
    offeringId,
    caller.id,
    caller.role
  );

  revalidatePath(`/teach/${offeringId}/quizzes/${quizId}/results`);
  return result;
}
