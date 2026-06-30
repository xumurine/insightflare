import { notificationEmailPreviewMessage } from "@/components/email/notification-email-preview-data";
import { renderNotificationEmail } from "@/lib/notifications/email-renderer";
import { resolveNotificationLocale } from "@/lib/notifications/locale";

export async function handleDemoNotificationEmailPreview(input: {
  type: "test" | "report" | "milestone" | "threshold" | "change" | "health";
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
  const rendered = await renderNotificationEmail({
    message,
    locale,
    timeZone: "Asia/Shanghai",
  });
  if (input.format === "text") return rendered.text;
  if (input.format === "json") return rendered;
  return rendered.html;
}
