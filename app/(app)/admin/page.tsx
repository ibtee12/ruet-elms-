import * as React from "react";
import { requireRole } from "@/lib/auth";
import { Role } from "@prisma/client";
import { SuperAdminDashboardView } from "@/components/dashboard/super-admin-dashboard-view";

export default async function AdminDashboardPage() {
  const sessionUser = await requireRole(Role.SUPER_ADMIN);

  return <SuperAdminDashboardView userName={sessionUser.name} />;
}
