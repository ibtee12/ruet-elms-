import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { headers } from "next/headers";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getClientIp } from "@/lib/utils/ip";

export async function POST() {
  const session = await getServerSession(authOptions);

  if (session?.user?.id) {
    const headerList = await headers();
    const clientIp = getClientIp(headerList);

    try {
      await prisma.auditLog.create({
        data: {
          action: "LOGOUT",
          objectType: "User",
          objectId: session.user.id,
          userId: session.user.id,
          description: "User logged out",
          ip: clientIp,
        },
      });
    } catch (e) {
      console.error("Failed to record logout audit log:", e);
    }
  }

  return NextResponse.json({ success: true, message: "Logged out" });
}
