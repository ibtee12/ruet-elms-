import * as React from "react";
import { Role } from "@prisma/client";
import { requireRole } from "@/lib/auth/session";
import { getTeacherWorkspaceData } from "@/services/course-workspace";
import { getTeacherQuizzesList } from "@/services/quizzes";
import { QuizListView } from "@/components/quiz/quiz-list-view";

export default async function TeacherCourseQuizzesPage({
  params,
}: {
  params: Promise<{ offeringId: string }>;
}) {
  const caller = await requireRole(Role.TEACHER, Role.SUPER_ADMIN);
  const { offeringId } = await params;

  // Workspace verification
  const workspace = await getTeacherWorkspaceData(caller.id, caller.role, offeringId);

  // Fetch quizzes list
  const quizzes = await getTeacherQuizzesList(offeringId, caller.id, caller.role);

  return (
    <QuizListView
      offeringId={offeringId}
      quizzes={quizzes}
      isArchived={workspace.status === "ARCHIVED"}
      canManage={workspace.status !== "ARCHIVED"}
    />
  );
}
