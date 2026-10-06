import * as React from "react";
import { Role } from "@prisma/client";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getOfferingAnnouncements } from "@/services/announcements";
import { OfferingAnnouncementsManager } from "@/components/course/offering-announcements-manager";

export default async function TeacherCourseAnnouncementsPage({
  params,
}: {
  params: Promise<{ offeringId: string }>;
}) {
  const caller = await requireRole(Role.TEACHER, Role.SUPER_ADMIN);
  const { offeringId } = await params;

  const [announcements, offering] = await Promise.all([
    getOfferingAnnouncements(offeringId, caller),
    prisma.courseOffering.findUniqueOrThrow({
      where: { id: offeringId },
      select: { status: true },
    }),
  ]);

  const isArchived = offering.status === "ARCHIVED";
  const canManage = true;

  return (
    <OfferingAnnouncementsManager
      offeringId={offeringId}
      initialAnnouncements={announcements}
      isArchived={isArchived}
      canManage={canManage}
    />
  );
}
