import * as React from "react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import { DeptAdminDashboardView } from "@/components/dashboard/dept-admin-dashboard-view";
import { ForbiddenError } from "@/lib/auth/errors";

export default async function DeptDashboardPage() {
  const sessionUser = await requireRole(Role.DEPT_ADMIN, Role.SUPER_ADMIN);

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: sessionUser.id },
    include: {
      teacherProfile: {
        include: { department: true },
      },
    },
  });

  const department = user.teacherProfile?.department;
  if (!department && sessionUser.role === Role.DEPT_ADMIN) {
    throw new ForbiddenError("You are not affiliated with an academic department.");
  }

  // If SUPER_ADMIN accesses /dept, pick first department or error if none
  let deptId = department?.id;
  let deptName = department?.name;
  let deptCode = department?.code;

  if (!deptId && sessionUser.role === Role.SUPER_ADMIN) {
    const firstDept = await prisma.department.findFirst({
      orderBy: { code: "asc" },
    });
    if (!firstDept) {
      throw new ForbiddenError("No department found in the system.");
    }
    deptId = firstDept.id;
    deptName = firstDept.name;
    deptCode = firstDept.code;
  }

  return (
    <DeptAdminDashboardView
      userId={user.id}
      userName={user.name}
      departmentName={deptName || "Engineering"}
      departmentCode={deptCode || "DEPT"}
    />
  );
}
