import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { Role } from "@prisma/client";
import { exportAuditLogsCsv } from "@/services/audit-logs";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (
      !session?.user ||
      (session.user.role !== Role.SUPER_ADMIN &&
        session.user.role !== Role.DEPT_ADMIN)
    ) {
      return new NextResponse(
        JSON.stringify({ error: "Unauthorized access to audit log export." }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    const { searchParams } = new URL(request.url);

    const departmentId = searchParams.get("departmentId") || undefined;
    const userId = searchParams.get("userId") || undefined;
    const actionsParam = searchParams.get("actions");
    const actions = actionsParam
      ? actionsParam.split(",").map((a) => a.trim()).filter(Boolean)
      : undefined;
    const objectType = searchParams.get("objectType") || undefined;
    const objectIdSearch = searchParams.get("objectIdSearch") || undefined;
    const startDate = searchParams.get("startDate") || undefined;
    const endDate = searchParams.get("endDate") || undefined;
    const maxRowsParam = searchParams.get("maxRows");
    const maxRows = maxRowsParam ? parseInt(maxRowsParam, 10) : 2000;

    const { csvContent, rowCount } = await exportAuditLogsCsv({
      caller: { id: session.user.id, role: session.user.role as Role },
      departmentId,
      userId,
      actions,
      objectType,
      objectIdSearch,
      startDate,
      endDate,
      maxRows: isNaN(maxRows) ? 2000 : maxRows,
    });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `ruet_elms_audit_logs_${timestamp}.csv`;

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Exported-Count": String(rowCount),
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (err: any) {
    console.error("Audit log CSV export error:", err);
    return new NextResponse(
      JSON.stringify({
        error: err?.message || "Internal server error exporting audit logs.",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
