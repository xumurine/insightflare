import { DEFAULT_LOCALE, type Locale, resolveLocale } from "@/lib/i18n/config";

export function resolveNotificationLocale(value: unknown): Locale {
  return resolveLocale(
    typeof value === "string" && value ? value : DEFAULT_LOCALE,
  );
}
