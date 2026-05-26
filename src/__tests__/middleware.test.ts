import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function request(
  path: string,
  init?: {
    headers?: HeadersInit;
    cookies?: Record<string, string>;
  },
): NextRequest {
  const headers = new Headers(init?.headers);
  const cookieHeader = Object.entries(init?.cookies ?? {})
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("; ");
  if (cookieHeader) headers.set("cookie", cookieHeader);
  const nextRequest = new NextRequest(`https://app.test${path}`, {
    headers: Object.fromEntries((headers as any).entries()),
  });
  if (init?.cookies) {
    Object.defineProperty(nextRequest, "cookies", {
      configurable: true,
      value: {
        get: (name: string) => {
          const value = init.cookies?.[name];
          return value === undefined ? undefined : { name, value };
        },
      },
    });
  }
  return nextRequest;
}

async function responseJson(response: Response) {
  return JSON.parse(await response.text()) as unknown;
}

async function callMiddleware(request: NextRequest): Promise<Response> {
  const { middleware } = await import("@/middleware");
  return middleware(request);
}

async function sessionCookies(): Promise<Record<string, string>> {
  const { createSessionToken } = await import("@/lib/session");
  return {
    if_session: await createSessionToken(
      {
        userId: "user-1",
        username: "admin",
        displayName: "Admin User",
        systemRole: "admin",
      },
      60 * 60,
    ),
  };
}

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    ...init,
  });
}

describe("middleware", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "");
    vi.stubEnv("DASHBOARD_SESSION_SECRET", "test-secret");
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("redirects non-localized paths to the preferred locale while preserving search", async () => {
    const response = await callMiddleware(
      request("/app?range=7d", {
        headers: { "accept-language": "zh-CN,zh;q=0.9,en;q=0.8" },
      }),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://app.test/zh/app?range=7d",
    );
    expect(response.headers.get("x-pathname")).toBe("/zh/app");
  });

  it("redirects the root path to the default localized app entry", async () => {
    const response = await callMiddleware(
      request("/?utm=home", {
        headers: { "accept-language": "fr-CA,fr;q=0.9" },
        cookies: { if_locale: "invalid" },
      }),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://app.test/en/app?utm=home",
    );
    expect(response.headers.get("x-pathname")).toBe("/en/app");
    expect(response.headers.get("set-cookie")).toContain("if_locale=en");
  });

  it("uses locale cookies when accept-language has no supported locale", async () => {
    const response = await callMiddleware(
      request("/reports/?range=30d", {
        headers: { "accept-language": "fr-CA,fr;q=0.9" },
        cookies: { if_locale: "zh" },
      }),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://app.test/zh/reports/?range=30d",
    );
    expect(response.headers.get("x-pathname")).toBe("/zh/reports");
    expect(response.headers.get("set-cookie")).toContain("if_locale=zh");
  });

  it("uses exact accept-language locale matches before cookies", async () => {
    const response = await callMiddleware(
      request("/login", {
        headers: { "accept-language": "zh,en;q=0.8" },
        cookies: { if_locale: "en" },
      }),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://app.test/zh/login");
    expect(response.headers.get("set-cookie")).toContain("if_locale=zh");
  });

  it("redirects locale roots to the localized app entry and sets the locale cookie", async () => {
    const response = await callMiddleware(request("/zh"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://app.test/zh/app");
    expect(response.headers.get("set-cookie")).toContain("if_locale=zh");
  });

  it("normalizes localized root trailing slashes while preserving search", async () => {
    const response = await callMiddleware(request("/zh/?from=nav"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://app.test/zh/app/?from=nav",
    );
    expect(response.headers.get("x-pathname")).toBe("/zh/app");
    expect(response.headers.get("set-cookie")).toContain("if_locale=zh");
  });

  it("keeps redirect Location pathname and x-pathname consistent", async () => {
    const response = await callMiddleware(request("/zh/?from=nav"));
    const location = response.headers.get("location");

    expect(response.status).toBe(307);
    expect(location).not.toBeNull();
    expect(new URL(location!).pathname).toBe(
      response.headers.get("x-pathname"),
    );
  });

  it("returns unauthorized JSON for protected API routes without a session", async () => {
    const response = await callMiddleware(request("/api/admin/users"));

    expect(response.status).toBe(401);
    expect(await responseJson(response)).toEqual({
      ok: false,
      error: "unauthorized",
    });
  });

  it("returns unauthorized JSON for archive API routes without a session", async () => {
    const response = await callMiddleware(request("/api/archive/manifest"));

    expect(response.status).toBe(401);
    expect(await responseJson(response)).toEqual({
      ok: false,
      error: "unauthorized",
    });
  });

  it("passes through protected API routes with a valid session", async () => {
    const cookies = await sessionCookies();

    const adminApi = await callMiddleware(
      request("/api/admin/users", { cookies }),
    );
    const archiveApi = await callMiddleware(
      request("/api/archive/manifest", { cookies }),
    );

    expect(adminApi.status).toBe(200);
    expect(adminApi.headers.get("x-middleware-next")).toBe("1");
    expect(archiveApi.status).toBe(200);
    expect(archiveApi.headers.get("x-middleware-next")).toBe("1");
  });

  it("uses the Cloudflare runtime session secret when process env is empty", async () => {
    vi.stubEnv("DASHBOARD_SESSION_SECRET", "cloudflare-secret");
    const cookies = await sessionCookies();
    vi.stubEnv("DASHBOARD_SESSION_SECRET", "");
    vi.stubEnv("SESSION_SECRET", "");
    vi.doMock("@opennextjs/cloudflare", () => ({
      getCloudflareContext: vi.fn(async () => ({
        env: { DASHBOARD_SESSION_SECRET: "cloudflare-secret" },
      })),
    }));

    const response = await callMiddleware(
      request("/api/admin/users", { cookies }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("rejects session cookies when no session secret is available", async () => {
    const cookies = await sessionCookies();
    vi.stubEnv("DASHBOARD_SESSION_SECRET", "");
    vi.stubEnv("SESSION_SECRET", "");
    vi.doMock("@opennextjs/cloudflare", () => ({
      getCloudflareContext: vi.fn(async () => ({ env: {} })),
    }));

    const response = await callMiddleware(
      request("/api/admin/users", { cookies }),
    );

    expect(response.status).toBe(401);
    expect(await responseJson(response)).toEqual({
      ok: false,
      error: "unauthorized",
    });
  });

  it("redirects unauthenticated app routes to login with a next parameter", async () => {
    const response = await callMiddleware(
      request("/en/app/team-a?tab=overview"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://app.test/en/login?tab=overview&next=%2Fen%2Fapp%2Fteam-a%3Ftab%3Doverview",
    );
    expect(response.headers.get("set-cookie")).toContain("if_locale=en");
  });

  it("redirects authenticated app roots to the only team from the profile", async () => {
    const cookies = await sessionCookies();
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        data: {
          teams: [{ slug: "  " }, { slug: "team-one" }, { slug: null }],
        },
      }),
    );

    const response = await callMiddleware(
      request("/en/app?range=7d", { cookies }),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://app.test/en/app/team-one",
    );
    expect(response.headers.get("x-pathname")).toBe("/en/app/team-one");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://app.test/api/private/admin/auth/me",
      {
        method: "GET",
        headers: {
          authorization: `Bearer ${cookies.if_session}`,
        },
        cache: "no-store",
      },
    );
  });

  it("passes authenticated app roots through when the profile has multiple teams", async () => {
    const cookies = await sessionCookies();
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        data: { teams: [{ slug: "team-one" }, { slug: "team-two" }] },
      }),
    );

    const response = await callMiddleware(request("/en/app", { cookies }));

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("x-pathname")).toBe("/en/app");
    expect(response.headers.get("set-cookie")).toContain("if_locale=en");
  });

  it("passes authenticated app roots through when profile loading fails", async () => {
    const cookies = await sessionCookies();
    vi.mocked(fetch).mockRejectedValueOnce(new Error("network failed"));

    const response = await callMiddleware(request("/zh/app", { cookies }));

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("x-pathname")).toBe("/zh/app");
    expect(response.headers.get("set-cookie")).toContain("if_locale=zh");
  });

  it("passes authenticated app roots through when profile payloads are unusable", async () => {
    const cookies = await sessionCookies();
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ ok: false }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: { teams: null } }))
      .mockResolvedValueOnce(jsonResponse({}, { status: 503 }));

    const notOkPayload = await callMiddleware(request("/en/app", { cookies }));
    const missingTeams = await callMiddleware(request("/en/app", { cookies }));
    const failedResponse = await callMiddleware(
      request("/en/app", { cookies }),
    );

    for (const response of [notOkPayload, missingTeams, failedResponse]) {
      expect(response.status).toBe(200);
      expect(response.headers.get("x-middleware-next")).toBe("1");
      expect(response.headers.get("x-pathname")).toBe("/en/app");
    }
  });

  it.each([
    ["settings", "https://app.test/en/app/team-a/settings"],
    ["members", "https://app.test/en/app/team-a/members"],
  ])("redirects authenticated legacy %s tabs", async (tab, location) => {
    const response = await callMiddleware(
      request(`/en/app/team-a?tab=${tab}&range=7d`, {
        cookies: await sessionCookies(),
      }),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(location);
    expect(response.headers.get("x-pathname")).toBe(
      location.replace("https://app.test", ""),
    );
  });

  it("passes authenticated app team pages through for non-legacy tabs", async () => {
    const response = await callMiddleware(
      request("/en/app/team-a?tab=overview", {
        cookies: await sessionCookies(),
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("x-pathname")).toBe("/en/app/team-a");
    expect(response.headers.get("set-cookie")).toContain("if_locale=en");
  });

  it("redirects authenticated localized login pages to the app entry", async () => {
    const response = await callMiddleware(
      request("/zh/login?next=%2Fzh%2Fapp", {
        cookies: await sessionCookies(),
      }),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://app.test/zh/app");
    expect(response.headers.get("x-pathname")).toBe("/zh/app");
    expect(response.headers.get("set-cookie")).toContain("if_locale=zh");
  });

  it("normalizes demo app and login routes without auth checks", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "1");

    const appRoot = await callMiddleware(request("/en/app"));
    expect(appRoot.status).toBe(307);
    expect(appRoot.headers.get("location")).toBe(
      "https://app.test/en/app/xeoos-team",
    );

    const login = await callMiddleware(request("/en/login"));
    expect(login.status).toBe(307);
    expect(login.headers.get("location")).toBe("https://app.test/en/app");
  });

  it("redirects demo non-localized paths using locale negotiation", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "1");

    const response = await callMiddleware(
      request("/reports?range=7d", {
        headers: { "accept-language": "zh-CN,zh;q=0.9" },
      }),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://app.test/zh/reports?range=7d",
    );
    expect(response.headers.get("x-pathname")).toBe("/zh/reports");
  });

  it("redirects demo localized roots while preserving search", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "1");

    const response = await callMiddleware(request("/en?from=root"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://app.test/en/app?from=root",
    );
    expect(response.headers.get("set-cookie")).toContain("if_locale=en");
  });

  it("passes demo localized pages through with pathname and locale cookie", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "1");

    const response = await callMiddleware(request("/zh/app/xeoos-team/pages"));

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("x-pathname")).toBe("/zh/app/xeoos-team/pages");
    expect(response.headers.get("set-cookie")).toContain("if_locale=zh");
  });

  it("passes through websocket and localized public routes", async () => {
    const websocket = await callMiddleware(request("/admin/ws"));
    expect(websocket.status).toBe(200);
    expect(websocket.headers.get("x-middleware-next")).toBe("1");

    const publicPage = await callMiddleware(request("/zh/login"));
    expect(publicPage.status).toBe(200);
    expect(publicPage.headers.get("x-middleware-next")).toBe("1");
    expect(publicPage.headers.get("x-pathname")).toBe("/zh/login");
    expect(publicPage.headers.get("set-cookie")).toContain("if_locale=zh");
  });

  it("allows admin and archive APIs directly in demo mode", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "1");

    const adminApi = await callMiddleware(request("/api/admin/users"));
    const archiveApi = await callMiddleware(request("/api/archive/manifest"));

    expect(adminApi.status).toBe(200);
    expect(adminApi.headers.get("x-middleware-next")).toBe("1");
    expect(archiveApi.status).toBe(200);
    expect(archiveApi.headers.get("x-middleware-next")).toBe("1");
  });
});
