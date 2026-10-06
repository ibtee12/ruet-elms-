import * as React from "react";
import { Role } from "@prisma/client";
import { requireRole } from "@/lib/auth/session";
import { getOfferingMaterialsData } from "@/services/materials";
import { OfferingMaterialsManager } from "@/components/course/offering-materials-manager";

export default async function TeacherCourseMaterialsPage({
  params,
}: {
  params: Promise<{ offeringId: string }>;
}) {
  const caller = await requireRole(Role.TEACHER, Role.SUPER_ADMIN);
  const { offeringId } = await params;

  // Authorization check and scoped data query
  const data = await getOfferingMaterialsData(offeringId, caller);

  return <OfferingMaterialsManager data={data} />;
}
