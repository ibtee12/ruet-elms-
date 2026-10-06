import * as React from "react";
import { Role } from "@prisma/client";
import { requireRole } from "@/lib/auth/session";
import { getTeacherGradebookData } from "@/services/gradebook";
import { TeacherGradebookView } from "@/components/course/teacher-gradebook-view";

export default async function TeacherCourseGradebookPage({
  params,
}: {
  params: Promise<{ offeringId: string }>;
}) {
  const caller = await requireRole(Role.TEACHER, Role.SUPER_ADMIN);
  const { offeringId } = await params;

  const data = await getTeacherGradebookData(offeringId, {
    id: caller.id,
    role: caller.role,
  });

  return <TeacherGradebookView initialData={data} />;
}
