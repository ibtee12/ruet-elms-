"use client";

import * as React from "react";
import Link from "next/link";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  FileCheck2,
  HelpCircle,
  Megaphone,
  Download,
  Filter,
  Clock,
  ExternalLink,
  BookOpen,
  CalendarDays,
  ListFilter,
  Layers,
} from "lucide-react";
import { formatDhaka, formatRelative } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import type {
  CalendarEvent,
  CalendarEventType,
  UserCourseOption,
} from "@/services/calendar";
import { getDhakaDateKey } from "@/services/calendar";

interface AcademicCalendarViewProps {
  events: CalendarEvent[];
  courses: UserCourseOption[];
  userRole: string;
}

type CalendarViewMode = "month" | "week" | "day" | "agenda";

const EVENT_TYPE_CONFIG: Record<
  CalendarEventType,
  {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badgeClass: string;
    chipClass: string;
    textClass: string;
  }
> = {
  ASSIGNMENT_DEADLINE: {
    label: "Assignment Deadline",
    icon: FileCheck2,
    badgeClass: "bg-warning/15 text-[#854D0E] dark:bg-warning/20 dark:text-warning border-warning/40",
    chipClass: "bg-warning/20 border-warning/50 text-[#854D0E] dark:text-warning hover:bg-warning/30",
    textClass: "text-[#854D0E] dark:text-warning",
  },
  QUIZ_WINDOW: {
    label: "Quiz Window",
    icon: HelpCircle,
    badgeClass: "bg-primary/15 text-primary dark:bg-primary/20 dark:text-primary border-primary/40",
    chipClass: "bg-primary/20 border-primary/50 text-primary dark:text-primary hover:bg-primary/30",
    textClass: "text-primary dark:text-primary",
  },
  ANNOUNCEMENT: {
    label: "Announcement",
    icon: Megaphone,
    badgeClass: "bg-info/15 text-info dark:bg-info/20 dark:text-info border-info/40",
    chipClass: "bg-info/20 border-info/50 text-info dark:text-info hover:bg-info/30",
    textClass: "text-info dark:text-info",
  },
};

export function AcademicCalendarView({
  events,
  courses,
  userRole,
}: AcademicCalendarViewProps) {
  // Current reference date in Dhaka
  const [currentDhakaDate, setCurrentDhakaDate] = React.useState<Date>(() => new Date());
  const [viewMode, setViewMode] = React.useState<CalendarViewMode>("month");
  const [selectedCourseOffering, setSelectedCourseOffering] = React.useState<string>("ALL");
  const [selectedEvent, setSelectedEvent] = React.useState<CalendarEvent | null>(null);

  // Compute Today's Dhaka date key
  const todayDhakaKey = React.useMemo(() => getDhakaDateKey(new Date()), []);

  // Filter events by course
  const filteredEvents = React.useMemo(() => {
    if (selectedCourseOffering === "ALL") {
      return events;
    }
    return events.filter((e) => e.offeringId === selectedCourseOffering);
  }, [events, selectedCourseOffering]);

  // Index events by Dhaka date key ("YYYY-MM-DD")
  const eventsByDate = React.useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of filteredEvents) {
      const list = map.get(ev.dhakaDateKey) || [];
      list.push(ev);
      map.set(ev.dhakaDateKey, list);
    }
    return map;
  }, [filteredEvents]);

  // Navigate functions
  function handlePrev() {
    const next = new Date(currentDhakaDate);
    if (viewMode === "month") {
      next.setMonth(next.getMonth() - 1);
    } else if (viewMode === "week") {
      next.setDate(next.getDate() - 7);
    } else {
      next.setDate(next.getDate() - 1);
    }
    setCurrentDhakaDate(next);
  }

  function handleNext() {
    const next = new Date(currentDhakaDate);
    if (viewMode === "month") {
      next.setMonth(next.getMonth() + 1);
    } else if (viewMode === "week") {
      next.setDate(next.getDate() + 7);
    } else {
      next.setDate(next.getDate() + 1);
    }
    setCurrentDhakaDate(next);
  }

  function handleToday() {
    setCurrentDhakaDate(new Date());
  }

  // Generate current month days
  const monthDays = React.useMemo(() => {
    const year = currentDhakaDate.getFullYear();
    const month = currentDhakaDate.getMonth();

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    // Day of week for 1st (0 = Sunday)
    const startWeekday = firstDay.getDay();

    const days: Array<{
      date: Date;
      dateKey: string;
      isCurrentMonth: boolean;
      isToday: boolean;
    }> = [];

    // Previous month padding
    for (let i = startWeekday - 1; i >= 0; i--) {
      const d = new Date(year, month, -i);
      const k = getDhakaDateKey(d);
      days.push({
        date: d,
        dateKey: k,
        isCurrentMonth: false,
        isToday: k === todayDhakaKey,
      });
    }

    // Current month days
    for (let i = 1; i <= lastDay.getDate(); i++) {
      const d = new Date(year, month, i);
      const k = getDhakaDateKey(d);
      days.push({
        date: d,
        dateKey: k,
        isCurrentMonth: true,
        isToday: k === todayDhakaKey,
      });
    }

    // Next month padding to fill complete weeks (multiples of 7)
    const remaining = (7 - (days.length % 7)) % 7;
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(year, month + 1, i);
      const k = getDhakaDateKey(d);
      days.push({
        date: d,
        dateKey: k,
        isCurrentMonth: false,
        isToday: k === todayDhakaKey,
      });
    }

    return days;
  }, [currentDhakaDate, todayDhakaKey]);

  // Generate current week days
  const weekDays = React.useMemo(() => {
    const curr = new Date(currentDhakaDate);
    const dayOfWeek = curr.getDay(); // 0 is Sunday
    const startOfWeek = new Date(curr);
    startOfWeek.setDate(curr.getDate() - dayOfWeek);

    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      const k = getDhakaDateKey(d);
      days.push({
        date: d,
        dateKey: k,
        isToday: k === todayDhakaKey,
      });
    }
    return days;
  }, [currentDhakaDate, todayDhakaKey]);

  // Month title format in Asia/Dhaka
  const currentTitle = React.useMemo(() => {
    if (viewMode === "month") {
      return new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Dhaka",
        month: "long",
        year: "numeric",
      }).format(currentDhakaDate);
    }
    if (viewMode === "week") {
      const start = weekDays[0].date;
      const end = weekDays[6].date;
      return `${formatDhaka(start, "date")} – ${formatDhaka(end, "date")}`;
    }
    return formatDhaka(currentDhakaDate, "date");
  }, [currentDhakaDate, viewMode, weekDays]);

  // Agenda items grouped by date
  const agendaGroups = React.useMemo(() => {
    const groups: Array<{
      dateKey: string;
      label: string;
      isToday: boolean;
      items: CalendarEvent[];
    }> = [];

    // Unique sorted date keys from filteredEvents
    const dateKeys = Array.from(new Set(filteredEvents.map((e) => e.dhakaDateKey))).sort();

    for (const key of dateKeys) {
      const items = eventsByDate.get(key) || [];
      const [year, month, day] = key.split("-").map(Number);
      const dateObj = new Date(year, month - 1, day);
      const isToday = key === todayDhakaKey;

      let dateLabel = formatDhaka(dateObj, "full");
      if (isToday) {
        dateLabel = `Today • ${dateLabel}`;
      }

      groups.push({
        dateKey: key,
        label: dateLabel,
        isToday,
        items,
      });
    }

    return groups;
  }, [filteredEvents, eventsByDate, todayDhakaKey]);

  return (
    <div className="space-y-6">
      {/* Top Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-2 border-b border-border">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <CalendarIcon className="w-6 h-6 text-primary" />
            Academic Calendar & Schedule
          </h1>
          <p className="text-xs sm:text-sm text-muted mt-0.5">
            Synchronized course deadlines, exam windows, and academic milestones in Asia/Dhaka.
          </p>
        </div>

        {/* Action Controls (.ics export & Course Filter) */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {/* Course Filter */}
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-muted" />
            <select
              value={selectedCourseOffering}
              onChange={(e) => setSelectedCourseOffering(e.target.value)}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-surface border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              aria-label="Filter events by course"
            >
              <option value="ALL">All Courses ({courses.length})</option>
              {courses.map((c) => (
                <option key={c.offeringId} value={c.offeringId}>
                  {c.courseCode} - {c.courseTitle}
                </option>
              ))}
            </select>
          </div>

          {/* .ics export button */}
          <a
            href="/api/calendar/export"
            download="ruet-elms-calendar.ics"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-surface border border-border text-foreground hover:bg-surface-muted transition-colors shadow-2xs"
            title="Export calendar to iCal / Google Calendar / Outlook"
          >
            <Download className="w-3.5 h-3.5 text-primary" />
            <span>Export .ics</span>
          </a>
        </div>
      </div>

      {/* Legend & View Mode Toggles */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface p-3 sm:p-4 rounded-2xl border border-border">
        {/* Legends */}
        <div className="flex flex-wrap items-center gap-3 text-xs select-none">
          <span className="text-muted font-medium">Legend:</span>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-warning" />
            <span className="text-foreground">Assignment Deadline</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-primary" />
            <span className="text-foreground">Quiz Window</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-info" />
            <span className="text-foreground">Announcement</span>
          </div>
        </div>

        {/* View Mode Switcher */}
        <div className="flex items-center gap-1 bg-surface-muted p-1 rounded-xl border border-border shrink-0 self-start sm:self-auto select-none">
          <button
            onClick={() => setViewMode("month")}
            className={cn(
              "px-3 py-1 rounded-lg text-xs font-semibold transition-all",
              viewMode === "month"
                ? "bg-surface text-foreground shadow-2xs"
                : "text-muted hover:text-foreground"
            )}
          >
            Month
          </button>
          <button
            onClick={() => setViewMode("week")}
            className={cn(
              "px-3 py-1 rounded-lg text-xs font-semibold transition-all",
              viewMode === "week"
                ? "bg-surface text-foreground shadow-2xs"
                : "text-muted hover:text-foreground"
            )}
          >
            Week
          </button>
          <button
            onClick={() => setViewMode("day")}
            className={cn(
              "px-3 py-1 rounded-lg text-xs font-semibold transition-all",
              viewMode === "day"
                ? "bg-surface text-foreground shadow-2xs"
                : "text-muted hover:text-foreground"
            )}
          >
            Day
          </button>
          <button
            onClick={() => setViewMode("agenda")}
            className={cn(
              "px-3 py-1 rounded-lg text-xs font-semibold transition-all",
              viewMode === "agenda"
                ? "bg-surface text-foreground shadow-2xs"
                : "text-muted hover:text-foreground"
            )}
          >
            Agenda
          </button>
        </div>
      </div>

      {/* Navigation Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-lg sm:text-xl font-bold text-foreground">
            {currentTitle}
          </h2>
          <span className="text-xs font-semibold text-muted bg-surface-muted px-2 py-0.5 rounded-md border border-border">
            Asia/Dhaka (UTC+6)
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={handleToday}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-surface border border-border text-foreground hover:bg-surface-muted transition-colors"
          >
            Today
          </button>
          <button
            onClick={handlePrev}
            aria-label="Previous period"
            className="p-1.5 rounded-xl bg-surface border border-border text-muted hover:text-foreground hover:bg-surface-muted transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={handleNext}
            aria-label="Next period"
            className="p-1.5 rounded-xl bg-surface border border-border text-muted hover:text-foreground hover:bg-surface-muted transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Desktop / Large Screen: Month Grid (Hidden on Mobile if Agenda preferred) */}
      <div className={cn(viewMode === "month" ? "block" : "hidden")}>
        <div className="bg-surface border border-border rounded-2xl overflow-hidden shadow-xs">
          {/* Weekday headers */}
          <div className="grid grid-cols-7 border-b border-border bg-surface-muted/50 text-center py-2.5 text-xs font-bold text-muted select-none">
            <span>Sun</span>
            <span>Mon</span>
            <span>Tue</span>
            <span>Wed</span>
            <span>Thu</span>
            <span>Fri</span>
            <span>Sat</span>
          </div>

          {/* Month Grid Cells */}
          <div className="grid grid-cols-7 auto-rows-fr divide-x divide-y divide-border border-b border-border">
            {monthDays.map((day, idx) => {
              const dayEvents = eventsByDate.get(day.dateKey) || [];

              return (
                <div
                  key={`${day.dateKey}-${idx}`}
                  className={cn(
                    "min-h-[90px] sm:min-h-[110px] p-1.5 sm:p-2 transition-colors flex flex-col justify-between",
                    !day.isCurrentMonth && "bg-surface-muted/30 text-muted opacity-50",
                    day.isToday && "bg-primary/[0.04] ring-1 ring-inset ring-primary/40 font-bold"
                  )}
                >
                  <div className="flex items-center justify-between pb-1">
                    <span
                      className={cn(
                        "text-xs font-semibold inline-flex items-center justify-center w-6 h-6 rounded-full",
                        day.isToday
                          ? "bg-primary text-primary-foreground font-bold shadow-xs"
                          : "text-foreground"
                      )}
                    >
                      {day.date.getDate()}
                    </span>
                    {day.isToday && (
                      <span className="hidden sm:inline text-[9px] uppercase font-extrabold text-primary px-1.5 py-0.2 rounded bg-primary/10">
                        Today
                      </span>
                    )}
                  </div>

                  {/* Day Events list */}
                  <div className="space-y-1 flex-1 overflow-y-auto max-h-[85px] scrollbar-none">
                    {dayEvents.map((ev) => {
                      const cfg = EVENT_TYPE_CONFIG[ev.type];
                      const Icon = cfg.icon;

                      return (
                        <button
                          key={ev.id}
                          type="button"
                          onClick={() => setSelectedEvent(ev)}
                          className={cn(
                            "w-full text-left px-1.5 py-1 rounded-md text-[11px] font-medium border truncate flex items-center gap-1 transition-all",
                            cfg.chipClass
                          )}
                          title={`${ev.courseCode ? `[${ev.courseCode}] ` : ""}${ev.title} (${ev.dhakaTimeDisplay})`}
                        >
                          <Icon className="w-3 h-3 shrink-0" />
                          <span className="truncate">
                            {ev.courseCode && <span className="font-bold">{ev.courseCode}: </span>}
                            {ev.title}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Week Grid */}
      <div className={cn(viewMode === "week" ? "block" : "hidden")}>
        <div className="bg-surface border border-border rounded-2xl overflow-hidden shadow-xs">
          <div className="grid grid-cols-7 divide-x divide-border min-h-[350px]">
            {weekDays.map((day) => {
              const dayEvents = eventsByDate.get(day.dateKey) || [];

              return (
                <div
                  key={day.dateKey}
                  className={cn(
                    "p-2 sm:p-3 flex flex-col space-y-2",
                    day.isToday && "bg-primary/[0.04] ring-1 ring-inset ring-primary/40"
                  )}
                >
                  <div className="text-center pb-2 border-b border-border">
                    <div className="text-xs text-muted font-bold">
                      {new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(day.date)}
                    </div>
                    <div
                      className={cn(
                        "text-sm font-extrabold inline-flex items-center justify-center w-7 h-7 rounded-full mt-1",
                        day.isToday ? "bg-primary text-primary-foreground" : "text-foreground"
                      )}
                    >
                      {day.date.getDate()}
                    </div>
                  </div>

                  <div className="space-y-1.5 flex-1">
                    {dayEvents.map((ev) => {
                      const cfg = EVENT_TYPE_CONFIG[ev.type];
                      const Icon = cfg.icon;
                      return (
                        <button
                          key={ev.id}
                          onClick={() => setSelectedEvent(ev)}
                          className={cn(
                            "w-full text-left p-2 rounded-xl text-xs font-semibold border space-y-1 transition-all",
                            cfg.chipClass
                          )}
                        >
                          <div className="flex items-center gap-1">
                            <Icon className="w-3 h-3 shrink-0" />
                            <span className="text-[10px] uppercase font-bold truncate">
                              {ev.courseCode || cfg.label}
                            </span>
                          </div>
                          <div className="line-clamp-2 leading-tight font-bold text-foreground">
                            {ev.title}
                          </div>
                          <div className="text-[10px] text-muted">{ev.dhakaTimeDisplay}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Single Day View */}
      <div className={cn(viewMode === "day" ? "block" : "hidden")}>
        <div className="bg-surface border border-border rounded-2xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-border">
            <h3 className="text-base font-bold text-foreground">
              {formatDhaka(currentDhakaDate, "full")}
            </h3>
            {getDhakaDateKey(currentDhakaDate) === todayDhakaKey && (
              <span className="text-xs uppercase font-extrabold text-primary px-2 py-0.5 rounded bg-primary/15">
                Today
              </span>
            )}
          </div>

          {eventsByDate.get(getDhakaDateKey(currentDhakaDate))?.length ? (
            <div className="space-y-2.5">
              {eventsByDate.get(getDhakaDateKey(currentDhakaDate))!.map((ev) => {
                const cfg = EVENT_TYPE_CONFIG[ev.type];
                const Icon = cfg.icon;
                return (
                  <div
                    key={ev.id}
                    onClick={() => setSelectedEvent(ev)}
                    className="p-4 rounded-xl border border-border bg-surface-muted/40 hover:border-primary/50 cursor-pointer transition-all flex items-start justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold border",
                            cfg.badgeClass
                          )}
                        >
                          <Icon className="w-3 h-3" />
                          <span>{cfg.label}</span>
                        </span>
                        {ev.courseCode && (
                          <span className="text-xs font-bold text-foreground">
                            {ev.courseCode}
                          </span>
                        )}
                      </div>
                      <h4 className="text-sm font-bold text-foreground">{ev.title}</h4>
                      <p className="text-xs text-muted flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        <span>{ev.dhakaTimeDisplay}</span>
                      </p>
                    </div>
                    <Link
                      href={ev.link}
                      className="p-2 rounded-lg text-primary hover:bg-primary/10 transition-colors"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ExternalLink className="w-4 h-4" />
                    </Link>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs sm:text-sm text-muted py-8 text-center">
              No academic deadlines or events scheduled for this day.
            </p>
          )}
        </div>
      </div>

      {/* Mobile-First Agenda List View (Responsive: always usable on small screens) */}
      <div className={cn(viewMode === "agenda" ? "block" : "block md:hidden")}>
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-xs font-bold text-muted uppercase tracking-wider">
            <ListFilter className="w-3.5 h-3.5" />
            <span>Agenda Schedule (Grouped by Day)</span>
          </div>

          {agendaGroups.length === 0 ? (
            <div className="bg-surface border border-dashed border-border rounded-2xl p-8 text-center text-muted">
              <CalendarDays className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm font-semibold text-foreground">No upcoming events</p>
              <p className="text-xs mt-1">There are no deadlines or events matching your criteria.</p>
            </div>
          ) : (
            agendaGroups.map((group) => (
              <div
                key={group.dateKey}
                className={cn(
                  "bg-surface border rounded-2xl p-4 shadow-xs space-y-3",
                  group.isToday ? "border-primary/50 bg-primary/[0.02]" : "border-border"
                )}
              >
                <div className="flex items-center justify-between pb-2 border-b border-border">
                  <h3 className="text-xs sm:text-sm font-bold text-foreground flex items-center gap-2">
                    <CalendarDays className="w-4 h-4 text-primary" />
                    <span>{group.label}</span>
                  </h3>
                  {group.isToday && (
                    <span className="text-[10px] uppercase font-extrabold px-1.5 py-0.5 rounded bg-primary/15 text-primary">
                      Today
                    </span>
                  )}
                </div>

                <div className="space-y-2">
                  {group.items.map((ev) => {
                    const cfg = EVENT_TYPE_CONFIG[ev.type];
                    const Icon = cfg.icon;

                    return (
                      <div
                        key={ev.id}
                        onClick={() => setSelectedEvent(ev)}
                        className="p-3 rounded-xl border border-border/80 bg-surface-muted/40 hover:bg-surface-muted cursor-pointer transition-all flex items-start justify-between gap-3"
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span
                              className={cn(
                                "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border",
                                cfg.badgeClass
                              )}
                            >
                              <Icon className="w-3 h-3" />
                              <span>{cfg.label}</span>
                            </span>
                            {ev.courseCode && (
                              <span className="text-xs font-bold text-foreground">
                                [{ev.courseCode}]
                              </span>
                            )}
                          </div>
                          <h4 className="text-xs sm:text-sm font-bold text-foreground truncate">
                            {ev.title}
                          </h4>
                          <p className="text-[11px] text-muted flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            <span>{ev.dhakaTimeDisplay}</span>
                          </p>
                        </div>

                        <Link
                          href={ev.link}
                          onClick={(e) => e.stopPropagation()}
                          className="p-2 rounded-lg text-primary hover:bg-primary/10 transition-colors shrink-0"
                          title="Open item"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </Link>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Event Details Popover / Modal */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-surface border border-border rounded-2xl p-6 w-full max-w-md shadow-xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-border">
              <div className="space-y-1">
                <span
                  className={cn(
                    "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-semibold border",
                    EVENT_TYPE_CONFIG[selectedEvent.type].badgeClass
                  )}
                >
                  {selectedEvent.type.replace(/_/g, " ")}
                </span>
                <h3 className="text-base sm:text-lg font-bold text-foreground">
                  {selectedEvent.title}
                </h3>
              </div>
              <button
                onClick={() => setSelectedEvent(null)}
                className="text-muted hover:text-foreground text-sm font-bold p-1"
                aria-label="Close dialog"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2.5 text-xs sm:text-sm">
              {selectedEvent.courseCode && (
                <div className="flex items-center gap-2 text-foreground font-medium">
                  <BookOpen className="w-4 h-4 text-muted shrink-0" />
                  <span>
                    {selectedEvent.courseCode} — {selectedEvent.courseTitle}
                  </span>
                </div>
              )}

              <div className="flex items-center gap-2 text-foreground">
                <Clock className="w-4 h-4 text-muted shrink-0" />
                <span>
                  {formatDhaka(selectedEvent.startDate, "full")} ({selectedEvent.dhakaTimeDisplay})
                </span>
              </div>

              {selectedEvent.description && (
                <div className="p-3 rounded-xl bg-surface-muted border border-border text-xs text-muted leading-relaxed max-h-32 overflow-y-auto">
                  {selectedEvent.description.replace(/<[^>]*>/g, "")}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border">
              <button
                type="button"
                onClick={() => setSelectedEvent(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-muted hover:text-foreground hover:bg-surface-muted transition-colors"
              >
                Close
              </button>
              <Link
                href={selectedEvent.link}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-primary text-primary-foreground hover:bg-primary-hover shadow-xs transition-colors"
              >
                <span>Open Item</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
