import * as React from "react";
import { Role } from "@prisma/client";
import { requireRole } from "@/lib/auth/session";
import { getTeacherSubmissionDetailData } from "@/services/grading";
import { TeacherSubmissionDetailView } from "@/components/course/teacher-submission-detail-view";

export default async function TeacherSubmissionDetailPage({
  params,
}: {
  params: Promise<{ offeringId: string; id: string }>;
}) {
  const caller = await requireRole(Role.TEACHER, Role.SUPER_ADMIN);
  const { offeringId, id } = await params;
  const data = await getTeacherSubmissionDetailData(offeringId, id, caller);

  return <TeacherSubmissionDetailView data={data} />;
}
