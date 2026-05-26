import en from "@/i18n/en.yaml";
import zh from "@/i18n/zh.yaml";

import type { Locale } from "./config";
import type { AppAnalyticsMessages } from "./messages-types-analytics";
import type { AppCoreMessages } from "./messages-types-core";
import type { AppManagementMessages } from "./messages-types-management";

export type { AppAnalyticsMessages } from "./messages-types-analytics";
export type { AppCoreMessages } from "./messages-types-core";
export type { AppManagementMessages } from "./messages-types-management";

export interface AppMessages
  extends AppCoreMessages, AppAnalyticsMessages, AppManagementMessages {}

const DICTIONARIES: Record<Locale, AppMessages> = {
  en: en as AppMessages,
  zh: zh as AppMessages,
};

export function getMessages(locale: Locale): AppMessages {
  return DICTIONARIES[locale];
}
