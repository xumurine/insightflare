import { describe, expect, it, vi } from "vitest";

import {
  apiKeyStatus,
  generateApiKeySecret,
  hashApiKeySecret,
  normalizeApiKeyScopes,
  normalizeApiKeySiteIds,
  parseApiKey,
  timingSafeEqualString,
} from "@/lib/edge/api-key-store";
import type { Env } from "@/lib/edge/types";

describe("api key store utilities", () => {
  it("generates and parses live API keys", () => {
    const generated = generateApiKeySecret();

    expect(generated.apiKey).toMatch(
      /^ifk_live_[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/,
    );
    expect(parseApiKey(generated.apiKey)).toEqual({
      prefix: generated.prefix,
    });
    expect(parseApiKey("not-a-key")).toBeNull();
  });

  it("hashes API keys with HMAC and compares strings safely", async () => {
    const env = { API_KEY_HASH_SECRET: "api-key-secret" } as Env;
    const left = await hashApiKeySecret(env, "ifk_live_prefix.secret");
    const right = await hashApiKeySecret(env, "ifk_live_prefix.secret");
    const other = await hashApiKeySecret(env, "ifk_live_prefix.other");

    expect(left).toBe(right);
    expect(left).not.toBe(other);
    expect(timingSafeEqualString(left, right)).toBe(true);
    expect(timingSafeEqualString(left, other)).toBe(false);
  });

  it("normalizes scopes, site ids, and lifecycle status", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-25T12:00:00Z"));

    expect(
      normalizeApiKeyScopes([
        "analytics:read",
        "unknown",
        "site:read",
        "analytics:read",
      ]),
    ).toEqual(["analytics:read", "site:read"]);
    expect(
      normalizeApiKeySiteIds([" site-1 ", "", "site-1", "site-2"]),
    ).toEqual(["site-1", "site-2"]);
    expect(apiKeyStatus({ expires_at: null, revoked_at: null })).toBe("active");
    expect(apiKeyStatus({ expires_at: 1, revoked_at: null })).toBe("expired");
    expect(apiKeyStatus({ expires_at: null, revoked_at: 2 })).toBe("revoked");

    vi.useRealTimers();
  });
});
