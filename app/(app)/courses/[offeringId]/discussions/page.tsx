import * as React from "react";
import { Role } from "@prisma/client";
import { requireRole } from "@/lib/auth/session";
import { getStudentWorkspaceData } from "@/services/course-workspace";
import { getOfferingThreads } from "@/services/discussions";
import { OfferingDiscussionsManager } from "@/components/course/offering-discussions-manager";

export default async function StudentCourseDiscussionsPage({
  params,
}: {
  params: Promise<{ offeringId: string }>;
}) {
  const caller = await requireRole(Role.STUDENT, Role.SUPER_ADMIN);
  const { offeringId } = await params;
  const workspace = await getStudentWorkspaceData(caller.id, caller.role, offeringId);

  const threads = await getOfferingThreads({
    offeringId,
    userId: caller.id,
    userRole: caller.role,
  });

  return (
    <div className="space-y-6">
      <OfferingDiscussionsManager
        offeringId={offeringId}
        courseCode={workspace.offering.course.code}
        courseTitle={workspace.offering.course.title}
        initialThreads={threads}
        currentUserId={caller.id}
        currentUserRole={caller.role}
        isModerator={caller.role === Role.SUPER_ADMIN}
        portal="student"
      />
    </div>
  );
}
