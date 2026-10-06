import * as React from "react";
import { Metadata } from "next";
import { Role } from "@prisma/client";
import { requireRole } from "@/lib/auth/session";
import { getTeacherWorkspaceData } from "@/services/course-workspace";
import { WorkspaceHeader } from "@/components/course/workspace-header";
import { WorkspaceTabBar } from "@/components/course/workspace-tab-bar";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ offeringId: string }>;
}): Promise<Metadata> {
  const { offeringId } = await params;
  try {
    const caller = await requireRole(Role.TEACHER, Role.SUPER_ADMIN);
    const data = await getTeacherWorkspaceData(caller.id, caller.role, offeringId);
    return {
      title: `${data.code}: ${data.title} | Teacher Workspace`,
      description: `Instructor workspace for ${data.code} • ${data.term} ${data.academicYear}`,
    };
  } catch {
    return {
      title: "Teacher Workspace | RUET ELMS",
    };
  }
}

export default async function TeacherCourseLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ offeringId: string }>;
}) {
  const caller = await requireRole(Role.TEACHER, Role.DEPT_ADMIN, Role.SUPER_ADMIN);
  const { offeringId } = await params;

  // Authorization check and scoped data query
  const data = await getTeacherWorkspaceData(caller.id, caller.role, offeringId);

  return (
    <div className="space-y-6">
      <WorkspaceHeader data={data} portal="teacher" />
      <WorkspaceTabBar offeringId={offeringId} portal="teacher" />
      <div className="pt-2">{children}</div>
    </div>
  );
}
