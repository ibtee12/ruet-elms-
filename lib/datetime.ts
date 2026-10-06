const TIMEZONE = "Asia/Dhaka";

export type DhakaDateStyle = "full" | "short" | "date" | "time";

/**
 * Formats any date into the Asia/Dhaka timezone according to RUET ELMS Design Guide.
 * Example "full": "Tue, 14 Oct 2026, 11:59 PM"
 */
export function formatDhaka(
  dateInput: Date | string | number,
  style: DhakaDateStyle = "full"
): string {
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) {
    return "Invalid date";
  }

  const options: Intl.DateTimeFormatOptions = {
    timeZone: TIMEZONE,
  };

  switch (style) {
    case "time":
      options.hour = "numeric";
      options.minute = "numeric";
      options.hour12 = true;
      break;

    case "date":
      options.day = "numeric";
      options.month = "short";
      options.year = "numeric";
      break;

    case "short":
      options.day = "numeric";
      options.month = "short";
      options.hour = "numeric";
      options.minute = "numeric";
      options.hour12 = true;
      break;

    case "full":
    default:
      options.weekday = "short";
      options.day = "numeric";
      options.month = "short";
      options.year = "numeric";
      options.hour = "numeric";
      options.minute = "numeric";
      options.hour12 = true;
      break;
  }

  const formatter = new Intl.DateTimeFormat("en-US", options);
  return formatter.format(date);
}

export interface RelativeTimeOptions {
  isDeadline?: boolean;
}

/**
 * Formats relative time for timestamps and deadlines.
 * If isDeadline is true:
 *   - Future: "Due in 4 hours", "Due in 2 days"
 *   - Past: "Overdue by 2 hours", "Overdue by 3 days"
 * General:
 *   - Future: "in 4 hours"
 *   - Past: "4 hours ago", "Just now"
 */
export function formatRelative(
  dateInput: Date | string | number,
  baseDateInput: Date | string | number = new Date(),
  options: RelativeTimeOptions = {}
): string {
  const date = new Date(dateInput);
  const baseDate = new Date(baseDateInput);

  if (isNaN(date.getTime()) || isNaN(baseDate.getTime())) {
    return "Invalid date";
  }

  const diffMs = date.getTime() - baseDate.getTime();
  const isFuture = diffMs > 0;
  const absMs = Math.abs(diffMs);

  const seconds = Math.floor(absMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  let durationText = "";
  if (seconds < 60) {
    if (options.isDeadline) {
      durationText = seconds <= 5 ? "a moment" : `${seconds} seconds`;
    } else {
      return "Just now";
    }
  } else if (minutes < 60) {
    durationText = `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  } else if (hours < 24) {
    durationText = `${hours} ${hours === 1 ? "hour" : "hours"}`;
  } else if (days < 7) {
    durationText = `${days} ${days === 1 ? "day" : "days"}`;
  } else {
    // Beyond 7 days, fallback to absolute Dhaka date
    return formatDhaka(date, "short");
  }

  if (options.isDeadline) {
    return isFuture ? `Due in ${durationText}` : `Overdue by ${durationText}`;
  }

  return isFuture ? `in ${durationText}` : `${durationText} ago`;
}

/**
 * Returns deadline urgency status per Design Guide:
 * Under 24 hours: warning
 * Under 3 hours or overdue: danger
 * Otherwise: normal
 */
export function getDeadlineUrgency(
  deadlineInput: Date | string | number,
  baseDateInput: Date | string | number = new Date()
): "normal" | "warning" | "danger" {
  const deadline = new Date(deadlineInput);
  const baseDate = new Date(baseDateInput);

  const diffMs = deadline.getTime() - baseDate.getTime();
  const hoursLeft = diffMs / (1000 * 60 * 60);

  if (hoursLeft <= 3) {
    return "danger";
  }
  if (hoursLeft <= 24) {
    return "warning";
  }
  return "normal";
}

/**
 * Converts a datetime string entered in Asia/Dhaka local time (e.g. "2026-10-14T23:59")
 * into a UTC Date object.
 * Asia/Dhaka is UTC+6 year-round with no Daylight Saving Time.
 */
export function dhakaLocalToUtc(dhakaLocalStr: string): Date {
  const clean = dhakaLocalStr.trim();
  if (clean.includes("Z") || /[+-]\d{2}:\d{2}$/.test(clean)) {
    return new Date(clean);
  }
  const parts = clean.split("T");
  if (parts.length === 2 && parts[1].split(":").length === 2) {
    return new Date(`${clean}:00+06:00`);
  }
  return new Date(`${clean}+06:00`);
}

/**
 * Converts a UTC Date into an Asia/Dhaka local datetime-local string (YYYY-MM-DDTHH:mm)
 * suitable for standard HTML datetime-local inputs.
 */
export function utcToDhakaInputFormat(dateInput: Date | string | number): string {
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return "";

  // Shift UTC by +6 hours for Asia/Dhaka
  const dhakaTime = new Date(date.getTime() + 6 * 60 * 60 * 1000);
  return dhakaTime.toISOString().slice(0, 16);
}

