import * as React from "react";
import { Metadata } from "next";
import { Role } from "@prisma/client";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/shared/page-header";
import { CoursesManager, CourseRow } from "./courses-manager";
import { getCoursesAction } from "@/actions/courses";

export const metadata: Metadata = {
  title: "Course Catalog | RUET ELMS",
  description: "Institutional course catalog, syllabus descriptions, and credit distributions.",
};

export default async function AdminCoursesPage() {
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

  const departments = await prisma.department.findMany({
    where: callerDeptId ? { id: callerDeptId } : undefined,
    orderBy: { code: "asc" },
    select: { id: true, name: true, code: true },
  });

  const initialData = await getCoursesAction({
    departmentId: callerDeptId,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          caller.role === Role.SUPER_ADMIN
            ? "Academic Course Catalog"
            : `Course Catalog (${callerDeptName || "My Department"})`
        }
        subtitle={
          caller.role === Role.SUPER_ADMIN
            ? "Manage all institutional catalog courses, credit hours, and department curricula."
            : "Manage catalog courses and curriculum offerings for your department."
        }
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Administration", href: "/admin/courses" },
          { label: "Courses" },
        ]}
      />

      <CoursesManager
        initialCourses={initialData.courses as CourseRow[]}
        initialTotal={initialData.total}
        departments={departments}
        callerRole={caller.role}
        callerDeptId={callerDeptId}
      />
    </div>
  );
}
