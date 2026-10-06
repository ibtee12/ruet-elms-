import * as React from "react";
import Link from "next/link";
import { Role } from "@prisma/client";
import { requireRole } from "@/lib/auth/session";
import { getTeacherWorkspaceData } from "@/services/course-workspace";
import { WorkspaceTabPlaceholder } from "@/components/course/workspace-tab-placeholder";
import { Users, ExternalLink } from "lucide-react";

export default async function TeacherCourseStudentsPage({
  params,
}: {
  params: Promise<{ offeringId: string }>;
}) {
  const caller = await requireRole(Role.TEACHER, Role.SUPER_ADMIN);
  const { offeringId } = await params;
  await getTeacherWorkspaceData(caller.id, caller.role, offeringId);

  return (
    <div className="space-y-4">
      <WorkspaceTabPlaceholder
        title="Student Roster & Section Management"
        description="View enrolled students, manage section assignments, drop students, and download roster spreadsheets."
        icon={Users}
        actionHint="Student roster management is fully available in the enrollment portal."
      />

      <div className="flex justify-center">
        <Link
          href={`/teach/offerings/${offeringId}/students`}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-semibold shadow-xs transition-colors"
        >
          <Users className="w-4 h-4" />
          <span>Open Full Student Roster Manager</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
}
