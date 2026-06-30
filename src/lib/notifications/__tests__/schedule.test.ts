import { describe, expect, it } from "vitest";

import {
  computeNextNotificationRunAt,
  normalizeNotificationSchedule,
  notificationRuleExpiresAtSeconds,
} from "@/lib/notifications/schedule";

describe("notification schedule", () => {
  it("computes the next daily run after today's configured time", () => {
    const now = Math.floor(Date.UTC(2026, 5, 29, 2, 20, 0) / 1000);
    const next = computeNextNotificationRunAt(
      { kind: "daily", time: "08:00", timezone: "Asia/Shanghai" },
      now,
    );

    expect(new Date(next * 1000).toISOString()).toBe(
      "2026-06-30T00:00:00.000Z",
    );
  });

  it("aligns hourly interval schedules to the next whole hour", () => {
    const now = Math.floor(Date.UTC(2026, 5, 29, 10, 20, 0) / 1000);
    const next = computeNextNotificationRunAt(
      { kind: "interval", everyMinutes: 60 },
      now,
    );

    expect(new Date(next * 1000).toISOString()).toBe(
      "2026-06-29T11:00:00.000Z",
    );
  });

  it("normalizes malformed schedules to safe defaults", () => {
    expect(
      normalizeNotificationSchedule({
        kind: "daily",
        time: "08:21",
        timezone: "Not/A_Zone",
      }),
    ).toEqual({ kind: "daily", time: "08:00", timezone: "UTC" });

    expect(
      normalizeNotificationSchedule({
        kind: "daily",
        time: "09:30",
        timezone: " Asia/Tokyo ",
      }),
    ).toEqual({ kind: "daily", time: "09:30", timezone: "Asia/Tokyo" });

    expect(normalizeNotificationSchedule({ kind: "unknown" })).toEqual({
      kind: "interval",
      everyMinutes: 60,
    });
  });

  it("clamps interval schedules and handles non-hourly alignment", () => {
    expect(
      normalizeNotificationSchedule({ kind: "interval", everyMinutes: 5 }),
    ).toEqual({ kind: "interval", everyMinutes: 30 });
    expect(
      normalizeNotificationSchedule({
        kind: "interval",
        everyMinutes: 60 * 24 * 60,
      }),
    ).toEqual({ kind: "interval", everyMinutes: 60 * 24 * 30 });
    expect(
      normalizeNotificationSchedule({ kind: "interval", everyMinutes: "bad" }),
    ).toEqual({ kind: "interval", everyMinutes: 60 });

    const now = Math.floor(Date.UTC(2026, 5, 29, 10, 20, 0) / 1000);
    const next = computeNextNotificationRunAt(
      { kind: "interval", everyMinutes: 30 },
      now,
    );

    expect(new Date(next * 1000).toISOString()).toBe(
      "2026-06-29T10:30:00.000Z",
    );
  });

  it("computes weekly, monthly, quarterly, and yearly schedules", () => {
    const now = Math.floor(Date.UTC(2026, 5, 30, 10, 20, 0) / 1000);

    expect(
      new Date(
        computeNextNotificationRunAt(
          { kind: "weekly", time: "08:30", timezone: "UTC", dayOfWeek: 1 },
          now,
        ) * 1000,
      ).toISOString(),
    ).toBe("2026-07-06T08:30:00.000Z");

    expect(
      new Date(
        computeNextNotificationRunAt(
          { kind: "monthly", time: "08:00", timezone: "UTC", dayOfMonth: 1 },
          now,
        ) * 1000,
      ).toISOString(),
    ).toBe("2026-07-01T08:00:00.000Z");

    expect(
      new Date(
        computeNextNotificationRunAt(
          { kind: "quarterly", time: "08:00", timezone: "UTC", dayOfMonth: 1 },
          now,
        ) * 1000,
      ).toISOString(),
    ).toBe("2026-07-01T08:00:00.000Z");

    expect(
      new Date(
        computeNextNotificationRunAt(
          {
            kind: "yearly",
            time: "08:00",
            timezone: "UTC",
            month: 1,
            dayOfMonth: 1,
          },
          now,
        ) * 1000,
      ).toISOString(),
    ).toBe("2027-01-01T08:00:00.000Z");
  });

  it("keeps daily runs at least one minute ahead", () => {
    const now = Math.floor(Date.UTC(2026, 5, 29, 8, 0, 0) / 1000);
    const next = computeNextNotificationRunAt(
      { kind: "daily", time: "08:00", timezone: "UTC" },
      now,
    );

    expect(new Date(next * 1000).toISOString()).toBe(
      "2026-06-30T08:00:00.000Z",
    );
  });

  it("computes notification expiration windows by type and severity", () => {
    const createdAtSeconds = 1000;

    expect(
      notificationRuleExpiresAtSeconds({
        type: "test",
        severity: "info",
        createdAtSeconds,
      }),
    ).toBe(createdAtSeconds + 30 * 24 * 60 * 60);
    expect(
      notificationRuleExpiresAtSeconds({
        type: "budget",
        severity: "warning",
        createdAtSeconds,
      }),
    ).toBe(createdAtSeconds + 180 * 24 * 60 * 60);
    expect(
      notificationRuleExpiresAtSeconds({
        type: "budget",
        severity: "critical",
        createdAtSeconds,
      }),
    ).toBe(createdAtSeconds + 180 * 24 * 60 * 60);
    expect(
      notificationRuleExpiresAtSeconds({
        type: "budget",
        severity: "info",
        createdAtSeconds,
      }),
    ).toBe(createdAtSeconds + 120 * 24 * 60 * 60);
  });
});
