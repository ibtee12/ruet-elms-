import * as React from "react";
import { Role } from "@prisma/client";
import { requireRole } from "@/lib/auth/session";
import { getStudentWorkspaceData } from "@/services/course-workspace";
import { getStudentQuizzesList } from "@/services/quiz-attempts";
import { StudentQuizList } from "@/components/quiz/student-quiz-list";

export default async function StudentCourseQuizzesPage({
  params,
}: {
  params: Promise<{ offeringId: string }>;
}) {
  const caller = await requireRole(Role.STUDENT, Role.SUPER_ADMIN);
  const { offeringId } = await params;
  const workspace = await getStudentWorkspaceData(caller.id, caller.role, offeringId);

  const quizzes = await getStudentQuizzesList(offeringId, caller.id);

  return (
    <StudentQuizList
      offeringId={offeringId}
      courseCode={workspace.code}
      quizzes={quizzes}
    />
  );
}
