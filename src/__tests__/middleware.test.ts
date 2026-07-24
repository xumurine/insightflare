import { afterEach, describe, expect, it, vi } from "vitest";

import type { Env } from "@/lib/edge/types";
import { createSessionToken } from "@/lib/session";
import { middleware } from "@/middleware";

const baseEnv = { MAIN_SECRET: "test-secret" } as unknown as Env;

function request(
  path: string,
  options?: { cookies?: Record<string, string>; headers?: HeadersInit },
): Request {
  const headers = new Headers(options?.headers);
  const cookies = Object.entries(options?.cookies ?? {})
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("; ");
  if (cookies) headers.set("cookie", cookies);
  const result = new Request(`https://app.test${path}`, { headers });
  if (cookies) result.headers.set("cookie", cookies);
  return result;
}

describe("page request middleware", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("localizes non-prefixed paths and preserves search", async () => {
    const response = await middleware(
      request("/reports?range=30d", {
        headers: { "accept-language": "zh-CN,zh;q=0.9" },
      }),
      baseEnv,
    );
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://app.test/zh/reports?range=30d",
    );
  });

  it("uses the locale cookie when the browser language is unsupported", async () => {
    const response = await middleware(
      request("/", {
        headers: { "accept-language": "fr-CA" },
        cookies: { if_locale: "ja" },
      }),
      baseEnv,
    );
    expect(response.headers.get("location")).toBe("https://app.test/ja/app");
  });

  it("redirects a locale root to its app entry", async () => {
    const response = await middleware(request("/zh?from=root"), baseEnv);
    expect(response.headers.get("location")).toBe(
      "https://app.test/zh/app?from=root",
    );
  });

  it("redirects to runtime configuration when no root secret exists", async () => {
    const response = await middleware(request("/en/login"), {} as Env);
    expect(response.headers.get("location")).toBe(
      "https://app.test/en/runtime-config-error",
    );
  });

  it("allows the runtime configuration page without a secret", async () => {
    const response = await middleware(
      request("/en/runtime-config-error"),
      {} as Env,
    );
    expect(response.status).toBe(200);
  });

  it("redirects unauthenticated app requests to login with next", async () => {
    const response = await middleware(
      request("/en/app/team-a?range=7d"),
      baseEnv,
    );
    expect(response.headers.get("location")).toBe(
      "https://app.test/en/login?next=%2Fen%2Fapp%2Fteam-a%3Frange%3D7d",
    );
  });

  it("allows authenticated app requests", async () => {
    vi.stubEnv("MAIN_SECRET", "test-secret");
    const token = await createSessionToken(
      {
        userId: "user-1",
        username: "admin",
        displayName: "Admin",
        systemRole: "admin",
      },
      3600,
    );
    const response = await middleware(
      request("/en/app/team-a", { cookies: { if_session: token } }),
      baseEnv,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("x-pathname")).toBe("/en/app/team-a");
  });

  it("redirects a sole team directly from the app entry", async () => {
    vi.stubEnv("MAIN_SECRET", "test-secret");
    const token = await createSessionToken(
      {
        userId: "user-1",
        username: "admin",
        displayName: "Admin",
        systemRole: "admin",
      },
      3600,
    );
    const internalFetch = vi.fn(async () =>
      Response.json({ ok: true, data: { teams: [{ slug: "team-one" }] } }),
    );
    const response = await middleware(
      request("/en/app", { cookies: { if_session: token } }),
      baseEnv,
      internalFetch,
    );
    expect(response.headers.get("location")).toBe(
      "https://app.test/en/app/team-one",
    );
  });

  it("normalizes legacy team tab query parameters", async () => {
    vi.stubEnv("MAIN_SECRET", "test-secret");
    const token = await createSessionToken(
      {
        userId: "user-1",
        username: "admin",
        displayName: "Admin",
        systemRole: "admin",
      },
      3600,
    );
    const response = await middleware(
      request("/en/app/team-a?tab=settings", {
        cookies: { if_session: token },
      }),
      baseEnv,
    );
    expect(response.headers.get("location")).toBe(
      "https://app.test/en/app/team-a/settings",
    );
  });

  it("uses deterministic demo redirects and bypasses authentication", async () => {
    const demoEnv = { ...baseEnv, DEMO_MODE: "1" };
    const app = await middleware(request("/zh/app"), demoEnv);
    expect(app.headers.get("location")).toBe(
      "https://app.test/zh/app/xeoos-team",
    );
    const page = await middleware(
      request("/zh/app/xeoos-team/widgets"),
      demoEnv,
    );
    expect(page.status).toBe(200);
  });
});
