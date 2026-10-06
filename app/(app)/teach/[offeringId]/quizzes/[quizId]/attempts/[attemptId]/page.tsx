import * as React from "react";
import { Role } from "@prisma/client";
import { requireRole } from "@/lib/auth/session";
import { getTeacherWorkspaceData } from "@/services/course-workspace";
import { getTeacherAttemptDetail } from "@/services/quiz-attempts";
import { TeacherAttemptDetailView } from "@/components/quiz/teacher-attempt-detail-view";

export default async function TeacherAttemptDetailPage({
  params,
}: {
  params: Promise<{ offeringId: string; quizId: string; attemptId: string }>;
}) {
  const caller = await requireRole(Role.TEACHER, Role.SUPER_ADMIN);
  const { offeringId, attemptId } = await params;

  // Workspace verification
  await getTeacherWorkspaceData(caller.id, caller.role, offeringId);

  // Fetch individual attempt data
  const data = await getTeacherAttemptDetail(
    attemptId,
    offeringId,
    caller.id,
    caller.role
  );

  return (
    <div className="container mx-auto px-4 py-8">
      <TeacherAttemptDetailView offeringId={offeringId} data={data} />
    </div>
  );
}
