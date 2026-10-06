import * as React from "react";
import { Role } from "@prisma/client";
import { requireRole } from "@/lib/auth/session";
import { getOfferingOverviewData } from "@/services/announcements";
import { CourseOverviewView } from "@/components/course/course-overview-view";

export default async function StudentCourseOverviewPage({
  params,
}: {
  params: Promise<{ offeringId: string }>;
}) {
  const caller = await requireRole(Role.STUDENT, Role.SUPER_ADMIN);
  const { offeringId } = await params;

  // Authorization check and scoped data query
  const data = await getOfferingOverviewData(offeringId, caller);

  return <CourseOverviewView data={data} portal="student" />;
}
