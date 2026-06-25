import { canManageTeam } from "./admin-access";
import { requireActor } from "./admin-auth";
import { bad, forb, j, na, nf, parseJson } from "./admin-response";
import {
  createApiKeyRecord,
  expiresAtFromDays,
  getApiKeyById,
  listApiKeys,
  normalizeApiKeyScopes,
  normalizeApiKeySiteIds,
  revokeApiKeyRecord,
  toPublicApiKey,
} from "./api-key-store";
import type { Env } from "./types";
import { clampString } from "./utils";

async function assertSitesBelongToTeam(
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

export async function handleApiKeysAdmin(
  req: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  const actor = await requireActor(env, req);
  if (actor instanceof Response) return actor;

  if (req.method === "GET") {
    const teamId = clampString(url.searchParams.get("teamId") || "", 120);
    if (!teamId) return bad("teamId is required");
    if (!(await canManageTeam(env, actor, teamId))) {
      return forb("Only team admins can manage API keys");
    }
    return j({ ok: true, data: await listApiKeys(env, teamId) });
  }

  if (req.method === "POST") {
    const body = await parseJson(req);
    const teamId = clampString(String(body.teamId || ""), 120);
    const name = clampString(String(body.name || "").trim(), 120);
    const scopes = normalizeApiKeyScopes(body.scopes);
    const siteIds = normalizeApiKeySiteIds(body.siteIds);
    if (!teamId) return bad("teamId is required");
    if (name.length < 2) return bad("name is required");
    if (scopes.length === 0) return bad("at least one scope is required");
    if (!(await canManageTeam(env, actor, teamId))) {
      return forb("Only team admins can manage API keys");
    }
    if (!(await assertSitesBelongToTeam(env, teamId, siteIds))) {
      return bad("siteIds must belong to the team");
    }
    const created = await createApiKeyRecord(env, {
      teamId,
      name,
      scopes,
      siteIds,
      createdByUserId: actor.user.id,
      expiresAt: expiresAtFromDays(body.expiresInDays),
    });
    return j({ ok: true, data: created });
  }

  if (req.method === "PATCH") {
    const body = await parseJson(req);
    const intent = clampString(String(body.intent || ""), 24).toLowerCase();
    const teamId = clampString(String(body.teamId || ""), 120);
    const keyId = clampString(String(body.keyId || ""), 120);
    if (!teamId || !keyId) return bad("teamId and keyId are required");
    if (!(await canManageTeam(env, actor, teamId))) {
      return forb("Only team admins can manage API keys");
    }

    const existing = await getApiKeyById(env, keyId);
    if (!existing || existing.team_id !== teamId)
      return nf("API key not found");

    if (intent === "revoke") {
      const revoked = await revokeApiKeyRecord(env, {
        teamId,
        keyId,
        revokedByUserId: actor.user.id,
      });
      return j({ ok: true, data: revoked });
    }

    if (intent === "rotate") {
      const replacement = await createApiKeyRecord(env, {
        teamId,
        name: existing.name,
        scopes: toPublicApiKey(existing).scopes,
        siteIds: toPublicApiKey(existing).siteIds,
        createdByUserId: actor.user.id,
        expiresAt: existing.expires_at,
        rotatedFromKeyId: existing.id,
      });
      await revokeApiKeyRecord(env, {
        teamId,
        keyId,
        revokedByUserId: actor.user.id,
      });
      return j({ ok: true, data: replacement });
    }

    return bad("unsupported intent");
  }

  return na();
}
