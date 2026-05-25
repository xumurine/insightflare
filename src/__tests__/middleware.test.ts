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
  return new NextRequest(`https://app.test${path}`, { headers });
}

async function responseJson(response: Response) {
  return JSON.parse(await response.text()) as unknown;
}

async function callMiddleware(request: NextRequest): Promise<Response> {
  const { middleware } = await import("@/middleware");
  return middleware(request);
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

  it("redirects locale roots to the localized app entry and sets the locale cookie", async () => {
    const response = await callMiddleware(request("/zh"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://app.test/zh/app");
    expect(response.headers.get("set-cookie")).toContain("if_locale=zh");
  });

  it("returns unauthorized JSON for protected API routes without a session", async () => {
    const response = await callMiddleware(request("/api/admin/users"));

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
