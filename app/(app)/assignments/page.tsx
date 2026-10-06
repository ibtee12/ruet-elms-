import * as React from "react";
import { Role } from "@prisma/client";
import { requireRole } from "@/lib/auth/session";
import { getStudentGlobalAssignmentsData } from "@/services/assignments";
import { StudentGlobalAssignmentsView } from "@/components/course/student-global-assignments-view";

export default async function AssignmentsPage() {
  const caller = await requireRole(Role.STUDENT, Role.SUPER_ADMIN);
  const data = await getStudentGlobalAssignmentsData(caller.id);

  return <StudentGlobalAssignmentsView data={data} />;
}

