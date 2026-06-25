import { DEFAULT_SITE_SCRIPT_SETTINGS } from "@/lib/site-settings";

import { parseWindow } from "./query/core";
import { routeQuery } from "./query/router";
import { handleTeamDashboardForTeam } from "./query/team";
import {
  bad,
  bool,
  forb,
  j,
  jsonResponseFor,
  na,
  nf,
  parseJson,
} from "./admin-response";
import { deleteSiteData } from "./admin-sites";
import {
  type ApiKeyPrincipal,
  authenticateApiKey,
  canAccessSiteId,
  hasFullSiteAccess,
  requireApiScope,
} from "./api-key-auth";
import {
  readSiteScriptSettings,
  upsertSiteScriptSettings,
} from "./site-settings-store";
import type { Env } from "./types";
import { clampString } from "./utils";

interface ApiV1SiteRow {
  id: string;
  teamId: string;
  name: string;
  domain: string;
  publicEnabled: number;
  publicSlug: string | null;
  createdAt: number;
  updatedAt: number;
}

function apiBase(url: URL): string {
  return url.pathname.replace(/^\/api\/v1\/?/, "");
}

function segments(url: URL): string[] {
  return apiBase(url)
    .split("/")
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    })
    .filter((segment) => segment.length > 0);
}

function sitePayload(row: ApiV1SiteRow) {
  return {
    id: row.id,
    teamId: row.teamId,
    name: row.name,
    domain: row.domain,
    publicEnabled: row.publicEnabled === 1,
    publicSlug: row.publicSlug || "",
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function siteById(
  env: Env,
  principal: ApiKeyPrincipal,
  siteId: string,
): Promise<ApiV1SiteRow | Response> {
  if (!canAccessSiteId(principal, siteId)) return nf("Site not found");
  const row = await env.DB.prepare(
    `
      SELECT
        id,
        team_id AS teamId,
        name,
        domain,
        public_enabled AS publicEnabled,
        public_slug AS publicSlug,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM sites
      WHERE id=? AND team_id=?
      LIMIT 1
    `,
  )
    .bind(siteId, principal.teamId)
    .first<ApiV1SiteRow>();
  return row ?? nf("Site not found");
}

async function listSites(
  env: Env,
  principal: ApiKeyPrincipal,
): Promise<ApiV1SiteRow[]> {
  const rows = await env.DB.prepare(
    `
      SELECT
        id,
        team_id AS teamId,
        name,
        domain,
        public_enabled AS publicEnabled,
        public_slug AS publicSlug,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM sites
      WHERE team_id=?
      ORDER BY created_at DESC
    `,
  )
    .bind(principal.teamId)
    .all<ApiV1SiteRow>();
  if (hasFullSiteAccess(principal)) return rows.results;
  const allowed = new Set(principal.siteIds);
  return rows.results.filter((site) => allowed.has(site.id));
}

async function handleSitesCollection(
  request: Request,
  env: Env,
  principal: ApiKeyPrincipal,
): Promise<Response> {
  if (request.method === "GET") {
    const denied = requireApiScope(principal, "site:read");
    if (denied) return denied;
    const sites = await listSites(env, principal);
    return jsonResponseFor(request, { ok: true, data: sites.map(sitePayload) });
  }

  if (request.method === "POST") {
    const denied = requireApiScope(principal, "site:write");
    if (denied) return denied;
    if (!hasFullSiteAccess(principal)) {
      return forb(
        "Restricted API keys cannot create sites",
        undefined,
        request,
      );
    }
    const body = await parseJson(request);
    const name = clampString(String(body.name || ""), 120);
    const domain = clampString(String(body.domain || ""), 255);
    const publicEnabled = bool(body.publicEnabled, false);
    const publicSlug = clampString(String(body.publicSlug || ""), 120);
    if (!name || !domain)
      return bad("name and domain are required", undefined, request);
    const siteId = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO sites (id,team_id,name,domain,public_enabled,public_slug,created_at,updated_at) VALUES (?,?,?,?,?,?,unixepoch(),unixepoch())",
    )
      .bind(
        siteId,
        principal.teamId,
        name,
        domain,
        publicEnabled ? 1 : 0,
        publicEnabled ? publicSlug || null : null,
      )
      .run();
    await upsertSiteScriptSettings(env, siteId, {
      siteDomain: domain,
      settings: DEFAULT_SITE_SCRIPT_SETTINGS,
    });
    const row = await siteById(env, principal, siteId);
    return row instanceof Response
      ? row
      : jsonResponseFor(request, { ok: true, data: sitePayload(row) });
  }

  return na(request);
}

async function handleSiteResource(
  request: Request,
  env: Env,
  principal: ApiKeyPrincipal,
  siteId: string,
): Promise<Response> {
  if (request.method === "GET") {
    const denied = requireApiScope(principal, "site:read");
    if (denied) return denied;
    const row = await siteById(env, principal, siteId);
    return row instanceof Response
      ? row
      : jsonResponseFor(request, { ok: true, data: sitePayload(row) });
  }

  if (request.method === "PATCH") {
    const denied = requireApiScope(principal, "site:write");
    if (denied) return denied;
    const existing = await siteById(env, principal, siteId);
    if (existing instanceof Response) return existing;
    const body = await parseJson(request);
    const name = clampString(String(body.name ?? existing.name), 120);
    const domain = clampString(String(body.domain ?? existing.domain), 255);
    const publicEnabled = bool(
      body.publicEnabled,
      existing.publicEnabled === 1,
    );
    const publicSlug = clampString(
      String(body.publicSlug ?? existing.publicSlug ?? ""),
      120,
    );
    if (!name || !domain)
      return bad("name and domain are required", undefined, request);
    await env.DB.prepare(
      "UPDATE sites SET name=?,domain=?,public_enabled=?,public_slug=?,updated_at=unixepoch() WHERE id=? AND team_id=?",
    )
      .bind(
        name,
        domain,
        publicEnabled ? 1 : 0,
        publicEnabled ? publicSlug || null : null,
        siteId,
        principal.teamId,
      )
      .run();
    await upsertSiteScriptSettings(env, siteId, { siteDomain: domain });
    const row = await siteById(env, principal, siteId);
    return row instanceof Response
      ? row
      : jsonResponseFor(request, { ok: true, data: sitePayload(row) });
  }

  if (request.method === "DELETE") {
    const denied = requireApiScope(principal, "site:write");
    if (denied) return denied;
    const existing = await siteById(env, principal, siteId);
    if (existing instanceof Response) return existing;
    await deleteSiteData(env, siteId);
    return jsonResponseFor(request, {
      ok: true,
      data: { siteId, teamId: principal.teamId, removed: true },
    });
  }

  return na(request);
}

async function handleSiteConfig(
  request: Request,
  env: Env,
  principal: ApiKeyPrincipal,
  siteId: string,
): Promise<Response> {
  const existing = await siteById(env, principal, siteId);
  if (existing instanceof Response) return existing;

  if (request.method === "GET") {
    const denied = requireApiScope(principal, "site_config:read");
    if (denied) return denied;
    const config = await readSiteScriptSettings(env, siteId);
    return jsonResponseFor(request, {
      ok: true,
      data: config ?? DEFAULT_SITE_SCRIPT_SETTINGS,
    });
  }

  if (request.method === "PATCH") {
    const denied = requireApiScope(principal, "site_config:write");
    if (denied) return denied;
    const body = await parseJson(request);
    const config = await upsertSiteScriptSettings(env, siteId, {
      siteDomain: existing.domain,
      settings:
        body.config && typeof body.config === "object" ? body.config : body,
    });
    return jsonResponseFor(request, { ok: true, data: config });
  }

  return na(request);
}

async function handleScriptSnippet(
  env: Env,
  url: URL,
  principal: ApiKeyPrincipal,
  siteId: string,
): Promise<Response> {
  const denied = requireApiScope(principal, "site_config:read");
  if (denied) return denied;
  const site = await siteById(env, principal, siteId);
  if (site instanceof Response) return site;
  const edgeBase = env.EDGE_PUBLIC_BASE_URL || `${url.protocol}//${url.host}`;
  const src = `${edgeBase.replace(/\/$/, "")}/script.js?siteId=${encodeURIComponent(siteId)}`;
  return j({
    ok: true,
    data: { siteId, src, snippet: `<script defer src="${src}"></script>` },
  });
}

async function handleAnalytics(
  request: Request,
  env: Env,
  url: URL,
  principal: ApiKeyPrincipal,
  siteId: string,
  queryName: string,
): Promise<Response> {
  if (request.method !== "GET") return na(request);
  const denied = requireApiScope(principal, "analytics:read");
  if (denied) return denied;
  const site = await siteById(env, principal, siteId);
  if (site instanceof Response) return site;
  return routeQuery(
    env,
    siteId,
    queryName,
    url,
    { publicMode: false },
    request,
  );
}

async function handleTeamDashboard(
  request: Request,
  env: Env,
  url: URL,
  principal: ApiKeyPrincipal,
): Promise<Response> {
  if (request.method !== "GET") return na(request);
  const denied = requireApiScope(principal, "analytics:read");
  if (denied) return denied;
  const window = parseWindow(url);
  if (!window) return bad("Invalid time window", undefined, request);
  return handleTeamDashboardForTeam(
    env,
    url,
    principal.teamId,
    window,
    hasFullSiteAccess(principal) ? undefined : principal.siteIds,
  );
}

export async function handleApiV1(
  request: Request,
  env: Env,
  url: URL,
  ctx?: ExecutionContext,
): Promise<Response> {
  const principal = await authenticateApiKey(request, env, ctx);
  if (principal instanceof Response) return principal;

  const path = segments(url);
  if (path.length === 1 && path[0] === "sites") {
    return handleSitesCollection(request, env, principal);
  }

  if (path.length === 2 && path[0] === "team" && path[1] === "dashboard") {
    return handleTeamDashboard(request, env, url, principal);
  }

  if (path[0] !== "sites" || !path[1]) return nf(undefined, undefined, request);
  const siteId = path[1];

  if (path.length === 2) {
    return handleSiteResource(request, env, principal, siteId);
  }
  if (path.length === 3 && path[2] === "config") {
    return handleSiteConfig(request, env, principal, siteId);
  }
  if (path.length === 3 && path[2] === "script-snippet") {
    if (request.method !== "GET") return na(request);
    return handleScriptSnippet(env, url, principal, siteId);
  }
  if (path.length === 4 && path[2] === "analytics") {
    return handleAnalytics(request, env, url, principal, siteId, path[3]);
  }

  return nf(undefined, undefined, request);
}
