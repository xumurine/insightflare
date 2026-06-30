import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ScheduledTaskContext } from "@/lib/edge/scheduled-task-runner";
import type { NotificationMessage } from "@/lib/notifications/message-store";
import {
  createNotificationRulePreview,
  runNotificationRuleManually,
  runNotificationTick,
} from "@/lib/notifications/notification-task";
import type { NotificationRule } from "@/lib/notifications/rule-store";

const listDueNotificationRules = vi.hoisted(() => vi.fn());
const resolveNotificationRecipients = vi.hoisted(() => vi.fn());
const advanceNotificationRuleSchedule = vi.hoisted(() => vi.fn());
const evaluateNotificationRule = vi.hoisted(() => vi.fn());
const createNotificationMessage = vi.hoisted(() => vi.fn());
const deliverNotificationMessage = vi.hoisted(() => vi.fn());

vi.mock("@/lib/notifications/rule-store", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  listDueNotificationRules,
  resolveNotificationRecipients,
  advanceNotificationRuleSchedule,
}));

vi.mock("@/lib/notifications/evaluator", () => ({
  evaluateNotificationRule,
}));

vi.mock("@/lib/notifications/message-store", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  createNotificationMessage,
}));

vi.mock("@/lib/notifications/delivery", () => ({
  deliverNotificationMessage,
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
    nextRunAt: 1,
    cooldownUntil: null,
    createdByUserId: "user-1",
    createdAt: 1,
    updatedAt: 1,
    ...input,
  };
}

function message(
  input: Partial<NotificationMessage> = {},
): NotificationMessage {
  return {
    id: "msg-1",
    teamId: "team-1",
    siteId: "site-1",
    userId: "user-1",
    ruleId: "rule-1",
    runId: "run-1",
    batchId: "batch-1",
    type: "threshold",
    severity: "warning",
    requiresAttention: true,
    title: "Title",
    summary: "Summary",
    bodyText: "Body",
    bodyHtml: "",
    data: {},
    channels: {},
    deliveryStatus: "sent",
    deliveryResults: { email: { status: "sent" } },
    errorMessage: "",
    readAt: null,
    dismissedAt: null,
    archivedAt: null,
    triggeredAt: 1,
    createdAt: 1,
    updatedAt: 1,
    sentAt: 1,
    failedAt: null,
    expiresAt: null,
    ...input,
  };
}

function context(): ScheduledTaskContext & {
  events: string[];
} {
  const events: string[] = [];
  const logger = {
    debug: vi.fn((event: string) => {
      events.push(event);
      return Promise.resolve();
    }),
    info: vi.fn((event: string) => {
      events.push(event);
      return Promise.resolve();
    }),
    warn: vi.fn((event: string) => {
      events.push(event);
      return Promise.resolve();
    }),
    error: vi.fn((event: string) => {
      events.push(event);
      return Promise.resolve();
    }),
  };
  return {
    env: {} as never,
    runId: "run-1",
    invocationId: "invocation-1",
    scheduledTime: null,
    startedAt: Date.now(),
    logger,
    events,
  };
}

describe("notification task", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    advanceNotificationRuleSchedule.mockResolvedValue(undefined);
  });

  it("creates and delivers messages for triggered rules", async () => {
    listDueNotificationRules.mockResolvedValue([rule()]);
    evaluateNotificationRule.mockResolvedValue({
      status: "triggered",
      cooldownUntil: 2000,
      message: {
        type: "threshold",
        severity: "warning",
        requiresAttention: true,
        title: "Traffic threshold",
        summary: "Visitors reached the threshold",
        bodyText: "Body",
        data: { metric: "visitors" },
      },
      data: { metric: "visitors" },
    });
    resolveNotificationRecipients.mockResolvedValue([
      {
        id: "user-1",
        email: "user@example.test",
        preferencesJson: "{}",
      },
    ]);
    createNotificationMessage.mockResolvedValue(message());
    deliverNotificationMessage.mockResolvedValue(message());

    const ctx = context();
    const outcome = await runNotificationTick(ctx);

    expect(outcome.status).toBe("success");
    expect(outcome.summary).toMatchObject({
      rulesScanned: 1,
      rulesChecked: 1,
      rulesTriggered: 1,
      messagesCreated: 1,
      emailSent: 1,
    });
    expect(createNotificationMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: "threshold",
        severity: "warning",
        requiresAttention: true,
      }),
    );
    expect(advanceNotificationRuleSchedule).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        triggeredAt: expect.any(Number),
        cooldownUntil: 2000,
      }),
    );
    expect(ctx.events).toContain("notification_rule_checked");
    expect(ctx.events).toContain("notification_rule_triggered");
  });

  it("advances checked rules without creating messages", async () => {
    listDueNotificationRules.mockResolvedValue([rule()]);
    evaluateNotificationRule.mockResolvedValue({
      status: "checked",
      triggered: false,
      summary: "Not over threshold",
      data: { value: 5 },
    });

    const outcome = await runNotificationTick(context());

    expect(outcome.summary).toMatchObject({
      rulesScanned: 1,
      rulesChecked: 1,
      rulesTriggered: 0,
      messagesCreated: 0,
    });
    expect(createNotificationMessage).not.toHaveBeenCalled();
    expect(advanceNotificationRuleSchedule).toHaveBeenCalled();
  });

  it("continues when one rule evaluation fails", async () => {
    listDueNotificationRules.mockResolvedValue([rule({ id: "bad" }), rule()]);
    evaluateNotificationRule
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({
        status: "checked",
        triggered: false,
        summary: "Not triggered",
      });

    const ctx = context();
    const outcome = await runNotificationTick(ctx);

    expect(outcome.summary).toMatchObject({
      rulesScanned: 2,
      rulesChecked: 1,
      rulesSkipped: 1,
    });
    expect(ctx.events).toContain("notification_rule_failed");
    expect(advanceNotificationRuleSchedule).toHaveBeenCalledTimes(2);
  });

  it("previews a rule without creating messages or advancing schedule", async () => {
    evaluateNotificationRule.mockResolvedValue({
      status: "checked",
      triggered: false,
      summary: "Not triggered",
    });

    const result = await createNotificationRulePreview({} as never, rule());

    expect(result).toMatchObject({
      status: "checked",
      triggered: false,
    });
    expect(createNotificationMessage).not.toHaveBeenCalled();
    expect(deliverNotificationMessage).not.toHaveBeenCalled();
    expect(advanceNotificationRuleSchedule).not.toHaveBeenCalled();
  });

  it("manually runs a triggered rule without advancing schedule", async () => {
    evaluateNotificationRule.mockResolvedValue({
      status: "triggered",
      message: {
        type: "threshold",
        severity: "warning",
        requiresAttention: true,
        title: "Traffic threshold",
        summary: "Visitors reached the threshold",
        bodyText: "Body",
      },
    });
    resolveNotificationRecipients.mockResolvedValue([
      { id: "user-1", email: "user@example.test", preferencesJson: "{}" },
    ]);
    createNotificationMessage.mockResolvedValue(message());
    deliverNotificationMessage.mockResolvedValue(
      message({
        deliveryResults: {
          email: { status: "skipped", reason: "recipient_email_invalid" },
        },
      }),
    );

    const outcome = await runNotificationRuleManually({
      env: {} as never,
      context: context(),
      rule: rule(),
    });

    expect(outcome.messageCount).toBe(1);
    expect(outcome.summary).toMatchObject({
      rulesScanned: 1,
      rulesChecked: 1,
      rulesTriggered: 1,
      messagesCreated: 1,
      emailSkipped: 1,
      emailSkippedInvalidRecipient: 1,
    });
    expect(advanceNotificationRuleSchedule).not.toHaveBeenCalled();
  });
});
