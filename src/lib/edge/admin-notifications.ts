import type { NotificationMessage } from "@/lib/notifications/message-store";
import {
  countUnreadAttentionMessages,
  listNotificationMessagesForTeam,
  listNotificationMessagesForUser,
  markAllNotificationMessagesRead,
  markNotificationMessageRead,
} from "@/lib/notifications/message-store";
import {
  createManualTestNotification,
  NOTIFICATION_TASK_KEY,
  NOTIFICATION_TASK_NAME,
  type NotificationTaskSummary,
} from "@/lib/notifications/notification-task";
import {
  getUserNotificationPreferences,
  updateUserNotificationPreferences,
} from "@/lib/notifications/preferences";
import {
  createNotificationRule,
  deleteNotificationRule,
  listNotificationRules,
  updateNotificationRule,
} from "@/lib/notifications/rule-store";

import { canManageTeam, canReadTeam } from "./admin-access";
import { requireActor } from "./admin-auth";
import {
  bad,
  forb,
  jsonResponseFor,
  na,
  nf,
  parseJson,
} from "./admin-response";
import { runScheduledTask } from "./scheduled-task-runner";
import type { Env } from "./types";

function stringParam(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseLimit(url: URL): number {
  const raw = Math.trunc(Number(url.searchParams.get("limit") ?? 50));
  if (!Number.isFinite(raw)) return 50;
  return Math.max(1, Math.min(100, raw));
}

function mapError(error: unknown, req: Request): Response {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "Forbidden") return forb("Forbidden", undefined, req);
  if (message === "Not Found") return nf("Not Found", undefined, req);
  return bad(message || "Invalid notification request", undefined, req);
}

export async function handleNotificationRulesAdmin(
  req: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  const actor = await requireActor(env, req);
  if (actor instanceof Response) return actor;

  try {
    if (req.method === "GET") {
      const teamId = url.searchParams.get("teamId")?.trim() || undefined;
      const siteId = url.searchParams.get("siteId")?.trim() || undefined;
      const rules = await listNotificationRules(env, actor, { teamId, siteId });
      return jsonResponseFor(req, { ok: true, data: rules });
    }

    if (req.method === "POST") {
      const body = await parseJson(req);
      const teamId = stringParam(body.teamId);
      if (!teamId) return bad("teamId is required", undefined, req);
      const rule = await createNotificationRule(env, actor, {
        teamId,
        siteId: stringParam(body.siteId) || null,
        name: stringParam(body.name) || "Notification rule",
        description: stringParam(body.description),
        type: Object.prototype.hasOwnProperty.call(body, "type")
          ? (stringParam(body.type) as never)
          : undefined,
        enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
        schedule: body.schedule ?? body.scheduleJson,
        condition:
          body.condition && typeof body.condition === "object"
            ? (body.condition as Record<string, unknown>)
            : undefined,
        recipient: body.recipient as never,
      });
      return jsonResponseFor(req, { ok: true, data: rule });
    }

    if (req.method === "PATCH") {
      const body = await parseJson(req);
      const ruleId = stringParam(body.ruleId || body.id);
      if (!ruleId) return bad("ruleId is required", undefined, req);
      const rule = await updateNotificationRule(env, actor, {
        ruleId,
        teamId: stringParam(body.teamId) || undefined,
        siteId: Object.prototype.hasOwnProperty.call(body, "siteId")
          ? stringParam(body.siteId) || null
          : undefined,
        name: Object.prototype.hasOwnProperty.call(body, "name")
          ? stringParam(body.name)
          : undefined,
        description: Object.prototype.hasOwnProperty.call(body, "description")
          ? stringParam(body.description)
          : undefined,
        type: stringParam(body.type) as never,
        enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
        schedule: Object.prototype.hasOwnProperty.call(body, "schedule")
          ? body.schedule
          : undefined,
        condition:
          body.condition && typeof body.condition === "object"
            ? (body.condition as Record<string, unknown>)
            : undefined,
        recipient: body.recipient as never,
      });
      return jsonResponseFor(req, { ok: true, data: rule });
    }

    if (req.method === "DELETE") {
      const ruleId = url.searchParams.get("id")?.trim() || "";
      if (!ruleId) return bad("id is required", undefined, req);
      const removed = await deleteNotificationRule(env, actor, ruleId);
      return jsonResponseFor(req, { ok: true, data: { id: ruleId, removed } });
    }
  } catch (error) {
    return mapError(error, req);
  }
  return na(req);
}

export async function handleNotifications(
  req: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  const actor = await requireActor(env, req);
  if (actor instanceof Response) return actor;
  if (req.method !== "GET") return na(req);

  const requestedUserId = url.searchParams.get("userId")?.trim() || "";
  const teamId = url.searchParams.get("teamId")?.trim() || "";
  const siteId = url.searchParams.get("siteId")?.trim() || "";
  const type = url.searchParams.get("type")?.trim() || "";
  const severity = url.searchParams.get("severity")?.trim() || "";
  const unread = url.searchParams.get("unread") === "1";
  const beforeRaw = Math.trunc(Number(url.searchParams.get("before") ?? 0));
  const before =
    Number.isFinite(beforeRaw) && beforeRaw > 0 ? beforeRaw : undefined;
  const limit = parseLimit(url);

  try {
    if (
      teamId &&
      (actor.isAdmin || (await canManageTeam(env, actor, teamId)))
    ) {
      const messages = await listNotificationMessagesForTeam(env, {
        teamId,
        userId: requestedUserId || undefined,
        siteId: siteId || undefined,
        type: type || undefined,
        severity: severity || undefined,
        unread,
        limit,
        before,
      });
      return jsonResponseFor(req, {
        ok: true,
        data: {
          messages,
          unreadAttentionCount: await countUnreadAttentionMessages(
            env,
            actor.user.id,
          ),
        },
      });
    }
    const userId =
      actor.isAdmin && requestedUserId ? requestedUserId : actor.user.id;
    const messages = await listNotificationMessagesForUser(env, {
      userId,
      teamId: teamId || undefined,
      siteId: siteId || undefined,
      type: type || undefined,
      severity: severity || undefined,
      unread,
      limit,
      before,
    });
    return jsonResponseFor(req, {
      ok: true,
      data: {
        messages,
        unreadAttentionCount: await countUnreadAttentionMessages(
          env,
          actor.user.id,
        ),
      },
    });
  } catch (error) {
    return mapError(error, req);
  }
}

export async function handleNotificationPreferences(
  req: Request,
  env: Env,
): Promise<Response> {
  const actor = await requireActor(env, req);
  if (actor instanceof Response) return actor;
  if (req.method === "GET") {
    const preferences = await getUserNotificationPreferences(
      env,
      actor.user.id,
    );
    return jsonResponseFor(req, { ok: true, data: preferences });
  }
  if (req.method !== "PATCH") return na(req);
  const preferences = await updateUserNotificationPreferences(env, {
    userId: actor.user.id,
    preferences: await parseJson(req),
  });
  return jsonResponseFor(req, { ok: true, data: preferences });
}

export async function handleNotificationRead(
  req: Request,
  env: Env,
  messageId: string,
): Promise<Response> {
  const actor = await requireActor(env, req);
  if (actor instanceof Response) return actor;
  if (req.method !== "PATCH") return na(req);
  if (!messageId) return bad("messageId is required", undefined, req);
  const message = await markNotificationMessageRead(env, {
    messageId,
    userId: actor.user.id,
  });
  return jsonResponseFor(req, { ok: true, data: message });
}

export async function handleNotificationsReadAll(
  req: Request,
  env: Env,
): Promise<Response> {
  const actor = await requireActor(env, req);
  if (actor instanceof Response) return actor;
  if (req.method !== "PATCH") return na(req);
  const body = await parseJson(req);
  const teamId = stringParam(body.teamId) || undefined;
  const updated = await markAllNotificationMessagesRead(env, {
    userId: actor.user.id,
    teamId,
  });
  return jsonResponseFor(req, { ok: true, data: { updated } });
}

export async function handleNotificationTestAdmin(
  req: Request,
  env: Env,
): Promise<Response> {
  const actor = await requireActor(env, req);
  if (actor instanceof Response) return actor;
  if (req.method !== "POST") return na(req);
  const body = await parseJson(req);
  const teamId = stringParam(body.teamId);
  const siteId = stringParam(body.siteId) || null;
  const requestedUserId = stringParam(body.userId) || actor.user.id;
  if (!teamId) return bad("teamId is required", undefined, req);
  if (!(await canReadTeam(env, actor, teamId))) {
    return forb("Forbidden", undefined, req);
  }
  if (
    requestedUserId !== actor.user.id &&
    !(await canManageTeam(env, actor, teamId))
  ) {
    return forb(
      "Only team managers can send test notifications to other users",
      undefined,
      req,
    );
  }

  const payload: {
    current: {
      message: NotificationMessage | null;
      summary: NotificationTaskSummary;
    } | null;
  } = { current: null };
  await runScheduledTask(
    env,
    {
      key: NOTIFICATION_TASK_KEY,
      name: NOTIFICATION_TASK_NAME,
      triggerType: "manual",
      scopeType: "team",
      scopeId: teamId,
    },
    undefined,
    async (context) => {
      payload.current = await createManualTestNotification({
        env,
        context,
        teamId,
        siteId,
        userId: requestedUserId,
      });
      const current = payload.current;
      return {
        status:
          current.message?.deliveryStatus === "failed" ? "partial" : "success",
        summary: { ...current.summary },
      };
    },
  );
  const result = payload.current;
  return jsonResponseFor(req, {
    ok: true,
    data: {
      message: result?.message ?? null,
      summary: result?.summary ?? null,
    },
  });
}
