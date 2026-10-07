import * as React from "react";
import { Metadata } from "next";
import { Role } from "@prisma/client";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/shared/page-header";
import { assertDeptAccess } from "@/lib/auth/guards";
import { getOfferingDetailAction } from "@/actions/offerings";
import { getRosterAction } from "@/actions/enrollment";
import {
  OfferingDetailManager,
  OfferingDetail,
} from "./offering-detail-manager";

export const metadata: Metadata = {
  title: "Offering Detail | RUET ELMS",
  description: "Manage course offering sections, instructors, join code, and publication status.",
};

export default async function OfferingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const caller = await requireRole(
    Role.SUPER_ADMIN,
    Role.DEPT_ADMIN
  );

  const { id } = await params;
  const [offering, initialRoster] = await Promise.all([
    getOfferingDetailAction(id),
    getRosterAction(id),
  ]);

  // Object-level isolation: assert DEPT_ADMIN has authority over this offering's department
  await assertDeptAccess(caller.id, offering.course.departmentId);

  // Fetch teachers from the offering's department for assignment dialog
  const departmentTeachers = await prisma.teacherProfile.findMany({
    where: { departmentId: offering.course.departmentId },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
    orderBy: { user: { name: "asc" } },
  });

  const teacherOptions = departmentTeachers.map((t) => ({
    id: t.userId,
    name: t.user.name,
    email: t.user.email,
    designation: t.designation,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${offering.course.code}: ${offering.course.title}`}
        subtitle={`${offering.term} ${offering.academicYear} • Department of ${offering.course.department.name}`}
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Offerings", href: "/dept/offerings" },
          { label: offering.course.code },
        ]}
      />

      <OfferingDetailManager
        initialOffering={offering as unknown as OfferingDetail}
        departmentTeachers={teacherOptions}
        callerRole={caller.role}
        initialRoster={initialRoster}
      />
    </div>
  );
}
