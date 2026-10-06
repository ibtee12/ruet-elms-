import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { runAnalyticsSnapshotJob } from "@/services/analytics";

/**
 * Constant-time comparison between client header token and server CRON_SECRET.
 * Protects against timing attacks.
 */
function isValidCronSecret(headerValue: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!headerValue || !secret) {
    return false;
  }

  const token = headerValue.startsWith("Bearer ")
    ? headerValue.slice(7).trim()
    : headerValue.trim();

  const bufToken = Buffer.from(token);
  const bufSecret = Buffer.from(secret);

  if (bufToken.length !== bufSecret.length) {
    return false;
  }

  return crypto.timingSafeEqual(bufToken, bufSecret);
}

export async function POST(req: NextRequest) {
  // Check authorization headers: Authorization: Bearer <secret> or x-cron-secret: <secret>
  const authHeader =
    req.headers.get("authorization") ||
    req.headers.get("x-cron-secret") ||
    req.headers.get("cron-secret");

  if (!isValidCronSecret(authHeader)) {
    return NextResponse.json(
      { error: "Unauthorized. Invalid or missing CRON_SECRET." },
      { status: 401 }
    );
  }

  try {
    let date: Date | undefined;
    let offeringId: string | undefined;

    // Optional parameters from request body or query params
    try {
      const body = await req.json();
      if (body?.date) {
        date = new Date(body.date);
      }
      if (body?.offeringId) {
        offeringId = body.offeringId;
      }
    } catch {
      // Body not provided or not JSON, check search params
      const searchParams = req.nextUrl.searchParams;
      const paramDate = searchParams.get("date");
      if (paramDate) {
        date = new Date(paramDate);
      }
      const paramOfferingId = searchParams.get("offeringId");
      if (paramOfferingId) {
        offeringId = paramOfferingId;
      }
    }

    const summary = await runAnalyticsSnapshotJob({ date, offeringId });

    return NextResponse.json({
      success: true,
      summary,
    });
  } catch (error: unknown) {
    console.error("[Analytics Cron] Execution error:", error);
    return NextResponse.json(
      { error: "Internal server error during analytics snapshot processing" },
      { status: 500 }
    );
  }
}
