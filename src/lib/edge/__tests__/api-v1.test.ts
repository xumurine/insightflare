import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  type ApiKeyRow,
  generateApiKeySecret,
  hashApiKeySecret,
} from "@/lib/edge/api-key-store";
import { handleApiV1 } from "@/lib/edge/api-v1";
import type { Env } from "@/lib/edge/types";

vi.mock("@/lib/edge/query/router", () => ({
  routeQuery: vi.fn(),
}));

vi.mock("@/lib/edge/query/funnels", async () => {
  const actual = await vi.importActual("@/lib/edge/query/funnels");
  return {
    ...(actual as Record<string, unknown>),
    queryFunnelAnalysis: vi.fn(),
  };
});

vi.mock("@/lib/edge/site-settings-store", async () => {
  const actual = await vi.importActual("@/lib/edge/site-settings-store");
  return {
    ...(actual as Record<string, unknown>),
    readSiteScriptSettings: vi.fn(),
    upsertSiteScriptSettings: vi.fn(),
  };
});

vi.mock("@/lib/edge/admin-sites", () => ({
  deleteSiteData: vi.fn(),
  createSiteWithDefaultSettings: vi.fn(),
  ensurePublicSlugAvailable: vi.fn(),
}));

import {
  createSiteWithDefaultSettings,
  deleteSiteData,
  ensurePublicSlugAvailable,
} from "@/lib/edge/admin-sites";
import { queryFunnelAnalysis } from "@/lib/edge/query/funnels";
import { routeQuery } from "@/lib/edge/query/router";
import {
  readSiteScriptSettings,
  upsertSiteScriptSettings,
} from "@/lib/edge/site-settings-store";

const routeQueryMock = vi.mocked(routeQuery);
const queryFunnelAnalysisMock = vi.mocked(queryFunnelAnalysis);
const readSiteScriptSettingsMock = vi.mocked(readSiteScriptSettings);
const upsertSiteScriptSettingsMock = vi.mocked(upsertSiteScriptSettings);
const deleteSiteDataMock = vi.mocked(deleteSiteData);

interface MockStatement {
  sql: string;
  bindings: Array<string | number | null>;
  bind: (...bindings: Array<string | number | null>) => MockStatement;
  first: () => Promise<Record<string, unknown> | null>;
  all: () => Promise<{ results: Record<string, unknown>[] }>;
  run: () => Promise<{ success: boolean }>;
}

interface Match {
  includes: string[];
  first?: Record<string, unknown> | null;
  all?: Record<string, unknown>[];
}

function createEnv(matches: Match[]) {
  return {
    MAIN_SECRET: "api-secret",
    EDGE_PUBLIC_BASE_URL: "https://edge.test",
    INGEST_DO: {
      idFromName: vi.fn(() => "stub-id"),
      get: vi.fn(() => ({
        fetch: vi.fn(async (input: string) => ({
          json: async () =>
            input.includes("/active")
              ? { activeNow: 3 }
              : { activeNow: 3, data: [{ id: "evt-1" }] },
        })),
      })),
    },
    DB: {
      prepare(sql: string) {
        const statement: MockStatement = {
          sql,
          bindings: [],
          bind(...bindings) {
            this.bindings = bindings;
            return this;
          },
          async first() {
            const match = matches.find((item) =>
              item.includes.every((needle) => statement.sql.includes(needle)),
            );
            return match && "first" in match ? (match.first ?? null) : null;
          },
          async all() {
            const match = matches.find((item) =>
              item.includes.every((needle) => statement.sql.includes(needle)),
            );
            return { results: match?.all ?? [] };
          },
          async run() {
            return { success: true };
          },
        };
        return statement;
      },
    } as unknown as D1Database,
  } as unknown as Env;
}

function request(path: string, apiKey?: string, init?: RequestInit): Request {
  return new Request(`https://edge.test${path}`, {
    ...init,
    headers: {
      ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
}

async function keyRow(
  overrides: Partial<ApiKeyRow> = {},
): Promise<{ apiKey: string; row: ApiKeyRow }> {
  const generated = generateApiKeySecret();
  const env = { MAIN_SECRET: "api-secret" } as Env;
  return {
    apiKey: generated.apiKey,
    row: {
      id: "key-1",
      team_id: "team-1",
      name: "CI",
      key_prefix: generated.prefix,
      key_hash: await hashApiKeySecret(env, generated.apiKey),
      scopes_json: JSON.stringify([
        "site:read",
        "site:write",
        "site_config:read",
        "site_config:write",
        "analytics:read",
      ]),
      site_ids_json: "[]",
      created_by_user_id: "user-1",
      expires_at: null,
      revoked_at: null,
      revoked_by_user_id: null,
      rotated_from_key_id: null,
      last_used_at: 101,
      created_at: 100,
      updated_at: 100,
      ...overrides,
    },
  };
}

function siteRow(id: string, name: string) {
  return {
    id,
    teamId: "team-1",
    name,
    domain: `${name}.test`,
    publicEnabled: 0,
    publicSlug: null,
    createdAt: 1,
    updatedAt: 2,
  };
}

function authMatch(row: ApiKeyRow): Match {
  return {
    includes: ["FROM api_keys", "key_prefix"],
    first: row as unknown as Record<string, unknown>,
  };
}

function teamMatch(): Match {
  return {
    includes: ["FROM teams"],
    first: { id: "team-1", name: "Team One", createdAt: 1 },
  };
}

function siteMatch(siteId: string, siteName: string): Match {
  return {
    includes: ["FROM sites", "WHERE id=?"],
    first: siteRow(siteId, siteName),
  };
}

function sitesListMatch(sites: Array<{ id: string; name: string }>): Match {
  return {
    includes: ["FROM sites", "WHERE team_id=?"],
    all: sites.map((site) => siteRow(site.id, site.name)),
  };
}

function teamSitesListMatch(sites: Array<{ id: string; name: string }>): Match {
  return {
    includes: ["FROM sites", "WHERE team_id = ?"],
    all: sites.map((site) => ({
      ...siteRow(site.id, site.name),
      teamId: "team-1",
      publicEnabled: 0,
      publicSlug: null,
      createdAt: 1,
      updatedAt: 2,
    })),
  };
}

function funnelRow(id: string, siteId = "site-1") {
  return {
    id,
    site_id: siteId,
    name: "Signup",
    config_json: JSON.stringify({
      steps: [
        { type: "pageview", value: "/pricing" },
        { type: "event", value: "signup" },
      ],
    }),
    created_at: 1,
    updated_at: 2,
  };
}

function funnelsListMatch(funnels: Array<Record<string, unknown>>): Match {
  return {
    includes: ["FROM analysis_definitions", "ORDER BY created_at DESC"],
    all: funnels,
  };
}

function funnelMatch(funnel: Record<string, unknown> | null): Match {
  return {
    includes: ["FROM analysis_definitions", "LIMIT 1"],
    first: funnel,
  };
}

async function authed(
  path: string,
  matches: Match[],
  init?: RequestInit,
  overrides?: Partial<ApiKeyRow>,
) {
  const generated = await keyRow(overrides);
  const env = createEnv([authMatch(generated.row), ...matches]);
  const response = await handleApiV1(
    request(path, generated.apiKey, init),
    env,
    new URL(`https://edge.test${path}`),
  );
  return { response, generated, env };
}

describe("api v1 gateway", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    routeQueryMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          data: {
            views: 10,
            sessions: 8,
            visitors: 7,
            bounces: 2,
            bounceRate: 0.25,
            avgDurationMs: 1500,
            viewsPerSession: 1.25,
            approximateVisitors: false,
          },
          interval: "day",
          requestId: "legacy",
          timestamp: "2026-06-26T00:00:00Z",
        }),
        { headers: { "content-type": "application/json" } },
      ),
    );
    readSiteScriptSettingsMock.mockResolvedValue(null);
    upsertSiteScriptSettingsMock.mockResolvedValue({
      trackingStrength: "smart",
      trackQueryParams: false,
      trackHash: true,
      autoTrackOutboundLinks: true,
      domainWhitelist: [],
      pathBlacklist: [],
      ignoreDoNotTrack: false,
      performanceSampleRate: 100,
    });
    vi.mocked(ensurePublicSlugAvailable).mockResolvedValue(true);
    deleteSiteDataMock.mockResolvedValue();
    queryFunnelAnalysisMock.mockResolvedValue({
      steps: [
        {
          index: 0,
          label: "/pricing",
          type: "pageview",
          sessions: 10,
          visitors: 9,
          conversionRate: 100,
          stepConversionRate: 100,
          dropOffSessions: 2,
          dropOffRate: 20,
        },
        {
          index: 1,
          label: "signup",
          type: "event",
          sessions: 8,
          visitors: 7,
          conversionRate: 80,
          stepConversionRate: 80,
          dropOffSessions: 0,
          dropOffRate: 0,
        },
      ],
      summary: {
        totalSessions: 10,
        convertedSessions: 8,
        totalVisitors: 9,
        convertedVisitors: 7,
        overallConversionRate: 80,
        largestDropOffStepIndex: 1,
      },
    });
  });

  it("returns root discovery without authentication", async () => {
    const response = await handleApiV1(
      request("/api/v1"),
      createEnv([]),
      new URL("https://edge.test/api/v1"),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: { links: Record<string, string> };
      meta: { generatedAt: string };
    };
    expect(body.data.links.openapi).toBe("/.well-known/openapi.json");
    expect(body.meta.generatedAt).toEqual(expect.any(String));
    expect(JSON.stringify(body)).not.toContain('"ok"');
  });

  it("rejects missing, expired, and revoked API keys with the new error envelope", async () => {
    const missing = await handleApiV1(
      request("/api/v1/sites"),
      createEnv([]),
      new URL("https://edge.test/api/v1/sites"),
    );
    expect(missing.status).toBe(401);
    expect(await missing.json()).toMatchObject({
      error: { code: "invalid_api_key" },
      meta: { generatedAt: expect.any(String) },
    });

    const expiredKey = await keyRow({ expires_at: 1 });
    const expired = await handleApiV1(
      request("/api/v1/sites", expiredKey.apiKey),
      createEnv([authMatch(expiredKey.row)]),
      new URL("https://edge.test/api/v1/sites"),
    );
    expect(expired.status).toBe(401);

    const revokedKey = await keyRow({ revoked_at: 2 });
    const revoked = await handleApiV1(
      request("/api/v1/sites", revokedKey.apiKey),
      createEnv([authMatch(revokedKey.row)]),
      new URL("https://edge.test/api/v1/sites"),
    );
    expect(revoked.status).toBe(401);
  });

  it("introspects the current token without returning secrets", async () => {
    const { response } = await authed("/api/v1/token", [teamMatch()]);

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: { name: string; scopes: string[]; siteAccess: { mode: string } };
    };
    expect(body.data.name).toBe("CI");
    expect(body.data.scopes).toContain("analytics:read");
    expect(body.data.siteAccess.mode).toBe("all");
    expect(JSON.stringify(body)).not.toContain("key_hash");
    expect(JSON.stringify(body)).not.toContain("ifk_live_");
  });

  it("checks token scope and site access in bulk", async () => {
    const { response } = await authed(
      "/api/v1/token/check",
      [],
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          checks: [
            { scope: "analytics:read", siteId: "site-2" },
            { scope: "site:write" },
          ],
        }),
      },
      {
        scopes_json: JSON.stringify(["analytics:read"]),
        site_ids_json: JSON.stringify(["site-2"]),
      },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: {
        checks: [
          { scope: "analytics:read", siteId: "site-2", allowed: true },
          { scope: "site:write", allowed: false, reason: "missing_scope" },
        ],
      },
    });
  });

  it("returns capabilities based on token scopes", async () => {
    const { response } = await authed("/api/v1/capabilities", [], undefined, {
      scopes_json: JSON.stringify(["analytics:read"]),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: {
        features: {
          analytics: true,
          sites: false,
          exports: false,
          batch: true,
        },
        limits: { batchMaxRequests: 20 },
      },
    });
  });

  it("lists only sites available to a restricted key", async () => {
    const { response } = await authed(
      "/api/v1/sites",
      [
        sitesListMatch([
          { id: "site-1", name: "One" },
          { id: "site-2", name: "Two" },
        ]),
      ],
      undefined,
      { site_ids_json: JSON.stringify(["site-2"]) },
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as { data: Array<{ id: string }> };
    expect(payload.data).toEqual([expect.objectContaining({ id: "site-2" })]);
  });

  it("creates, updates, and deletes sites with new response shape", async () => {
    vi.mocked(createSiteWithDefaultSettings).mockResolvedValue("new-site");
    const created = await authed(
      "/api/v1/sites",
      [siteMatch("new-site", "NewSite")],
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "NewSite", domain: "newsite.test" }),
      },
    );

    expect(created.response.status).toBe(201);
    expect(await created.response.json()).toMatchObject({
      data: {
        id: "new-site",
        sharing: { publicEnabled: false, publicSlug: null },
        links: { tracking: "/api/v1/sites/new-site/tracking" },
      },
    });

    const updated = await authed(
      "/api/v1/sites/site-1",
      [siteMatch("site-1", "Blog")],
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Updated" }),
      },
    );
    expect(updated.response.status).toBe(200);
    expect(upsertSiteScriptSettingsMock).toHaveBeenCalled();

    const deleted = await authed(
      "/api/v1/sites/site-1",
      [siteMatch("site-1", "Blog")],
      { method: "DELETE" },
    );
    expect(deleted.response.status).toBe(204);
    expect(deleteSiteDataMock).toHaveBeenCalledWith(
      expect.anything(),
      "site-1",
    );
  });

  it("returns 404 instead of 403 for a site outside a restricted token allowlist", async () => {
    const { response } = await authed(
      "/api/v1/sites/site-1",
      [siteMatch("site-1", "Blog")],
      undefined,
      { site_ids_json: JSON.stringify(["site-2"]) },
    );

    expect(response.status).toBe(404);
  });

  it("handles tracking, privacy, sharing, and tracking script settings", async () => {
    const tracking = await authed("/api/v1/sites/site-1/tracking", [
      siteMatch("site-1", "Blog"),
    ]);
    expect(tracking.response.status).toBe(200);
    expect(await tracking.response.json()).toMatchObject({
      data: { trackPageviews: true, trackQuery: true },
    });

    const privacy = await authed("/api/v1/sites/site-1/privacy", [
      siteMatch("site-1", "Blog"),
    ]);
    expect(privacy.response.status).toBe(200);
    expect(await privacy.response.json()).toMatchObject({
      data: { anonymizeIp: true, visitorTokenMode: "daily" },
    });

    const sharing = await authed("/api/v1/sites/site-1/sharing", [
      siteMatch("site-1", "Blog"),
    ]);
    expect(sharing.response.status).toBe(200);
    expect(await sharing.response.json()).toMatchObject({
      data: { publicEnabled: false, publicSlug: null },
    });

    const script = await authed("/api/v1/sites/site-1/tracking/script", [
      siteMatch("site-1", "Blog"),
    ]);
    expect(script.response.status).toBe(200);
    expect(await script.response.json()).toMatchObject({
      data: {
        siteId: "site-1",
        src: "https://edge.test/script.js?siteId=site-1",
      },
    });
  });

  it("returns analytics schema, overview, timeseries, and breakdown primitives", async () => {
    const schema = await authed("/api/v1/sites/site-1/analytics/schema", [
      siteMatch("site-1", "Blog"),
    ]);
    expect(schema.response.status).toBe(200);
    expect(await schema.response.json()).toMatchObject({
      data: {
        metrics: expect.arrayContaining([
          expect.objectContaining({ key: "views" }),
        ]),
        dimensions: expect.arrayContaining([
          expect.objectContaining({ key: "geo.country" }),
        ]),
      },
    });

    const overview = await authed(
      "/api/v1/sites/site-1/analytics/overview?preset=last_7_days&timeZone=UTC&metrics=views,sessions",
      [siteMatch("site-1", "Blog")],
    );
    expect(overview.response.status).toBe(200);
    expect(await overview.response.json()).toMatchObject({
      data: { views: 10, sessions: 8 },
      meta: { timeRange: expect.any(Object) },
    });

    routeQueryMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          interval: "day",
          data: [{ timestampMs: 1_000, views: 2, sessions: 1, visitors: 1 }],
        }),
        { headers: { "content-type": "application/json" } },
      ),
    );
    const timeseries = await authed(
      "/api/v1/sites/site-1/analytics/timeseries?from=2026-06-01T00:00:00Z&to=2026-06-02T00:00:00Z&interval=day",
      [siteMatch("site-1", "Blog")],
    );
    expect(timeseries.response.status).toBe(200);
    expect(await timeseries.response.json()).toMatchObject({
      data: [expect.objectContaining({ start: "1970-01-01T00:00:01.000Z" })],
      meta: { interval: "day" },
    });

    routeQueryMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          data: [
            { value: "US", label: "United States", views: 4, sessions: 3 },
          ],
        }),
        { headers: { "content-type": "application/json" } },
      ),
    );
    const breakdown = await authed(
      "/api/v1/sites/site-1/analytics/breakdowns/geo.country?preset=last_30_days&metrics=views,sessions",
      [siteMatch("site-1", "Blog")],
    );
    expect(breakdown.response.status).toBe(200);
    expect(routeQueryMock).toHaveBeenLastCalledWith(
      expect.anything(),
      "site-1",
      "overview-geo-country",
      expect.any(URL),
      { publicMode: false },
      expect.any(Request),
    );
    expect(await breakdown.response.json()).toMatchObject({
      data: [{ key: "US", label: "United States", views: 4, sessions: 3 }],
    });
  });

  it("uses cursor pagination for events, visitors, and sessions", async () => {
    routeQueryMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          data: [],
          pagination: { page: 1, pageSize: 100, total: 0 },
        }),
        { headers: { "content-type": "application/json" } },
      ),
    );
    const events = await authed("/api/v1/sites/site-1/events?limit=100", [
      siteMatch("site-1", "Blog"),
    ]);
    expect(events.response.status).toBe(200);
    expect(await events.response.json()).toMatchObject({
      data: [],
      pagination: { limit: 100, nextCursor: null, hasMore: false },
    });
  });

  it("serves team analytics from the team dashboard runtime", async () => {
    const matches = [
      teamSitesListMatch([
        { id: "site-1", name: "One" },
        { id: "site-2", name: "Two" },
      ]),
      {
        includes: ["FROM combined", "GROUP BY siteId"],
        all: [
          {
            siteId: "site-1",
            views: 10,
            sessions: 5,
            visitors: 4,
            bounces: 1,
            totalDuration: 1000,
            durationViews: 5,
          },
          {
            siteId: "site-2",
            views: 20,
            sessions: 10,
            visitors: 8,
            bounces: 2,
            totalDuration: 3000,
            durationViews: 10,
          },
        ],
      },
      {
        includes: ["GROUP BY siteId, bucket"],
        all: [
          { siteId: "site-1", bucket: 0, views: 3, visitors: 2 },
          { siteId: "site-2", bucket: 0, views: 4, visitors: 3 },
        ],
      },
    ];

    const overview = await authed(
      "/api/v1/team/analytics/overview?from=2026-06-01T00:00:00Z&to=2026-06-02T00:00:00Z",
      matches,
    );
    expect(overview.response.status).toBe(200);
    expect(await overview.response.json()).toMatchObject({
      data: {
        views: 30,
        sessions: 15,
        visitors: 12,
        bounces: 3,
        bounceRate: 0.2,
        avgDurationMs: 267,
      },
    });

    const timeseries = await authed(
      "/api/v1/team/analytics/timeseries?from=2026-06-01T00:00:00Z&to=2026-06-02T00:00:00Z&interval=day",
      matches,
    );
    expect(timeseries.response.status).toBe(200);
    expect(await timeseries.response.json()).toMatchObject({
      data: [
        {
          start: "2026-06-01T00:00:00.000Z",
          views: 7,
          visitors: 5,
        },
      ],
      meta: { interval: "day" },
    });

    const sites = await authed(
      "/api/v1/team/analytics/sites?from=2026-06-01T00:00:00Z&to=2026-06-02T00:00:00Z",
      matches,
    );
    expect(sites.response.status).toBe(200);
    expect(await sites.response.json()).toMatchObject({
      data: [
        expect.objectContaining({ key: "site-1", label: "One", views: 10 }),
        expect.objectContaining({ key: "site-2", label: "Two", views: 20 }),
      ],
    });
  });

  it("manages saved funnels and analyzes stored definitions", async () => {
    const list = await authed("/api/v1/sites/site-1/funnels", [
      siteMatch("site-1", "Blog"),
      funnelsListMatch([funnelRow("funnel-1")]),
    ]);
    expect(list.response.status).toBe(200);
    expect(await list.response.json()).toMatchObject({
      data: [
        {
          id: "funnel-1",
          steps: [
            { type: "pageview", value: "/pricing" },
            { type: "event", value: "signup" },
          ],
        },
      ],
    });

    const created = await authed(
      "/api/v1/sites/site-1/funnels",
      [siteMatch("site-1", "Blog")],
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Checkout",
          steps: [
            { type: "pageview", value: "/checkout" },
            { type: "event", value: "purchase" },
          ],
        }),
      },
    );
    expect(created.response.status).toBe(201);
    expect(await created.response.json()).toMatchObject({
      data: {
        siteId: "site-1",
        name: "Checkout",
        links: {
          analysis: expect.stringContaining("/analysis"),
        },
      },
    });

    const analyzed = await authed(
      "/api/v1/sites/site-1/funnels/funnel-1/analysis?from=2026-06-01T00:00:00Z&to=2026-06-02T00:00:00Z",
      [siteMatch("site-1", "Blog"), funnelMatch(funnelRow("funnel-1"))],
    );
    expect(analyzed.response.status).toBe(200);
    expect(queryFunnelAnalysisMock).toHaveBeenLastCalledWith(
      expect.anything(),
      "site-1",
      expect.objectContaining({ timeZone: "UTC" }),
      {},
      [
        { type: "pageview", value: "/pricing" },
        { type: "event", value: "signup" },
      ],
    );
    expect(await analyzed.response.json()).toMatchObject({
      data: {
        funnel: { id: "funnel-1" },
        analysis: { summary: { convertedSessions: 8 } },
      },
    });

    const updated = await authed(
      "/api/v1/sites/site-1/funnels/funnel-1",
      [siteMatch("site-1", "Blog"), funnelMatch(funnelRow("funnel-1"))],
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Updated signup" }),
      },
    );
    expect(updated.response.status).toBe(200);
    expect(await updated.response.json()).toMatchObject({
      data: { id: "funnel-1", name: "Updated signup" },
    });

    const deleted = await authed(
      "/api/v1/sites/site-1/funnels/funnel-1",
      [siteMatch("site-1", "Blog"), funnelMatch(funnelRow("funnel-1"))],
      { method: "DELETE" },
    );
    expect(deleted.response.status).toBe(204);
  });

  it("returns v1 error envelopes for body validation failures", async () => {
    const invalid = await authed(
      "/api/v1/sites/site-1/funnels",
      [siteMatch("site-1", "Blog")],
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Broken", steps: [] }),
      },
    );

    expect(invalid.response.status).toBe(400);
    expect(await invalid.response.json()).toMatchObject({
      error: { code: "validation_failed" },
      meta: { generatedAt: expect.any(String) },
    });
  });

  it("returns realtime snapshot and active visitors", async () => {
    const snapshot = await authed("/api/v1/sites/site-1/realtime/snapshot", [
      siteMatch("site-1", "Blog"),
    ]);
    expect(snapshot.response.status).toBe(200);
    expect(await snapshot.response.json()).toMatchObject({
      data: { activeVisitors: 3, events: [{ id: "evt-1" }], sessions: [] },
    });

    const active = await authed(
      "/api/v1/sites/site-1/realtime/active-visitors",
      [siteMatch("site-1", "Blog")],
    );
    expect(active.response.status).toBe(200);
    expect(await active.response.json()).toMatchObject({
      data: { activeVisitors: 3 },
    });
  });

  it("executes global batch with partial failure metadata", async () => {
    const { response } = await authed(
      "/api/v1/batch",
      [siteMatch("site-1", "Blog")],
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          requests: [
            {
              id: "overview",
              method: "GET",
              path: "/api/v1/sites/site-1/analytics/overview",
              query: { preset: "last_7_days" },
            },
            {
              id: "bad",
              method: "POST",
              path: "/api/v1/sites/site-1/analytics/overview",
            },
          ],
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: {
        responses: [
          { id: "overview", status: 200 },
          { id: "bad", status: 400 },
        ],
      },
      meta: { partialFailure: true },
    });
  });
});
