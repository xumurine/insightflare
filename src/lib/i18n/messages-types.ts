import type { AppAnalyticsMessages } from "./messages-types-analytics";
import type { AppCoreMessages } from "./messages-types-core";
import type { AppManagementMessages } from "./messages-types-management";

export type { AppAnalyticsMessages } from "./messages-types-analytics";
export type { AppCoreMessages } from "./messages-types-core";
export type { AppManagementMessages } from "./messages-types-management";

export interface AppMessages
  extends AppCoreMessages, AppAnalyticsMessages, AppManagementMessages {}
