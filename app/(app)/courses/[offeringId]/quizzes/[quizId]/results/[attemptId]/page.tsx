import * as React from "react";
import { Role } from "@prisma/client";
import { requireRole } from "@/lib/auth/session";
import { getAttemptResult } from "@/services/quiz-attempts";
import { StudentQuizResultView } from "@/components/quiz/student-quiz-result-view";

export default async function StudentQuizResultPage({
  params,
}: {
  params: Promise<{
    offeringId: string;
    quizId: string;
    attemptId: string;
  }>;
}) {
  const caller = await requireRole(Role.STUDENT, Role.SUPER_ADMIN);
  const { offeringId, attemptId } = await params;

  const result = await getAttemptResult(attemptId, caller.id);

  return <StudentQuizResultView offeringId={offeringId} result={result} />;
}
