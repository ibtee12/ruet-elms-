import * as React from "react";
import { Metadata } from "next";
import { Role } from "@prisma/client";
import { requireRole } from "@/lib/auth/session";
import { getStudentCourseProgressData } from "@/services/student-progress";
import { StudentProgressView } from "@/components/course/student-progress-view";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ offeringId: string }>;
}): Promise<Metadata> {
  const { offeringId } = await params;
  return {
    title: "My Learning Progress & Recommendations | RUET ELMS",
    description: `Track your course completion rate, weekly activity trends, and personalized recommendations for course ${offeringId}.`,
  };
}

export default async function StudentCourseProgressPage({
  params,
}: {
  params: Promise<{ offeringId: string }>;
}) {
  const caller = await requireRole(Role.STUDENT, Role.SUPER_ADMIN);
  const { offeringId } = await params;

  // Caller can only view their own student progress
  const data = await getStudentCourseProgressData(caller.id, offeringId);

  return <StudentProgressView data={data} />;
}
