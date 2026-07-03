import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BotAnalyticsConfig } from "@/lib/bot-analytics-config";
import { requireActor } from "@/lib/edge/admin-auth";
import {
  handleBotAnalyticsAdmin,
  handleBotAnalyticsConfigAdmin,
} from "@/lib/edge/admin-bot-analytics";
import { decryptBotAnalyticsSecret } from "@/lib/edge/secret-encryption";
import type { Env } from "@/lib/edge/types";

vi.mock("@/lib/edge/admin-auth", () => ({
  requireActor: vi.fn(),
}));

interface MockStatement {
  bind: ReturnType<typeof vi.fn>;
  first: ReturnType<typeof vi.fn>;
  run: ReturnType<typeof vi.fn>;
  all: ReturnType<typeof vi.fn>;
}

const actor = {
  user: {
    id: "admin-1",
    username: "admin",
    email: "admin@example.test",
    name: "Admin",
    password_hash: null,
    system_role: "admin",
    timezone: "UTC",
    created_at: 1,
    updated_at: 1,
  },
  isAdmin: true,
};

function statement(options: { first?: unknown; all?: unknown[] } = {}) {
  const stmt: MockStatement = {
    bind: vi.fn((..._args: unknown[]) => stmt),
    first: vi.fn().mockResolvedValue(options.first ?? null),
    run: vi.fn().mockResolvedValue({ success: true }),
    all: vi.fn().mockResolvedValue({ results: options.all ?? [] }),
  };
  return stmt;
}

function createEnv(statements: MockStatement[]) {
  let index = 0;
  return {
    MAIN_SECRET: "main-secret",
    DB: {
      prepare: vi.fn(() => {
        const stmt = statements[index];
        index += 1;
        if (!stmt) throw new Error(`Unexpected SQL #${index}`);
        return stmt;
      }),
    } as unknown as D1Database,
  } as Env;
}

function request(path: string, init?: RequestInit) {
  return new Request(`https://app.test${path}`, {
    method: "GET",
    ...init,
  });
}

function jsonRequest(path: string, body: unknown, method = "PATCH") {
  return request(path, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function row(config: Partial<BotAnalyticsConfig>) {
  return {
    value_json: JSON.stringify({
      accountId: "442fe5198bff93bdf60d4223d9618033",
      dataset: "insightflare_bot_events",
      apiTokenEncrypted: "",
      apiTokenHint: "",
      configured: false,
      updatedAt: 0,
      ...config,
    }),
  };
}

async function jsonOf(response: Response) {
  return (await response.json()) as Record<string, any>;
}

describe("admin bot analytics handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    vi.mocked(requireActor).mockResolvedValue(actor);
  });

  it("saves Cloudflare reader settings with encrypted token and redacts response", async () => {
    const select = statement();
    const upsert = statement();
    const env = createEnv([select, upsert]);

    const response = await handleBotAnalyticsConfigAdmin(
      jsonRequest("/api/private/admin/bot-analytics-config", {
        accountId: "442fe5198bff93bdf60d4223d9618033",
        dataset: "insightflare_bot_events",
        apiToken: "cf_token_secret",
      }),
      env,
    );
    const body = await jsonOf(response);

    expect(response.status).toBe(200);
    expect(body.data.apiTokenConfigured).toBe(true);
    expect(body.data.apiTokenHint).toBe("••••cret");
    expect(JSON.stringify(body)).not.toContain("cf_token_secret");

    const saved = JSON.parse(
      upsert.bind.mock.calls[0][1],
    ) as BotAnalyticsConfig;
    expect(saved.apiTokenEncrypted).toMatch(/^v1:/);
    await expect(
      decryptBotAnalyticsSecret(env, saved.apiTokenEncrypted),
    ).resolves.toBe("cf_token_secret");
  });

  it("returns an unconfigured data shape when reader settings are incomplete", async () => {
    const response = await handleBotAnalyticsAdmin(
      request("/api/private/admin/bot-analytics"),
      createEnv([statement()]),
      new URL("https://app.test/api/private/admin/bot-analytics"),
    );
    const body = await jsonOf(response);

    expect(response.status).toBe(200);
    expect(body.configured).toBe(false);
    expect(body.events).toEqual([]);
    expect(body.summary.total).toBe(0);
  });

  it("passes through auth responses, rejects non-admins, and handles methods", async () => {
    const unauthorized = new Response("unauthorized", { status: 401 });
    vi.mocked(requireActor).mockResolvedValueOnce(unauthorized);
    await expect(
      handleBotAnalyticsConfigAdmin(
        request("/api/private/admin/bot-analytics-config"),
        createEnv([]),
      ),
    ).resolves.toBe(unauthorized);

    vi.mocked(requireActor).mockResolvedValueOnce({ ...actor, isAdmin: false });
    const forbidden = await handleBotAnalyticsConfigAdmin(
      request("/api/private/admin/bot-analytics-config"),
      createEnv([]),
    );
    expect(forbidden.status).toBe(403);

    const deleteStatement = statement();
    const deleted = await handleBotAnalyticsConfigAdmin(
      request("/api/private/admin/bot-analytics-config", { method: "DELETE" }),
      createEnv([deleteStatement]),
    );
    expect(deleted.status).toBe(200);
    expect(deleteStatement.run).toHaveBeenCalled();

    const unsupported = await handleBotAnalyticsConfigAdmin(
      request("/api/private/admin/bot-analytics-config", { method: "PUT" }),
      createEnv([]),
    );
    expect(unsupported.status).toBe(405);
  });

  it("reports token and Analytics Engine query failures", async () => {
    const invalidSecret = statement({
      first: row({
        apiTokenEncrypted: "invalid",
        apiTokenHint: "••••oken",
        configured: true,
      }),
    });
    const decryptFailed = await handleBotAnalyticsAdmin(
      request("/api/private/admin/bot-analytics"),
      createEnv([invalidSecret]),
      new URL("https://app.test/api/private/admin/bot-analytics"),
    );
    expect(decryptFailed.status).toBe(400);

    const encrypted = await import("@/lib/edge/secret-encryption").then(
      ({ encryptBotAnalyticsSecret }) =>
        encryptBotAnalyticsSecret(
          { MAIN_SECRET: "main-secret" },
          "cf_reader_token",
        ),
    );
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("denied", { status: 403 }))
      .mockResolvedValueOnce(new Response("{bad-json", { status: 200 }));

    const cfFailed = await handleBotAnalyticsAdmin(
      request("/api/private/admin/bot-analytics"),
      createEnv([
        statement({
          first: row({
            apiTokenEncrypted: encrypted,
            apiTokenHint: "••••oken",
            configured: true,
          }),
        }),
      ]),
      new URL("https://app.test/api/private/admin/bot-analytics"),
    );
    expect(cfFailed.status).toBe(400);

    const parseFailed = await handleBotAnalyticsAdmin(
      request("/api/private/admin/bot-analytics"),
      createEnv([
        statement({
          first: row({
            apiTokenEncrypted: encrypted,
            apiTokenHint: "••••oken",
            configured: true,
          }),
        }),
      ]),
      new URL("https://app.test/api/private/admin/bot-analytics"),
    );
    expect(parseFailed.status).toBe(400);
  });

  it("queries Analytics Engine and maps bot rows with site metadata", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_800_000_000_000);
    const encrypted = await import("@/lib/edge/secret-encryption").then(
      ({ encryptBotAnalyticsSecret }) =>
        encryptBotAnalyticsSecret(
          { MAIN_SECRET: "main-secret" },
          "cf_reader_token",
        ),
    );
    const configSelect = statement({
      first: row({
        apiTokenEncrypted: encrypted,
        apiTokenHint: "••••oken",
        configured: true,
      }),
    });
    const siteSelect = statement({
      all: [{ id: "site-1", name: "Blog", domain: "example.test" }],
    });
    const env = createEnv([configSelect, siteSelect]);
    const aeBody = [
      JSON.stringify({
        timestamp: "2026-07-03 10:00:00",
        siteId: "site-1",
        kind: "pageview",
        confidence: "medium",
        reasons: "hosting_asn",
        ip: "203.0.113.8",
        userAgent: "Mozilla/5.0",
        origin: "https://example.test",
        hostname: "example.test",
        pathname: "/post",
        country: "JP",
        region: "Tokyo",
        city: "Tokyo",
        continent: "AS",
        colo: "NRT",
        asnText: "16509",
        asOrganization: "Amazon.com, Inc.",
        verifiedBotCategory: "",
        rayId: "ray-1",
        traceId: "trace-1",
        metadataJson: "{}",
        receivedAt: 1_799_999_900_000,
        asn: 16509,
        latitude: 35.6895,
        longitude: 139.6917,
        botScore: 0,
        userAgentLength: 11,
      }),
      "",
    ].join("\n");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(aeBody, { status: 200 }));

    const response = await handleBotAnalyticsAdmin(
      request("/api/private/admin/bot-analytics?minutes=60&limit=10"),
      env,
      new URL(
        "https://app.test/api/private/admin/bot-analytics?minutes=60&limit=10",
      ),
    );
    const body = await jsonOf(response);

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.cloudflare.com/client/v4/accounts/442fe5198bff93bdf60d4223d9618033/analytics_engine/sql",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Bearer cf_reader_token",
        }),
      }),
    );
    expect(body.configured).toBe(true);
    expect(body.summary).toMatchObject({
      total: 1,
      mediumConfidence: 1,
      uniqueAsns: 1,
      uniqueCountries: 1,
    });
    expect(body.events[0]).toMatchObject({
      siteName: "Blog",
      siteDomain: "example.test",
      asn: 16509,
      reasons: ["hosting_asn"],
    });
    expect(body.mapPoints[0]).toMatchObject({
      country: "JP",
      pointCount: 1,
    });
  });
});
