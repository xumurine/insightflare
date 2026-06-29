import type {
  ScheduledTaskContext,
  ScheduledTaskOutcome,
} from "@/lib/edge/scheduled-task-runner";
import type { Env } from "@/lib/edge/types";

import { deliverNotificationMessage } from "./delivery";
import {
  createNotificationMessage,
  type NotificationMessage,
} from "./message-store";
import {
  normalizeNotificationPreferences,
  shouldCreateUnreadAttention,
} from "./preferences";
import {
  advanceNotificationRuleSchedule,
  listDueNotificationRules,
  type NotificationRule,
  resolveNotificationRecipients,
} from "./rule-store";

export const NOTIFICATION_TASK_KEY = "notification_tick";
export const NOTIFICATION_TASK_NAME = "Notification dispatch";

export interface NotificationTaskSummary {
  rulesScanned: number;
  rulesTriggered: number;
  messagesCreated: number;
  inAppCreated: number;
  emailAttempted: number;
  emailSent: number;
  emailFailed: number;
  skippedByPreference: number;
  durationMs: number;
}

interface NotificationTemplate {
  title: string;
  summary: string;
  bodyText: string;
  requiresAttention: boolean;
}

function testTemplate(): NotificationTemplate {
  return {
    title: "InsightFlare notification test",
    summary: "This is a test notification from InsightFlare.",
    bodyText:
      "This is a test notification from InsightFlare. If email is configured and enabled, this message also verifies Resend delivery.",
    requiresAttention: false,
  };
}

function templateForRule(rule: NotificationRule): NotificationTemplate | null {
  if (rule.type === "test") return testTemplate();
  if (
    rule.type === "report" &&
    String(rule.condition.reportType ?? "") === "daily"
  ) {
    return {
      title: "InsightFlare daily report",
      summary: "Your daily report is ready.",
      bodyText:
        "A minimal daily report notification was generated. Detailed report content will be expanded in a later release.",
      requiresAttention: false,
    };
  }
  return null;
}

function emptySummary(startedAt: number): NotificationTaskSummary {
  return {
    rulesScanned: 0,
    rulesTriggered: 0,
    messagesCreated: 0,
    inAppCreated: 0,
    emailAttempted: 0,
    emailSent: 0,
    emailFailed: 0,
    skippedByPreference: 0,
    durationMs: Date.now() - startedAt,
  };
}

function collectDeliveryStats(
  summary: NotificationTaskSummary,
  message: NotificationMessage | null,
) {
  const email = message?.deliveryResults.email;
  if (!email || typeof email !== "object" || Array.isArray(email)) return;
  const status = String((email as Record<string, unknown>).status ?? "");
  if (status === "sent") {
    summary.emailAttempted += 1;
    summary.emailSent += 1;
    return;
  }
  if (status === "failed") {
    summary.emailAttempted += 1;
    summary.emailFailed += 1;
    return;
  }
  if (status === "skipped") {
    const reason = String((email as Record<string, unknown>).reason ?? "");
    if (reason === "user_preference_disabled") {
      summary.skippedByPreference += 1;
    }
  }
}

export async function runNotificationTick(
  context: ScheduledTaskContext,
): Promise<ScheduledTaskOutcome> {
  const { env, logger, runId, startedAt } = context;
  const now = Math.floor(Date.now() / 1000);
  const summary = emptySummary(startedAt);

  await logger.info("notification_tick_start", "Notification tick started", {
    now,
  });
  const rules = await listDueNotificationRules(env, now);
  summary.rulesScanned = rules.length;
  await logger.info(
    "notification_candidates",
    "Loaded due notification rules",
    {
      count: rules.length,
    },
  );

  for (const rule of rules) {
    const checkedAt = Math.floor(Date.now() / 1000);
    try {
      await logger.info(
        "notification_rule_evaluated",
        "Evaluating notification rule",
        {
          ruleId: rule.id,
          teamId: rule.teamId,
          siteId: rule.siteId,
          type: rule.type,
        },
      );
      const template = templateForRule(rule);
      if (!template) {
        await logger.info(
          "notification_rule_skipped",
          "Notification rule type is not implemented in this release",
          { ruleId: rule.id, type: rule.type },
        );
        await advanceNotificationRuleSchedule(env, { rule, checkedAt });
        continue;
      }

      const recipients = await resolveNotificationRecipients(env, rule);
      if (recipients.length === 0) {
        await logger.warn(
          "notification_rule_skipped",
          "Notification rule has no recipients",
          { ruleId: rule.id, recipientMode: rule.recipient.mode },
        );
        await advanceNotificationRuleSchedule(env, { rule, checkedAt });
        continue;
      }

      const batchId = crypto.randomUUID();
      summary.rulesTriggered += 1;
      await logger.info(
        "notification_rule_triggered",
        "Notification rule triggered",
        {
          ruleId: rule.id,
          batchId,
          recipientCount: recipients.length,
        },
      );

      for (const user of recipients) {
        const preferences = normalizeNotificationPreferences(
          user.preferencesJson,
        );
        const requiresAttention = shouldCreateUnreadAttention({
          preferences,
          type: rule.type,
          fallback: template.requiresAttention,
        });
        const message = await createNotificationMessage(env, {
          teamId: rule.teamId,
          siteId: rule.siteId,
          userId: user.id,
          ruleId: rule.id,
          runId,
          batchId,
          type: rule.type,
          severity: "info",
          requiresAttention,
          title: template.title,
          summary: template.summary,
          bodyText: template.bodyText,
          data: {
            ruleId: rule.id,
            batchId,
          },
          triggeredAt: checkedAt,
        });
        summary.messagesCreated += 1;
        summary.inAppCreated += 1;
        await logger.info(
          "notification_messages_created",
          "Notification message created",
          {
            ruleId: rule.id,
            messageId: message.id,
            userId: user.id,
            batchId,
          },
        );
        const delivered = await deliverNotificationMessage(env, message, user, {
          logger,
        });
        collectDeliveryStats(summary, delivered);
      }

      await advanceNotificationRuleSchedule(env, {
        rule,
        checkedAt,
        triggeredAt: checkedAt,
      });
    } catch (error) {
      await logger.error(
        "notification_rule_skipped",
        "Notification rule failed; continuing with remaining rules",
        {
          ruleId: rule.id,
          error: error instanceof Error ? error.message : String(error),
        },
      );
      await advanceNotificationRuleSchedule(env, { rule, checkedAt });
    }
  }

  summary.durationMs = Date.now() - startedAt;
  await logger.info("notification_tick_finish", "Notification tick finished", {
    ...summary,
  });
  return {
    status: summary.emailFailed > 0 ? "partial" : "success",
    summary: { ...summary },
  };
}

export async function createManualTestNotification(input: {
  env: Env;
  context: ScheduledTaskContext;
  teamId: string;
  siteId?: string | null;
  userId: string;
}): Promise<{
  message: NotificationMessage | null;
  summary: NotificationTaskSummary;
}> {
  const { env, context, teamId, siteId, userId } = input;
  const summary = emptySummary(context.startedAt);
  const now = Math.floor(Date.now() / 1000);
  const user = await env.DB.prepare(
    `
      SELECT id, email, notification_preferences_json AS preferencesJson
      FROM users
      WHERE id = ?
      LIMIT 1
    `,
  )
    .bind(userId)
    .first<{ id: string; email: string; preferencesJson: string }>();
  if (!user) {
    await context.logger.warn(
      "notification_delivery_skipped",
      "Manual test notification recipient was not found",
      { userId },
    );
    return { message: null, summary };
  }
  const template = testTemplate();
  const message = await createNotificationMessage(env, {
    teamId,
    siteId: siteId ?? null,
    userId,
    runId: context.runId,
    batchId: crypto.randomUUID(),
    type: "test",
    severity: "info",
    requiresAttention: false,
    title: template.title,
    summary: template.summary,
    bodyText: template.bodyText,
    data: { source: "manual_test" },
    triggeredAt: now,
  });
  summary.messagesCreated = 1;
  summary.inAppCreated = 1;
  await context.logger.info(
    "notification_messages_created",
    "Manual test notification message created",
    { messageId: message.id, userId, teamId, siteId: siteId ?? null },
  );
  const delivered = await deliverNotificationMessage(env, message, user, {
    logger: context.logger,
  });
  collectDeliveryStats(summary, delivered);
  summary.durationMs = Date.now() - context.startedAt;
  return { message: delivered, summary };
}
