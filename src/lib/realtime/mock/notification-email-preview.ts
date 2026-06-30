import { notificationEmailPreviewMessage } from "@/components/email/notification-email-preview-data";
import { buildNotificationContent } from "@/lib/notifications/content";
import { renderNotificationEmailText } from "@/lib/notifications/email-text";
import { resolveNotificationLocale } from "@/lib/notifications/locale";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderPreviewHtml(input: {
  subject: string;
  title: string;
  summary: string;
  text: string;
}): string {
  const lines = input.text
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("");
  return [
    "<!doctype html>",
    '<html><head><meta charset="utf-8" />',
    `<title>${escapeHtml(input.subject)}</title>`,
    "</head><body>",
    `<h1>${escapeHtml(input.title)}</h1>`,
    `<p>${escapeHtml(input.summary)}</p>`,
    lines,
    "</body></html>",
  ].join("");
}

export async function handleDemoNotificationEmailPreview(input: {
  type: "test" | "report" | "threshold" | "health";
  locale: "en" | "zh";
  format: "html" | "text" | "json";
}): Promise<
  | string
  | {
      subject: string;
      html: string;
      text: string;
    }
> {
  const locale = resolveNotificationLocale(input.locale);
  const message = notificationEmailPreviewMessage(input.type, locale);
  const content = buildNotificationContent({
    type: message.type,
    severity: message.severity,
    data: message.data,
    fallbackTitle: message.title,
    fallbackSummary: message.summary,
    fallbackBodyText: message.bodyText,
    locale,
  });
  const text = renderNotificationEmailText({
    content,
    message,
    locale,
    timeZone: "Asia/Shanghai",
  });
  const rendered = {
    subject: content.subject,
    html: renderPreviewHtml({
      subject: content.subject,
      title: content.title,
      summary: content.summary,
      text,
    }),
    text,
  };
  if (input.format === "text") return rendered.text;
  if (input.format === "json") return rendered;
  return rendered.html;
}
