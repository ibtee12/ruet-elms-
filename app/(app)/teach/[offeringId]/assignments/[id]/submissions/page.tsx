import * as React from "react";
import { Role } from "@prisma/client";
import { requireRole } from "@/lib/auth/session";
import { getTeacherAssignmentSubmissionsData } from "@/services/grading";
import { TeacherAssignmentSubmissionsView } from "@/components/course/teacher-assignment-submissions-view";

export default async function TeacherAssignmentSubmissionsPage({
  params,
}: {
  params: Promise<{ offeringId: string; id: string }>;
}) {
  const caller = await requireRole(Role.TEACHER, Role.SUPER_ADMIN);
  const { offeringId, id } = await params;
  const data = await getTeacherAssignmentSubmissionsData(offeringId, id, caller);

  return <TeacherAssignmentSubmissionsView data={data} />;
}
