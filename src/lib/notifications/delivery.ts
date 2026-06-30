import type { ScheduledTaskLogger } from "@/lib/edge/scheduled-task-runner";
import { decryptNotificationSecret } from "@/lib/edge/secret-encryption";
import { readConfig } from "@/lib/edge/system-config";
import type { Env } from "@/lib/edge/types";
import { clampString } from "@/lib/edge/utils";
import {
  isValidEmail,
  normalizeNotificationEmailConfig,
  SYSTEM_NOTIFICATION_EMAIL_CONFIG_KEY,
} from "@/lib/notifications/email-config";
import { renderNotificationEmail } from "@/lib/notifications/email-renderer";
import { resolveNotificationLocale } from "@/lib/notifications/locale";

import {
  type NotificationMessage,
  updateNotificationDeliveryResult,
} from "./message-store";
import { normalizeNotificationPreferences } from "./preferences";

const RESEND_EMAILS_API_URL = "https://api.resend.com/emails";
type NotificationDeliveryLogger = Pick<
  ScheduledTaskLogger,
  "info" | "warn" | "error"
>;

export interface NotificationDeliveryUser {
  id: string;
  email: string;
  preferencesJson?: string | null;
  preferredLocale?: string | null;
  timeZone?: string | null;
}

function buildFromAddress(input: { fromName: string; fromEmail: string }) {
  const name = input.fromName.trim();
  if (!name) return input.fromEmail;
  const escaped = name.replace(/["\\]/g, "");
  return `${escaped} <${input.fromEmail}>`;
}

function sanitizeProviderError(value: unknown): string {
  if (!value || typeof value !== "object") {
    return clampString(String(value || "provider_error"), 180);
  }
  const record = value as Record<string, unknown>;
  const message =
    (typeof record.message === "string" && record.message) ||
    (typeof record.error === "string" && record.error) ||
    (typeof record.name === "string" && record.name) ||
    "provider_error";
  return clampString(message, 180);
}

function maskEmail(value: string): string {
  const [local = "", domain = ""] = value.split("@");
  if (!local || !domain) return "";
  return `${local.slice(0, 2)}***@${domain}`;
}

function fallbackRenderedEmail(message: NotificationMessage) {
  return {
    subject: message.title,
    text:
      message.bodyText ||
      message.summary ||
      "You have a new InsightFlare notification.",
    html: message.bodyHtml || undefined,
  };
}

export async function deliverNotificationMessage(
  env: Env,
  message: NotificationMessage,
  user: NotificationDeliveryUser,
  context: { logger?: NotificationDeliveryLogger },
): Promise<NotificationMessage | null> {
  const preferences = normalizeNotificationPreferences(user.preferencesJson);
  const channels = { inApp: true, email: preferences.email };
  const results: Record<string, unknown> = {
    inApp: { status: "sent" },
  };

  if (!preferences.email) {
    results.email = {
      status: "skipped",
      reason: "user_preference_disabled",
    };
    await context.logger?.info(
      "notification_delivery_skipped",
      "Email delivery skipped by user preference",
      {
        messageId: message.id,
        userId: user.id,
        channel: "email",
        reason: "user_preference_disabled",
      },
    );
    return updateNotificationDeliveryResult(env, {
      messageId: message.id,
      status: "sent",
      channels,
      deliveryResults: results,
    });
  }

  const rawConfig = await readConfig(env, SYSTEM_NOTIFICATION_EMAIL_CONFIG_KEY);
  const config = normalizeNotificationEmailConfig(rawConfig);
  if (
    !config.enabled ||
    config.provider !== "resend" ||
    !config.fromEmail ||
    !config.resend.configured ||
    !config.resend.apiKeyEncrypted
  ) {
    results.email = {
      status: "skipped",
      reason: "system_email_unconfigured",
    };
    await context.logger?.info(
      "notification_delivery_skipped",
      "Email delivery skipped because system email is not configured",
      {
        messageId: message.id,
        userId: user.id,
        channel: "email",
        provider: "resend",
        reason: "system_email_unconfigured",
      },
    );
    return updateNotificationDeliveryResult(env, {
      messageId: message.id,
      status: "sent",
      channels,
      deliveryResults: results,
    });
  }

  if (!isValidEmail(user.email)) {
    results.email = {
      status: "skipped",
      reason: "recipient_email_invalid",
    };
    await context.logger?.warn(
      "notification_delivery_skipped",
      "Email delivery skipped because recipient email is invalid",
      {
        messageId: message.id,
        userId: user.id,
        channel: "email",
        provider: "resend",
        reason: "recipient_email_invalid",
      },
    );
    return updateNotificationDeliveryResult(env, {
      messageId: message.id,
      status: "sent",
      channels,
      deliveryResults: results,
    });
  }

  let apiKey = "";
  try {
    apiKey = await decryptNotificationSecret(
      env,
      config.resend.apiKeyEncrypted,
    );
  } catch {
    results.email = {
      status: "skipped",
      reason: "secret_decryption_failed",
    };
    await context.logger?.warn(
      "notification_delivery_skipped",
      "Email delivery skipped because saved credentials cannot be decrypted",
      {
        messageId: message.id,
        userId: user.id,
        channel: "email",
        provider: "resend",
        reason: "secret_decryption_failed",
      },
    );
    return updateNotificationDeliveryResult(env, {
      messageId: message.id,
      status: "sent",
      channels,
      deliveryResults: results,
    });
  }

  const startedAt = Date.now();
  await context.logger?.info("notification_delivery_attempt", "Sending email", {
    messageId: message.id,
    userId: user.id,
    channel: "email",
    provider: "resend",
    recipient: maskEmail(user.email),
  });

  try {
    let rendered = fallbackRenderedEmail(message);
    try {
      const locale = resolveNotificationLocale(user.preferredLocale);
      rendered = await renderNotificationEmail({
        message,
        locale,
        timeZone: user.timeZone,
      });
    } catch (error) {
      await context.logger?.warn(
        "notification_email_render_failed",
        "Notification email render failed; falling back to plain text delivery",
        {
          messageId: message.id,
          userId: user.id,
          channel: "email",
          provider: "resend",
          error: error instanceof Error ? error.message : String(error),
        },
      );
    }

    const response = await fetch(RESEND_EMAILS_API_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: buildFromAddress(config),
        to: [user.email],
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html,
        reply_to: config.replyTo || undefined,
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const durationMs = Date.now() - startedAt;
    if (!response.ok) {
      const errorMessage = sanitizeProviderError(payload);
      results.email = {
        status: "failed",
        provider: "resend",
        reason: "provider_failed",
        errorMessage,
        durationMs,
      };
      await context.logger?.error(
        "notification_delivery_failed",
        "Email delivery failed",
        {
          messageId: message.id,
          userId: user.id,
          channel: "email",
          provider: "resend",
          recipient: maskEmail(user.email),
          errorMessage,
          durationMs,
        },
      );
      return updateNotificationDeliveryResult(env, {
        messageId: message.id,
        status: "failed",
        channels,
        deliveryResults: results,
        errorMessage,
      });
    }
    const providerMessageId =
      typeof payload.id === "string" ? clampString(payload.id, 120) : "";
    results.email = {
      status: "sent",
      provider: "resend",
      messageId: providerMessageId,
      durationMs,
    };
    await context.logger?.info(
      "notification_delivery_success",
      "Email delivery succeeded",
      {
        messageId: message.id,
        userId: user.id,
        channel: "email",
        provider: "resend",
        recipient: maskEmail(user.email),
        providerMessageId,
        durationMs,
      },
    );
    return updateNotificationDeliveryResult(env, {
      messageId: message.id,
      status: "sent",
      channels,
      deliveryResults: results,
    });
  } catch {
    const durationMs = Date.now() - startedAt;
    const errorMessage = "Unable to reach Resend email API";
    results.email = {
      status: "failed",
      provider: "resend",
      reason: "network_failed",
      errorMessage,
      durationMs,
    };
    await context.logger?.error(
      "notification_delivery_failed",
      "Email delivery failed",
      {
        messageId: message.id,
        userId: user.id,
        channel: "email",
        provider: "resend",
        recipient: maskEmail(user.email),
        errorMessage,
        durationMs,
      },
    );
    return updateNotificationDeliveryResult(env, {
      messageId: message.id,
      status: "failed",
      channels,
      deliveryResults: results,
      errorMessage,
    });
  }
}
