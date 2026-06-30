// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

import { handleUsersAdmin } from "@/lib/edge/admin-users";
import { handleAdminWs } from "@/lib/edge/admin-ws";
import {
  handleLegacyAdminMember,
  handleLegacyAdminProfile,
  handleLegacyAdminSite,
  handleLegacyAdminSiteConfig,
  handleLegacyAdminTeam,
  handleLegacyAdminUser,
} from "@/lib/edge/legacy-admin";
import {
  handleLegacyArchiveFile,
  handleLegacyArchiveManifest,
} from "@/lib/edge/legacy-archive";
import {
  handleLegacyAuthLogin,
  handleLegacyAuthLogout,
} from "@/lib/edge/legacy-auth";
import { handleMapTileRequest } from "@/lib/edge/map-tiles";
import { handleReleasesCompareRequest } from "@/lib/edge/releases-compare";
import { handleWikiSummaryRequest } from "@/lib/edge/wiki-summary";
import { handleWorldCountriesRequest } from "@/lib/edge/world-countries";
import { adminWsRoutes } from "@/lib/hono/routes/admin-ws";
import { authRoutes } from "@/lib/hono/routes/auth";
import { legacyAdminRoutes } from "@/lib/hono/routes/legacy-admin";
import { legacyArchiveRoutes } from "@/lib/hono/routes/legacy-archive";
import { mapTileRoutes } from "@/lib/hono/routes/map-tiles";
import { privateRealtimeRoutes } from "@/lib/hono/routes/private/realtime";
import { privateReleaseRoutes } from "@/lib/hono/routes/private/releases";
import { privateSessionRoutes } from "@/lib/hono/routes/private/session";
import { wikiSummaryRoutes } from "@/lib/hono/routes/wiki-summary";
import { worldCountriesRoutes } from "@/lib/hono/routes/world-countries";

vi.mock("@/lib/edge/admin-ws", () => ({
  handleAdminWs: vi.fn(),
}));

vi.mock("@/lib/edge/admin-users", () => ({
  handleAuthMeAdmin: vi.fn(),
  handleUsersAdmin: vi.fn(),
}));

vi.mock("@/lib/edge/legacy-admin", () => ({
  handleLegacyAdminMember: vi.fn(),
  handleLegacyAdminProfile: vi.fn(),
  handleLegacyAdminSite: vi.fn(),
  handleLegacyAdminSiteConfig: vi.fn(),
  handleLegacyAdminTeam: vi.fn(),
  handleLegacyAdminUser: vi.fn(),
}));

vi.mock("@/lib/edge/legacy-archive", () => ({
  handleLegacyArchiveFile: vi.fn(),
  handleLegacyArchiveManifest: vi.fn(),
}));

vi.mock("@/lib/edge/legacy-auth", () => ({
  handleLegacyAuthLogin: vi.fn(),
  handleLegacyAuthLogout: vi.fn(),
}));

vi.mock("@/lib/edge/map-tiles", () => ({
  handleMapTileRequest: vi.fn(),
}));

vi.mock("@/lib/edge/releases-compare", () => ({
  handleReleasesCompareRequest: vi.fn(),
}));

vi.mock("@/lib/edge/wiki-summary", () => ({
  handleWikiSummaryRequest: vi.fn(),
}));

vi.mock("@/lib/edge/world-countries", () => ({
  handleWorldCountriesRequest: vi.fn(),
}));

const env = { DB: {} };

function request(path: string, init?: RequestInit) {
  return new Request(`https://app.test${path}`, init);
}

describe("thin Hono route modules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(handleAdminWs).mockResolvedValue(new Response("ws"));
    vi.mocked(handleLegacyAuthLogin).mockResolvedValue(new Response("login"));
    vi.mocked(handleLegacyAuthLogout).mockResolvedValue(new Response("logout"));
    vi.mocked(handleLegacyAdminUser).mockResolvedValue(new Response("user"));
    vi.mocked(handleLegacyAdminTeam).mockResolvedValue(new Response("team"));
    vi.mocked(handleLegacyAdminSite).mockResolvedValue(new Response("site"));
    vi.mocked(handleLegacyAdminMember).mockResolvedValue(
      new Response("member"),
    );
    vi.mocked(handleLegacyAdminProfile).mockResolvedValue(
      new Response("profile"),
    );
    vi.mocked(handleLegacyAdminSiteConfig).mockResolvedValue(
      new Response("site-config"),
    );
    vi.mocked(handleLegacyArchiveManifest).mockResolvedValue(
      new Response("manifest"),
    );
    vi.mocked(handleLegacyArchiveFile).mockResolvedValue(new Response("file"));
    vi.mocked(handleMapTileRequest).mockResolvedValue(new Response("tile"));
    vi.mocked(handleReleasesCompareRequest).mockResolvedValue(
      new Response("release"),
    );
    vi.mocked(handleWikiSummaryRequest).mockResolvedValue(new Response("wiki"));
    vi.mocked(handleWorldCountriesRequest).mockResolvedValue(
      new Response("countries"),
    );
  });

  it("forwards auth, ws, resource, and release routes to edge handlers", async () => {
    await expect(
      adminWsRoutes.fetch(request("/api/private/realtime/ws"), env as never),
    ).resolves.toMatchObject({ status: 200 });
    await authRoutes.fetch(request("/login", { method: "POST" }), env as never);
    await authRoutes.fetch(
      request("/logout", { method: "POST" }),
      env as never,
    );
    await mapTileRoutes.fetch(request("/1/2/3.png"), env as never);
    await wikiSummaryRoutes.fetch(request("/wiki-summary"), env as never);
    await worldCountriesRoutes.fetch(request("/world-countries"), env as never);
    await privateRealtimeRoutes.fetch(request("/ws"), env as never);
    await privateReleaseRoutes.fetch(request("/compare"), env as never);

    expect(handleAdminWs).toHaveBeenCalledTimes(2);
    expect(handleLegacyAuthLogin).toHaveBeenCalled();
    expect(handleLegacyAuthLogout).toHaveBeenCalled();
    expect(handleMapTileRequest).toHaveBeenCalledWith(expect.any(Request), {
      z: "1",
      x: "2",
      y: "3.png",
    });
    expect(handleWikiSummaryRequest).toHaveBeenCalled();
    expect(handleWorldCountriesRequest).toHaveBeenCalled();
    expect(handleReleasesCompareRequest).toHaveBeenCalledWith(
      expect.any(Request),
      env,
    );
  });

  it("forwards legacy admin and archive routes to edge handlers", async () => {
    await legacyAdminRoutes.fetch(
      request("/user", { method: "POST" }),
      env as never,
    );
    await legacyAdminRoutes.fetch(
      request("/team", { method: "POST" }),
      env as never,
    );
    await legacyAdminRoutes.fetch(
      request("/site", { method: "POST" }),
      env as never,
    );
    await legacyAdminRoutes.fetch(
      request("/member", { method: "POST" }),
      env as never,
    );
    await legacyAdminRoutes.fetch(
      request("/profile", { method: "POST" }),
      env as never,
    );
    await legacyAdminRoutes.fetch(
      request("/site-config", { method: "POST" }),
      env as never,
    );
    await legacyArchiveRoutes.fetch(request("/manifest"), env as never);
    await legacyArchiveRoutes.fetch(request("/file"), env as never);
    await legacyArchiveRoutes.fetch(
      request("/file", { method: "HEAD" }),
      env as never,
    );

    expect(handleLegacyAdminUser).toHaveBeenCalled();
    expect(handleLegacyAdminTeam).toHaveBeenCalled();
    expect(handleLegacyAdminSite).toHaveBeenCalled();
    expect(handleLegacyAdminMember).toHaveBeenCalled();
    expect(handleLegacyAdminProfile).toHaveBeenCalled();
    expect(handleLegacyAdminSiteConfig).toHaveBeenCalled();
    expect(handleLegacyArchiveManifest).toHaveBeenCalledWith(
      expect.any(Request),
      env,
    );
    expect(handleLegacyArchiveFile).toHaveBeenCalledTimes(2);
  });

  it("returns not found from private wildcard routes", async () => {
    vi.mocked(handleUsersAdmin).mockResolvedValue(new Response("me"));

    const sessionMiss = await privateSessionRoutes.fetch(
      request("/missing"),
      env as never,
    );
    const realtimeMiss = await privateRealtimeRoutes.fetch(
      request("/missing"),
      env as never,
    );
    const releasesMiss = await privateReleaseRoutes.fetch(
      request("/missing"),
      env as never,
    );

    expect(sessionMiss.status).toBe(404);
    expect(realtimeMiss.status).toBe(404);
    expect(releasesMiss.status).toBe(404);
  });
});
