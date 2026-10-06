import * as React from "react";
import { requireUser } from "@/lib/auth/session";
import { getCalendarData } from "@/services/calendar";
import { AcademicCalendarView } from "@/components/calendar/academic-calendar-view";

export const metadata = {
  title: "Academic Calendar | RUET ELMS",
  description: "View synchronized course deadlines, quiz windows, and academic schedules in Asia/Dhaka.",
};

export default async function CalendarPage() {
  const user = await requireUser();
  const calendarData = await getCalendarData(user.id, user.role);

  return (
    <div className="space-y-6">
      <AcademicCalendarView
        events={calendarData.events}
        courses={calendarData.courses}
        userRole={user.role}
      />
    </div>
  );
}
