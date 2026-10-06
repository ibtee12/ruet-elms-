import * as React from "react";
import { Metadata } from "next";
import { Role } from "@prisma/client";
import { requireRole } from "@/lib/auth/session";
import { getTeacherOfferingAnalytics } from "@/services/teacher-analytics";
import { TeacherAnalyticsView } from "@/components/course/teacher-analytics-view";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ offeringId: string }>;
}): Promise<Metadata> {
  const { offeringId } = await params;
  return {
    title: "Class Analytics & Attention Indicator | RUET ELMS",
    description: `Performance metrics, submission rates, topic rankings, and student attention telemetry for offering ${offeringId}.`,
  };
}

export default async function TeacherCourseAnalyticsPage({
  params,
}: {
  params: Promise<{ offeringId: string }>;
}) {
  const caller = await requireRole(Role.TEACHER, Role.DEPT_ADMIN, Role.SUPER_ADMIN);
  const { offeringId } = await params;

  // Authorization check inside service verifies assigned instructor/TA or department admin
  const data = await getTeacherOfferingAnalytics(offeringId, caller);

  return <TeacherAnalyticsView data={data} />;
}
