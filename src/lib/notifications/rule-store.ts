import {
  canManageSite,
  canManageTeam,
  canReadTeam,
} from "@/lib/edge/admin-access";
import type { Actor } from "@/lib/edge/admin-auth";
import type { Env } from "@/lib/edge/types";
import { clampString } from "@/lib/edge/utils";

import { safeJsonStringify, safeParseRecord } from "./json";
import {
  normalizeNotificationRuleType,
  type NotificationRuleType,
} from "./message-types";
import {
  computeNextNotificationRunAt,
  normalizeNotificationSchedule,
  type NotificationScheduleConfig,
} from "./schedule";

export type NotificationRecipientConfig =
  | { mode: "creator" }
  | { mode: "team_admins" }
  | { mode: "all_team_members" }
  | { mode: "users"; userIds: string[] };

export interface NotificationRule {
  id: string;
  teamId: string;
  siteId: string | null;
  name: string;
  description: string;
  type: NotificationRuleType;
  enabled: boolean;
  schedule: NotificationScheduleConfig;
  condition: Record<string, unknown>;
  recipient: NotificationRecipientConfig;
  lastCheckedAt: number | null;
  lastTriggeredAt: number | null;
  nextRunAt: number | null;
  cooldownUntil: number | null;
  createdByUserId: string | null;
  createdAt: number;
  updatedAt: number;
}

interface RuleRow {
  id: string;
  teamId: string;
  siteId: string | null;
  name: string;
  description: string | null;
  type: string;
  enabled: number;
  scheduleJson: string;
  conditionJson: string;
  recipientJson: string;
  lastCheckedAt: number | null;
  lastTriggeredAt: number | null;
  nextRunAt: number | null;
  cooldownUntil: number | null;
  createdByUserId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface CreateNotificationRuleInput {
  teamId: string;
  siteId?: string | null;
  name: string;
  description?: string;
  type?: NotificationRuleType;
  enabled?: boolean;
  schedule?: unknown;
  condition?: Record<string, unknown>;
  recipient?: NotificationRecipientConfig;
}

export interface UpdateNotificationRuleInput {
  ruleId: string;
  teamId?: string;
  siteId?: string | null;
  name?: string;
  description?: string;
  type?: NotificationRuleType;
  enabled?: boolean;
  schedule?: unknown;
  condition?: Record<string, unknown>;
  recipient?: NotificationRecipientConfig;
}

const RULE_SELECT = `
  id,
  team_id AS teamId,
  site_id AS siteId,
  name,
  description,
  type,
  enabled,
  schedule_json AS scheduleJson,
  condition_json AS conditionJson,
  recipient_json AS recipientJson,
  last_checked_at AS lastCheckedAt,
  last_triggered_at AS lastTriggeredAt,
  next_run_at AS nextRunAt,
  cooldown_until AS cooldownUntil,
  created_by_user_id AS createdByUserId,
  created_at AS createdAt,
  updated_at AS updatedAt
`;

function cleanUserIds(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return Array.from(
    new Set(
      input
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
        .map((item) => clampString(item, 120)),
    ),
  ).slice(0, 200);
}

export function normalizeNotificationRecipientConfig(
  input: unknown,
): NotificationRecipientConfig {
  const raw = safeParseRecord(input);
  if (raw.mode === "creator") return { mode: "creator" };
  if (raw.mode === "team_admins") return { mode: "team_admins" };
  if (raw.mode === "all_team_members") return { mode: "all_team_members" };
  if (raw.mode === "users") {
    return { mode: "users", userIds: cleanUserIds(raw.userIds) };
  }
  return { mode: "creator" };
}

export function mapNotificationRule(row: RuleRow): NotificationRule {
  return {
    id: String(row.id ?? ""),
    teamId: String(row.teamId ?? ""),
    siteId:
      row.siteId === null || row.siteId === undefined
        ? null
        : String(row.siteId),
    name: String(row.name ?? ""),
    description: String(row.description ?? ""),
    type: normalizeNotificationRuleType(row.type),
    enabled: Number(row.enabled ?? 0) === 1,
    schedule: normalizeNotificationSchedule(row.scheduleJson),
    condition: safeParseRecord(row.conditionJson),
    recipient: normalizeNotificationRecipientConfig(row.recipientJson),
    lastCheckedAt:
      row.lastCheckedAt === null || row.lastCheckedAt === undefined
        ? null
        : Number(row.lastCheckedAt),
    lastTriggeredAt:
      row.lastTriggeredAt === null || row.lastTriggeredAt === undefined
        ? null
        : Number(row.lastTriggeredAt),
    nextRunAt:
      row.nextRunAt === null || row.nextRunAt === undefined
        ? null
        : Number(row.nextRunAt),
    cooldownUntil:
      row.cooldownUntil === null || row.cooldownUntil === undefined
        ? null
        : Number(row.cooldownUntil),
    createdByUserId:
      row.createdByUserId === null || row.createdByUserId === undefined
        ? null
        : String(row.createdByUserId),
    createdAt: Number(row.createdAt ?? 0),
    updatedAt: Number(row.updatedAt ?? 0),
  };
}

export async function getNotificationRule(
  env: Env,
  ruleId: string,
): Promise<NotificationRule | null> {
  const row = await env.DB.prepare(
    `SELECT ${RULE_SELECT} FROM notification_rules WHERE id=? LIMIT 1`,
  )
    .bind(ruleId)
    .first<RuleRow>();
  return row ? mapNotificationRule(row) : null;
}

async function requireCanManageRuleScope(
  env: Env,
  actor: Actor,
  input: { teamId: string; siteId?: string | null },
): Promise<boolean> {
  if (!(await canManageTeam(env, actor, input.teamId))) return false;
  if (input.siteId && !(await canManageSite(env, actor, input.siteId))) {
    return false;
  }
  return true;
}

export async function createNotificationRule(
  env: Env,
  actor: Actor,
  input: CreateNotificationRuleInput,
): Promise<NotificationRule> {
  if (!(await requireCanManageRuleScope(env, actor, input))) {
    throw new Error("Forbidden");
  }
  const now = Math.floor(Date.now() / 1000);
  const id = crypto.randomUUID();
  const schedule = normalizeNotificationSchedule(input.schedule);
  const nextRunAt = computeNextNotificationRunAt(schedule, now);
  const type = normalizeNotificationRuleType(input.type ?? "test");
  const recipient = normalizeNotificationRecipientConfig(
    input.recipient ?? { mode: "creator" },
  );
  await env.DB.prepare(
    `
      INSERT INTO notification_rules (
        id, team_id, site_id, name, description, type, enabled,
        schedule_json, condition_json, recipient_json, next_run_at,
        created_by_user_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  )
    .bind(
      id,
      input.teamId,
      input.siteId ?? null,
      clampString(input.name.trim() || "Notification rule", 160),
      clampString((input.description ?? "").trim(), 1000),
      type,
      input.enabled === false ? 0 : 1,
      safeJsonStringify(schedule),
      safeJsonStringify(input.condition ?? {}),
      safeJsonStringify(recipient),
      nextRunAt,
      actor.user.id,
      now,
      now,
    )
    .run();
  const rule = await getNotificationRule(env, id);
  if (!rule) throw new Error("Notification rule was not created");
  return rule;
}

export async function listNotificationRules(
  env: Env,
  actor: Actor,
  filters: { teamId?: string; siteId?: string } = {},
): Promise<NotificationRule[]> {
  const where: string[] = [];
  const bindings: string[] = [];
  if (filters.teamId) {
    if (!(await canReadTeam(env, actor, filters.teamId))) {
      throw new Error("Forbidden");
    }
    where.push("team_id = ?");
    bindings.push(filters.teamId);
  } else if (!actor.isAdmin) {
    where.push(
      "team_id IN (SELECT team_id FROM team_members WHERE user_id = ?)",
    );
    bindings.push(actor.user.id);
  }
  if (filters.siteId) {
    where.push("site_id = ?");
    bindings.push(filters.siteId);
  }
  const rows = await env.DB.prepare(
    `
      SELECT ${RULE_SELECT}
      FROM notification_rules
      ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY updated_at DESC
      LIMIT 200
    `,
  )
    .bind(...bindings)
    .all<RuleRow>();
  return rows.results.map(mapNotificationRule);
}

export async function updateNotificationRule(
  env: Env,
  actor: Actor,
  input: UpdateNotificationRuleInput,
): Promise<NotificationRule> {
  const current = await getNotificationRule(env, input.ruleId);
  if (!current) throw new Error("Not Found");
  const teamId = input.teamId ?? current.teamId;
  const siteId = Object.prototype.hasOwnProperty.call(input, "siteId")
    ? (input.siteId ?? null)
    : current.siteId;
  if (!(await requireCanManageRuleScope(env, actor, { teamId, siteId }))) {
    throw new Error("Forbidden");
  }
  const now = Math.floor(Date.now() / 1000);
  const schedule = Object.prototype.hasOwnProperty.call(input, "schedule")
    ? normalizeNotificationSchedule(input.schedule)
    : current.schedule;
  const nextRunAt = Object.prototype.hasOwnProperty.call(input, "schedule")
    ? computeNextNotificationRunAt(schedule, now)
    : current.nextRunAt;
  const recipient = Object.prototype.hasOwnProperty.call(input, "recipient")
    ? normalizeNotificationRecipientConfig(input.recipient)
    : current.recipient;
  await env.DB.prepare(
    `
      UPDATE notification_rules
      SET
        team_id = ?,
        site_id = ?,
        name = ?,
        description = ?,
        type = ?,
        enabled = ?,
        schedule_json = ?,
        condition_json = ?,
        recipient_json = ?,
        next_run_at = ?,
        updated_at = ?
      WHERE id = ?
    `,
  )
    .bind(
      teamId,
      siteId,
      clampString((input.name ?? current.name).trim(), 160),
      clampString((input.description ?? current.description).trim(), 1000),
      normalizeNotificationRuleType(input.type ?? current.type),
      (input.enabled ?? current.enabled) ? 1 : 0,
      safeJsonStringify(schedule),
      safeJsonStringify(input.condition ?? current.condition),
      safeJsonStringify(recipient),
      nextRunAt,
      now,
      input.ruleId,
    )
    .run();
  const updated = await getNotificationRule(env, input.ruleId);
  if (!updated) throw new Error("Notification rule disappeared");
  return updated;
}

export async function deleteNotificationRule(
  env: Env,
  actor: Actor,
  ruleId: string,
): Promise<boolean> {
  const rule = await getNotificationRule(env, ruleId);
  if (!rule) return false;
  if (
    !(await requireCanManageRuleScope(env, actor, {
      teamId: rule.teamId,
      siteId: rule.siteId,
    }))
  ) {
    throw new Error("Forbidden");
  }
  await env.DB.prepare("DELETE FROM notification_rules WHERE id=?")
    .bind(ruleId)
    .run();
  return true;
}

export async function listDueNotificationRules(
  env: Env,
  now: number,
): Promise<NotificationRule[]> {
  const rows = await env.DB.prepare(
    `
      SELECT ${RULE_SELECT}
      FROM notification_rules
      WHERE enabled = 1
        AND next_run_at IS NOT NULL
        AND next_run_at <= ?
        AND (cooldown_until IS NULL OR cooldown_until <= ?)
      ORDER BY next_run_at ASC
      LIMIT 100
    `,
  )
    .bind(now, now)
    .all<RuleRow>();
  return rows.results.map(mapNotificationRule);
}

export async function advanceNotificationRuleSchedule(
  env: Env,
  input: {
    rule: NotificationRule;
    checkedAt: number;
    triggeredAt?: number | null;
  },
): Promise<void> {
  const nextRunAt = computeNextNotificationRunAt(
    input.rule.schedule,
    input.checkedAt,
  );
  await env.DB.prepare(
    `
      UPDATE notification_rules
      SET
        last_checked_at = ?,
        last_triggered_at = COALESCE(?, last_triggered_at),
        next_run_at = ?,
        updated_at = ?
      WHERE id = ?
    `,
  )
    .bind(
      input.checkedAt,
      input.triggeredAt ?? null,
      nextRunAt,
      input.checkedAt,
      input.rule.id,
    )
    .run();
}

export async function resolveNotificationRecipients(
  env: Env,
  rule: NotificationRule,
): Promise<Array<{ id: string; email: string; preferencesJson: string }>> {
  if (rule.recipient.mode === "creator") {
    if (!rule.createdByUserId) return [];
    const row = await env.DB.prepare(
      `
        SELECT id, email, notification_preferences_json AS preferencesJson
        FROM users
        WHERE id = ?
        LIMIT 1
      `,
    )
      .bind(rule.createdByUserId)
      .first<{ id: string; email: string; preferencesJson: string }>();
    return row ? [row] : [];
  }
  if (rule.recipient.mode === "users") {
    if (rule.recipient.userIds.length === 0) return [];
    const placeholders = rule.recipient.userIds.map(() => "?").join(", ");
    const rows = await env.DB.prepare(
      `
        SELECT id, email, notification_preferences_json AS preferencesJson
        FROM users
        WHERE id IN (${placeholders})
      `,
    )
      .bind(...rule.recipient.userIds)
      .all<{ id: string; email: string; preferencesJson: string }>();
    return rows.results;
  }
  const roleFilter =
    rule.recipient.mode === "team_admins"
      ? "AND (tm.role IN ('owner', 'admin') OR t.owner_user_id = u.id)"
      : "";
  const rows = await env.DB.prepare(
    `
      SELECT DISTINCT
        u.id,
        u.email,
        u.notification_preferences_json AS preferencesJson
      FROM users u
      INNER JOIN team_members tm ON tm.user_id = u.id
      INNER JOIN teams t ON t.id = tm.team_id
      WHERE tm.team_id = ?
      ${roleFilter}
      ORDER BY u.created_at ASC
    `,
  )
    .bind(rule.teamId)
    .all<{ id: string; email: string; preferencesJson: string }>();
  return rows.results;
}
