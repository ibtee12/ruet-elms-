import * as React from "react";
import { Role } from "@prisma/client";
import { requireRole } from "@/lib/auth/session";
import { getTeacherWorkspaceData } from "@/services/course-workspace";
import { getTeacherQuizResults } from "@/services/quiz-attempts";
import { TeacherQuizResultsView } from "@/components/quiz/teacher-quiz-results-view";

export default async function TeacherQuizResultsPage({
  params,
}: {
  params: Promise<{ offeringId: string; quizId: string }>;
}) {
  const caller = await requireRole(Role.TEACHER, Role.SUPER_ADMIN);
  const { offeringId, quizId } = await params;

  // Workspace verification
  await getTeacherWorkspaceData(caller.id, caller.role, offeringId);

  // Fetch results data
  const data = await getTeacherQuizResults(
    quizId,
    offeringId,
    caller.id,
    caller.role
  );

  return (
    <div className="container mx-auto px-4 py-8">
      <TeacherQuizResultsView offeringId={offeringId} data={data} />
    </div>
  );
}
