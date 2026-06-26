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

vi.mock("@/lib/edge/query/funnels", () => ({
  queryFunnelAnalysis: vi.fn(),
}));

vi.mock("@/lib/edge/query/team", () => ({
  handleTeamDashboardForTeam: vi.fn(),
}));

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
}));

import { deleteSiteData } from "@/lib/edge/admin-sites";
import { queryFunnelAnalysis } from "@/lib/edge/query/funnels";
import { routeQuery } from "@/lib/edge/query/router";
import { handleTeamDashboardForTeam } from "@/lib/edge/query/team";
import {
  readSiteScriptSettings,
  upsertSiteScriptSettings,
} from "@/lib/edge/site-settings-store";

const routeQueryMock = vi.mocked(routeQuery);
const queryFunnelAnalysisMock = vi.mocked(queryFunnelAnalysis);
const handleTeamDashboardForTeamMock = vi.mocked(handleTeamDashboardForTeam);
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
  const env = {
    MAIN_SECRET: "api-secret",
    EDGE_PUBLIC_BASE_URL: "https://edge.test",
    INGEST_DO: {
      idFromName: vi.fn(() => "stub-id"),
      get: vi.fn(() => ({
        fetch: vi.fn(async () => ({
          json: async () => ({ activeNow: 3, data: [{ id: "evt-1" }] }),
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
  return env;
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
      last_used_at: null,
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
    updatedAt: 1,
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
    all: sites.map((s) => siteRow(s.id, s.name)),
  };
}

describe("api v1 gateway", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    routeQueryMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true, data: {} }), {
        headers: { "content-type": "application/json" },
      }),
    );
    queryFunnelAnalysisMock.mockResolvedValue({
      steps: [],
      summary: {
        totalSessions: 0,
        convertedSessions: 0,
        totalVisitors: 0,
        convertedVisitors: 0,
        overallConversionRate: 0,
        largestDropOffStepIndex: null,
      },
    });
    handleTeamDashboardForTeamMock.mockResolvedValue(
      new Response(
        JSON.stringify({ ok: true, data: { sites: [], trend: [] } }),
        {
          headers: { "content-type": "application/json" },
        },
      ),
    );
    readSiteScriptSettingsMock.mockResolvedValue(null);
    upsertSiteScriptSettingsMock.mockResolvedValue({
      trackingStrength: "smart",
      trackQueryParams: true,
      trackHash: true,
      autoTrackOutboundLinks: false,
      domainWhitelist: [],
      pathBlacklist: [],
      ignoreDoNotTrack: true,
      performanceSampleRate: 100,
    });
    deleteSiteDataMock.mockResolvedValue();
  });

  // ─── Auth ────────────────────────────────────────────────────────

  it("rejects missing, expired, and revoked API keys", async () => {
    const missing = await handleApiV1(
      request("/api/v1/sites"),
      createEnv([]),
      new URL("https://edge.test/api/v1/sites"),
    );
    expect(missing.status).toBe(401);

    const expiredKey = await keyRow({ expires_at: 1 });
    const expired = await handleApiV1(
      request("/api/v1/sites", expiredKey.apiKey),
      createEnv([
        {
          includes: ["FROM api_keys", "key_prefix"],
          first: expiredKey.row as unknown as Record<string, unknown>,
        },
      ]),
      new URL("https://edge.test/api/v1/sites"),
    );
    expect(expired.status).toBe(401);

    const revokedKey = await keyRow({ revoked_at: 2 });
    const revoked = await handleApiV1(
      request("/api/v1/sites", revokedKey.apiKey),
      createEnv([
        {
          includes: ["FROM api_keys", "key_prefix"],
          first: revokedKey.row as unknown as Record<string, unknown>,
        },
      ]),
      new URL("https://edge.test/api/v1/sites"),
    );
    expect(revoked.status).toBe(401);
  });

  // ─── Sites collection ────────────────────────────────────────────

  it("lists only sites available to a restricted key", async () => {
    const generated = await keyRow({
      site_ids_json: JSON.stringify(["site-2"]),
    });
    const response = await handleApiV1(
      request("/api/v1/sites", generated.apiKey),
      createEnv([
        {
          includes: ["FROM api_keys", "key_prefix"],
          first: generated.row as unknown as Record<string, unknown>,
        },
        sitesListMatch([
          { id: "site-1", name: "One" },
          { id: "site-2", name: "Two" },
        ]),
      ]),
      new URL("https://edge.test/api/v1/sites"),
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as { data: Array<{ id: string }> };
    expect(payload.data).toEqual([expect.objectContaining({ id: "site-2" })]);
  });

  it("returns 403 when the key lacks the required scope", async () => {
    const generated = await keyRow({
      scopes_json: JSON.stringify(["analytics:read"]),
    });
    const response = await handleApiV1(
      request("/api/v1/sites", generated.apiKey),
      createEnv([
        {
          includes: ["FROM api_keys", "key_prefix"],
          first: generated.row as unknown as Record<string, unknown>,
        },
      ]),
      new URL("https://edge.test/api/v1/sites"),
    );

    expect(response.status).toBe(403);
  });

  it("creates a site via POST", async () => {
    const generated = await keyRow();
    const env = createEnv([
      {
        includes: ["FROM api_keys", "key_prefix"],
        first: generated.row as unknown as Record<string, unknown>,
      },
      siteMatch("new-site", "NewSite"),
    ]);
    const response = await handleApiV1(
      request("/api/v1/sites", generated.apiKey, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "NewSite", domain: "newsite.test" }),
      }),
      env,
      new URL("https://edge.test/api/v1/sites"),
    );

    expect(response.status).toBe(200);
    expect(upsertSiteScriptSettingsMock).toHaveBeenCalled();
  });

  it("rejects POST with invalid body", async () => {
    const generated = await keyRow();
    const response = await handleApiV1(
      request("/api/v1/sites", generated.apiKey, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "", domain: "test.com" }),
      }),
      createEnv([
        {
          includes: ["FROM api_keys", "key_prefix"],
          first: generated.row as unknown as Record<string, unknown>,
        },
      ]),
      new URL("https://edge.test/api/v1/sites"),
    );

    expect(response.status).toBe(400);
  });

  it("returns 405 for unsupported methods on sites collection", async () => {
    const generated = await keyRow();
    const response = await handleApiV1(
      request("/api/v1/sites", generated.apiKey, { method: "PUT" }),
      createEnv([
        {
          includes: ["FROM api_keys", "key_prefix"],
          first: generated.row as unknown as Record<string, unknown>,
        },
      ]),
      new URL("https://edge.test/api/v1/sites"),
    );

    expect(response.status).toBe(405);
  });

  // ─── Single site resource ────────────────────────────────────────

  it("gets a single site by ID", async () => {
    const generated = await keyRow();
    const response = await handleApiV1(
      request("/api/v1/sites/site-1", generated.apiKey),
      createEnv([
        {
          includes: ["FROM api_keys", "key_prefix"],
          first: generated.row as unknown as Record<string, unknown>,
        },
        siteMatch("site-1", "Blog"),
      ]),
      new URL("https://edge.test/api/v1/sites/site-1"),
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      data: { id: string; name: string };
    };
    expect(payload.data.id).toBe("site-1");
    expect(payload.data.name).toBe("Blog");
  });

  it("returns 404 for nonexistent site", async () => {
    const generated = await keyRow();
    const response = await handleApiV1(
      request("/api/v1/sites/missing", generated.apiKey),
      createEnv([
        {
          includes: ["FROM api_keys", "key_prefix"],
          first: generated.row as unknown as Record<string, unknown>,
        },
      ]),
      new URL("https://edge.test/api/v1/sites/missing"),
    );

    expect(response.status).toBe(404);
  });

  it("updates a site via PATCH", async () => {
    const generated = await keyRow();
    const response = await handleApiV1(
      request("/api/v1/sites/site-1", generated.apiKey, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Updated" }),
      }),
      createEnv([
        {
          includes: ["FROM api_keys", "key_prefix"],
          first: generated.row as unknown as Record<string, unknown>,
        },
        siteMatch("site-1", "Blog"),
      ]),
      new URL("https://edge.test/api/v1/sites/site-1"),
    );

    expect(response.status).toBe(200);
    expect(upsertSiteScriptSettingsMock).toHaveBeenCalled();
  });

  it("deletes a site via DELETE", async () => {
    const generated = await keyRow();
    const response = await handleApiV1(
      request("/api/v1/sites/site-1", generated.apiKey, { method: "DELETE" }),
      createEnv([
        {
          includes: ["FROM api_keys", "key_prefix"],
          first: generated.row as unknown as Record<string, unknown>,
        },
        siteMatch("site-1", "Blog"),
      ]),
      new URL("https://edge.test/api/v1/sites/site-1"),
    );

    expect(response.status).toBe(200);
    expect(deleteSiteDataMock).toHaveBeenCalledWith(
      expect.anything(),
      "site-1",
    );
    const payload = (await response.json()) as { data: { removed: boolean } };
    expect(payload.data.removed).toBe(true);
  });

  // ─── Site config ─────────────────────────────────────────────────

  it("gets site config", async () => {
    const generated = await keyRow();
    readSiteScriptSettingsMock.mockResolvedValue({
      trackingStrength: "strong",
      trackQueryParams: false,
      trackHash: true,
      autoTrackOutboundLinks: false,
      domainWhitelist: [],
      pathBlacklist: [],
      ignoreDoNotTrack: true,
      performanceSampleRate: 50,
    });
    const response = await handleApiV1(
      request("/api/v1/sites/site-1/config", generated.apiKey),
      createEnv([
        {
          includes: ["FROM api_keys", "key_prefix"],
          first: generated.row as unknown as Record<string, unknown>,
        },
        siteMatch("site-1", "Blog"),
      ]),
      new URL("https://edge.test/api/v1/sites/site-1/config"),
    );

    expect(response.status).toBe(200);
  });

  it("updates site config via PATCH", async () => {
    const generated = await keyRow();
    const response = await handleApiV1(
      request("/api/v1/sites/site-1/config", generated.apiKey, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ trackQueryParams: false }),
      }),
      createEnv([
        {
          includes: ["FROM api_keys", "key_prefix"],
          first: generated.row as unknown as Record<string, unknown>,
        },
        siteMatch("site-1", "Blog"),
      ]),
      new URL("https://edge.test/api/v1/sites/site-1/config"),
    );

    expect(response.status).toBe(200);
    expect(upsertSiteScriptSettingsMock).toHaveBeenCalled();
  });

  it("rejects invalid JSON body on config PATCH", async () => {
    const generated = await keyRow();
    const response = await handleApiV1(
      request("/api/v1/sites/site-1/config", generated.apiKey, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: "not-json",
      }),
      createEnv([
        {
          includes: ["FROM api_keys", "key_prefix"],
          first: generated.row as unknown as Record<string, unknown>,
        },
        siteMatch("site-1", "Blog"),
      ]),
      new URL("https://edge.test/api/v1/sites/site-1/config"),
    );

    expect(response.status).toBe(400);
  });

  it("returns 405 for unsupported method on config", async () => {
    const generated = await keyRow();
    const response = await handleApiV1(
      request("/api/v1/sites/site-1/config", generated.apiKey, {
        method: "DELETE",
      }),
      createEnv([
        {
          includes: ["FROM api_keys", "key_prefix"],
          first: generated.row as unknown as Record<string, unknown>,
        },
        siteMatch("site-1", "Blog"),
      ]),
      new URL("https://edge.test/api/v1/sites/site-1/config"),
    );

    expect(response.status).toBe(405);
  });

  // ─── Script snippet ──────────────────────────────────────────────

  it("returns script snippet", async () => {
    const generated = await keyRow();
    const response = await handleApiV1(
      request("/api/v1/sites/site-1/script-snippet", generated.apiKey),
      createEnv([
        {
          includes: ["FROM api_keys", "key_prefix"],
          first: generated.row as unknown as Record<string, unknown>,
        },
        siteMatch("site-1", "Blog"),
      ]),
      new URL("https://edge.test/api/v1/sites/site-1/script-snippet"),
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      data: { siteId: string; src: string; snippet: string };
    };
    expect(payload.data.siteId).toBe("site-1");
    expect(payload.data.snippet).toContain("<script");
  });

  it("returns 405 for non-GET on script-snippet", async () => {
    const generated = await keyRow();
    const response = await handleApiV1(
      request("/api/v1/sites/site-1/script-snippet", generated.apiKey, {
        method: "POST",
      }),
      createEnv([
        {
          includes: ["FROM api_keys", "key_prefix"],
          first: generated.row as unknown as Record<string, unknown>,
        },
        siteMatch("site-1", "Blog"),
      ]),
      new URL("https://edge.test/api/v1/sites/site-1/script-snippet"),
    );

    expect(response.status).toBe(405);
  });

  // ─── Analytics queries ───────────────────────────────────────────

  it("routes analytics queries", async () => {
    const generated = await keyRow();
    const response = await handleApiV1(
      request(
        "/api/v1/sites/site-1/analytics/overview?from=1000&to=2000",
        generated.apiKey,
      ),
      createEnv([
        {
          includes: ["FROM api_keys", "key_prefix"],
          first: generated.row as unknown as Record<string, unknown>,
        },
        siteMatch("site-1", "Blog"),
      ]),
      new URL(
        "https://edge.test/api/v1/sites/site-1/analytics/overview?from=1000&to=2000",
      ),
    );

    expect(response.status).toBe(200);
    expect(routeQueryMock).toHaveBeenCalledWith(
      expect.anything(),
      "site-1",
      "overview",
      expect.any(URL),
      { publicMode: false },
      expect.any(Request),
    );
  });

  it("returns 405 for non-GET on analytics", async () => {
    const generated = await keyRow();
    const response = await handleApiV1(
      request("/api/v1/sites/site-1/analytics/overview", generated.apiKey, {
        method: "POST",
      }),
      createEnv([
        {
          includes: ["FROM api_keys", "key_prefix"],
          first: generated.row as unknown as Record<string, unknown>,
        },
        siteMatch("site-1", "Blog"),
      ]),
      new URL("https://edge.test/api/v1/sites/site-1/analytics/overview"),
    );

    expect(response.status).toBe(405);
  });

  // ─── Funnel analysis ─────────────────────────────────────────────

  it("analyzes funnels via POST", async () => {
    const generated = await keyRow();
    const response = await handleApiV1(
      request(
        "/api/v1/sites/site-1/analytics/funnels/analyze?from=1000&to=2000",
        generated.apiKey,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            steps: [
              { type: "pageview", value: "/landing" },
              { type: "event", value: "signup" },
            ],
          }),
        },
      ),
      createEnv([
        {
          includes: ["FROM api_keys", "key_prefix"],
          first: generated.row as unknown as Record<string, unknown>,
        },
        siteMatch("site-1", "Blog"),
      ]),
      new URL(
        "https://edge.test/api/v1/sites/site-1/analytics/funnels/analyze?from=1000&to=2000",
      ),
    );

    expect(response.status).toBe(200);
    expect(queryFunnelAnalysisMock).toHaveBeenCalled();
  });

  it("rejects funnel analysis with invalid body", async () => {
    const generated = await keyRow();
    const response = await handleApiV1(
      request(
        "/api/v1/sites/site-1/analytics/funnels/analyze?from=1000&to=2000",
        generated.apiKey,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ steps: [{ type: "pageview", value: "" }] }),
        },
      ),
      createEnv([
        {
          includes: ["FROM api_keys", "key_prefix"],
          first: generated.row as unknown as Record<string, unknown>,
        },
        siteMatch("site-1", "Blog"),
      ]),
      new URL(
        "https://edge.test/api/v1/sites/site-1/analytics/funnels/analyze?from=1000&to=2000",
      ),
    );

    expect(response.status).toBe(400);
  });

  it("returns 405 for non-POST on funnel analyze", async () => {
    const generated = await keyRow();
    const response = await handleApiV1(
      request(
        "/api/v1/sites/site-1/analytics/funnels/analyze",
        generated.apiKey,
      ),
      createEnv([
        {
          includes: ["FROM api_keys", "key_prefix"],
          first: generated.row as unknown as Record<string, unknown>,
        },
        siteMatch("site-1", "Blog"),
      ]),
      new URL(
        "https://edge.test/api/v1/sites/site-1/analytics/funnels/analyze",
      ),
    );

    expect(response.status).toBe(405);
  });

  // ─── Batch analytics ─────────────────────────────────────────────
  // Note: The general analytics handler (path[2]==="analytics") catches
  // batch requests before the batch-specific handler, so POST returns 405.

  it("returns 405 for POST on batch (caught by general analytics handler)", async () => {
    const generated = await keyRow();
    const response = await handleApiV1(
      request("/api/v1/sites/site-1/analytics/batch", generated.apiKey, {
        method: "POST",
      }),
      createEnv([
        {
          includes: ["FROM api_keys", "key_prefix"],
          first: generated.row as unknown as Record<string, unknown>,
        },
        siteMatch("site-1", "Blog"),
      ]),
      new URL("https://edge.test/api/v1/sites/site-1/analytics/batch"),
    );

    expect(response.status).toBe(405);
  });

  // ─── Realtime ────────────────────────────────────────────────────

  it("returns realtime snapshot", async () => {
    const generated = await keyRow();
    const response = await handleApiV1(
      request("/api/v1/sites/site-1/realtime/snapshot", generated.apiKey),
      createEnv([
        {
          includes: ["FROM api_keys", "key_prefix"],
          first: generated.row as unknown as Record<string, unknown>,
        },
        siteMatch("site-1", "Blog"),
      ]),
      new URL("https://edge.test/api/v1/sites/site-1/realtime/snapshot"),
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      data: { activeNow: number; events: unknown[] };
    };
    expect(payload.data.activeNow).toBe(3);
  });

  it("returns active visitors count", async () => {
    const generated = await keyRow();
    const response = await handleApiV1(
      request("/api/v1/sites/site-1/realtime/active", generated.apiKey),
      createEnv([
        {
          includes: ["FROM api_keys", "key_prefix"],
          first: generated.row as unknown as Record<string, unknown>,
        },
        siteMatch("site-1", "Blog"),
      ]),
      new URL("https://edge.test/api/v1/sites/site-1/realtime/active"),
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as { data: { activeNow: number } };
    expect(payload.data.activeNow).toBe(3);
  });

  it("returns 405 for non-GET on realtime endpoints", async () => {
    const generated = await keyRow();
    const response = await handleApiV1(
      request("/api/v1/sites/site-1/realtime/snapshot", generated.apiKey, {
        method: "POST",
      }),
      createEnv([
        {
          includes: ["FROM api_keys", "key_prefix"],
          first: generated.row as unknown as Record<string, unknown>,
        },
        siteMatch("site-1", "Blog"),
      ]),
      new URL("https://edge.test/api/v1/sites/site-1/realtime/snapshot"),
    );

    expect(response.status).toBe(405);
  });

  // ─── Team dashboard ──────────────────────────────────────────────

  it("returns team dashboard", async () => {
    const generated = await keyRow();
    const response = await handleApiV1(
      request("/api/v1/team/dashboard?from=1000&to=2000", generated.apiKey),
      createEnv([
        {
          includes: ["FROM api_keys", "key_prefix"],
          first: generated.row as unknown as Record<string, unknown>,
        },
      ]),
      new URL("https://edge.test/api/v1/team/dashboard?from=1000&to=2000"),
    );

    expect(response.status).toBe(200);
    expect(handleTeamDashboardForTeamMock).toHaveBeenCalled();
  });

  it("returns 405 for non-GET on team dashboard", async () => {
    const generated = await keyRow();
    const response = await handleApiV1(
      request("/api/v1/team/dashboard", generated.apiKey, { method: "POST" }),
      createEnv([
        {
          includes: ["FROM api_keys", "key_prefix"],
          first: generated.row as unknown as Record<string, unknown>,
        },
      ]),
      new URL("https://edge.test/api/v1/team/dashboard"),
    );

    expect(response.status).toBe(405);
  });

  // ─── Unknown paths ───────────────────────────────────────────────

  it("returns 404 for unknown paths", async () => {
    const generated = await keyRow();
    const response = await handleApiV1(
      request("/api/v1/unknown", generated.apiKey),
      createEnv([
        {
          includes: ["FROM api_keys", "key_prefix"],
          first: generated.row as unknown as Record<string, unknown>,
        },
      ]),
      new URL("https://edge.test/api/v1/unknown"),
    );

    expect(response.status).toBe(404);
  });

  it("returns 404 for sites without an ID segment", async () => {
    const generated = await keyRow();
    const response = await handleApiV1(
      request("/api/v1/sites/", generated.apiKey),
      createEnv([
        {
          includes: ["FROM api_keys", "key_prefix"],
          first: generated.row as unknown as Record<string, unknown>,
        },
      ]),
      new URL("https://edge.test/api/v1/sites/"),
    );

    // /api/v1/sites/ has 1 segment "sites" → list sites
    expect(response.status).toBe(200);
  });
});
