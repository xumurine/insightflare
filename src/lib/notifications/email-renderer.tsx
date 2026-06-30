import { createElement } from "react";
import { render } from "@react-email/render";

import type { Locale } from "@/lib/i18n/config";

import { buildNotificationContent, type NotificationContent } from "./content";
import { renderNotificationEmailText } from "./email-text";
import type { NotificationMessage } from "./message-store";

export interface RenderNotificationEmailInput {
  message: NotificationMessage;
  locale: Locale;
}

export interface RenderedNotificationEmail {
  subject: string;
  html: string;
  text: string;
}

export function buildNotificationContentForMessage(input: {
  message: NotificationMessage;
  locale: Locale;
}): NotificationContent {
  return buildNotificationContent({
    type: input.message.type,
    severity: input.message.severity,
    data: input.message.data,
    fallbackTitle: input.message.title,
    fallbackSummary: input.message.summary,
    fallbackBodyText: input.message.bodyText,
    locale: input.locale,
  });
}

export async function renderNotificationEmail({
  message,
  locale,
}: RenderNotificationEmailInput): Promise<RenderedNotificationEmail> {
  const content = buildNotificationContentForMessage({ message, locale });
  const text = renderNotificationEmailText({ content, message, locale });
  const { NotificationEmail } =
    await import("@/components/email/notification-email");
  const html = await render(
    createElement(NotificationEmail, { locale, content, message }),
  );
  return {
    subject: content.subject,
    html,
    text,
  };
}
