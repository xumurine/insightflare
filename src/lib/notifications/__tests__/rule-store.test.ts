import { describe, expect, it, vi } from "vitest";

import type { NotificationRule } from "@/lib/notifications/rule-store";
import {
  advanceNotificationRuleSchedule,
  listDueNotificationRules,
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
});
