import * as React from "react";
import { Role } from "@prisma/client";
import { requireRole } from "@/lib/auth/session";
import { getStudentAssignmentDetailData } from "@/services/assignments";
import { StudentAssignmentDetailView } from "@/components/course/student-assignment-detail-view";

export default async function StudentCourseAssignmentDetailPage({
  params,
}: {
  params: Promise<{ offeringId: string; assignmentId: string }>;
}) {
  const caller = await requireRole(Role.STUDENT, Role.SUPER_ADMIN);
  const { offeringId, assignmentId } = await params;
  const data = await getStudentAssignmentDetailData(
    offeringId,
    assignmentId,
    caller.id
  );

  return <StudentAssignmentDetailView data={data} />;
}
