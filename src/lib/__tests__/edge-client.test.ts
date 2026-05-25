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

  it("adds session authorization for private GET requests and serializes filters", async () => {
    await fetchAdminTeams("user-1");

    let [url, init] = lastFetchCall();
    let headers = init.headers as Headers;
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

  it("serializes POST and PATCH request bodies for admin wrappers", async () => {
    await createAdminTeam({ name: "Team", slug: "team" });

    let [url, init] = lastFetchCall();
    let headers = init.headers as Headers;
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

  it("continues without authorization when the session token is unavailable", async () => {
    getSessionTokenMock.mockRejectedValueOnce(new Error("outside request"));

    await fetchAdminMe();

    const [, init] = lastFetchCall();
    const headers = init.headers as Headers;
    expect(headers.has("authorization")).toBe(false);
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
