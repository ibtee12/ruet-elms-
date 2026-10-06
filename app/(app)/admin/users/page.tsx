import * as React from "react";
import { Metadata } from "next";
import { Role } from "@prisma/client";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/shared/page-header";
import { UsersManager, UserRow } from "./users-manager";
import { getUsersAction } from "@/actions/users";

export const metadata: Metadata = {
  title: "User Management | RUET ELMS",
  description: "Manage institutional users, faculty profiles, and student rosters.",
};

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  const caller = await requireRole(Role.SUPER_ADMIN, Role.DEPT_ADMIN);
  const resolvedParams = await searchParams;

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

  // Fetch departments
  const departments = await prisma.department.findMany({
    where: callerDeptId ? { id: callerDeptId } : { isActive: true },
    orderBy: { code: "asc" },
    select: { id: true, name: true, code: true },
  });

  const initialRole = resolvedParams?.role as Role | undefined;

  // Initial users fetch
  const initialData = await getUsersAction({
    page: 1,
    pageSize: 10,
    role: initialRole,
    departmentId: callerDeptId,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          caller.role === Role.SUPER_ADMIN
            ? "University User Management"
            : `Department User Directory (${callerDeptName || "My Department"})`
        }
        subtitle={
          caller.role === Role.SUPER_ADMIN
            ? "Manage all registered university accounts, faculty allocations, and student academic credentials."
            : "Manage teacher and student accounts for your department."
        }
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Administration", href: "/admin/users" },
          { label: "Users" },
        ]}
      />

      <UsersManager
        initialUsers={initialData.users as UserRow[]}
        initialTotal={initialData.total}
        departments={departments}
        callerRole={caller.role}
        callerDeptId={callerDeptId}
        currentUserId={caller.id}
        initialRoleFilter={initialRole}
      />
    </div>
  );
}
