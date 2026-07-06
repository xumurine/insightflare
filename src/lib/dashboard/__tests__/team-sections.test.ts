import { describe, expect, it } from "vitest";

import {
  buildManagementSections,
  buildTeamSections,
} from "@/lib/dashboard/team-sections";
import type { AppMessages } from "@/lib/i18n/messages";

const messages = {
  teamManagement: {
    sites: { title: "Sites" },
    widgets: { title: "Widgets" },
    notifications: { title: "Notifications" },
    publicLinks: { title: "Public links" },
    apiKeys: { title: "API keys" },
    settings: { title: "Settings" },
  },
  managementNav: {
    sites: "Site management",
    users: "Users",
    teams: "Teams",
    versionUpdates: "Version updates",
    scheduledTasks: "Scheduled tasks",
    requestObservation: "Request observation",
    systemPerformance: "System performance",
    systemSettings: "System settings",
  },
} as AppMessages;

describe("dashboard team section builders", () => {
  it("returns only the sites section for members without manage access", () => {
    expect(buildTeamSections("en", "acme", messages, false)).toEqual([
      {
        key: "sites",
        label: "Sites",
        href: "/en/app/acme",
      },
    ]);
  });

  it("returns team management sections in navigation order for managers", () => {
    expect(buildTeamSections("zh", "team-1", messages, true)).toEqual([
      { key: "sites", label: "Sites", href: "/zh/app/team-1" },
      { key: "widgets", label: "Widgets", href: "/zh/app/team-1/widgets" },
      {
        key: "notifications",
        label: "Notifications",
        href: "/zh/app/team-1/notifications",
      },
      {
        key: "public-links",
        label: "Public links",
        href: "/zh/app/team-1/public-links",
      },
      { key: "api-keys", label: "API keys", href: "/zh/app/team-1/api-keys" },
      {
        key: "site-management",
        label: "Site management",
        href: "/zh/app/team-1/manage/sites",
      },
      { key: "settings", label: "Settings", href: "/zh/app/team-1/settings" },
    ]);
  });

  it("returns management sections in navigation order", () => {
    expect(buildManagementSections("en", messages)).toEqual([
      {
        key: "manage-users",
        label: "Users",
        href: "/en/app/manage/users",
      },
      {
        key: "manage-teams",
        label: "Teams",
        href: "/en/app/manage/teams",
      },
      {
        key: "version-updates",
        label: "Version updates",
        href: "/en/app/manage/version-updates",
      },
      {
        key: "scheduled-tasks",
        label: "Scheduled tasks",
        href: "/en/app/manage/scheduled-tasks",
      },
      {
        key: "request-observation",
        label: "Request observation",
        href: "/en/app/manage/request-observation",
      },
      {
        key: "system-performance",
        label: "System performance",
        href: "/en/app/manage/system-performance",
      },
      {
        key: "system-settings",
        label: "System settings",
        href: "/en/app/manage/system-settings",
      },
    ]);
  });
});
