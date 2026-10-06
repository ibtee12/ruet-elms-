import { NextRequest } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { Role } from "@prisma/client";
import { assertOfferingTeacher } from "@/lib/auth/guards";
import { getTeacherGradebookData } from "@/services/gradebook";
import { generateGradebookCsv, GradebookExportStudentRow } from "@/lib/gradebook";

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
    if (user.role !== Role.SUPER_ADMIN) {
      await assertOfferingTeacher(user.id, offeringId, { allowTA: true });
    }

    const data = await getTeacherGradebookData(offeringId, {
      id: user.id,
      role: user.role,
    });

    const exportRows: GradebookExportStudentRow[] = data.students.map((s) => ({
      roll: s.roll,
      name: s.name,
      email: s.email,
      section: s.sectionName,
      totalFinalMarks: s.totalFinalMarks,
      totalMaxMarks: s.totalMaxMarks,
      percentage: s.percentage,
      assignmentScores: Object.fromEntries(
        Object.entries(s.cells).map(([aid, cell]) => [
          aid,
          {
            rawMarks: cell.rawMarks,
            finalMarks: cell.finalMarks,
            isLate: cell.isLate,
            isMissing: cell.isMissing,
          },
        ])
      ),
    }));

    const csvContent = generateGradebookCsv(data.assignments, exportRows);

    // Prepend UTF-8 Byte Order Mark (BOM) so Excel seamlessly recognizes UTF-8 text
    const bomCsv = "\uFEFF" + csvContent;

    const safeFilename = `${data.courseCode.replace(/[^a-zA-Z0-9_-]/g, "_")}_Gradebook_${data.academicYear}_${data.term}.csv`;

    return new Response(bomCsv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${safeFilename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return new Response(
      err instanceof Error ? err.message : "Failed to generate CSV",
      { status: 403 }
    );
  }
}
