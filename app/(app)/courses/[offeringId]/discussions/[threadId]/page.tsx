import * as React from "react";
import { Role } from "@prisma/client";
import { requireRole } from "@/lib/auth/session";
import { getStudentWorkspaceData } from "@/services/course-workspace";
import { getThreadDetail } from "@/services/discussions";
import { ThreadDetailView } from "@/components/course/thread-detail-view";

export default async function StudentThreadDetailPage({
  params,
}: {
  params: Promise<{ offeringId: string; threadId: string }>;
}) {
  const caller = await requireRole(Role.STUDENT, Role.SUPER_ADMIN);
  const { offeringId, threadId } = await params;
  const workspace = await getStudentWorkspaceData(caller.id, caller.role, offeringId);

  const thread = await getThreadDetail(threadId, caller.id, caller.role);

  return (
    <ThreadDetailView
      offeringId={offeringId}
      courseCode={workspace.offering.course.code}
      thread={thread}
      currentUserId={caller.id}
      currentUserRole={caller.role}
      isModerator={caller.role === Role.SUPER_ADMIN}
      portal="student"
    />
  );
}
