import { describe, expect, it } from "vitest";

import { computeNextNotificationRunAt } from "@/lib/notifications/schedule";

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
});
