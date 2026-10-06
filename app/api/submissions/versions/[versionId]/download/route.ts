import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSignedDownloadUrl } from "@/lib/storage";
import { Role } from "@prisma/client";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ versionId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Unauthorized. Please log in to download submission files." },
      { status: 401 }
    );
  }

  const { versionId } = await params;
  const user = session.user as { id: string; role: Role };

  const version = await prisma.submissionVersion.findUnique({
    where: { id: versionId },
    include: {
      submission: {
        include: {
          assignment: {
            include: {
              offering: {
                include: {
                  offeringTeachers: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!version) {
    return NextResponse.json(
      { error: "Submission file not found." },
      { status: 404 }
    );
  }

  const submission = version.submission;
  const offering = submission.assignment.offering;

  // Access Authorization Check:
  // ONLY the student who submitted, the offering's teachers, or a super admin can download.
  const isOwnerStudent = submission.studentId === user.id;
  const isSuperAdmin = user.role === Role.SUPER_ADMIN;
  const isOfferingTeacher = offering.offeringTeachers.some(
    (ot) => ot.userId === user.id
  );

  if (!isOwnerStudent && !isSuperAdmin && !isOfferingTeacher) {
    return NextResponse.json(
      { error: "Forbidden. You are not authorized to download this student's submission." },
      { status: 403 }
    );
  }

  try {
    const signedUrl = await getSignedDownloadUrl(version.fileKey, 60);
    return NextResponse.redirect(signedUrl);
  } catch (err: unknown) {
    console.error("Failed to generate signed download URL for submission", err);
    return NextResponse.json(
      { error: "Failed to generate secure download link. Please try again later." },
      { status: 500 }
    );
  }
}
