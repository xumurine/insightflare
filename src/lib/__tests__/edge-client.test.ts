import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getSessionToken } from "@/lib/auth";
import {
  addAdminMember,
  createAdminSite,
  createAdminTeam,
  createAdminUser,
  fetchAdminMe,
  fetchAdminMembers,
  fetchAdminScriptSnippet,
  fetchAdminSiteConfig,
  fetchAdminSites,
  fetchAdminTeams,
  fetchAdminUsers,
  fetchPublicOverview,
  fetchPublicPages,
  fetchPublicReferrers,
  fetchPublicTrend,
  loginAdminAccount,
  removeAdminMember,
  removeAdminSite,
  removeAdminTeam,
  removeAdminUser,
  transferAdminTeamOwner,
  updateAdminMemberRole,
  updateAdminSite,
  updateAdminTeam,
  updateAdminUser,
  updateMyProfile,
  upsertAdminSiteConfig,
} from "@/lib/edge-client";
import { handleDemoRequest } from "@/lib/realtime/mock";

vi.mock("@/lib/auth", () => ({
  getSessionToken: vi.fn(),
}));

vi.mock("@/lib/realtime/mock", () => ({
  handleDemoRequest: vi.fn(),
}));

const getSessionTokenMock = vi.mocked(getSessionToken);
const handleDemoRequestMock = vi.mocked(handleDemoRequest);

function fetchMock() {
  return vi.mocked(fetch);
}

function lastFetchCall(): [string, RequestInit] {
  return fetchMock().mock.calls.at(-1) as [string, RequestInit];
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status });
}

describe("edge client request wrappers", () => {
  beforeEach(() => {
    vi.stubEnv("INSIGHTFLARE_EDGE_URL", "https://edge.example.test");
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "");
    getSessionTokenMock.mockReset();
    getSessionTokenMock.mockResolvedValue("session-token");
    handleDemoRequestMock.mockReset();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() =>
        Promise.resolve(
          jsonResponse({
            ok: true,
            data: {
              id: "result-1",
              teamId: "team-1",
              userId: "user-1",
              siteId: "site-1",
              removed: true,
              role: "member",
              user: { id: "user-1", username: "admin" },
              teams: [{ id: "team-1" }],
            },
            interval: "day",
          }),
        ),
      ),
    );
  });

  afterEach(() => {
    vi.doUnmock("next/headers");
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("builds public requests without session authorization", async () => {
    await fetchPublicOverview("public site", { from: 10, to: 20 });

    const [url, init] = lastFetchCall();
    const headers = init.headers as Headers;

    expect(url).toBe(
      "https://edge.example.test/api/public/public%20site/overview?from=10&to=20",
    );
    expect(init.method).toBe("GET");
    expect(init.cache).toBe("no-store");
    expect(headers.has("authorization")).toBe(false);
    expect(getSessionTokenMock).not.toHaveBeenCalled();
  });

  it("encodes public slugs and query params", async () => {
    await fetchPublicOverview("public/site?draft=true", { from: 0, to: 1 });

    const [url] = lastFetchCall();

    expect(url).toBe(
      "https://edge.example.test/api/public/public%2Fsite%3Fdraft%3Dtrue/overview?from=0&to=1",
    );
  });

  it("adds session authorization for private GET requests and serializes filters", async () => {
    await fetchAdminTeams("user-1");

    const [firstUrl, init] = lastFetchCall();
    let url = firstUrl;
    const headers = init.headers as Headers;
    expect(url).toBe(
      "https://edge.example.test/api/private/admin/teams?userId=user-1",
    );
    expect(headers.get("authorization")).toBe("Bearer session-token");

    await fetchPublicTrend("slug", { from: 1, to: 2 });
    [url] = lastFetchCall();
    expect(url).toBe(
      "https://edge.example.test/api/public/slug/trend?from=1&to=2&interval=day",
    );

    await fetchPublicPages("slug", { from: 1, to: 2 });
    [url] = lastFetchCall();
    expect(url).toBe(
      "https://edge.example.test/api/public/slug/pages?from=1&to=2&limit=8",
    );

    await fetchPublicReferrers("slug", { from: 1, to: 2 });
    [url] = lastFetchCall();
    expect(url).toBe(
      "https://edge.example.test/api/public/slug/referrers?from=1&to=2&limit=8",
    );
  });

  it("omits optional query params when they are not provided", async () => {
    await fetchAdminTeams();

    const [url] = lastFetchCall();

    expect(url).toBe("https://edge.example.test/api/private/admin/teams");
  });

  it("serializes POST and PATCH request bodies for admin wrappers", async () => {
    await createAdminTeam({ name: "Team", slug: "team" });

    let [url, init] = lastFetchCall();
    const headers = init.headers as Headers;
    expect(url).toBe("https://edge.example.test/api/private/admin/teams");
    expect(init.method).toBe("POST");
    expect(headers.get("content-type")).toBe("application/json");
    expect(init.body).toBe(JSON.stringify({ name: "Team", slug: "team" }));

    await updateAdminTeam({ teamId: "team-1", name: "Renamed" });
    [url, init] = lastFetchCall();
    expect(url).toBe("https://edge.example.test/api/private/admin/teams");
    expect(init.method).toBe("PATCH");
    expect(init.body).toBe(
      JSON.stringify({ teamId: "team-1", name: "Renamed" }),
    );

    await removeAdminTeam({ teamId: "team-1" });
    [, init] = lastFetchCall();
    expect(init.body).toBe(
      JSON.stringify({ teamId: "team-1", intent: "remove" }),
    );

    await updateAdminMemberRole({
      teamId: "team-1",
      userId: "user-1",
      role: "member",
    });
    [, init] = lastFetchCall();
    expect(init.body).toBe(
      JSON.stringify({
        teamId: "team-1",
        userId: "user-1",
        role: "member",
        intent: "update_role",
      }),
    );
  });

  it("unwraps data for the remaining admin wrappers", async () => {
    await fetchAdminSites("team-1");
    await createAdminSite({
      teamId: "team-1",
      name: "Docs",
      domain: "docs.example.test",
      publicEnabled: true,
    });
    await updateAdminSite({ siteId: "site-1", name: "Docs" });
    await removeAdminSite({ siteId: "site-1" });
    await fetchAdminMembers("team-1");
    await addAdminMember({
      teamId: "team-1",
      identifier: "user@example.test",
      role: "member",
    });
    await removeAdminMember({ teamId: "team-1", userId: "user-1" });
    await fetchAdminSiteConfig("site-1");
    await upsertAdminSiteConfig({
      siteId: "site-1",
      config: { trackingStrength: "smart" },
    });
    await fetchAdminScriptSnippet("site-1");
    await loginAdminAccount({ username: "admin", password: "secret" });
    await fetchAdminMe();
    await fetchAdminUsers();
    await createAdminUser({
      username: "new-user",
      email: "new@example.test",
      password: "supersecret",
      systemRole: "user",
    });
    await updateAdminUser({ userId: "user-1", email: "new@example.test" });
    await removeAdminUser({ userId: "user-1" });
    await updateMyProfile({ name: "Admin User", timeZone: "Asia/Shanghai" });
    await transferAdminTeamOwner({
      teamId: "team-1",
      newOwnerUserId: "user-2",
    });

    expect(fetchMock()).toHaveBeenCalledTimes(18);
    const urls = fetchMock().mock.calls.map(([url]) => String(url));
    expect(urls).toContain(
      "https://edge.example.test/api/private/admin/sites?teamId=team-1",
    );
    expect(urls).toContain(
      "https://edge.example.test/api/private/admin/script-snippet?siteId=site-1",
    );
    expect(urls).toContain(
      "https://edge.example.test/api/private/admin/auth/me",
    );
    expect(urls).toContain("https://edge.example.test/api/private/admin/users");
  });

  it("throws descriptive errors for non-OK edge responses", async () => {
    fetchMock().mockResolvedValueOnce(new Response("denied", { status: 403 }));

    await expect(fetchAdminUsers()).rejects.toThrow(
      "Edge API failed (403 GET /api/private/admin/users): denied",
    );
  });

  it("includes JSON API error bodies in non-OK edge response errors", async () => {
    fetchMock().mockResolvedValueOnce(
      jsonResponse({ error: "invalid_request", reason: "Missing team" }, 400),
    );

    await expect(fetchAdminSites("team-1")).rejects.toThrow(
      'Edge API failed (400 GET /api/private/admin/sites): {"error":"invalid_request","reason":"Missing team"}',
    );
  });

  it("propagates network failures from fetch", async () => {
    fetchMock().mockRejectedValueOnce(new TypeError("fetch failed"));

    await expect(fetchAdminUsers()).rejects.toThrow("fetch failed");
  });

  it("continues without authorization when the session token is unavailable", async () => {
    getSessionTokenMock.mockRejectedValueOnce(new Error("outside request"));

    await fetchAdminMe();

    const [, init] = lastFetchCall();
    const headers = init.headers as Headers;
    expect(headers.has("authorization")).toBe(false);
  });

  it("continues without authorization when no session token is returned", async () => {
    getSessionTokenMock.mockResolvedValueOnce("");

    await fetchAdminMe();

    const [, init] = lastFetchCall();
    const headers = init.headers as Headers;
    expect(headers.has("authorization")).toBe(false);
  });

  it("derives the edge base URL from forwarded server headers", async () => {
    vi.stubEnv("INSIGHTFLARE_EDGE_URL", " ");
    vi.doMock("next/headers", () => ({
      headers: vi.fn().mockResolvedValue(
        new Headers({
          "x-forwarded-host": "dashboard.example.test",
          "x-forwarded-proto": "https",
        }),
      ),
    }));

    await fetchAdminUsers();

    const [url] = lastFetchCall();
    expect(url).toBe("https://dashboard.example.test/api/private/admin/users");
  });

  it("uses https for non-local server hosts when forwarded proto is absent", async () => {
    vi.stubEnv("INSIGHTFLARE_EDGE_URL", "");
    vi.doMock("next/headers", () => ({
      headers: vi.fn().mockResolvedValue(new Headers({ host: "app.test" })),
    }));

    await fetchAdminUsers();

    const [url] = lastFetchCall();
    expect(url).toBe("https://app.test/api/private/admin/users");
  });

  it("falls back when server headers do not include a host", async () => {
    vi.stubEnv("INSIGHTFLARE_EDGE_URL", "");
    vi.doMock("next/headers", () => ({
      headers: vi.fn().mockResolvedValue(new Headers()),
    }));

    await fetchAdminUsers();

    const [url] = lastFetchCall();
    expect(url).toBe("http://127.0.0.1:8787/api/private/admin/users");
  });

  it("uses http for localhost server headers and falls back when headers fail", async () => {
    vi.stubEnv("INSIGHTFLARE_EDGE_URL", "");
    vi.doMock("next/headers", () => ({
      headers: vi
        .fn()
        .mockResolvedValueOnce(new Headers({ host: "localhost:3000" }))
        .mockRejectedValueOnce(new Error("outside request")),
    }));

    await fetchAdminUsers();
    expect(lastFetchCall()[0]).toBe(
      "http://localhost:3000/api/private/admin/users",
    );

    await fetchAdminUsers();
    expect(lastFetchCall()[0]).toBe(
      "http://127.0.0.1:8787/api/private/admin/users",
    );
  });

  it("delegates to the realtime demo handler in demo mode", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "1");
    handleDemoRequestMock.mockReturnValue({
      ok: true,
      data: [{ bucket: 1 }],
    });

    const result = await fetchPublicTrend("demo-site", { from: 1, to: 2 });

    expect(result).toEqual({ ok: true, data: [{ bucket: 1 }] });
    expect(handleDemoRequestMock).toHaveBeenCalledWith({
      path: "/api/public/demo-site/trend",
      method: undefined,
      params: { from: 1, to: 2, interval: "day" },
      body: undefined,
    });
    expect(fetchMock()).not.toHaveBeenCalled();
  });
});
