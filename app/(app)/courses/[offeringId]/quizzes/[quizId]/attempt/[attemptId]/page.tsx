import * as React from "react";
import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { requireRole } from "@/lib/auth/session";
import { getQuizAttemptSession } from "@/services/quiz-attempts";
import { StudentQuizAttemptView } from "@/components/quiz/student-quiz-attempt-view";
import { prisma } from "@/lib/prisma";

export default async function StudentQuizAttemptPage({
  params,
}: {
  params: Promise<{
    offeringId: string;
    quizId: string;
    attemptId: string;
  }>;
}) {
  const caller = await requireRole(Role.STUDENT, Role.SUPER_ADMIN);
  const { offeringId, quizId, attemptId } = await params;

  // Check if attempt is already submitted
  const attempt = await prisma.quizAttempt.findUnique({
    where: { id: attemptId },
    select: { submittedAt: true, studentId: true },
  });

  if (attempt && attempt.studentId === caller.id && attempt.submittedAt !== null) {
    redirect(`/courses/${offeringId}/quizzes/${quizId}/results/${attemptId}`);
  }

  let session;
  try {
    session = await getQuizAttemptSession(attemptId, caller.id);
  } catch (err: unknown) {
    const error = err as { message?: string };
    if (
      error.message?.includes("submitted") ||
      error.message?.includes("expired")
    ) {
      redirect(`/courses/${offeringId}/quizzes/${quizId}/results/${attemptId}`);
    }
    throw err;
  }

  return (
    <StudentQuizAttemptView
      offeringId={offeringId}
      session={session}
    />
  );
}
