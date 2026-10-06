import { NextRequest } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { Role } from "@prisma/client";
import { assertAnalyticsAccess } from "@/lib/auth/guards";
import {
  getTeacherOfferingAnalytics,
  generateAtRiskCsv,
} from "@/services/teacher-analytics";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ offeringId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { offeringId } = await params;
  const user = session.user as { id: string; role: Role };

  try {
    // Enforce role guard: only instructors/TAs of the offering, dept admin, and super admin
    await assertAnalyticsAccess(user, offeringId);

    const data = await getTeacherOfferingAnalytics(offeringId, user);

    const csvContent = generateAtRiskCsv(
      {
        code: data.courseCode,
        title: data.courseTitle,
        term: data.term,
        academicYear: data.academicYear,
      },
      data.students
    );

    const safeFilename = `${data.courseCode.replace(/[^a-zA-Z0-9_-]/g, "_")}_At_Risk_Report_${data.academicYear}_${data.term}.csv`;

    return new Response(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${safeFilename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return new Response(
      err instanceof Error ? err.message : "Access forbidden",
      { status: 403 }
    );
  }
}
