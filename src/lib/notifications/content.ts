import type { Locale } from "@/lib/i18n/config";

import { NOTIFICATION_EMAIL_MESSAGES } from "./email-i18n";
import type {
  NotificationMessageType,
  NotificationSeverity,
} from "./message-types";

export interface NotificationContentInput {
  type: NotificationMessageType;
  severity: NotificationSeverity;
  data: Record<string, unknown>;
  fallbackTitle?: string;
  fallbackSummary?: string;
  fallbackBodyText?: string;
  locale: Locale;
}

export interface NotificationContent {
  subject: string;
  title: string;
  summary: string;
  bodyText: string;
}

type MetricKey = "views" | "visitors" | "sessions";
type WindowKey = "last_1h" | "last_24h" | "yesterday";

function format(template: string, values: Record<string, string>): string {
  return template.replace(
    /\{([a-zA-Z0-9_]+)\}/g,
    (_, key: string) => values[key] ?? "",
  );
}

export function formatNotificationNumber(value: unknown): string {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0";
  return Math.trunc(number).toLocaleString("en-US");
}

export function notificationSiteName(data: Record<string, unknown>): string {
  for (const key of ["siteDomain", "domain", "siteName", "hostname"]) {
    const value = data[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "Site";
}

export function notificationMetricLabel(
  locale: Locale,
  value: unknown,
): string {
  const key =
    value === "views" || value === "visitors" || value === "sessions"
      ? value
      : "views";
  return NOTIFICATION_EMAIL_MESSAGES[locale].threshold.metricLabels[
    key as MetricKey
  ];
}

export function notificationWindowLabel(
  locale: Locale,
  value: unknown,
): string {
  const key =
    value === "last_1h" || value === "last_24h" || value === "yesterday"
      ? value
      : "last_1h";
  return NOTIFICATION_EMAIL_MESSAGES[locale].threshold.windows[
    key as WindowKey
  ];
}

function reportContent(input: NotificationContentInput): NotificationContent {
  const messages = NOTIFICATION_EMAIL_MESSAGES[input.locale];
  const site = notificationSiteName(input.data);
  const range =
    input.data.range && typeof input.data.range === "object"
      ? (input.data.range as Record<string, unknown>)
      : {};
  const date =
    typeof range.label === "string" && range.label ? range.label : "";
  const metrics =
    input.data.metrics && typeof input.data.metrics === "object"
      ? (input.data.metrics as Record<string, unknown>)
      : {};
  const subject = format(messages.report.subject, { site });
  const summary = format(messages.report.summary, {
    date,
    visitors: formatNotificationNumber(metrics.visitors),
    views: formatNotificationNumber(metrics.views),
  });
  return {
    subject,
    title: format(messages.report.title, { site }),
    summary,
    bodyText: input.fallbackBodyText || summary,
  };
}

function thresholdContent(
  input: NotificationContentInput,
): NotificationContent {
  const messages = NOTIFICATION_EMAIL_MESSAGES[input.locale];
  const site = notificationSiteName(input.data);
  const metric = notificationMetricLabel(input.locale, input.data.metric);
  const window = notificationWindowLabel(input.locale, input.data.window);
  const operator =
    typeof input.data.operator === "string" ? input.data.operator : ">=";
  const value = formatNotificationNumber(input.data.value);
  const target = formatNotificationNumber(input.data.target);
  const subject = format(messages.threshold.subject, { site });
  const summary = format(messages.threshold.summary, {
    window,
    metric,
    value,
    operator,
    target,
  });
  return {
    subject,
    title: format(messages.threshold.title, { site }),
    summary,
    bodyText: input.fallbackBodyText || summary,
  };
}

function healthContent(input: NotificationContentInput): NotificationContent {
  const messages = NOTIFICATION_EMAIL_MESSAGES[input.locale];
  const site = notificationSiteName(input.data);
  const hours = formatNotificationNumber(input.data.hours);
  const subject = format(messages.health.subject, { site, hours });
  const summary =
    input.data.lastSeenAt === null
      ? messages.health.noHistory
      : messages.common.trackingHint;
  return {
    subject,
    title: format(messages.health.title, { site, hours }),
    summary,
    bodyText: input.fallbackBodyText || summary,
  };
}

export function buildNotificationContent(
  input: NotificationContentInput,
): NotificationContent {
  const messages = NOTIFICATION_EMAIL_MESSAGES[input.locale];
  if (input.type === "test") {
    return {
      subject: messages.test.subject,
      title: messages.test.title,
      summary: messages.test.summary,
      bodyText: messages.test.body,
    };
  }
  if (input.type === "report") return reportContent(input);
  if (input.type === "threshold") return thresholdContent(input);
  if (input.type === "health") return healthContent(input);

  const title = input.fallbackTitle || messages.common.fallbackSubject;
  const summary = input.fallbackSummary || title;
  return {
    subject: title,
    title,
    summary,
    bodyText: input.fallbackBodyText || summary,
  };
}
