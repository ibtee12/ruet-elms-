import * as React from "react";
import { Role } from "@prisma/client";
import { requireRole } from "@/lib/auth/session";
import { getStudentWorkspaceData } from "@/services/course-workspace";
import { getStudentQuizInfo } from "@/services/quiz-attempts";
import { StudentQuizInfoView } from "@/components/quiz/student-quiz-info";

export default async function StudentQuizInfoPage({
  params,
}: {
  params: Promise<{ offeringId: string; quizId: string }>;
}) {
  const caller = await requireRole(Role.STUDENT, Role.SUPER_ADMIN);
  const { offeringId, quizId } = await params;
  await getStudentWorkspaceData(caller.id, caller.role, offeringId);

  const quiz = await getStudentQuizInfo(quizId, offeringId, caller.id);

  return <StudentQuizInfoView offeringId={offeringId} quiz={quiz} />;
}
