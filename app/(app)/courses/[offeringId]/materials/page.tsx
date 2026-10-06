import * as React from "react";
import { Metadata } from "next";
import { Role } from "@prisma/client";
import { requireRole } from "@/lib/auth/session";
import { getStudentOfferingMaterialsData } from "@/services/materials";
import { StudentMaterialsView } from "@/components/course/student-materials-view";

export const metadata: Metadata = {
  title: "Course Materials | Student Workspace",
  description: "View and access published course modules, lecture slides, and learning materials.",
};

export default async function StudentCourseMaterialsPage({
  params,
}: {
  params: Promise<{ offeringId: string }>;
}) {
  const caller = await requireRole(Role.STUDENT, Role.SUPER_ADMIN);
  const { offeringId } = await params;

  // Authorization check and scoped published materials query
  const materialsData = await getStudentOfferingMaterialsData(offeringId, caller.id);

  return <StudentMaterialsView initialData={materialsData} />;
}
