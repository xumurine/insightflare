import type { Env } from "./types";
import { clampString } from "./utils";

function safeJsonArray(input: string): unknown[] {
  try {
    const parsed = JSON.parse(input) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function normalizeMemberSiteIds(input: unknown): string[] {
  const raw = Array.isArray(input) ? input : [];
  const out: string[] = [];
  for (const value of raw) {
    const siteId = clampString(String(value || "").trim(), 120);
    if (!siteId || out.includes(siteId)) continue;
    out.push(siteId);
  }
  return out;
}

export function parseMemberSiteIdsJson(input: unknown): string[] {
  if (typeof input === "string")
    return normalizeMemberSiteIds(safeJsonArray(input));
  return normalizeMemberSiteIds(input);
}

export function serializeMemberSiteIds(siteIds: string[]): string {
  return JSON.stringify(normalizeMemberSiteIds(siteIds));
}

export function hasFullMemberSiteAccess(siteIds: string[]): boolean {
  return siteIds.length === 0;
}

export function canAccessMemberSite(
  siteIds: string[],
  siteId: string,
): boolean {
  return hasFullMemberSiteAccess(siteIds) || siteIds.includes(siteId);
}

export function memberSiteIdsFromInvitePayload(
  payload: Record<string, unknown>,
): string[] {
  if (Array.isArray(payload.siteIds)) {
    return normalizeMemberSiteIds(payload.siteIds);
  }

  const siteAccess =
    payload.siteAccess &&
    typeof payload.siteAccess === "object" &&
    !Array.isArray(payload.siteAccess)
      ? (payload.siteAccess as Record<string, unknown>)
      : null;

  if (!siteAccess) return [];
  if (Array.isArray(siteAccess.siteIds)) {
    return normalizeMemberSiteIds(siteAccess.siteIds);
  }
  return [];
}

export async function assertSitesBelongToTeam(
  env: Env,
  teamId: string,
  siteIds: string[],
): Promise<boolean> {
  if (siteIds.length === 0) return true;
  const placeholders = siteIds.map(() => "?").join(",");
  const rows = await env.DB.prepare(
    `SELECT id FROM sites WHERE team_id=? AND id IN (${placeholders})`,
  )
    .bind(teamId, ...siteIds)
    .all<{ id: string }>();
  return rows.results.length === siteIds.length;
}
