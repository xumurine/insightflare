import type { Locale } from "@/lib/i18n/config";

import type { NotificationContent } from "./content";
import {
  formatNotificationNumber,
  notificationMetricLabel,
  notificationWindowLabel,
} from "./content";
import { NOTIFICATION_EMAIL_MESSAGES } from "./email-i18n";
import type { NotificationMessage } from "./message-store";

interface RenderNotificationEmailTextInput {
  content: NotificationContent;
  message: NotificationMessage;
  locale: Locale;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function rows(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          item !== null && typeof item === "object" && !Array.isArray(item),
      )
    : [];
}

function textValue(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function formatLastSeen(value: unknown, locale: Locale): string {
  const messages = NOTIFICATION_EMAIL_MESSAGES[locale];
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return messages.common.never;
  return new Date(Math.trunc(seconds) * 1000).toISOString();
}

function renderReportText(input: RenderNotificationEmailTextInput): string {
  const messages = NOTIFICATION_EMAIL_MESSAGES[input.locale];
  const data = input.message.data;
  const range = record(data.range);
  const metrics = record(data.metrics);
  const topPages = rows(data.topPages);
  const topReferrers = rows(data.topReferrers);
  const date = textValue(range.label);
  const pageLines =
    topPages.length > 0
      ? topPages.map((page, index) => {
          const path = textValue(page.path, "/");
          const views = formatNotificationNumber(page.views);
          return `${index + 1}. ${path} - ${views} ${messages.common.viewsUnit}`;
        })
      : [messages.common.noPageData];
  const referrerLines =
    topReferrers.length > 0
      ? topReferrers.map((referrer, index) => {
          const name = textValue(referrer.referrer, messages.common.direct);
          const visits = formatNotificationNumber(referrer.visits);
          return `${index + 1}. ${name} - ${visits} ${messages.common.visits}`;
        })
      : [messages.common.noReferrerData];
  const colon = input.locale === "zh" ? "：" : ":";

  return [
    input.content.title,
    "",
    `${messages.common.date}${colon} ${date}`,
    "",
    `${messages.common.coreMetrics}${colon}`,
    `- ${messages.common.views}${colon} ${formatNotificationNumber(metrics.views)}`,
    `- ${messages.common.visitors}${colon} ${formatNotificationNumber(metrics.visitors)}`,
    `- ${messages.common.sessions}${colon} ${formatNotificationNumber(metrics.sessions)}`,
    "",
    `${messages.common.topPages}${colon}`,
    ...pageLines,
    "",
    `${messages.common.topReferrers}${colon}`,
    ...referrerLines,
  ].join("\n");
}

function renderThresholdText(input: RenderNotificationEmailTextInput): string {
  const messages = NOTIFICATION_EMAIL_MESSAGES[input.locale];
  const data = input.message.data;
  const colon = input.locale === "zh" ? "：" : ":";
  const operator = textValue(data.operator, ">=");
  return [
    input.content.title,
    "",
    `${messages.common.metric}${colon} ${notificationMetricLabel(input.locale, data.metric)}`,
    `${messages.common.window}${colon} ${notificationWindowLabel(input.locale, data.window)}`,
    `${messages.common.currentValue}${colon} ${formatNotificationNumber(data.value)}`,
    `${messages.common.threshold}${colon} ${operator} ${formatNotificationNumber(data.target)}`,
  ].join("\n");
}

function renderHealthText(input: RenderNotificationEmailTextInput): string {
  const messages = NOTIFICATION_EMAIL_MESSAGES[input.locale];
  const colon = input.locale === "zh" ? "：" : ":";
  return [
    input.content.title,
    "",
    input.content.summary,
    "",
    `${messages.common.lastSeen}${colon} ${formatLastSeen(input.message.data.lastSeenAt, input.locale)}`,
  ].join("\n");
}

export function renderNotificationEmailText(
  input: RenderNotificationEmailTextInput,
): string {
  if (input.message.type === "report") return renderReportText(input);
  if (input.message.type === "threshold") return renderThresholdText(input);
  if (input.message.type === "health") return renderHealthText(input);
  return [input.content.title, "", input.content.bodyText].join("\n").trim();
}
