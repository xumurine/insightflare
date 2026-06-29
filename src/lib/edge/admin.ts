import { handleApiKeysAdmin } from "./admin-api-keys";
import { requireActor } from "./admin-auth";
import {
  handleNotificationEmailConfigAdmin,
  handleNotificationEmailTestAdmin,
} from "./admin-notification-email";
import {
  handleNotificationPreferences,
  handleNotificationRead,
  handleNotificationRulesAdmin,
  handleNotifications,
  handleNotificationsReadAll,
  handleNotificationTestAdmin,
} from "./admin-notifications";
import { nf } from "./admin-response";
import { handleScheduledTasksAdmin } from "./admin-scheduled-tasks";
import {
  handleScriptSnippetAdmin,
  handleSiteConfigAdmin,
  handleSitesAdmin,
} from "./admin-sites";
import {
  handleDoDiagnosticAdmin,
  handleSystemPerformanceAdmin,
} from "./admin-system";
import { handleMembersAdmin, handleTeamsAdmin } from "./admin-teams";
import {
  handleAuthLoginAdmin,
  handleAuthMeAdmin,
  handleProfileAdmin,
  handleUsersAdmin,
} from "./admin-users";
import type { Env } from "./types";

/**
 * Compatibility wrapper. Production routing lives in src/lib/hono/routes.
 */
export async function handlePrivateAdmin(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  const p = url.pathname;
  if (p === "/api/public/session") return handleAuthLoginAdmin(request, env);
  if (p === "/api/private/session") return handleAuthMeAdmin(request, env);
  if (p === "/api/private/admin/users") return handleUsersAdmin(request, env);
  if (p === "/api/private/admin/profile")
    return handleProfileAdmin(request, env);
  if (p === "/api/private/admin/teams") return handleTeamsAdmin(request, env);
  if (p === "/api/private/admin/sites")
    return handleSitesAdmin(request, env, url);
  if (p === "/api/private/admin/members")
    return handleMembersAdmin(request, env, url);
  if (p === "/api/private/admin/site-config")
    return handleSiteConfigAdmin(request, env, url);
  if (p === "/api/private/admin/script-snippet")
    return handleScriptSnippetAdmin(request, env, url);
  if (p === "/api/private/admin/api-keys")
    return handleApiKeysAdmin(request, env, url);
  if (p === "/api/private/admin/notification-email")
    return handleNotificationEmailConfigAdmin(request, env);
  if (p === "/api/private/admin/notification-email/test")
    return handleNotificationEmailTestAdmin(request, env);
  if (p === "/api/private/notifications")
    return request.method === "PATCH"
      ? handleNotificationsReadAll(request, env)
      : handleNotifications(request, env, url);
  if (p === "/api/private/notifications/preferences")
    return handleNotificationPreferences(request, env);
  if (p.startsWith("/api/private/notifications/")) {
    const messageId = decodeURIComponent(
      p.slice("/api/private/notifications/".length),
    ).trim();
    return handleNotificationRead(request, env, messageId);
  }
  if (p === "/api/private/admin/notification-rules")
    return handleNotificationRulesAdmin(request, env, url);
  if (p === "/api/private/admin/notification-test")
    return handleNotificationTestAdmin(request, env);
  if (p === "/api/private/admin/system-performance")
    return handleSystemPerformanceAdmin(request, env, url, requireActor);
  if (p === "/api/private/admin/scheduled-tasks")
    return handleScheduledTasksAdmin(request, env, url, requireActor);
  if (p === "/api/private/admin/do-diagnostic")
    return handleDoDiagnosticAdmin(request, env, url, requireActor);
  return nf();
}
