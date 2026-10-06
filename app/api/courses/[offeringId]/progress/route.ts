import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { Role } from "@prisma/client";
import { getStudentCourseProgressData } from "@/services/student-progress";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ offeringId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { offeringId } = await params;
  const user = session.user;

  // Student can only view their own progress
  const targetStudentId =
    user.role === Role.STUDENT ? user.id : req.nextUrl.searchParams.get("studentId") || user.id;

  try {
    const data = await getStudentCourseProgressData(targetStudentId, offeringId);

    // Explicit safety guarantee: Never expose riskScore, riskLevel, or reasons to students
    const studentSafePayload = {
      offeringId: data.offeringId,
      courseCode: data.courseCode,
      courseTitle: data.courseTitle,
      term: data.term,
      academicYear: data.academicYear,
      breakdown: data.breakdown,
      weeklyActivity: data.weeklyActivity,
      trendSentence: data.trendSentence,
      topicPerformances: data.topicPerformances,
      weakTopics: data.weakTopics,
      hasTopicTags: data.hasTopicTags,
      recommendations: data.recommendations,
      weakTopicThreshold: data.weakTopicThreshold,
    };

    return NextResponse.json({
      success: true,
      data: studentSafePayload,
    });
  } catch (error: unknown) {
    console.error("[Student Progress API] Error:", error);
    const message = error instanceof Error ? error.message : "Failed to load progress data";
    const status = message.toLowerCase().includes("not enrolled") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
