import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { Role } from "@prisma/client";
import { assertEnrolled } from "@/lib/auth/guards";
import { getStudentQuizQuestions } from "@/services/quizzes";
import { prisma } from "@/lib/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ offeringId: string; id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { offeringId, id: quizId } = await params;

    // If caller is student, verify enrollment
    if (session.user.role === Role.STUDENT) {
      await assertEnrolled(session.user.id, offeringId);
    }

    const quiz = await prisma.quiz.findUnique({
      where: { id: quizId },
      select: {
        id: true,
        offeringId: true,
        title: true,
        description: true,
        durationMin: true,
        startAt: true,
        endAt: true,
        maxAttempts: true,
        published: true,
        showAnswersAfterClose: true,
      },
    });

    if (!quiz || quiz.offeringId !== offeringId || !quiz.published) {
      return NextResponse.json(
        { error: "Quiz not found or not published" },
        { status: 404 }
      );
    }

    // Call student-safe helper: strips isCorrect for unfinished quizzes
    const questions = await getStudentQuizQuestions(
      quizId,
      offeringId,
      session.user.id
    );

    return NextResponse.json({
      quiz: {
        id: quiz.id,
        title: quiz.title,
        description: quiz.description,
        durationMin: quiz.durationMin,
        startAt: quiz.startAt,
        endAt: quiz.endAt,
        maxAttempts: quiz.maxAttempts,
      },
      questions,
    });
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    const status = err.statusCode || 500;
    return NextResponse.json(
      { error: err.message || "Failed to fetch quiz" },
      { status }
    );
  }
}
