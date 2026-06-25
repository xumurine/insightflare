import { describe, expect, it } from "vitest";

import {
  buildLandingEmbedDemoSitePath,
  isLandingEmbedView,
  LANDING_EMBED_DEMO_SITE,
  LANDING_EMBED_VIEW_ALIASES,
  LANDING_EMBED_VIEWS,
  normalizeLandingEmbedView,
} from "@/lib/embeds/landing";

describe("lib/embeds/landing", () => {
  describe("LANDING_EMBED_VIEWS", () => {
    it("contains a non-empty list of view identifiers", () => {
      expect(LANDING_EMBED_VIEWS.length).toBeGreaterThan(0);
      for (const view of LANDING_EMBED_VIEWS) {
        expect(typeof view).toBe("string");
        expect(view.length).toBeGreaterThan(0);
      }
    });

    it("includes expected core views", () => {
      const views = LANDING_EMBED_VIEWS as readonly string[];
      expect(views).toContain("overview");
      expect(views).toContain("realtime");
      expect(views).toContain("events");
      expect(views).toContain("browsers");
      expect(views).toContain("devices");
      expect(views).toContain("funnels");
    });
  });

  describe("LANDING_EMBED_DEMO_SITE", () => {
    it("has all required fields as non-empty strings", () => {
      expect(LANDING_EMBED_DEMO_SITE.teamSlug).toBeTruthy();
      expect(LANDING_EMBED_DEMO_SITE.siteSlug).toBeTruthy();
      expect(LANDING_EMBED_DEMO_SITE.siteId).toBeTruthy();
      expect(LANDING_EMBED_DEMO_SITE.siteName).toBeTruthy();
      expect(LANDING_EMBED_DEMO_SITE.siteDomain).toBeTruthy();
    });
  });

  describe("LANDING_EMBED_VIEW_ALIASES", () => {
    it("maps top-level views to their detailed counterparts", () => {
      expect(LANDING_EMBED_VIEW_ALIASES.overview).toBe("overview-metrics");
      expect(LANDING_EMBED_VIEW_ALIASES.realtime).toBe("realtime-stream");
      expect(LANDING_EMBED_VIEW_ALIASES.events).toBe("events-summary");
      expect(LANDING_EMBED_VIEW_ALIASES.browsers).toBe("browsers-share");
      expect(LANDING_EMBED_VIEW_ALIASES.devices).toBe("devices-share");
    });

    it("only contains valid target views", () => {
      for (const target of Object.values(LANDING_EMBED_VIEW_ALIASES)) {
        expect(LANDING_EMBED_VIEWS).toContain(target);
      }
    });
  });

  describe("normalizeLandingEmbedView", () => {
    it("resolves aliased views to their detailed counterpart", () => {
      expect(normalizeLandingEmbedView("overview")).toBe("overview-metrics");
      expect(normalizeLandingEmbedView("realtime")).toBe("realtime-stream");
      expect(normalizeLandingEmbedView("events")).toBe("events-summary");
      expect(normalizeLandingEmbedView("browsers")).toBe("browsers-share");
      expect(normalizeLandingEmbedView("devices")).toBe("devices-share");
    });

    it("returns non-aliased views unchanged", () => {
      expect(normalizeLandingEmbedView("funnels")).toBe("funnels");
      expect(normalizeLandingEmbedView("pages")).toBe("pages");
      expect(normalizeLandingEmbedView("traffic-trend")).toBe("traffic-trend");
      expect(normalizeLandingEmbedView("geo-map")).toBe("geo-map");
    });
  });

  describe("isLandingEmbedView", () => {
    it("returns true for every view in the canonical list", () => {
      for (const view of LANDING_EMBED_VIEWS) {
        expect(isLandingEmbedView(view)).toBe(true);
      }
    });

    it("returns false for unknown strings", () => {
      expect(isLandingEmbedView("nonexistent")).toBe(false);
      expect(isLandingEmbedView("dashboard")).toBe(false);
    });

    it("returns false for null and undefined", () => {
      expect(isLandingEmbedView(null)).toBe(false);
      expect(isLandingEmbedView(undefined)).toBe(false);
    });

    it("returns false for empty string", () => {
      expect(isLandingEmbedView("")).toBe(false);
    });
  });

  describe("buildLandingEmbedDemoSitePath", () => {
    it("builds the base path for views without a section", () => {
      const path = buildLandingEmbedDemoSitePath("en", "overview");
      expect(path).toBe("/en/app/xeoos-team/dailypulse-news");
    });

    it("appends the realtime section for realtime views", () => {
      expect(buildLandingEmbedDemoSitePath("en", "realtime")).toBe(
        "/en/app/xeoos-team/dailypulse-news/realtime",
      );
      expect(buildLandingEmbedDemoSitePath("en", "realtime-stream")).toBe(
        "/en/app/xeoos-team/dailypulse-news/realtime",
      );
    });

    it("appends the retention section", () => {
      expect(buildLandingEmbedDemoSitePath("en", "retention")).toBe(
        "/en/app/xeoos-team/dailypulse-news/retention",
      );
    });

    it("appends the events section for event views", () => {
      expect(buildLandingEmbedDemoSitePath("en", "events")).toBe(
        "/en/app/xeoos-team/dailypulse-news/events",
      );
      expect(buildLandingEmbedDemoSitePath("en", "events-trend")).toBe(
        "/en/app/xeoos-team/dailypulse-news/events",
      );
    });

    it("appends the browsers section for browser views", () => {
      expect(buildLandingEmbedDemoSitePath("en", "browsers")).toBe(
        "/en/app/xeoos-team/dailypulse-news/browsers",
      );
    });

    it("appends the devices section for device views", () => {
      expect(buildLandingEmbedDemoSitePath("en", "devices")).toBe(
        "/en/app/xeoos-team/dailypulse-news/devices",
      );
    });

    it("appends the pages section", () => {
      expect(buildLandingEmbedDemoSitePath("en", "pages")).toBe(
        "/en/app/xeoos-team/dailypulse-news/pages",
      );
    });

    it("appends the performance section", () => {
      expect(buildLandingEmbedDemoSitePath("en", "performance")).toBe(
        "/en/app/xeoos-team/dailypulse-news/performance",
      );
    });

    it("appends the sessions section", () => {
      expect(buildLandingEmbedDemoSitePath("en", "sessions")).toBe(
        "/en/app/xeoos-team/dailypulse-news/sessions",
      );
    });

    it("appends the visitors section", () => {
      expect(buildLandingEmbedDemoSitePath("en", "visitors")).toBe(
        "/en/app/xeoos-team/dailypulse-news/visitors",
      );
    });

    it("appends the funnel section for funnels view", () => {
      expect(buildLandingEmbedDemoSitePath("en", "funnels")).toBe(
        "/en/app/xeoos-team/dailypulse-news/funnels",
      );
    });

    it("respects different locale values", () => {
      expect(buildLandingEmbedDemoSitePath("zh", "overview")).toBe(
        "/zh/app/xeoos-team/dailypulse-news",
      );
      expect(buildLandingEmbedDemoSitePath("zh", "pages")).toBe(
        "/zh/app/xeoos-team/dailypulse-news/pages",
      );
    });

    it("returns the base path for overview-metrics (empty section)", () => {
      expect(buildLandingEmbedDemoSitePath("en", "overview-metrics")).toBe(
        "/en/app/xeoos-team/dailypulse-news",
      );
    });

    it("returns the base path for traffic views (empty section)", () => {
      expect(buildLandingEmbedDemoSitePath("en", "traffic-trend")).toBe(
        "/en/app/xeoos-team/dailypulse-news",
      );
      expect(buildLandingEmbedDemoSitePath("en", "traffic-pages")).toBe(
        "/en/app/xeoos-team/dailypulse-news",
      );
    });

    it("returns the base path for geo-map (empty section)", () => {
      expect(buildLandingEmbedDemoSitePath("en", "geo-map")).toBe(
        "/en/app/xeoos-team/dailypulse-news",
      );
    });
  });
});
