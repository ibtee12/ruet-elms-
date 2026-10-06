import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { getCalendarData, generateICalendarFeed } from "@/services/calendar";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const calendarData = await getCalendarData(session.user.id, session.user.role);
  const icsFeed = generateICalendarFeed(
    calendarData.events,
    `RUET ELMS - ${session.user.name}`
  );

  return new NextResponse(icsFeed, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="ruet-elms-calendar.ics"',
      "Cache-Control": "private, no-cache, no-store, must-revalidate",
    },
  });
}
