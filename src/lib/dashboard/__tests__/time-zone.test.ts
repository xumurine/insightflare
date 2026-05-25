import { describe, expect, it } from "vitest";

import {
  addCalendarDays,
  addCalendarMonths,
  addZonedInterval,
  isValidTimeZone,
  resolveReportingTimeZone,
  startOfZonedDay,
  startOfZonedMonth,
  startOfZonedWeek,
  timeZoneOffsetMinutes,
  zonedParts,
  zonedTimeToUtcMs,
} from "@/lib/dashboard/time-zone";

describe("Timezone & Calendar Calculation Utilities", () => {
  describe("isValidTimeZone", () => {
    it("should correctly identify valid timezone strings", () => {
      expect(isValidTimeZone("UTC")).toBe(true);
      expect(isValidTimeZone("Asia/Shanghai")).toBe(true);
      expect(isValidTimeZone("America/New_York")).toBe(true);
      expect(isValidTimeZone("Europe/London")).toBe(true);
    });

    it("should identify and reject invalid timezone strings", () => {
      expect(isValidTimeZone("")).toBe(false);
      expect(isValidTimeZone("   ")).toBe(false);
      expect(isValidTimeZone("Asia/Beijing")).toBe(false); // Not standard IANA (should be Asia/Shanghai)
      expect(isValidTimeZone("Invalid/Zone_Name")).toBe(false);
    });
  });

  describe("resolveReportingTimeZone", () => {
    it("should use preferred timezone when it is valid", () => {
      expect(resolveReportingTimeZone("Asia/Tokyo", "Asia/Shanghai")).toBe(
        "Asia/Tokyo",
      );
    });

    it("should fall back to browser timezone when preferred is invalid but browser is valid", () => {
      expect(resolveReportingTimeZone("Invalid/Zone", "Asia/Shanghai")).toBe(
        "Asia/Shanghai",
      );
    });

    it("should fall back to UTC when both preferred and browser timezones are invalid", () => {
      expect(resolveReportingTimeZone("", "Invalid/Zone")).toBe("UTC");
      expect(resolveReportingTimeZone(null, undefined)).toBe("UTC");
    });
  });

  describe("zonedParts & timeZoneOffsetMinutes", () => {
    // Fixed test timestamp: UTC 2026-05-26T12:00:00.000Z
    // Timestamp: 1779796800000
    const testTimestamp = 1779796800000;

    it("should correctly parse date components in UTC", () => {
      const parts = zonedParts(testTimestamp, "UTC");
      expect(parts.year).toBe(2026);
      expect(parts.month).toBe(5);
      expect(parts.day).toBe(26);
      expect(parts.hour).toBe(12);
      expect(parts.minute).toBe(0);
      expect(parts.second).toBe(0);

      expect(timeZoneOffsetMinutes("UTC", testTimestamp)).toBe(0);
    });

    it("should correctly handle Asia/Shanghai offset and date translation", () => {
      const parts = zonedParts(testTimestamp, "Asia/Shanghai");
      // Asia/Shanghai should be 2026-05-26 20:00:00
      expect(parts.year).toBe(2026);
      expect(parts.month).toBe(5);
      expect(parts.day).toBe(26);
      expect(parts.hour).toBe(20);
      expect(parts.minute).toBe(0);

      expect(timeZoneOffsetMinutes("Asia/Shanghai", testTimestamp)).toBe(480); // +8 hours = +480 minutes
    });

    it("should roundtrip correctly back to timestamp via zonedTimeToUtcMs", () => {
      const parts = zonedParts(testTimestamp, "Asia/Shanghai");
      const reversedTimestamp = zonedTimeToUtcMs("Asia/Shanghai", parts);
      expect(reversedTimestamp).toBe(testTimestamp);
    });
  });

  describe("addCalendarDays & addCalendarMonths", () => {
    it("should correctly handle calendar day additions crossing month boundaries", () => {
      const start = { year: 2026, month: 5, day: 31 };

      const nextDay = addCalendarDays(start, 1);
      expect(nextDay).toEqual({ year: 2026, month: 6, day: 1 });

      const prevDay = addCalendarDays(start, -1);
      expect(prevDay).toEqual({ year: 2026, month: 5, day: 30 });
    });

    it("should correctly handle February additions in common and leap years", () => {
      // 2024 is a leap year (February has 29 days)
      const leapFeb = { year: 2024, month: 2, day: 28 };
      expect(addCalendarDays(leapFeb, 1)).toEqual({
        year: 2024,
        month: 2,
        day: 29,
      });
      expect(addCalendarDays(leapFeb, 2)).toEqual({
        year: 2024,
        month: 3,
        day: 1,
      }); // crossing to March 1st

      // 2023 is a common year (February has 28 days)
      const commonFeb = { year: 2023, month: 2, day: 28 };
      expect(addCalendarDays(commonFeb, 1)).toEqual({
        year: 2023,
        month: 3,
        day: 1,
      });
    });

    it("should perform safe month-end truncation in addCalendarMonths if target month has fewer days", () => {
      const date = { year: 2026, month: 5, day: 31 };

      // May 31 + 1 month = June 30 due to truncation (June has only 30 days)
      const nextMonth = addCalendarMonths(date, 1);
      expect(nextMonth).toEqual({ year: 2026, month: 6, day: 30 });

      // May 31 + 2 months = July 31 (no truncation, July has 31 days)
      const twoMonthsLater = addCalendarMonths(date, 2);
      expect(twoMonthsLater).toEqual({ year: 2026, month: 7, day: 31 });
    });
  });

  describe("startOfZonedDay & startOfZonedWeek & startOfZonedMonth", () => {
    // Fixed test timestamp: UTC 2026-05-26T15:14:56.789Z (Tuesday 23:14:56 in Asia/Shanghai)
    const testTimestamp = 1779808496789;

    it("startOfZonedDay should clear hours, minutes, seconds and milliseconds of the day", () => {
      const startMs = startOfZonedDay(testTimestamp, "Asia/Shanghai");
      const parts = zonedParts(startMs, "Asia/Shanghai");
      expect(parts.year).toBe(2026);
      expect(parts.month).toBe(5);
      expect(parts.day).toBe(26);
      expect(parts.hour).toBe(0);
      expect(parts.minute).toBe(0);
      expect(parts.second).toBe(0);
      expect(parts.millisecond).toBe(0);
    });

    it("startOfZonedWeek should correctly find the first day of the week (Monday)", () => {
      // 2026-05-26 is Tuesday, so Monday should be May 25
      const startMs = startOfZonedWeek(testTimestamp, "Asia/Shanghai");
      const parts = zonedParts(startMs, "Asia/Shanghai");
      expect(parts.year).toBe(2026);
      expect(parts.month).toBe(5);
      expect(parts.day).toBe(25); // Monday
      expect(parts.hour).toBe(0);

      // Test a real Sunday timestamp: 2026-05-31 (Asia/Shanghai)
      const sundayTimestamp = 1780238400000;
      const startMsSunday = startOfZonedWeek(sundayTimestamp, "Asia/Shanghai");
      const partsSunday = zonedParts(startMsSunday, "Asia/Shanghai");
      expect(partsSunday.year).toBe(2026);
      expect(partsSunday.month).toBe(5);
      expect(partsSunday.day).toBe(25); // Should still resolve to Monday May 25
    });

    it("startOfZonedMonth should correctly find the 1st of the month", () => {
      const startMs = startOfZonedMonth(testTimestamp, "Asia/Shanghai");
      const parts = zonedParts(startMs, "Asia/Shanghai");
      expect(parts.year).toBe(2026);
      expect(parts.month).toBe(5);
      expect(parts.day).toBe(1); // 1st
      expect(parts.hour).toBe(0);
    });
  });

  describe("addZonedInterval", () => {
    const testTimestamp = 1779796800000; // 2026-05-26 12:00:00 UTC

    it("should accurately add intervals in days, weeks, and months", () => {
      // Add one day
      const plusOneDay = addZonedInterval(testTimestamp, "day", "UTC", 1);
      const dayParts = zonedParts(plusOneDay, "UTC");
      expect(dayParts.day).toBe(27);

      // Add one week
      const plusOneWeek = addZonedInterval(testTimestamp, "week", "UTC", 1);
      const weekParts = zonedParts(plusOneWeek, "UTC");
      expect(weekParts.day).toBe(2); // 26 + 7 = 33 -> June 2nd
      expect(weekParts.month).toBe(6);

      // Add one month
      const plusOneMonth = addZonedInterval(testTimestamp, "month", "UTC", 1);
      const monthParts = zonedParts(plusOneMonth, "UTC");
      expect(monthParts.month).toBe(6);
      expect(monthParts.day).toBe(26);
    });
  });
});
