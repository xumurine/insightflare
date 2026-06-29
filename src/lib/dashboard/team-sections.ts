import type { Locale } from "@/lib/i18n/config";
import type { AppMessages } from "@/lib/i18n/messages";

export type TeamTab =
  | "sites"
  | "site-management"
  | "widgets"
  | "notifications"
  | "public-links"
  | "api-keys"
  | "settings";

export type ManagementSectionKey =
  | "manage-users"
  | "manage-teams"
  | "version-updates"
  | "scheduled-tasks"
  | "system-performance"
  | "system-settings";

export interface DashboardSectionItem {
  key: string;
  label: string;
  href: string;
}

const TEAM_TABS_ALWAYS: readonly TeamTab[] = ["sites"] as const;
const TEAM_TABS_MANAGE: readonly TeamTab[] = [
  "widgets",
  "notifications",
  "public-links",
  "api-keys",
  "site-management",
  "settings",
] as const;

function teamTabLabel(messages: AppMessages, tab: TeamTab): string {
  if (tab === "sites") return messages.teamManagement.sites.title;
  if (tab === "site-management") return messages.managementNav.sites;
  if (tab === "widgets") return messages.teamManagement.widgets.title;
  if (tab === "notifications")
    return messages.teamManagement.notifications.title;
  if (tab === "public-links") return messages.teamManagement.publicLinks.title;
  if (tab === "api-keys") return messages.teamManagement.apiKeys.title;
  return messages.teamManagement.settings.title;
}

function managementLabel(
  messages: AppMessages,
  key: ManagementSectionKey,
): string {
  if (key === "manage-users") return messages.managementNav.users;
  if (key === "manage-teams") return messages.managementNav.teams;
  if (key === "version-updates") return messages.managementNav.versionUpdates;
  if (key === "scheduled-tasks") return messages.managementNav.scheduledTasks;
  if (key === "system-settings") return messages.managementNav.systemSettings;
  return messages.managementNav.systemPerformance;
}

function buildTeamTabPath(
  locale: Locale,
  teamSlug: string,
  tab: TeamTab,
): string {
  const base = `/${locale}/app/${teamSlug}`;
  if (tab === "sites") return base;
  if (tab === "site-management") return `${base}/manage/sites`;
  return `${base}/${tab}`;
}

function buildManagementPath(
  locale: Locale,
  teamSlug: string,
  key: ManagementSectionKey,
): string {
  if (key === "manage-users") return `/${locale}/app/${teamSlug}/manage/users`;
  if (key === "manage-teams") return `/${locale}/app/${teamSlug}/manage/teams`;
  if (key === "version-updates")
    return `/${locale}/app/${teamSlug}/manage/version-updates`;
  if (key === "scheduled-tasks")
    return `/${locale}/app/${teamSlug}/manage/scheduled-tasks`;
  if (key === "system-settings")
    return `/${locale}/app/${teamSlug}/manage/system-settings`;
  return `/${locale}/app/${teamSlug}/manage/system-performance`;
}

export function buildTeamSections(
  locale: Locale,
  teamSlug: string,
  messages: AppMessages,
  canManage: boolean,
): DashboardSectionItem[] {
  const tabs = canManage
    ? [...TEAM_TABS_ALWAYS, ...TEAM_TABS_MANAGE]
    : [...TEAM_TABS_ALWAYS];
  return tabs.map((tab) => ({
    key: tab,
    label: teamTabLabel(messages, tab),
    href: buildTeamTabPath(locale, teamSlug, tab),
  }));
}

export function buildManagementSections(
  locale: Locale,
  teamSlug: string,
  messages: AppMessages,
): DashboardSectionItem[] {
  const keys: readonly ManagementSectionKey[] = [
    "manage-users",
    "manage-teams",
    "version-updates",
    "scheduled-tasks",
    "system-performance",
    "system-settings",
  ] as const;
  return keys.map((key) => ({
    key,
    label: managementLabel(messages, key),
    href: buildManagementPath(locale, teamSlug, key),
  }));
}
