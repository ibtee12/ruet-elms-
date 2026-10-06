import { NextRequest } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { Role } from "@prisma/client";
import { assertOfferingTeacher } from "@/lib/auth/guards";
import {
  getTeacherQuizResults,
  generateQuizResultsCsv,
} from "@/services/quiz-attempts";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ offeringId: string; quizId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { offeringId, quizId } = await params;
  const user = session.user as { id: string; role: Role };

  try {
    if (user.role !== Role.SUPER_ADMIN) {
      await assertOfferingTeacher(user.id, offeringId, { allowTA: true });
    }

    const data = await getTeacherQuizResults(
      quizId,
      offeringId,
      user.id,
      user.role
    );

    const csvContent = generateQuizResultsCsv(data);

    // Prepend UTF-8 Byte Order Mark (BOM) so Excel seamlessly recognizes UTF-8 text
    const bomCsv = "\uFEFF" + csvContent;

    const safeFilename = `${data.courseCode.replace(/[^a-zA-Z0-9_-]/g, "_")}_Quiz_${data.quizTitle.replace(/[^a-zA-Z0-9_-]/g, "_")}_Results.csv`;

    return new Response(bomCsv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${safeFilename}"`,
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (error: unknown) {
    const err = error as { status?: number; message?: string };
    const status = err.status || 500;
    return new Response(err.message || "Failed to generate CSV export", {
      status,
    });
  }
}
