import * as React from "react";
import { Role } from "@prisma/client";
import { requireRole } from "@/lib/auth/session";
import { getTeacherWorkspaceData } from "@/services/course-workspace";
import { prisma } from "@/lib/prisma";
import { QuizBuilder } from "@/components/quiz/quiz-builder";

export default async function NewQuizPage({
  params,
}: {
  params: Promise<{ offeringId: string }>;
}) {
  const caller = await requireRole(Role.TEACHER, Role.SUPER_ADMIN);
  const { offeringId } = await params;

  const workspace = await getTeacherWorkspaceData(caller.id, caller.role, offeringId);

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
      initialQuiz={null}
      existingTopics={topics}
      isArchived={workspace.status === "ARCHIVED"}
    />
  );
}
