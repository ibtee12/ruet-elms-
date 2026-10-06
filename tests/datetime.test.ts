import { describe, it, expect } from "vitest";
import {
  formatDhaka,
  formatRelative,
  getDeadlineUrgency,
} from "../lib/datetime";

describe("DateTime Helpers (Asia/Dhaka)", () => {
  // 2026-10-14 17:59:00 UTC is 2026-10-14 23:59:00 in Dhaka (UTC+6)
  const sampleUtcDate = new Date("2026-10-14T17:59:00Z");

  describe("formatDhaka", () => {
    it("formats date in Asia/Dhaka timezone with full style", () => {
      const formatted = formatDhaka(sampleUtcDate, "full");
      expect(formatted).toContain("Oct");
      expect(formatted).toContain("14");
      expect(formatted).toContain("2026");
      expect(formatted).toContain("11:59 PM");
    });

    it("formats short style with day, month, time", () => {
      const formatted = formatDhaka(sampleUtcDate, "short");
      expect(formatted).toContain("14");
      expect(formatted).toContain("Oct");
      expect(formatted).toContain("11:59 PM");
    });

    it("formats date-only style", () => {
      const formatted = formatDhaka(sampleUtcDate, "date");
      expect(formatted).toBe("Oct 14, 2026");
    });

    it("formats time-only style", () => {
      const formatted = formatDhaka(sampleUtcDate, "time");
      expect(formatted).toBe("11:59 PM");
    });

    it("returns 'Invalid date' for invalid date inputs", () => {
      expect(formatDhaka("not-a-valid-date")).toBe("Invalid date");
    });
  });

  describe("formatRelative", () => {
    const baseDate = new Date("2026-10-14T12:00:00Z");

    it("formats future deadline relative text", () => {
      const fourHoursLater = new Date(baseDate.getTime() + 4 * 60 * 60 * 1000);
      expect(
        formatRelative(fourHoursLater, baseDate, { isDeadline: true })
      ).toBe("Due in 4 hours");
    });

    it("formats overdue deadline relative text", () => {
      const twoHoursAgo = new Date(baseDate.getTime() - 2 * 60 * 60 * 1000);
      expect(formatRelative(twoHoursAgo, baseDate, { isDeadline: true })).toBe(
        "Overdue by 2 hours"
      );
    });

    it("formats general past relative time", () => {
      const fifteenMinutesAgo = new Date(baseDate.getTime() - 15 * 60 * 1000);
      expect(formatRelative(fifteenMinutesAgo, baseDate)).toBe(
        "15 minutes ago"
      );
    });

    it("formats recent activity as 'Just now'", () => {
      const thirtySecondsAgo = new Date(baseDate.getTime() - 30 * 1000);
      expect(formatRelative(thirtySecondsAgo, baseDate)).toBe("Just now");
    });

    it("falls back to Dhaka date when beyond 7 days", () => {
      const tenDaysLater = new Date(
        baseDate.getTime() + 10 * 24 * 60 * 60 * 1000
      );
      const formatted = formatRelative(tenDaysLater, baseDate);
      expect(formatted).toContain("Oct");
    });
  });

  describe("getDeadlineUrgency", () => {
    const baseDate = new Date("2026-10-14T12:00:00Z");

    it("returns 'normal' for deadlines more than 24 hours away", () => {
      const inTwoDays = new Date(baseDate.getTime() + 48 * 60 * 60 * 1000);
      expect(getDeadlineUrgency(inTwoDays, baseDate)).toBe("normal");
    });

    it("returns 'warning' for deadlines under 24 hours away", () => {
      const inTwelveHours = new Date(baseDate.getTime() + 12 * 60 * 60 * 1000);
      expect(getDeadlineUrgency(inTwelveHours, baseDate)).toBe("warning");
    });

    it("returns 'danger' for deadlines under 3 hours away", () => {
      const inTwoHours = new Date(baseDate.getTime() + 2 * 60 * 60 * 1000);
      expect(getDeadlineUrgency(inTwoHours, baseDate)).toBe("danger");
    });

    it("returns 'danger' for overdue deadlines", () => {
      const pastDeadline = new Date(baseDate.getTime() - 1 * 60 * 60 * 1000);
      expect(getDeadlineUrgency(pastDeadline, baseDate)).toBe("danger");
    });
  });
});
