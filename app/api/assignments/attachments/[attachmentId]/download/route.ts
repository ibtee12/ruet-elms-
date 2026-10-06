import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canViewOffering } from "@/lib/auth/guards";
import { getSignedDownloadUrl } from "@/lib/storage";
import { Role } from "@prisma/client";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ attachmentId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Unauthorized. Please log in to download assignment attachments." },
      { status: 401 }
    );
  }

  const { attachmentId } = await params;

  const attachment = await prisma.assignmentAttachment.findUnique({
    where: { id: attachmentId },
    include: {
      assignment: {
        select: {
          offeringId: true,
          published: true,
        },
      },
    },
  });

  if (!attachment) {
    return NextResponse.json(
      { error: "Attachment not found." },
      { status: 404 }
    );
  }

  const offeringId = attachment.assignment.offeringId;
  const user = session.user as { id: string; role: Role };

  // Offering access authorization check
  const allowed = await canViewOffering(user, offeringId);
  if (!allowed) {
    return NextResponse.json(
      { error: "You are not authorized to download files from this course offering." },
      { status: 403 }
    );
  }

  // If student, check if assignment is published
  if (user.role === Role.STUDENT && !attachment.assignment.published) {
    return NextResponse.json(
      { error: "This assignment is not published yet." },
      { status: 403 }
    );
  }

  try {
    const signedUrl = await getSignedDownloadUrl(attachment.fileKey, 60);
    return NextResponse.redirect(signedUrl);
  } catch (err: unknown) {
    console.error("Failed to generate signed download URL for assignment attachment", err);
    return NextResponse.json(
      { error: "Failed to generate secure download link. Please try again later." },
      { status: 500 }
    );
  }
}
