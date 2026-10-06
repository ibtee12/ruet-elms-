import * as React from "react";
import { Role } from "@prisma/client";
import { requireRole } from "@/lib/auth/session";
import { getStudentOfferingAssignmentsData } from "@/services/assignments";
import { StudentOfferingAssignmentsView } from "@/components/course/student-offering-assignments-view";

export default async function StudentCourseAssignmentsPage({
  params,
}: {
  params: Promise<{ offeringId: string }>;
}) {
  const caller = await requireRole(Role.STUDENT, Role.SUPER_ADMIN);
  const { offeringId } = await params;
  const data = await getStudentOfferingAssignmentsData(offeringId, caller.id);

  return <StudentOfferingAssignmentsView data={data} />;
}

