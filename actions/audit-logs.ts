"use server";

import { requireRole } from "@/lib/auth/session";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  getAuditLogs,
  getCallerDeptId,
  AUDIT_ACTIONS,
  AUDIT_OBJECT_TYPES,
  GetAuditLogsResult,
} from "@/services/audit-logs";

export interface FilterOptions {
  actions: string[];
  objectTypes: string[];
  departments: Array<{ id: string; name: string; code: string }>;
  users: Array<{ id: string; name: string; email: string; role: Role }>;
  userDeptId?: string;
}

/**
 * Server action to fetch filter options (departments, users, actions, object types).
 * Scoped according to caller's role.
 */
export async function getAuditLogFilterOptionsAction(): Promise<FilterOptions> {
  const caller = await requireRole(Role.SUPER_ADMIN, Role.DEPT_ADMIN);

  let userDeptId: string | undefined = undefined;
  let departments: Array<{ id: string; name: string; code: string }> = [];

  if (caller.role === Role.SUPER_ADMIN) {
    departments = await prisma.department.findMany({
      select: { id: true, name: true, code: true },
      orderBy: { code: "asc" },
    });
  } else {
    userDeptId = await getCallerDeptId(caller.id);
    const dept = await prisma.department.findUnique({
      where: { id: userDeptId },
      select: { id: true, name: true, code: true },
    });
    if (dept) {
      departments = [dept];
    }
  }

  // Fetch users scoped to role
  const userWhere =
    caller.role === Role.DEPT_ADMIN && userDeptId
      ? {
          OR: [
            { studentProfile: { departmentId: userDeptId } },
            { teacherProfile: { departmentId: userDeptId } },
          ],
        }
      : {};

  const users = await prisma.user.findMany({
    where: userWhere,
    select: { id: true, name: true, email: true, role: true },
    take: 300,
    orderBy: { name: "asc" },
  });

  return {
    actions: [...AUDIT_ACTIONS],
    objectTypes: [...AUDIT_OBJECT_TYPES],
    departments,
    users,
    userDeptId,
  };
}

export interface FetchAuditLogsInput {
  departmentId?: string;
  userId?: string;
  actions?: string[];
  objectType?: string;
  objectIdSearch?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}

/**
 * Server action to fetch a paginated page of audit logs.
 * Strictly enforces role scoping.
 */
export async function fetchAuditLogsAction(
  input: FetchAuditLogsInput
): Promise<GetAuditLogsResult> {
  const caller = await requireRole(Role.SUPER_ADMIN, Role.DEPT_ADMIN);

  return await getAuditLogs({
    caller: { id: caller.id, role: caller.role },
    departmentId: input.departmentId,
    userId: input.userId,
    actions: input.actions,
    objectType: input.objectType,
    objectIdSearch: input.objectIdSearch,
    startDate: input.startDate,
    endDate: input.endDate,
    page: input.page || 1,
    pageSize: input.pageSize || 50,
  });
}
