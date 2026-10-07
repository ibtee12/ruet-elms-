import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { getThreadDetail, createDiscussionPost } from "@/services/discussions";
import { createPostSchema } from "@/lib/validations/discussion";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ offeringId: string; threadId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { threadId } = await params;

    const thread = await getThreadDetail(
      threadId,
      session.user.id,
      session.user.role
    );

    return NextResponse.json({ thread });
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    const status = err.statusCode || 500;
    return NextResponse.json(
      { error: err.message || "Failed to fetch thread detail" },
      { status }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ offeringId: string; threadId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { threadId } = await params;
    const body = await req.json();

    const parsed = createPostSchema.parse({
      ...body,
      threadId,
    });

    const post = await createDiscussionPost(parsed, {
      id: session.user.id,
      role: session.user.role,
      name: session.user.name ?? undefined,
    });

    return NextResponse.json({ post }, { status: 201 });
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    const status = err.statusCode || 400;
    return NextResponse.json(
      { error: err.message || "Failed to post reply" },
      { status }
    );
  }
}
