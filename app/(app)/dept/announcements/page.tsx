import * as React from "react";
import { Metadata } from "next";
import { Role } from "@prisma/client";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/shared/page-header";
import { DeptAnnouncementsManager } from "@/components/dept/dept-announcements-manager";
import { ForbiddenError } from "@/lib/auth/errors";

export const metadata: Metadata = {
  title: "Department Announcements | RUET ELMS",
  description: "Official department announcements, notices, and communications.",
};

export default async function DeptAnnouncementsPage() {
  const caller = await requireRole(Role.DEPT_ADMIN, Role.SUPER_ADMIN);

  let department = null;

  if (caller.role === Role.DEPT_ADMIN) {
    const profile = await prisma.teacherProfile.findUnique({
      where: { userId: caller.id },
      include: { department: true },
    });

    if (!profile?.department) {
      throw new ForbiddenError("Department Administrator is not assigned to a department.");
    }
    department = profile.department;
  } else {
    // SUPER_ADMIN gets the first department by default
    department = await prisma.department.findFirst({
      orderBy: { code: "asc" },
    });
  }

  if (!department) {
    throw new ForbiddenError("No department found.");
  }

  const announcements = await prisma.announcement.findMany({
    where: { departmentId: department.id },
    include: {
      author: { select: { name: true, role: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Department Notices & Announcements"
        subtitle={`Official communications for the Department of ${department.name}`}
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Department Portal", href: "/dept/offerings" },
          { label: "Announcements" },
        ]}
      />

      <DeptAnnouncementsManager
        departmentId={department.id}
        departmentCode={department.code}
        departmentName={department.name}
        initialAnnouncements={announcements}
      />
    </div>
  );
}
