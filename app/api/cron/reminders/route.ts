import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { processReminders } from "@/services/reminders";

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
    const summary = await processReminders();
    return NextResponse.json({
      success: true,
      summary,
    });
  } catch (error: unknown) {
    console.error("[Reminders Cron] Execution error:", error);
    return NextResponse.json(
      { error: "Internal server error during reminder processing" },
      { status: 500 }
    );
  }
}
