import * as React from "react";
import { Metadata } from "next";
import { Role } from "@prisma/client";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/shared/page-header";
import { DepartmentsManager } from "./departments-manager";

export const metadata: Metadata = {
  title: "Departments | RUET ELMS Admin",
  description: "Manage academic departments, faculty allocations, and course catalogs.",
};

export default async function AdminDepartmentsPage() {
  // Step 11: SUPER_ADMIN only access
  await requireRole(Role.SUPER_ADMIN);

  // Fetch departments with counts
  const departments = await prisma.department.findMany({
    orderBy: { code: "asc" },
    include: {
      _count: {
        select: {
          teacherProfiles: true,
          studentProfiles: true,
          courses: true,
        },
      },
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Academic Departments"
        subtitle="Configure academic departments, university department codes, and lifecycle status."
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Administration", href: "/admin/departments" },
          { label: "Departments" },
        ]}
      />

      <DepartmentsManager initialDepartments={departments} />
    </div>
  );
}
