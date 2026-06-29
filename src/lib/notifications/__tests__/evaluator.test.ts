import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  compareThreshold,
  evaluateNotificationRule,
} from "@/lib/notifications/evaluator";
import type { NotificationRule } from "@/lib/notifications/rule-store";

const loadDailyReportData = vi.hoisted(() => vi.fn());
const loadMetricValue = vi.hoisted(() => vi.fn());
const loadSiteLastSeenAt = vi.hoisted(() => vi.fn());

vi.mock("@/lib/notifications/report-data", () => ({
  loadDailyReportData,
  loadMetricValue,
  loadSiteLastSeenAt,
}));

function rule(input: Partial<NotificationRule> = {}): NotificationRule {
  return {
    id: "rule-1",
    teamId: "team-1",
    siteId: "site-1",
    name: "Rule",
    description: "",
    type: "threshold",
    enabled: true,
    schedule: { kind: "interval", everyMinutes: 60 },
    condition: {},
    recipient: { mode: "team_admins" },
    lastCheckedAt: null,
    lastTriggeredAt: null,
    nextRunAt: null,
    cooldownUntil: null,
    createdByUserId: "user-1",
    createdAt: 1,
    updatedAt: 1,
    ...input,
  };
}

function envWithSite() {
  return {
    DB: {
      prepare: vi.fn(() => ({
        bind: vi.fn(() => ({
          first: vi.fn(() =>
            Promise.resolve({ name: "Example", domain: "example.com" }),
          ),
        })),
      })),
    },
  };
}

describe("notification evaluator", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns a triggered draft for test rules", async () => {
    const result = await evaluateNotificationRule(
      {} as never,
      rule({ type: "test" }),
      100,
    );

    expect(result.status).toBe("triggered");
    if (result.status === "triggered") {
      expect(result.message.type).toBe("test");
      expect(result.message.requiresAttention).toBe(false);
    }
  });

  it("builds a daily report draft from report data", async () => {
    loadDailyReportData.mockResolvedValue({
      siteName: "Example",
      siteDomain: "example.com",
      range: { from: 10, to: 20, label: "2026-06-29" },
      metrics: { views: 3820, visitors: 1240, sessions: 1510 },
      topPages: [{ path: "/", views: 1200 }],
      topReferrers: [{ referrer: "Google", visits: 520 }],
    });

    const result = await evaluateNotificationRule(
      {} as never,
      rule({
        type: "report",
        condition: { reportType: "daily" },
        schedule: { kind: "daily", time: "08:00", timezone: "Asia/Shanghai" },
      }),
      100,
    );

    expect(result.status).toBe("triggered");
    if (result.status === "triggered") {
      expect(result.message.type).toBe("report");
      expect(result.message.summary).toContain("1,240 visitors");
      expect(result.message.bodyText).toContain("Top Pages");
    }
  });

  it("triggers threshold rules when the metric matches", async () => {
    loadMetricValue.mockResolvedValue({
      metric: "visitors",
      window: "last_1h",
      value: 1240,
      range: { from: 1, to: 2 },
    });

    const result = await evaluateNotificationRule(
      envWithSite() as never,
      rule({
        condition: {
          metric: "visitors",
          window: "last_1h",
          operator: ">=",
          value: 1000,
          cooldownMinutes: 360,
        },
      }),
      1000,
    );

    expect(result.status).toBe("triggered");
    if (result.status === "triggered") {
      expect(result.message.type).toBe("threshold");
      expect(result.message.severity).toBe("warning");
      expect(result.cooldownUntil).toBe(22600);
    }
  });

  it("returns checked when threshold rules do not match", async () => {
    loadMetricValue.mockResolvedValue({
      metric: "views",
      window: "last_24h",
      value: 50,
      range: { from: 1, to: 2 },
    });

    const result = await evaluateNotificationRule(
      envWithSite() as never,
      rule({
        condition: {
          metric: "views",
          window: "last_24h",
          operator: ">",
          value: 100,
        },
      }),
      1000,
    );

    expect(result).toMatchObject({
      status: "checked",
      triggered: false,
    });
  });

  it("skips invalid threshold configuration", async () => {
    const result = await evaluateNotificationRule(
      envWithSite() as never,
      rule({
        condition: {
          metric: "unknown",
          window: "last_1h",
          operator: ">=",
          value: 1000,
        },
      }),
      1000,
    );

    expect(result).toMatchObject({
      status: "skipped",
      reason: "invalid_metric",
    });
  });

  it("skips health rules without a site", async () => {
    const result = await evaluateNotificationRule(
      {} as never,
      rule({
        type: "health",
        siteId: null,
        condition: { check: "no_data", hours: 12 },
      }),
      1000,
    );

    expect(result).toMatchObject({
      status: "skipped",
      reason: "missing_site_id",
    });
  });

  it("triggers health when no history exists", async () => {
    loadSiteLastSeenAt.mockResolvedValue(null);

    const result = await evaluateNotificationRule(
      envWithSite() as never,
      rule({
        type: "health",
        condition: { check: "no_data", hours: 12 },
      }),
      1000,
    );

    expect(result.status).toBe("triggered");
    if (result.status === "triggered") {
      expect(result.message.type).toBe("health");
      expect(result.message.severity).toBe("critical");
    }
  });

  it("does not trigger health when data is recent", async () => {
    loadSiteLastSeenAt.mockResolvedValue(900);

    const result = await evaluateNotificationRule(
      envWithSite() as never,
      rule({
        type: "health",
        condition: { check: "no_data", hours: 1 },
      }),
      1000,
    );

    expect(result).toMatchObject({
      status: "checked",
      triggered: false,
    });
  });

  it("compares supported threshold operators", () => {
    expect(compareThreshold(10, ">", 9)).toBe(true);
    expect(compareThreshold(10, ">=", 10)).toBe(true);
    expect(compareThreshold(10, "<", 11)).toBe(true);
    expect(compareThreshold(10, "<=", 10)).toBe(true);
  });
});
