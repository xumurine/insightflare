import { type Locale, SUPPORTED_LOCALES } from "@/lib/i18n/config";
import { type AppMessages, getMessages } from "@/lib/i18n/messages";

export type NotificationEmailMessages = AppMessages["notificationEmail"];

export const NOTIFICATION_EMAIL_MESSAGES = Object.fromEntries(
  SUPPORTED_LOCALES.map((locale) => [
    locale,
    getMessages(locale).notificationEmail,
  ]),
) as Record<Locale, NotificationEmailMessages>;
