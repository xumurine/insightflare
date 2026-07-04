import { DEFAULT_LOCALE, type Locale, resolveLocale } from "@/lib/i18n/config";

export function resolveNotificationLocale(value: unknown): Locale {
  return resolveLocale(
    typeof value === "string" && value ? value : DEFAULT_LOCALE,
  );
}

export function resolveNotificationMessageLocale(input: {
  messageLocale?: unknown;
  userLocale?: unknown;
}): Locale {
  const messageLocale =
    typeof input.messageLocale === "string" && input.messageLocale
      ? input.messageLocale
      : undefined;
  if (messageLocale) return resolveNotificationLocale(messageLocale);
  return resolveNotificationLocale(input.userLocale);
}
