import * as React from "react";
import { Metadata } from "next";
import { Role } from "@prisma/client";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/shared/page-header";
import { OfferingsManager, OfferingRow } from "./offerings-manager";
import { getOfferingsAction } from "@/actions/offerings";

export const metadata: Metadata = {
  title: "Course Offerings | RUET ELMS",
  description: "Academic term offerings, section allocations, and instructor assignments.",
};

export default async function DeptOfferingsPage() {
  const caller = await requireRole(Role.SUPER_ADMIN, Role.DEPT_ADMIN);

  let callerDeptId: string | undefined = undefined;
  let callerDeptName: string | undefined = undefined;

  if (caller.role === Role.DEPT_ADMIN) {
    const profile = await prisma.teacherProfile.findUnique({
      where: { userId: caller.id },
      include: { department: true },
    });
    callerDeptId = profile?.departmentId;
    callerDeptName = profile?.department.name;
  }

  // Fetch available catalog courses
  const availableCourses = await prisma.course.findMany({
    where: callerDeptId ? { departmentId: callerDeptId } : undefined,
    orderBy: { code: "asc" },
    select: {
      id: true,
      code: true,
      title: true,
      departmentId: true,
    },
  });

  const initialData = await getOfferingsAction({
    departmentId: callerDeptId,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          caller.role === Role.SUPER_ADMIN
            ? "Term Course Offerings"
            : `Term Offerings (${callerDeptName || "My Department"})`
        }
        subtitle={
          caller.role === Role.SUPER_ADMIN
            ? "Manage semester offerings, faculty appointments, and active section structures."
            : "Manage course offerings, assign teachers, and organize sections for your department."
        }
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Department", href: "/dept/offerings" },
          { label: "Offerings" },
        ]}
      />

      <OfferingsManager
        initialOfferings={initialData.offerings as OfferingRow[]}
        availableCourses={availableCourses}
        callerRole={caller.role}
        callerDeptId={callerDeptId}
      />
    </div>
  );
}
