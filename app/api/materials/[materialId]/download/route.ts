import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canViewOffering } from "@/lib/auth/guards";
import { getSignedDownloadUrl } from "@/lib/storage";
import { recordMaterialView } from "@/lib/activity";
import { Role } from "@prisma/client";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ materialId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Unauthorized. Please log in to download course materials." },
      { status: 401 }
    );
  }

  const { materialId } = await params;

  const material = await prisma.material.findUnique({
    where: { id: materialId },
    include: {
      module: {
        include: {
          offering: true,
        },
      },
    },
  });

  if (!material) {
    return NextResponse.json(
      { error: "Material not found." },
      { status: 404 }
    );
  }

  const offeringId = material.module.offeringId;
  const user = session.user as { id: string; role: Role };

  // Object-level authorization check
  const allowed = await canViewOffering(user, offeringId);
  if (!allowed) {
    return NextResponse.json(
      { error: "You are not authorized to download materials from this course offering." },
      { status: 403 }
    );
  }

  // If student, check if material is published
  if (user.role === Role.STUDENT && !material.published) {
    return NextResponse.json(
      { error: "This course material is not published yet." },
      { status: 403 }
    );
  }

  // Log ActivityEvent (type MATERIAL_VIEWED) when opened/downloaded, throttled to once per material per hour
  try {
    await recordMaterialView({
      userId: user.id,
      offeringId,
      materialId: material.id,
    });
  } catch (logErr) {
    console.error("Failed to record material view activity", logErr);
  }

  // Handle uploaded file download
  if (material.fileKey) {
    try {
      // 60-second signed download URL
      const signedUrl = await getSignedDownloadUrl(material.fileKey, 60);
      return NextResponse.redirect(signedUrl);
    } catch (err: unknown) {
      console.error("Failed to generate signed download URL", err);
      return NextResponse.json(
        { error: "Failed to generate secure download link. Please try again later." },
        { status: 500 }
      );
    }
  }

  // Handle external link or video link
  if (material.url) {
    return NextResponse.redirect(material.url);
  }

  return NextResponse.json(
    { error: "This material does not contain a downloadable file or valid URL." },
    { status: 400 }
  );
}
