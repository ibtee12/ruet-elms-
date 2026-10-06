import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { ThreadCategory } from "@prisma/client";
import { getOfferingThreads, createDiscussionThread } from "@/services/discussions";
import { createThreadSchema } from "@/lib/validations/discussion";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ offeringId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { offeringId } = await params;
    const { searchParams } = new URL(req.url);

    const categoryParam = searchParams.get("category");
    const category =
      categoryParam && Object.values(ThreadCategory).includes(categoryParam as ThreadCategory)
        ? (categoryParam as ThreadCategory)
        : categoryParam === "ALL"
        ? "ALL"
        : undefined;

    const unansweredOnly = searchParams.get("unanswered") === "true";
    const search = searchParams.get("search") || undefined;
    const sortBy = searchParams.get("sortBy") === "newest" ? "newest" : "activity";

    const threads = await getOfferingThreads({
      offeringId,
      userId: session.user.id,
      userRole: session.user.role,
      category,
      unansweredOnly,
      search,
      sortBy,
    });

    return NextResponse.json({ threads });
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    const status = err.statusCode || 500;
    return NextResponse.json(
      { error: err.message || "Failed to fetch discussion threads" },
      { status }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ offeringId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { offeringId } = await params;
    const body = await req.json();

    const parsed = createThreadSchema.parse({
      ...body,
      offeringId,
    });

    const thread = await createDiscussionThread(parsed, {
      id: session.user.id,
      role: session.user.role,
    });

    return NextResponse.json({ thread }, { status: 201 });
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    const status = err.statusCode || 400;
    return NextResponse.json(
      { error: err.message || "Failed to create discussion thread" },
      { status }
    );
  }
}
