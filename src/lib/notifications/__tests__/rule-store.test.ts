import { describe, expect, it, vi } from "vitest";

import type { NotificationRule } from "@/lib/notifications/rule-store";
import {
  advanceNotificationRuleSchedule,
  listDueNotificationRules,
  updateNotificationRule,
} from "@/lib/notifications/rule-store";

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
    nextRunAt: 100,
    cooldownUntil: null,
    createdByUserId: "user-1",
    createdAt: 1,
    updatedAt: 1,
    ...input,
  };
}

describe("notification rule store", () => {
  it("excludes test rules and active cooldowns from due rule queries", async () => {
    let sql = "";
    const env = {
      DB: {
        prepare: vi.fn((nextSql: string) => {
          sql = nextSql;
          return {
            bind: vi.fn(() => ({
              all: vi.fn(() => Promise.resolve({ results: [] })),
            })),
          };
        }),
      },
    };

    await listDueNotificationRules(env as never, 1000);

    expect(sql).toContain("AND type != 'test'");
    expect(sql).toContain("cooldown_until IS NULL OR cooldown_until <= ?");
  });

  it("writes cooldown when advancing a triggered rule", async () => {
    const bind = vi.fn(() => ({ run: vi.fn(() => Promise.resolve()) }));
    const env = {
      DB: {
        prepare: vi.fn(() => ({ bind })),
      },
    };

    await advanceNotificationRuleSchedule(env as never, {
      rule: rule(),
      checkedAt: 1000,
      triggeredAt: 1000,
      cooldownUntil: 2000,
    });

    expect(bind).toHaveBeenCalledWith(
      1000,
      1000,
      expect.any(Number),
      2000,
      2000,
      1000,
      1000,
      "rule-1",
    );
  });

  it("preserves omitted fields when partially updating rule state", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_800_000_000_000);
    const currentRow = {
      id: "rule-1",
      teamId: "team-1",
      siteId: "site-1",
      name: "Daily report",
      description: "Original",
      type: "report",
      enabled: 1,
      scheduleJson: JSON.stringify({
        kind: "daily",
        time: "08:00",
        timezone: "UTC",
      }),
      conditionJson: JSON.stringify({ reportType: "daily" }),
      recipientJson: JSON.stringify({ mode: "team_admins" }),
      lastCheckedAt: null,
      lastTriggeredAt: null,
      nextRunAt: 1_800_010_000,
      cooldownUntil: null,
      createdByUserId: "user-1",
      createdAt: 1,
      updatedAt: 1,
    };
    const updateBind = vi.fn(() => ({
      run: vi.fn(() => Promise.resolve()),
    }));
    const env = {
      DB: {
        prepare: vi.fn((sql: string) => {
          if (sql.includes("UPDATE notification_rules")) {
            return { bind: updateBind };
          }
          if (sql.includes("SELECT team_id FROM sites")) {
            return {
              bind: vi.fn(() => ({
                first: vi.fn(() => Promise.resolve({ team_id: "team-1" })),
              })),
            };
          }
          return {
            bind: vi.fn(() => ({
              first: vi.fn(() => Promise.resolve(currentRow)),
            })),
          };
        }),
      },
    };

    await updateNotificationRule(
      env as never,
      { user: { id: "admin-1" }, isAdmin: true } as never,
      { ruleId: "rule-1", enabled: false },
    );

    expect(updateBind).toHaveBeenCalledWith(
      "team-1",
      "site-1",
      "Daily report",
      "Original",
      "report",
      0,
      currentRow.scheduleJson,
      currentRow.conditionJson,
      currentRow.recipientJson,
      1_800_010_000,
      1_800_000_000,
      "rule-1",
    );
  });

  it("only recalculates schedule and recipient fields when those fields are provided", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_800_000_000_000);
    const currentRow = {
      id: "rule-1",
      teamId: "team-1",
      siteId: "site-1",
      name: "Threshold",
      description: "",
      type: "threshold",
      enabled: 1,
      scheduleJson: JSON.stringify({ kind: "interval", everyMinutes: 60 }),
      conditionJson: JSON.stringify({ metric: "visitors" }),
      recipientJson: JSON.stringify({ mode: "team_admins" }),
      lastCheckedAt: null,
      lastTriggeredAt: null,
      nextRunAt: 1_800_010_000,
      cooldownUntil: null,
      createdByUserId: "user-1",
      createdAt: 1,
      updatedAt: 1,
    };
    const calls: unknown[][] = [];
    const env = {
      DB: {
        prepare: vi.fn((sql: string) => {
          if (sql.includes("UPDATE notification_rules")) {
            return {
              bind: vi.fn((...args: unknown[]) => {
                calls.push(args);
                return { run: vi.fn(() => Promise.resolve()) };
              }),
            };
          }
          if (sql.includes("SELECT team_id FROM sites")) {
            return {
              bind: vi.fn(() => ({
                first: vi.fn(() => Promise.resolve({ team_id: "team-1" })),
              })),
            };
          }
          return {
            bind: vi.fn(() => ({
              first: vi.fn(() => Promise.resolve(currentRow)),
            })),
          };
        }),
      },
    };
    const actor = { user: { id: "admin-1" }, isAdmin: true } as never;

    await updateNotificationRule(env as never, actor, {
      ruleId: "rule-1",
      name: "Renamed",
    });
    await updateNotificationRule(env as never, actor, {
      ruleId: "rule-1",
      schedule: { kind: "interval", everyMinutes: 120 },
    });
    await updateNotificationRule(env as never, actor, {
      ruleId: "rule-1",
      recipient: { mode: "creator" },
    });

    expect(calls[0][4]).toBe("threshold");
    expect(calls[0][6]).toBe(currentRow.scheduleJson);
    expect(calls[0][8]).toBe(currentRow.recipientJson);
    expect(calls[0][9]).toBe(1_800_010_000);
    expect(calls[1][6]).toBe(
      JSON.stringify({ kind: "interval", everyMinutes: 120 }),
    );
    expect(calls[1][9]).not.toBe(1_800_010_000);
    expect(calls[2][8]).toBe(JSON.stringify({ mode: "creator" }));
    expect(calls[2][6]).toBe(currentRow.scheduleJson);
  });
});
