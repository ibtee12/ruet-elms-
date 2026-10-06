import * as React from "react";
import { Role } from "@prisma/client";
import { requireRole } from "@/lib/auth/session";
import { getStudentGradebookData } from "@/services/gradebook";
import { StudentGradesView } from "@/components/course/student-grades-view";

export default async function StudentCourseGradesPage({
  params,
}: {
  params: Promise<{ offeringId: string }>;
}) {
  const caller = await requireRole(Role.STUDENT, Role.SUPER_ADMIN);
  const { offeringId } = await params;

  const data = await getStudentGradebookData(offeringId, caller.id);

  return <StudentGradesView data={data} />;
}
