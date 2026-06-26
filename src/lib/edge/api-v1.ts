import { DEFAULT_SITE_SCRIPT_SETTINGS } from "@/lib/site-settings";
import { parseAndValidateBody, validateBody } from "@/lib/validate";
import { BatchInputSchema } from "@/schemas/analytics";
import { FunnelAnalyzeInputSchema } from "@/schemas/funnel";
import { SiteCreateInputSchema, SiteUpdateInputSchema } from "@/schemas/site";
import { SiteConfigUpdateInputSchema } from "@/schemas/site-config";

import { parseFilters, parseWindow } from "./query/core";
import { queryFunnelAnalysis } from "./query/funnels";
import { routeQuery } from "./query/router";
import { handleTeamDashboardForTeam } from "./query/team";
import { bad, forb, j, jsonResponseFor, na, nf } from "./admin-response";
import {
  createSiteWithDefaultSettings,
  deleteSiteData,
  ensurePublicSlugAvailable,
} from "./admin-sites";
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
    const parsed = await parseAndValidateBody(request, SiteCreateInputSchema);
    if (!parsed.ok) return parsed.response;
    const { name, domain, publicEnabled, publicSlug } = parsed.data;
    const resolvedSlug = publicEnabled ? publicSlug || null : null;
    if (resolvedSlug) {
      const available = await ensurePublicSlugAvailable(env, resolvedSlug);
      if (!available)
        return bad("Public slug already exists", undefined, request);
    }
    const siteId = await createSiteWithDefaultSettings(env, {
      teamId: principal.teamId,
      name,
      domain,
      publicEnabled,
      publicSlug: resolvedSlug,
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
    const parsed = await parseAndValidateBody(request, SiteUpdateInputSchema);
    if (!parsed.ok) return parsed.response;
    const name = parsed.data.name ?? existing.name;
    const domain = parsed.data.domain ?? existing.domain;
    const publicEnabled =
      parsed.data.publicEnabled ?? existing.publicEnabled === 1;
    const publicSlug = parsed.data.publicSlug ?? existing.publicSlug ?? "";
    if (publicEnabled && publicSlug) {
      const available = await ensurePublicSlugAvailable(
        env,
        publicSlug,
        siteId,
      );
      if (!available)
        return bad("Public slug already exists", undefined, request);
    }
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
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return bad("Invalid JSON body");
    }
    const rawConfig =
      rawBody &&
      typeof rawBody === "object" &&
      "config" in (rawBody as Record<string, unknown>)
        ? (rawBody as Record<string, unknown>).config
        : rawBody;
    const parsed = validateBody(rawConfig, SiteConfigUpdateInputSchema);
    if (!parsed.ok) return parsed.response;
    const config = await upsertSiteScriptSettings(env, siteId, {
      siteDomain: existing.domain,
      settings: parsed.data,
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

async function handleAnalyzeFunnel(
  request: Request,
  env: Env,
  url: URL,
  principal: ApiKeyPrincipal,
  siteId: string,
): Promise<Response> {
  if (request.method !== "POST") return na(request);
  const denied = requireApiScope(principal, "analytics:read");
  if (denied) return denied;
  const site = await siteById(env, principal, siteId);
  if (site instanceof Response) return site;

  const parsed = await parseAndValidateBody(request, FunnelAnalyzeInputSchema);
  if (!parsed.ok) return parsed.response;
  const steps = parsed.data.steps;

  const window = parseWindow(url);
  if (!window) return bad("Invalid time window", undefined, request);
  const filters = parseFilters(url);
  const analysis = await queryFunnelAnalysis(
    env,
    siteId,
    window,
    filters,
    steps,
  );
  return jsonResponseFor(request, { ok: true, data: analysis });
}

async function handleBatchAnalytics(
  request: Request,
  env: Env,
  url: URL,
  principal: ApiKeyPrincipal,
  siteId: string,
): Promise<Response> {
  if (request.method !== "POST") return na(request);
  const denied = requireApiScope(principal, "analytics:read");
  if (denied) return denied;
  const site = await siteById(env, principal, siteId);
  if (site instanceof Response) return site;

  const parsed = await parseAndValidateBody(request, BatchInputSchema);
  if (!parsed.ok) return parsed.response;
  const queries = parsed.data.queries;

  const buildQueryUrl = (
    queryName: string,
    overrides: Record<string, unknown>,
  ): URL => {
    const queryUrl = new URL(
      `${url.protocol}//${url.host}/api/v1/sites/${encodeURIComponent(siteId)}/analytics/${encodeURIComponent(queryName)}`,
    );
    const baseKeys = ["from", "to", "interval", "timeZone", "tz"];
    for (const key of baseKeys) {
      const val = url.searchParams.get(key);
      if (val !== null) queryUrl.searchParams.set(key, val);
    }
    for (const [k, v] of Object.entries(overrides)) {
      if (k === "queryName") continue;
      if (v !== undefined && v !== null)
        queryUrl.searchParams.set(k, String(v));
    }
    return queryUrl;
  };

  const results = await Promise.all(
    queries.map(async (q) => {
      const queryName = q.queryName;
      try {
        const queryUrl = buildQueryUrl(queryName, q);
        const resp = await routeQuery(env, siteId, queryName, queryUrl, {
          publicMode: false,
        });
        const payload = (await resp.json()) as Record<string, unknown>;
        const { requestId: _rid, timestamp: _ts, ...rest } = payload;
        return { queryName, ok: resp.ok, status: resp.status, ...rest };
      } catch (e) {
        return {
          queryName,
          ok: false,
          status: 500,
          error: {
            code: "query_error",
            message: e instanceof Error ? e.message : "Unknown error",
          },
        };
      }
    }),
  );

  const partialFailure = results.some((r) => r.ok === false);
  return jsonResponseFor(request, {
    ok: true,
    data: { partialFailure, results },
  });
}

async function handleRealtimeSnapshot(
  request: Request,
  env: Env,
  url: URL,
  principal: ApiKeyPrincipal,
  siteId: string,
): Promise<Response> {
  if (request.method !== "GET") return na(request);
  const denied = requireApiScope(principal, "analytics:read");
  if (denied) return denied;
  const site = await siteById(env, principal, siteId);
  if (site instanceof Response) return site;

  const stubId = env.INGEST_DO.idFromName(siteId);
  const stub = env.INGEST_DO.get(stubId);
  const doUrl = `https://ingest.internal/snapshot?${url.searchParams.toString()}`;
  const doResp = await stub.fetch(doUrl, { method: "GET" });
  const doData = (await doResp.json()) as {
    activeNow?: number;
    data?: unknown[];
  };

  return jsonResponseFor(request, {
    ok: true,
    data: {
      activeNow: doData.activeNow ?? 0,
      events: doData.data ?? [],
    },
  });
}

async function handleRealtimeActive(
  request: Request,
  env: Env,
  principal: ApiKeyPrincipal,
  siteId: string,
): Promise<Response> {
  if (request.method !== "GET") return na(request);
  const denied = requireApiScope(principal, "analytics:read");
  if (denied) return denied;
  const site = await siteById(env, principal, siteId);
  if (site instanceof Response) return site;

  const stubId = env.INGEST_DO.idFromName(siteId);
  const stub = env.INGEST_DO.get(stubId);
  const doResp = await stub.fetch("https://ingest.internal/active", {
    method: "GET",
  });
  const doData = (await doResp.json()) as { activeNow?: number };

  return jsonResponseFor(request, {
    ok: true,
    data: { activeNow: doData.activeNow ?? 0 },
  });
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
  if (path.length === 4 && path[2] === "analytics" && path[3] === "batch") {
    return handleBatchAnalytics(request, env, url, principal, siteId);
  }
  if (
    path.length === 5 &&
    path[2] === "analytics" &&
    path[3] === "funnels" &&
    path[4] === "analyze"
  ) {
    return handleAnalyzeFunnel(request, env, url, principal, siteId);
  }
  if (path.length === 4 && path[2] === "analytics") {
    return handleAnalytics(request, env, url, principal, siteId, path[3]);
  }
  if (path.length === 4 && path[2] === "realtime" && path[3] === "snapshot") {
    return handleRealtimeSnapshot(request, env, url, principal, siteId);
  }
  if (path.length === 4 && path[2] === "realtime" && path[3] === "active") {
    return handleRealtimeActive(request, env, principal, siteId);
  }

  return nf(undefined, undefined, request);
}
