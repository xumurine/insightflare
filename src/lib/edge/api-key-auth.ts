import {
  type ApiKeyScope,
  apiKeyStatus,
  getApiKeyByPrefix,
  hashApiKeySecret,
  markApiKeyUsed,
  normalizeApiKeyScopes,
  normalizeApiKeySiteIds,
  parseApiKey,
  timingSafeEqualString,
} from "./api-key-store";
import type { Env } from "./types";

export interface ApiKeyPrincipal {
  keyId: string;
  teamId: string;
  prefix: string;
  scopes: ApiKeyScope[];
  siteIds: string[];
}

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export function extractApiKeyToken(request: Request): string {
  const auth = request.headers.get("authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) return "";
  return auth.slice(7).trim();
}

function safeJsonArray(input: string): unknown[] {
  try {
    const parsed = JSON.parse(input) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function authenticateApiKey(
  request: Request,
  env: Env,
  ctx?: ExecutionContext,
): Promise<ApiKeyPrincipal | Response> {
  const token = extractApiKeyToken(request);
  const parsed = parseApiKey(token);
  if (!parsed) {
    return json({ ok: false, error: "invalid_api_key" }, 401);
  }

  const row = await getApiKeyByPrefix(env, parsed.prefix);
  if (!row) {
    return json({ ok: false, error: "invalid_api_key" }, 401);
  }

  const actualHash = await hashApiKeySecret(env, token);
  if (!timingSafeEqualString(actualHash, row.key_hash)) {
    return json({ ok: false, error: "invalid_api_key" }, 401);
  }

  const status = apiKeyStatus(row);
  if (status === "revoked") {
    return json({ ok: false, error: "api_key_revoked" }, 401);
  }
  if (status === "expired") {
    return json({ ok: false, error: "api_key_expired" }, 401);
  }

  const update = markApiKeyUsed(env, row.id);
  if (ctx) {
    ctx.waitUntil(update);
  } else {
    await update;
  }

  return {
    keyId: row.id,
    teamId: row.team_id,
    prefix: row.key_prefix,
    scopes: normalizeApiKeyScopes(safeJsonArray(row.scopes_json)),
    siteIds: normalizeApiKeySiteIds(safeJsonArray(row.site_ids_json)),
  };
}

export function hasApiScope(
  principal: ApiKeyPrincipal,
  scope: ApiKeyScope,
): boolean {
  return principal.scopes.includes(scope);
}

export function hasFullSiteAccess(principal: ApiKeyPrincipal): boolean {
  return principal.siteIds.length === 0;
}

export function canAccessSiteId(
  principal: ApiKeyPrincipal,
  siteId: string,
): boolean {
  return hasFullSiteAccess(principal) || principal.siteIds.includes(siteId);
}

export function requireApiScope(
  principal: ApiKeyPrincipal,
  scope: ApiKeyScope,
): Response | null {
  if (hasApiScope(principal, scope)) return null;
  return json({ ok: false, error: "insufficient_scope" }, 403);
}
