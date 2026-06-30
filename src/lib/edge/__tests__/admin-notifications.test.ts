import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  handleNotificationRulePreviewAdmin,
  handleNotificationRuleRunAdmin,
  handleNotificationRulesAdmin,
} from "@/lib/edge/admin-notifications";

const requireActor = vi.hoisted(() => vi.fn());
const canManageTeam = vi.hoisted(() => vi.fn());
const canManageSite = vi.hoisted(() => vi.fn());
const updateNotificationRule = vi.hoisted(() => vi.fn());
const getNotificationRule = vi.hoisted(() => vi.fn());
const createNotificationRulePreview = vi.hoisted(() => vi.fn());
const runNotificationRuleManually = vi.hoisted(() => vi.fn());
const runScheduledTask = vi.hoisted(() => vi.fn());

vi.mock("@/lib/edge/admin-auth", () => ({
  requireActor,
}));

vi.mock("@/lib/edge/admin-access", () => ({
  canManageSite,
  canManageTeam,
  canReadTeam: vi.fn(),
}));

vi.mock("@/lib/notifications/rule-store", () => ({
  createNotificationRule: vi.fn(),
  deleteNotificationRule: vi.fn(),
  getNotificationRule,
  listNotificationRules: vi.fn(),
  updateNotificationRule,
}));

vi.mock("@/lib/notifications/notification-task", () => ({
  createManualTestNotification: vi.fn(),
  createNotificationRulePreview,
  runNotificationRuleManually,
  NOTIFICATION_TASK_KEY: "notification_tick",
  NOTIFICATION_TASK_NAME: "Notification dispatch",
}));

vi.mock("@/lib/edge/scheduled-task-runner", () => ({
  runScheduledTask,
}));

function request(path: string, body: Record<string, unknown>): Request {
  return new Request(`https://edge.test${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function patchRequest(body: Record<string, unknown>): Request {
  return new Request("https://edge.test/api/private/admin/notification-rules", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function rule() {
  return {
    id: "rule-1",
    teamId: "team-1",
    siteId: "site-1",
    type: "report",
  };
}

describe("admin notification handlers", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    requireActor.mockResolvedValue({
      user: { id: "user-1" },
      isAdmin: false,
    });
    updateNotificationRule.mockResolvedValue(rule());
  });

  it("passes only explicit fields for notification rule enabled patches", async () => {
    const response = await handleNotificationRulesAdmin(
      patchRequest({ ruleId: "rule-1", enabled: false }),
      {} as never,
      new URL("https://edge.test/api/private/admin/notification-rules"),
    );

    expect(response.status).toBe(200);
    expect(updateNotificationRule).toHaveBeenCalledWith(
      expect.anything(),
      {
        user: { id: "user-1" },
        isAdmin: false,
      },
      {
        ruleId: "rule-1",
        enabled: false,
      },
    );
  });

  it("passes only explicit fields for notification rule name patches", async () => {
    await handleNotificationRulesAdmin(
      patchRequest({ ruleId: "rule-1", name: "Renamed" }),
      {} as never,
      new URL("https://edge.test/api/private/admin/notification-rules"),
    );

    expect(updateNotificationRule).toHaveBeenCalledWith(
      expect.anything(),
      {
        user: { id: "user-1" },
        isAdmin: false,
      },
      {
        ruleId: "rule-1",
        name: "Renamed",
      },
    );
  });

  it("denies preview and manual run when the actor cannot manage the rule", async () => {
    getNotificationRule.mockResolvedValue(rule());
    canManageTeam.mockResolvedValue(false);

    const preview = await handleNotificationRulePreviewAdmin(
      request("/api/private/admin/notification-rules/preview", {
        ruleId: "rule-1",
      }),
      {} as never,
    );
    const run = await handleNotificationRuleRunAdmin(
      request("/api/private/admin/notification-rules/run", {
        ruleId: "rule-1",
      }),
      {} as never,
    );

    expect(preview.status).toBe(403);
    expect(run.status).toBe(403);
    expect(createNotificationRulePreview).not.toHaveBeenCalled();
    expect(runScheduledTask).not.toHaveBeenCalled();
    expect(runNotificationRuleManually).not.toHaveBeenCalled();
  });
});
