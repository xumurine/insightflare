import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  type ApiKeyRow,
  generateApiKeySecret,
  hashApiKeySecret,
} from "@/lib/edge/api-key-store";
import { handleApiV1 } from "@/lib/edge/api-v1";
import type { Env } from "@/lib/edge/types";

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
  } as Env;
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
      scopes_json: JSON.stringify(["site:read", "analytics:read"]),
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

describe("api v1 gateway", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

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
        {
          includes: ["FROM sites", "WHERE team_id=?"],
          all: [
            {
              id: "site-1",
              teamId: "team-1",
              name: "One",
              domain: "one.test",
              publicEnabled: 0,
              publicSlug: null,
              createdAt: 1,
              updatedAt: 1,
            },
            {
              id: "site-2",
              teamId: "team-1",
              name: "Two",
              domain: "two.test",
              publicEnabled: 1,
              publicSlug: "two",
              createdAt: 2,
              updatedAt: 2,
            },
          ],
        },
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
});
