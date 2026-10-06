import * as React from "react";
import { Role } from "@prisma/client";
import { requireRole } from "@/lib/auth/session";
import { getTeacherWorkspaceData } from "@/services/course-workspace";
import { getTeacherQuizDetail } from "@/services/quizzes";
import { prisma } from "@/lib/prisma";
import { QuizBuilder } from "@/components/quiz/quiz-builder";

export default async function EditQuizPage({
  params,
}: {
  params: Promise<{ offeringId: string; quizId: string }>;
}) {
  const caller = await requireRole(Role.TEACHER, Role.SUPER_ADMIN);
  const { offeringId, quizId } = await params;

  const workspace = await getTeacherWorkspaceData(caller.id, caller.role, offeringId);

  // Fetch full quiz details
  const quiz = await getTeacherQuizDetail(quizId, offeringId, caller.id, caller.role);

  // Fetch topics in this offering
  const topics = await prisma.topic.findMany({
    where: { offeringId },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <QuizBuilder
      offeringId={offeringId}
      courseCode={workspace.code}
      initialQuiz={quiz}
      existingTopics={topics}
      isArchived={workspace.status === "ARCHIVED"}
    />
  );
}
