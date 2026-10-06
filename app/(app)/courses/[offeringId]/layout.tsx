import * as React from "react";
import { Metadata } from "next";
import { Role } from "@prisma/client";
import { requireRole } from "@/lib/auth/session";
import { getStudentWorkspaceData } from "@/services/course-workspace";
import { WorkspaceHeader } from "@/components/course/workspace-header";
import { WorkspaceTabBar } from "@/components/course/workspace-tab-bar";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ offeringId: string }>;
}): Promise<Metadata> {
  const { offeringId } = await params;
  try {
    const caller = await requireRole(Role.STUDENT, Role.SUPER_ADMIN);
    const data = await getStudentWorkspaceData(caller.id, caller.role, offeringId);
    return {
      title: `${data.code}: ${data.title} | Student Workspace`,
      description: `Course workspace for ${data.code} • ${data.term} ${data.academicYear}`,
    };
  } catch {
    return {
      title: "Course Workspace | RUET ELMS",
    };
  }
}

export default async function StudentCourseLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ offeringId: string }>;
}) {
  const caller = await requireRole(Role.STUDENT, Role.SUPER_ADMIN);
  const { offeringId } = await params;

  // Authorization check and scoped data query
  const data = await getStudentWorkspaceData(caller.id, caller.role, offeringId);

  return (
    <div className="space-y-6">
      <WorkspaceHeader data={data} portal="student" />
      <WorkspaceTabBar offeringId={offeringId} portal="student" />
      <div className="pt-2">{children}</div>
    </div>
  );
}
