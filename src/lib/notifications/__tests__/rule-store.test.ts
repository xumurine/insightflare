import { describe, expect, it, vi } from "vitest";

import type { NotificationRule } from "@/lib/notifications/rule-store";
import {
  advanceNotificationRuleSchedule,
  createNotificationRule,
  deleteNotificationRule,
  listDueNotificationRules,
  listNotificationRules,
  mapNotificationRule,
  normalizeNotificationRecipientConfig,
  resolveNotificationRecipients,
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
  it("normalizes recipient configs and maps nullable rule rows", () => {
    expect(
      normalizeNotificationRecipientConfig({
        mode: "users",
        userIds: [" user-1 ", "user-1", "", 42, "x".repeat(200)],
      }),
    ).toEqual({
      mode: "users",
      userIds: ["user-1", "x".repeat(120)],
    });
    expect(
      normalizeNotificationRecipientConfig({ mode: "team_admins" }),
    ).toEqual({ mode: "team_admins" });
    expect(normalizeNotificationRecipientConfig("not-json")).toEqual({
      mode: "creator",
    });

    expect(
      mapNotificationRule({
        id: 1,
        teamId: 2,
        siteId: undefined,
        name: null,
        description: null,
        type: "unknown",
        enabled: 0,
        scheduleJson: "{",
        conditionJson: JSON.stringify({ metric: "visitors" }),
        recipientJson: JSON.stringify({ mode: "all_team_members" }),
        lastCheckedAt: undefined,
        lastTriggeredAt: 3,
        nextRunAt: null,
        cooldownUntil: 4,
        createdByUserId: undefined,
        createdAt: undefined,
        updatedAt: 5,
      } as never),
    ).toMatchObject({
      id: "1",
      teamId: "2",
      siteId: null,
      name: "",
      type: "test",
      enabled: false,
      condition: { metric: "visitors" },
      recipient: { mode: "all_team_members" },
      lastCheckedAt: null,
      lastTriggeredAt: 3,
      nextRunAt: null,
      cooldownUntil: 4,
      createdByUserId: null,
      createdAt: 0,
      updatedAt: 5,
    });
  });

  it("creates rules with normalized defaults and creator attribution", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue("rule-new");
    vi.spyOn(Date, "now").mockReturnValue(1_800_000_000_000);
    const inserted: unknown[][] = [];
    const env = {
      DB: {
        prepare: vi.fn((sql: string) => {
          if (sql.includes("INSERT INTO notification_rules")) {
            return {
              bind: vi.fn((...args: unknown[]) => {
                inserted.push(args);
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
              first: vi.fn(() =>
                Promise.resolve({
                  id: "rule-new",
                  teamId: "team-1",
                  siteId: null,
                  name: "Notification rule",
                  description: "",
                  type: "test",
                  enabled: 1,
                  scheduleJson: JSON.stringify({
                    kind: "interval",
                    everyMinutes: 60,
                  }),
                  conditionJson: "{}",
                  recipientJson: JSON.stringify({ mode: "creator" }),
                  lastCheckedAt: null,
                  lastTriggeredAt: null,
                  nextRunAt: 1_800_003_600,
                  cooldownUntil: null,
                  createdByUserId: "user-1",
                  createdAt: 1_800_000_000,
                  updatedAt: 1_800_000_000,
                }),
              ),
            })),
          };
        }),
      },
    };

    const created = await createNotificationRule(
      env as never,
      { user: { id: "user-1" }, isAdmin: true } as never,
      { teamId: "team-1", name: "   ", schedule: "bad" },
    );

    expect(created.id).toBe("rule-new");
    expect(inserted[0]).toEqual([
      "rule-new",
      "team-1",
      null,
      "Notification rule",
      "",
      "test",
      1,
      JSON.stringify({ kind: "interval", everyMinutes: 60 }),
      "{}",
      JSON.stringify({ mode: "creator" }),
      1_800_003_600,
      "user-1",
      1_800_000_000,
      1_800_000_000,
    ]);
  });

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

  it("lists rules with actor-scoped filters for non-admins", async () => {
    const bind = vi.fn(() => ({
      all: vi.fn(() =>
        Promise.resolve({
          results: [
            {
              id: "rule-1",
              teamId: "team-1",
              siteId: null,
              name: "Rule",
              description: null,
              type: "report",
              enabled: 1,
              scheduleJson: "{}",
              conditionJson: "{}",
              recipientJson: "{}",
              lastCheckedAt: null,
              lastTriggeredAt: null,
              nextRunAt: null,
              cooldownUntil: null,
              createdByUserId: null,
              createdAt: 1,
              updatedAt: 2,
            },
          ],
        }),
      ),
    }));
    const env = {
      DB: {
        prepare: vi.fn(() => ({ bind })),
      },
    };

    const rules = await listNotificationRules(
      env as never,
      { user: { id: "user-1" }, isAdmin: false } as never,
    );

    expect(rules).toHaveLength(1);
    expect(bind).toHaveBeenCalledWith("user-1");
    const prepareCalls = env.DB.prepare.mock.calls as unknown as Array<
      [string]
    >;
    expect(String(prepareCalls[0]?.[0] ?? "")).toContain(
      "team_id IN (SELECT team_id FROM team_members WHERE user_id = ?)",
    );
  });

  it("deletes manageable rules and returns false for missing rules", async () => {
    const run = vi.fn(() => Promise.resolve());
    const env = {
      DB: {
        prepare: vi.fn((sql: string) => {
          if (sql.includes("DELETE FROM notification_rules")) {
            return { bind: vi.fn(() => ({ run })) };
          }
          if (sql.includes("SELECT team_id FROM sites")) {
            return {
              bind: vi.fn(() => ({
                first: vi.fn(() => Promise.resolve({ team_id: "team-1" })),
              })),
            };
          }
          return {
            bind: vi.fn((id: string) => ({
              first: vi.fn(() =>
                Promise.resolve(
                  id === "missing"
                    ? null
                    : {
                        id,
                        teamId: "team-1",
                        siteId: null,
                        name: "Rule",
                        description: "",
                        type: "report",
                        enabled: 1,
                        scheduleJson: "{}",
                        conditionJson: "{}",
                        recipientJson: "{}",
                        lastCheckedAt: null,
                        lastTriggeredAt: null,
                        nextRunAt: null,
                        cooldownUntil: null,
                        createdByUserId: null,
                        createdAt: 1,
                        updatedAt: 1,
                      },
                ),
              ),
            })),
          };
        }),
      },
    };
    const actor = { user: { id: "admin-1" }, isAdmin: true } as never;

    await expect(
      deleteNotificationRule(env as never, actor, "rule-1"),
    ).resolves.toBe(true);
    await expect(
      deleteNotificationRule(env as never, actor, "missing"),
    ).resolves.toBe(false);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("resolves recipients for creator, explicit users, and team roles", async () => {
    const preparedSql: string[] = [];
    const env = {
      DB: {
        prepare: vi.fn((sql: string) => {
          preparedSql.push(sql);
          return {
            bind: vi.fn(() => ({
              first: vi.fn(() =>
                Promise.resolve({
                  id: "creator",
                  email: "creator@example.test",
                  preferencesJson: "{}",
                }),
              ),
              all: vi.fn(() =>
                Promise.resolve({
                  results: [
                    {
                      id: "user-1",
                      email: "user@example.test",
                      preferencesJson: "{}",
                    },
                  ],
                }),
              ),
            })),
          };
        }),
      },
    };

    await expect(
      resolveNotificationRecipients(
        env as never,
        rule({ recipient: { mode: "creator" } }),
      ),
    ).resolves.toHaveLength(1);
    await expect(
      resolveNotificationRecipients(
        env as never,
        rule({ recipient: { mode: "users", userIds: ["user-1", "user-2"] } }),
      ),
    ).resolves.toHaveLength(1);
    await expect(
      resolveNotificationRecipients(
        env as never,
        rule({ recipient: { mode: "team_admins" } }),
      ),
    ).resolves.toHaveLength(1);
    await expect(
      resolveNotificationRecipients(
        env as never,
        rule({ recipient: { mode: "creator" }, createdByUserId: null }),
      ),
    ).resolves.toEqual([]);

    expect(preparedSql.join("\n")).toContain("WHERE id IN (?, ?)");
    expect(preparedSql.join("\n")).toContain("tm.role IN ('owner', 'admin')");
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
