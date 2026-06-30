import { Hono } from "hono";

import { handleApiKeysAdmin } from "@/lib/edge/admin-api-keys";
import { requireActor } from "@/lib/edge/admin-auth";
import {
  handleNotificationEmailConfigAdmin,
  handleNotificationEmailTestAdmin,
} from "@/lib/edge/admin-notification-email";
import {
  handleNotificationEmailPreviewAdmin,
  handleNotificationRulePreviewAdmin,
  handleNotificationRuleRunAdmin,
  handleNotificationRulesAdmin,
  handleNotificationTestAdmin,
} from "@/lib/edge/admin-notifications";
import { nf } from "@/lib/edge/admin-response";
import { handleScheduledTasksAdmin } from "@/lib/edge/admin-scheduled-tasks";
import {
  handleScriptSnippetAdmin,
  handleSiteConfigAdmin,
  handleSitesAdmin,
} from "@/lib/edge/admin-sites";
import {
  handleDoDiagnosticAdmin,
  handleSystemPerformanceAdmin,
} from "@/lib/edge/admin-system";
import { handleMembersAdmin, handleTeamsAdmin } from "@/lib/edge/admin-teams";
import { handleProfileAdmin, handleUsersAdmin } from "@/lib/edge/admin-users";
import type { AppEnv } from "@/lib/hono/types";
import { requestUrl } from "@/lib/hono/utils/context";

export const privateAdminRoutes = new Hono<AppEnv>();

privateAdminRoutes.all("/users", (c) => handleUsersAdmin(c.req.raw, c.env));
privateAdminRoutes.all("/profile", (c) => handleProfileAdmin(c.req.raw, c.env));
privateAdminRoutes.all("/teams", (c) => handleTeamsAdmin(c.req.raw, c.env));
privateAdminRoutes.all("/sites", (c) =>
  handleSitesAdmin(c.req.raw, c.env, requestUrl(c)),
);
privateAdminRoutes.all("/members", (c) =>
  handleMembersAdmin(c.req.raw, c.env, requestUrl(c)),
);
privateAdminRoutes.all("/site-config", (c) =>
  handleSiteConfigAdmin(c.req.raw, c.env, requestUrl(c)),
);
privateAdminRoutes.all("/script-snippet", (c) =>
  handleScriptSnippetAdmin(c.req.raw, c.env, requestUrl(c)),
);
privateAdminRoutes.all("/api-keys", (c) =>
  handleApiKeysAdmin(c.req.raw, c.env, requestUrl(c)),
);
privateAdminRoutes.all("/notification-email", (c) =>
  handleNotificationEmailConfigAdmin(c.req.raw, c.env),
);
privateAdminRoutes.all("/notification-email/test", (c) =>
  handleNotificationEmailTestAdmin(c.req.raw, c.env),
);
privateAdminRoutes.all("/notification-email-preview", (c) =>
  handleNotificationEmailPreviewAdmin(c.req.raw, c.env, requestUrl(c)),
);
privateAdminRoutes.all("/notification-rules", (c) =>
  handleNotificationRulesAdmin(c.req.raw, c.env, requestUrl(c)),
);
privateAdminRoutes.all("/notification-rules/preview", (c) =>
  handleNotificationRulePreviewAdmin(c.req.raw, c.env),
);
privateAdminRoutes.all("/notification-rules/run", (c) =>
  handleNotificationRuleRunAdmin(c.req.raw, c.env),
);
privateAdminRoutes.all("/notification-test", (c) =>
  handleNotificationTestAdmin(c.req.raw, c.env),
);
privateAdminRoutes.all("/system-performance", (c) =>
  handleSystemPerformanceAdmin(c.req.raw, c.env, requestUrl(c), requireActor),
);
privateAdminRoutes.all("/scheduled-tasks", (c) =>
  handleScheduledTasksAdmin(c.req.raw, c.env, requestUrl(c), requireActor),
);
privateAdminRoutes.all("/do-diagnostic", (c) =>
  handleDoDiagnosticAdmin(c.req.raw, c.env, requestUrl(c), requireActor),
);
privateAdminRoutes.all("/*", () => nf());
