import { Metadata } from "next";
import { requireRole } from "@/lib/auth/session";
import { Role } from "@prisma/client";
import { getAuditLogs } from "@/services/audit-logs";
import { getAuditLogFilterOptionsAction } from "@/actions/audit-logs";
import { AuditLogViewer } from "@/components/audit-logs/audit-log-viewer";

export const metadata: Metadata = {
  title: "Department Audit Logs | RUET ELMS",
  description:
    "Department-scoped audit trail and academic activity records.",
};

export default async function DeptAuditLogsPage() {
  const caller = await requireRole(Role.DEPT_ADMIN);

  const [initialData, filterOptions] = await Promise.all([
    getAuditLogs({
      caller: { id: caller.id, role: caller.role },
      page: 1,
      pageSize: 50,
    }),
    getAuditLogFilterOptionsAction(),
  ]);

  return (
    <div className="container mx-auto py-8 px-4 sm:px-6 lg:px-8 max-w-7xl">
      <AuditLogViewer
        initialData={initialData}
        filterOptions={filterOptions}
        isDeptAdmin={true}
        callerRole={caller.role}
      />
    </div>
  );
}
