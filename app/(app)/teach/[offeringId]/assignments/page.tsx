import * as React from "react";
import { Metadata } from "next";
import { Role } from "@prisma/client";
import { requireRole } from "@/lib/auth/session";
import { getTeacherOfferingAssignmentsData } from "@/services/assignments";
import { OfferingAssignmentsManager } from "@/components/course/offering-assignments-manager";

export const metadata: Metadata = {
  title: "Assignments | Teacher Workspace",
  description: "Create and manage course assignments, deadlines, submission rules, and grading.",
};

export default async function TeacherCourseAssignmentsPage({
  params,
}: {
  params: Promise<{ offeringId: string }>;
}) {
  const caller = await requireRole(Role.TEACHER, Role.SUPER_ADMIN);
  const { offeringId } = await params;

  // Authorization check and scoped assignments query
  const assignmentsData = await getTeacherOfferingAssignmentsData(offeringId, caller);

  return <OfferingAssignmentsManager initialData={assignmentsData} />;
}
