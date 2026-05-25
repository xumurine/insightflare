import { describe, expect, it } from "vitest";

import {
  createMockRealtimeSocket,
  handleDemoRequest,
  type RealtimeSocketLike,
} from "@/lib/realtime/mock";

const SITE_ID = "demo-site-001";

function ok(result: unknown): { ok: boolean; data: unknown } {
  return result as { ok: boolean; data: unknown };
}

describe("mock — handleDemoRequest", () => {
  describe("write operations", () => {
    it("returns user+teams for POST /auth/login", () => {
      const res = ok(
        handleDemoRequest({ path: "/api/private/auth/login", method: "POST" }),
      );
      expect(res.ok).toBe(true);
      const data = res.data as Record<string, unknown>;
      expect(data.user).toBeTruthy();
      expect(Array.isArray(data.teams)).toBe(true);
    });

    it("returns user+teams for POST /auth/me", () => {
      const res = ok(
        handleDemoRequest({ path: "/api/private/auth/me", method: "POST" }),
      );
      expect(res.ok).toBe(true);
    });

    it("PATCH /profile merges body into demo user", () => {
      const res = ok(
        handleDemoRequest({
          path: "/api/private/profile",
          method: "PATCH",
          body: { name: "New Name", timeZone: "Asia/Shanghai" },
        }),
      );
      expect(res.ok).toBe(true);
      const data = res.data as Record<string, unknown>;
      expect(data.name).toBe("New Name");
      expect(data.timeZone).toBeTruthy();
    });

    it("PATCH /profile keeps existing timeZone when key is absent", () => {
      const res = ok(
        handleDemoRequest({
          path: "/api/private/profile",
          method: "PATCH",
          body: { name: "Only Name" },
        }),
      );
      const data = res.data as Record<string, unknown>;
      expect(data.name).toBe("Only Name");
      expect("timeZone" in data).toBe(true);
    });

    it("PATCH /profile tolerates non-object bodies", () => {
      const res = ok(
        handleDemoRequest({
          path: "/api/private/profile",
          method: "PATCH",
          body: "not-an-object",
        }),
      );
      expect(res.ok).toBe(true);
    });

    it("PUT /site-config merges config body", () => {
      const res = ok(
        handleDemoRequest({
          path: "/api/private/site-config",
          method: "PUT",
          body: { config: { foo: "bar" } },
        }),
      );
      expect(res.ok).toBe(true);
    });

    it("PUT /site-config tolerates missing config", () => {
      const res = ok(
        handleDemoRequest({
          path: "/api/private/site-config",
          method: "PUT",
          body: {},
        }),
      );
      expect(res.ok).toBe(true);
    });

    it("returns generic success for unrecognized writes", () => {
      const res = ok(
        handleDemoRequest({ path: "/api/private/unknown", method: "DELETE" }),
      );
      expect(res.ok).toBe(true);
    });
  });

  describe("admin routes", () => {
    it("returns auth/me data", () => {
      const res = ok(handleDemoRequest({ path: "/api/admin/admin/auth/me" }));
      expect(res.ok).toBe(true);
    });

    it("returns users", () => {
      const res = ok(handleDemoRequest({ path: "/api/admin/admin/users" }));
      expect(Array.isArray(res.data)).toBe(true);
    });

    it("returns teams", () => {
      const res = ok(handleDemoRequest({ path: "/api/admin/admin/teams" }));
      expect(Array.isArray(res.data)).toBe(true);
    });

    it("returns sites", () => {
      const res = ok(handleDemoRequest({ path: "/api/admin/admin/sites" }));
      expect(Array.isArray(res.data)).toBe(true);
    });

    it("returns members", () => {
      const res = ok(handleDemoRequest({ path: "/api/admin/admin/members" }));
      expect(Array.isArray(res.data)).toBe(true);
    });

    it("returns site config", () => {
      const res = ok(
        handleDemoRequest({ path: "/api/admin/admin/site-config" }),
      );
      expect(res.ok).toBe(true);
    });

    it("returns script snippet", () => {
      const res = ok(
        handleDemoRequest({
          path: "/api/admin/admin/script-snippet",
          params: { siteId: SITE_ID },
        }),
      );
      expect(res.ok).toBe(true);
    });

    it("returns system performance metrics", () => {
      const res = ok(
        handleDemoRequest({ path: "/api/admin/admin/system-performance" }),
      );
      expect(res.ok).toBe(true);
    });

    it("returns DO diagnostic", () => {
      const res = ok(
        handleDemoRequest({ path: "/api/admin/admin/do-diagnostic" }),
      );
      expect(res.ok).toBe(true);
    });

    it("returns system-performance with different windowMinutes values", () => {
      for (const minutes of [5, 30, 180, 720, 1440]) {
        const res = handleDemoRequest({
          path: "/api/admin/admin/system-performance",
          params: { windowMinutes: minutes },
        });
        expect(res).toBeDefined();
      }
    });
  });

  describe("analytics queries", () => {
    const now = Date.now();
    const baseParams = {
      siteId: SITE_ID,
      from: now - 3_600_000,
      to: now,
    };

    const routes = [
      "/api/private/filter-options",
      "/api/private/overview",
      "/api/private/overview-page-path",
      "/api/private/overview-page-title",
      "/api/private/overview-page-hostname",
      "/api/private/overview-page-entry",
      "/api/private/overview-page-exit",
      "/api/private/overview-source-domain",
      "/api/private/overview-source-link",
      "/api/private/overview-client-browser",
      "/api/private/overview-client-os-version",
      "/api/private/overview-client-device-type",
      "/api/private/overview-client-language",
      "/api/private/overview-client-screen-size",
      "/api/private/overview-geo-country",
      "/api/private/overview-geo-region",
      "/api/private/overview-geo-city",
      "/api/private/overview-geo-continent",
      "/api/private/overview-geo-timezone",
      "/api/private/overview-geo-organization",
      "/api/private/overview-geo-points",
      "/api/private/trend",
      "/api/private/sessions",
      "/api/private/pages",
      "/api/private/referrers",
      "/api/private/visitors",
      "/api/private/countries",
      "/api/private/devices",
      "/api/private/page-hash",
      "/api/private/page-query",
      "/api/private/event-types",
      "/api/private/events-summary",
      "/api/private/events-trend",
      "/api/private/events-records",
      "/api/private/pages-dashboard",
      "/api/private/retention",
      "/api/private/performance",
      "/api/private/browser-cross-breakdown",
      "/api/private/browser-version-breakdown",
      "/api/private/browser-radar",
      "/api/private/referrer-radar",
      "/api/private/referrer-dimension-trend",
      "/api/private/browser-trend",
      "/api/private/browser-engine-trend",
      "/api/private/client-dimension-trend",
      "/api/private/utm-dimension-trend",
      "/api/private/utm-source",
      "/api/private/utm-medium",
      "/api/private/utm-campaign",
      "/api/private/utm-term",
      "/api/private/utm-content",
    ];

    it.each(routes)("returns a defined result for %s", (route) => {
      const res = handleDemoRequest({ path: route, params: baseParams });
      expect(res).toBeDefined();
    });

    it("client-cross-breakdown handles missing dimensions gracefully", () => {
      const res = handleDemoRequest({
        path: "/api/private/client-cross-breakdown",
        params: baseParams,
      }) as Record<string, unknown>;
      expect(Array.isArray(res.columns)).toBe(true);
      expect(Array.isArray(res.rows)).toBe(true);
    });

    it("client-cross-breakdown returns data for valid dimensions", () => {
      const res = handleDemoRequest({
        path: "/api/private/client-cross-breakdown",
        params: {
          ...baseParams,
          primaryDimension: "browser",
          secondaryDimension: "deviceType",
        },
      }) as Record<string, unknown>;
      expect(res).toBeDefined();
    });

    it("returns ok for team dashboard", () => {
      const res = ok(
        handleDemoRequest({
          path: "/api/private/team-dashboard",
          params: baseParams,
        }),
      );
      expect(res).toBeDefined();
    });

    it("returns session detail", () => {
      const res = handleDemoRequest({
        path: "/api/private/session-detail",
        params: { ...baseParams, sessionId: "demo-site-001-s-00001" },
      });
      expect(res).toBeDefined();
    });

    it("returns visitor detail", () => {
      const res = handleDemoRequest({
        path: "/api/private/visitor-detail",
        params: { ...baseParams, visitorId: "v-001-000001" },
      });
      expect(res).toBeDefined();
    });
  });

  describe("public routes", () => {
    const now = Date.now();
    const params = {
      siteId: SITE_ID,
      from: now - 3_600_000,
      to: now,
    };

    it("dispatches overview to the same generator", () => {
      const res = handleDemoRequest({
        path: "/api/public/some-token/overview",
        params,
      });
      expect(res).toBeDefined();
    });

    it("dispatches trend to the same generator", () => {
      const res = handleDemoRequest({
        path: "/api/public/some-token/trend",
        params,
      });
      expect(res).toBeDefined();
    });

    it("dispatches pages to the same generator", () => {
      const res = handleDemoRequest({
        path: "/api/public/some-token/pages",
        params,
      });
      expect(res).toBeDefined();
    });

    it("dispatches referrers to the same generator", () => {
      const res = handleDemoRequest({
        path: "/api/public/some-token/referrers",
        params,
      });
      expect(res).toBeDefined();
    });

    it("returns fallback for unknown public sub-paths", () => {
      const res = ok(
        handleDemoRequest({
          path: "/api/public/some-token/unknown",
          params,
        }),
      );
      expect(res.ok).toBe(true);
    });
  });

  describe("fallback", () => {
    it("returns empty success for unrecognized GET paths", () => {
      const res = ok(
        handleDemoRequest({ path: "/api/private/totally-unknown" }),
      );
      expect(res.ok).toBe(true);
      expect(res.data).toEqual({});
    });
  });
});

describe("mock — createMockRealtimeSocket", () => {
  function closeSocket(socket: RealtimeSocketLike) {
    try {
      socket.close();
    } catch {
      // ignore
    }
  }

  it("returns a socket-like object", () => {
    const socket = createMockRealtimeSocket({ siteId: SITE_ID });
    expect(typeof socket.close).toBe("function");
    expect(socket.readyState).toBeGreaterThanOrEqual(0);
    closeSocket(socket);
  });

  it("can be closed twice without error", () => {
    const socket = createMockRealtimeSocket({ siteId: SITE_ID });
    socket.close();
    expect(() => socket.close()).not.toThrow();
  });

  it("respects custom activeWindowMs", () => {
    const socket = createMockRealtimeSocket({
      siteId: SITE_ID,
      activeWindowMs: 60_000,
    });
    expect(socket).toBeDefined();
    closeSocket(socket);
  });
});
