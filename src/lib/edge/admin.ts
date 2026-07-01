import { handleApiKeysAdmin } from "./admin-api-keys";
import { requireActor } from "./admin-auth";
import {
  handleLoginTurnstileConfigAdmin,
  handleLoginTurnstileTestAdmin,
} from "./admin-login-turnstile";
import {
  handleNotificationEmailConfigAdmin,
  handleNotificationEmailTestAdmin,
} from "./admin-notification-email";
import {
  handleNotificationEmailPreviewAdmin,
  handleNotificationPreferences,
  handleNotificationRead,
  handleNotificationRulePreviewAdmin,
  handleNotificationRuleRunAdmin,
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
import { handleTeamInvitesAdmin } from "./admin-team-invites";
import { handleMembersAdmin, handleTeamsAdmin } from "./admin-teams";
import {
  handleAuthMeAdmin,
  handleProfileAdmin,
  handleUsersAdmin,
} from "./admin-users";
import { handleLegacyAuthLogin } from "./legacy-auth";
import { handlePublicAccountLinks } from "./public-account-links";
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
  if (p === "/api/public/session") return handleLegacyAuthLogin(request, env);
  if (p.startsWith("/api/public/account-links/"))
    return handlePublicAccountLinks(request, env, url);
  if (p === "/api/private/session") return handleAuthMeAdmin(request, env);
  if (p === "/api/private/admin/users") return handleUsersAdmin(request, env);
  if (p === "/api/private/admin/profile")
    return handleProfileAdmin(request, env);
  if (p === "/api/private/admin/teams") return handleTeamsAdmin(request, env);
  if (p === "/api/private/admin/team-invites")
    return handleTeamInvitesAdmin(request, env, url);
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
  if (p === "/api/private/admin/login-turnstile")
    return handleLoginTurnstileConfigAdmin(request, env);
  if (p === "/api/private/admin/login-turnstile/test")
    return handleLoginTurnstileTestAdmin(request, env);
  if (p === "/api/private/admin/notification-email-preview")
    return handleNotificationEmailPreviewAdmin(request, env, url);
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
  if (p === "/api/private/admin/notification-rules/preview")
    return handleNotificationRulePreviewAdmin(request, env);
  if (p === "/api/private/admin/notification-rules/run")
    return handleNotificationRuleRunAdmin(request, env);
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
