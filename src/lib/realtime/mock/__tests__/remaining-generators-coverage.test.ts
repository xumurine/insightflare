import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  generateDemoDoDiagnostic,
  generateDemoSystemPerformance,
  getDemoMembers,
  getDemoScriptSnippet,
  getDemoSiteConfig,
  getDemoSites,
  getDemoTeams,
  getDemoUser,
} from "@/lib/realtime/mock/admin";
import {
  generateDemoPerformance,
  summarizeDemoJourneyPerformance,
} from "@/lib/realtime/mock/analytics-performance";
import {
  generateDemoBrowserRadar,
  generateDemoReferrerRadar,
} from "@/lib/realtime/mock/browser-client";
import {
  generateDemoBrowserCrossBreakdown,
  generateDemoBrowserVersionBreakdown,
} from "@/lib/realtime/mock/browser-client-breakdowns";
import { generateDemoClientCrossBreakdown } from "@/lib/realtime/mock/client-cross";
import type * as FactBuilder from "@/lib/realtime/mock/fact-builder";
import { generateDemoFilterOptions } from "@/lib/realtime/mock/filter-options";
import {
  generateDemoSessionDetail,
  generateDemoSessions,
  generateDemoVisitorDetail,
  generateDemoVisitors,
} from "@/lib/realtime/mock/journeys";
import { generateDemoTeamDashboard } from "@/lib/realtime/mock/team-dashboard";
import type {
  DemoFactDataset,
  DemoFilteredFacts,
  DemoVisitFact,
} from "@/lib/realtime/mock/types";
import {
  generateDemoUtmDimension,
  generateDemoUtmTrend,
} from "@/lib/realtime/mock/utm-dimensions";
import {
  generateDemoGeoPoints,
  generateDemoOverviewClientTab,
  generateDemoOverviewGeoTab,
  generateDemoOverviewPageTab,
  generateDemoOverviewSourceTab,
} from "@/lib/realtime/mock/utm-overview";

const { mockApplyDemoFilters, mockBuildDemoFactDataset } = vi.hoisted(() => ({
  mockApplyDemoFilters: vi.fn(),
  mockBuildDemoFactDataset: vi.fn(),
}));

vi.mock("@/lib/realtime/mock/fact-builder", async () => {
  const actual = await vi.importActual<typeof FactBuilder>(
    "@/lib/realtime/mock/fact-builder",
  );
  return {
    ...actual,
    buildDemoFactDataset: mockBuildDemoFactDataset,
    applyDemoFilters: mockApplyDemoFilters,
  };
});

const SITE_ID = "demo-site-001";
const BASE_TIME = Date.UTC(2026, 0, 5, 12);

describe("mock remaining generator coverage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
    mockBuildDemoFactDataset.mockReset();
    mockApplyDemoFilters.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns admin fixtures and generated operational snapshots", () => {
    const user = getDemoUser();
    const teams = getDemoTeams();
    const sites = getDemoSites(teams[0].id);

    expect(user).toMatchObject({
      id: "demo-user-001",
      systemRole: "admin",
      teamCount: 1,
    });
    expect(teams[0]).toMatchObject({
      id: "demo-team-001",
      siteCount: expect.any(Number),
      membershipRole: "owner",
    });
    expect(sites.length).toBeGreaterThan(0);
    expect(getDemoMembers(teams[0].id)).toEqual([
      expect.objectContaining({ teamId: teams[0].id, role: "owner" }),
    ]);
    expect(getDemoSiteConfig()).toMatchObject({
      trackingStrength: "smart",
      performanceSampleRate: 100,
    });
    expect(getDemoScriptSnippet("site with space")).toMatchObject({
      siteId: "site with space",
      src: expect.stringContaining("siteId=site%20with%20space"),
      snippet: expect.stringContaining("<script defer"),
    });

    const performance = generateDemoSystemPerformance({ minutes: 15 });
    expect(performance.window.minutes).toBe(15);
    expect(performance.summary.totalEvents).toBe(
      performance.summary.visits + performance.summary.customEvents,
    );
    expect(performance.trend.length).toBeGreaterThan(0);
    expect(performance.topSites.length).toBeGreaterThan(0);

    const fallbackPerformance = generateDemoSystemPerformance({
      minutes: "bad",
    });
    expect(fallbackPerformance.window.minutes).toBe(60);
    expect(
      generateDemoSystemPerformance({ minutes: 360 }).trend[1].timestampMs -
        generateDemoSystemPerformance({ minutes: 360 }).trend[0].timestampMs,
    ).toBe(30 * 60 * 1000);
    expect(
      generateDemoSystemPerformance({ minutes: 1440 }).trend[1].timestampMs -
        generateDemoSystemPerformance({ minutes: 1440 }).trend[0].timestampMs,
    ).toBe(60 * 60 * 1000);

    const diagnostic = generateDemoDoDiagnostic();
    expect(diagnostic.totalSites).toBe(diagnostic.sites.length);
    expect(diagnostic.reachableSites).toBe(diagnostic.totalSites);
    expect(diagnostic.totals.openVisits).toBe(
      diagnostic.sites.reduce(
        (sum, site) => sum + (site.diagnostic?.visits.open.total ?? 0),
        0,
      ),
    );
  });

  it("builds script snippets from an explicit edge URL without a trailing slash", () => {
    const previousEdgeUrl = process.env.NEXT_PUBLIC_INSIGHTFLARE_EDGE_URL;
    process.env.NEXT_PUBLIC_INSIGHTFLARE_EDGE_URL =
      "https://edge.example.test/";

    try {
      expect(getDemoScriptSnippet("site/with space")).toEqual({
        siteId: "site/with space",
        src: "https://edge.example.test/script.js?siteId=site%2Fwith%20space",
        snippet:
          '<script defer src="https://edge.example.test/script.js?siteId=site%2Fwith%20space"></script>',
      });
    } finally {
      if (previousEdgeUrl === undefined) {
        delete process.env.NEXT_PUBLIC_INSIGHTFLARE_EDGE_URL;
      } else {
        process.env.NEXT_PUBLIC_INSIGHTFLARE_EDGE_URL = previousEdgeUrl;
      }
    }
  });

  it("builds filter option branches from page, referrer, client, and geo tabs", () => {
    const visits = [
      makeVisit({
        visitId: "home",
        sessionId: "s1",
        visitorId: "u1",
        pathname: "/home",
        title: "Home",
        referrerHost: "",
        referrerUrl: "",
        country: "US",
        region: "US::CA::California",
        city: "US::CA::California::San Francisco",
        timezone: "America/Los_Angeles",
      }),
      makeVisit({
        visitId: "pricing",
        sessionId: "s1",
        visitorId: "u1",
        startedAt: BASE_TIME + 1_000,
        pathname: "/pricing",
        title: "Pricing",
        browser: "Safari",
        browserVersion: "",
        osVersion: "iOS 18",
        deviceType: "Mobile",
        referrerHost: "Search.Example",
        referrerUrl: "https://search.example/result",
        country: "DE",
        region: "DE::BE::Berlin",
        city: "DE::BE::Berlin::Berlin",
        continent: "Europe",
        timezone: "Europe/Berlin",
        organization: "Example Mobile",
      }),
      makeVisit({
        visitId: "blank-client",
        sessionId: "s2",
        visitorId: "u2",
        startedAt: BASE_TIME + 2_000,
        pathname: "/home",
        title: "Home",
        browser: "",
        browserVersion: "",
        osVersion: "",
        deviceType: "Desktop",
        language: "de-DE",
        screenSize: "390x844",
      }),
    ];
    setFacts(visits);

    expect(generateDemoFilterOptions(SITE_ID, { filterKey: "" })).toEqual({
      ok: false,
      data: [],
    });
    expect(
      generateDemoFilterOptions(SITE_ID, { filterKey: "country" }).data,
    ).toEqual([
      { value: "US", label: "US" },
      { value: "DE", label: "DE" },
    ]);
    expect(
      generateDemoFilterOptions(SITE_ID, { filterKey: "device" }).data,
    ).toEqual([
      { value: "Desktop", label: "Desktop" },
      { value: "Mobile", label: "Mobile" },
    ]);
    expect(
      generateDemoFilterOptions(SITE_ID, { filterKey: "browser" }).data,
    ).toEqual([
      { value: "Chrome", label: "Chrome" },
      { value: "Safari", label: "Safari" },
    ]);
    expect(
      generateDemoFilterOptions(SITE_ID, { filterKey: "path" }).data,
    ).toEqual([
      { value: "/home", label: "/home" },
      { value: "/pricing", label: "/pricing" },
    ]);
    expect(
      generateDemoFilterOptions(SITE_ID, { filterKey: "entry" }).data,
    ).toEqual([{ value: "/home", label: "/home" }]);
    expect(
      generateDemoFilterOptions(SITE_ID, { filterKey: "exit" }).data,
    ).toEqual([
      { value: "/home", label: "/home" },
      { value: "/pricing", label: "/pricing" },
    ]);
    expect(
      generateDemoFilterOptions(SITE_ID, { filterKey: "sourceDomain" }).data,
    ).toEqual([{ value: "Search.Example", label: "Search.Example" }]);
    expect(
      generateDemoFilterOptions(SITE_ID, { filterKey: "sourceLink" }).data,
    ).toEqual([
      {
        value: "https://search.example/result",
        label: "https://search.example/result",
      },
    ]);
    expect(
      generateDemoFilterOptions(SITE_ID, { filterKey: "clientBrowser" }).data,
    ).toEqual([
      { value: "Chrome", label: "Chrome" },
      { value: "Safari", label: "Safari" },
    ]);
    expect(
      generateDemoFilterOptions(SITE_ID, { filterKey: "geo" }).data,
    ).toEqual(
      expect.arrayContaining([
        { value: "US", label: "US", group: "country" },
        {
          value: "US::CA::California",
          label: "California",
          group: "region",
        },
        {
          value: "US::CA::California::San Francisco",
          label: "San Francisco",
          group: "city",
        },
      ]),
    );
    expect(
      generateDemoFilterOptions(SITE_ID, { filterKey: "geoTimezone" }).data,
    ).toEqual(
      expect.arrayContaining([
        { value: "America/Los_Angeles", label: "America/Los_Angeles" },
        { value: "Europe/Berlin", label: "Europe/Berlin" },
      ]),
    );
    expect(
      generateDemoFilterOptions(SITE_ID, { filterKey: "geoContinent" }).data,
    ).toEqual(
      expect.arrayContaining([
        { value: "North America", label: "North America" },
        { value: "Europe", label: "Europe" },
      ]),
    );
    expect(
      generateDemoFilterOptions(SITE_ID, { filterKey: "geoOrganization" }).data,
    ).toEqual(
      expect.arrayContaining([
        { value: "Example ISP", label: "Example ISP" },
        { value: "Example Mobile", label: "Example Mobile" },
      ]),
    );
  });

  it("builds remaining client filter option dimensions", () => {
    setFacts([
      makeVisit({
        visitId: "desktop",
        osVersion: "Windows 11",
        deviceType: "Desktop",
        language: "en-US",
        screenSize: "1920x1080",
      }),
      makeVisit({
        visitId: "mobile",
        sessionId: "s2",
        visitorId: "u2",
        osVersion: "iOS 18",
        deviceType: "Mobile",
        language: "de-DE",
        screenSize: "390x844",
      }),
    ]);

    expect(
      generateDemoFilterOptions(SITE_ID, { filterKey: "clientOsVersion" }).data,
    ).toEqual(
      expect.arrayContaining([
        { value: "Windows 11", label: "Windows 11" },
        { value: "iOS 18", label: "iOS 18" },
      ]),
    );
    expect(
      generateDemoFilterOptions(SITE_ID, { filterKey: "clientDeviceType" })
        .data,
    ).toEqual(
      expect.arrayContaining([
        { value: "Desktop", label: "Desktop" },
        { value: "Mobile", label: "Mobile" },
      ]),
    );
    expect(
      generateDemoFilterOptions(SITE_ID, { filterKey: "clientLanguage" }).data,
    ).toEqual(
      expect.arrayContaining([
        { value: "en-US", label: "en-US" },
        { value: "de-DE", label: "de-DE" },
      ]),
    );
    expect(
      generateDemoFilterOptions(SITE_ID, { filterKey: "clientScreenSize" })
        .data,
    ).toEqual(
      expect.arrayContaining([
        { value: "1920x1080", label: "1920x1080" },
        { value: "390x844", label: "390x844" },
      ]),
    );
  });

  it("exposes direct referrers as user-facing filter options with the direct sentinel", () => {
    setFacts([
      makeVisit({
        visitId: "direct",
        referrerHost: "",
        referrerUrl: "",
      }),
    ]);

    expect(
      generateDemoFilterOptions(SITE_ID, { filterKey: "sourceDomain" }).data,
    ).toContainEqual({ value: "__direct__", label: "Direct" });
    expect(
      generateDemoFilterOptions(SITE_ID, { filterKey: "sourceLink" }).data,
    ).toContainEqual({ value: "__direct__", label: "Direct" });
  });

  it("dedupes and normalizes sparse filter option rows", () => {
    setFacts([
      makeVisit({
        visitId: "first",
        sessionId: "s1",
        visitorId: "u1",
        pathname: "/home",
        title: "Home",
        hostname: "example.test",
        browser: "Chrome",
      }),
      makeVisit({
        visitId: "duplicate",
        sessionId: "s2",
        visitorId: "u2",
        pathname: "/home",
        title: "   ",
        hostname: "",
        browser: "Chrome",
      }),
      makeVisit({
        visitId: "second",
        sessionId: "s3",
        visitorId: "u3",
        pathname: "/about",
        title: "About",
        hostname: "docs.example.test",
        browser: "Firefox",
      }),
    ]);

    expect(
      generateDemoFilterOptions(SITE_ID, { filterKey: "title" }).data,
    ).toEqual(
      expect.arrayContaining([
        { value: "Home", label: "Home" },
        { value: "About", label: "About" },
      ]),
    );
    expect(
      generateDemoFilterOptions(SITE_ID, { filterKey: "hostname" }).data,
    ).toEqual(
      expect.arrayContaining([
        { value: "example.test", label: "example.test" },
        { value: "docs.example.test", label: "docs.example.test" },
      ]),
    );
  });

  it("labels sparse geo filter options with segment fallbacks", () => {
    setFacts([
      makeVisit({
        visitId: "sparse-geo",
        region: "US::CA",
        city: "US",
      }),
    ]);

    expect(
      generateDemoFilterOptions(SITE_ID, { filterKey: "geo" }).data,
    ).toEqual(
      expect.arrayContaining([
        { value: "US", label: "US", group: "country" },
        { value: "US::CA", label: "CA", group: "region" },
      ]),
    );
  });

  it("computes browser and referrer radar metrics and empty branches", () => {
    setFacts([]);
    expect(generateDemoBrowserRadar(SITE_ID, {})).toEqual({
      ok: true,
      data: [],
    });
    expect(generateDemoReferrerRadar(SITE_ID, {})).toEqual({
      ok: true,
      data: [],
    });

    setFacts([
      makeVisit({
        visitId: "chrome-1",
        sessionId: "s1",
        visitorId: "u1",
        browser: "Chrome",
        referrerHost: "search.example",
      }),
      makeVisit({
        visitId: "chrome-2",
        sessionId: "s1",
        visitorId: "u1",
        startedAt: BASE_TIME + 1_000,
        browser: "Chrome",
        referrerHost: "search.example",
        durationMs: 2_000,
      }),
      makeVisit({
        visitId: "safari",
        sessionId: "s2",
        visitorId: "u2",
        startedAt: BASE_TIME + 2_000,
        browser: "Safari",
        referrerHost: "social.example",
      }),
    ]);

    expect(generateDemoBrowserRadar(SITE_ID, { limit: 2 })).toMatchObject({
      ok: true,
      data: expect.arrayContaining([
        expect.objectContaining({
          browser: "Chrome",
          metrics: expect.objectContaining({
            engagement: 1,
            depth: 2,
            traffic: expect.any(Number),
          }),
        }),
      ]),
    });
    expect(generateDemoReferrerRadar(SITE_ID, { limit: 1 })).toMatchObject({
      ok: true,
      data: [
        expect.objectContaining({
          referrer: "search.example",
          metrics: expect.objectContaining({
            engagement: 1,
            depth: 2,
          }),
        }),
      ],
    });
  });

  it("computes radar loyalty and direct-referrer rows", () => {
    setFacts([
      makeVisit({
        visitId: "returning-1",
        sessionId: "s1",
        visitorId: "u1",
        browser: "Chrome",
        referrerHost: "",
        durationMs: -500,
      }),
      makeVisit({
        visitId: "returning-2",
        sessionId: "s2",
        visitorId: "u1",
        startedAt: BASE_TIME + 1_000,
        browser: "Chrome",
        referrerHost: "",
      }),
    ]);

    expect(generateDemoBrowserRadar(SITE_ID, {})).toMatchObject({
      ok: true,
      data: [
        expect.objectContaining({
          browser: "Chrome",
          metrics: expect.objectContaining({
            duration: 500,
            engagement: 0,
            loyalty: 1,
          }),
        }),
      ],
    });
    expect(generateDemoReferrerRadar(SITE_ID, {})).toEqual({
      ok: true,
      data: [],
    });
  });

  it("falls back to default radar frequency when filtered visitors are unavailable", () => {
    const visits = [
      makeVisit({
        visitId: "chrome",
        sessionId: "s1",
        visitorId: "u1",
        browser: "Chrome",
        referrerHost: "search.example",
      }),
    ];
    setFacts(visits);
    mockApplyDemoFilters.mockReturnValue({
      visits,
      sessions: new Set(["s1"]),
      visitors: new Set(),
      visitsBySession: new Map([["s1", 1]]),
    });

    expect(generateDemoBrowserRadar(SITE_ID, {})).toMatchObject({
      ok: true,
      data: [
        expect.objectContaining({
          browser: "Chrome",
          metrics: expect.objectContaining({
            frequency: expect.any(Number),
            traffic: 1,
          }),
        }),
      ],
    });
    expect(generateDemoReferrerRadar(SITE_ID, {})).toMatchObject({
      ok: true,
      data: [
        expect.objectContaining({
          referrer: "search.example",
          metrics: expect.objectContaining({
            frequency: expect.any(Number),
            traffic: 1,
          }),
        }),
      ],
    });
  });

  it("builds UTM dimension rows, invalid trend fallbacks, and Other trend series", () => {
    setFacts([
      makeVisit({ visitId: "a", sessionId: "s1", visitorId: "u1" }),
      makeVisit({ visitId: "b", sessionId: "s2", visitorId: "u2" }),
      makeVisit({ visitId: "c", sessionId: "s3", visitorId: "u3" }),
      makeVisit({ visitId: "d", sessionId: "s4", visitorId: "u4" }),
    ]);

    const dimension = generateDemoUtmDimension(SITE_ID, "source", {
      from: BASE_TIME,
      to: BASE_TIME + 3_600_000,
      limit: 4,
    });
    expect(dimension).toMatchObject({ ok: true });
    expect(dimension.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          value: expect.any(String),
          views: expect.any(Number),
          sessions: expect.any(Number),
        }),
      ]),
    );

    expect(
      generateDemoUtmTrend(SITE_ID, {
        dimension: "unknown",
        from: BASE_TIME,
        to: BASE_TIME + 3_600_000,
      }),
    ).toEqual({ ok: true, interval: "day", series: [], data: [] });

    const trend = generateDemoUtmTrend(SITE_ID, {
      dimension: "campaign",
      from: BASE_TIME,
      to: BASE_TIME + 3_600_000,
      interval: "hour",
      limit: 1,
      timeZone: "UTC",
    });
    expect(trend).toMatchObject({
      ok: true,
      interval: "hour",
      series: [
        expect.objectContaining({ key: expect.any(String) }),
        expect.objectContaining({ key: "other", isOther: true }),
      ],
    });
    expect(trend.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          totalVisitors: expect.any(Number),
          visitorsBySeries: expect.any(Object),
        }),
      ]),
    );
  });

  it("returns empty UTM rows when there are no tagged views", () => {
    setFacts([]);

    expect(
      generateDemoUtmDimension(SITE_ID, "source", {
        from: BASE_TIME,
        to: BASE_TIME + 1,
      }),
    ).toEqual({ ok: true, data: [] });
    expect(
      generateDemoUtmTrend(SITE_ID, {
        dimension: "source",
        from: BASE_TIME,
        to: BASE_TIME + 1,
      }),
    ).toEqual({ ok: true, interval: "day", series: [], data: [] });
  });

  it("builds non-source UTM dimensions from medium, term, and content pools", () => {
    setFacts([
      makeVisit({ visitId: "a", sessionId: "s1", visitorId: "u1" }),
      makeVisit({ visitId: "b", sessionId: "s2", visitorId: "u2" }),
      makeVisit({ visitId: "c", sessionId: "s3", visitorId: "u3" }),
    ]);

    for (const tab of ["medium", "term", "content"] as const) {
      const result = generateDemoUtmDimension(SITE_ID, tab, {
        from: BASE_TIME,
        to: BASE_TIME + 3_600_000,
        limit: 3,
      });

      expect(result).toMatchObject({
        ok: true,
        data: expect.arrayContaining([
          expect.objectContaining({
            value: expect.any(String),
            views: expect.any(Number),
            sessions: expect.any(Number),
          }),
        ]),
      });
    }
  });

  it("builds campaign UTM dimension rows from site-specific labels", () => {
    setFacts([
      makeVisit({ visitId: "a", sessionId: "s1", visitorId: "u1" }),
      makeVisit({ visitId: "b", sessionId: "s2", visitorId: "u2" }),
      makeVisit({ visitId: "c", sessionId: "s3", visitorId: "u3" }),
      makeVisit({ visitId: "d", sessionId: "s4", visitorId: "u4" }),
    ]);

    expect(
      generateDemoUtmDimension(SITE_ID, "campaign", {
        from: BASE_TIME,
        to: BASE_TIME + 3_600_000,
        limit: 5,
      }),
    ).toMatchObject({
      ok: true,
      data: expect.arrayContaining([
        expect.objectContaining({
          value: expect.any(String),
          views: expect.any(Number),
          sessions: expect.any(Number),
        }),
      ]),
    });
  });

  it("returns overview tab wrappers for page, source, client, geo, and map points", () => {
    setFacts([
      makeVisit({
        visitId: "us",
        sessionId: "s1",
        visitorId: "u1",
        pathname: "/home",
        referrerHost: "",
        referrerUrl: "",
        country: "US",
        region: "US::CA::California",
        city: "US::CA::California::San Francisco",
      }),
      makeVisit({
        visitId: "de",
        sessionId: "s2",
        visitorId: "u2",
        startedAt: BASE_TIME + 2_000,
        pathname: "/pricing",
        browser: "Safari",
        referrerHost: "search.example",
        referrerUrl: "https://search.example/result",
        country: "DE",
        regionCode: "BE",
        regionName: "Berlin",
        region: "DE::BE::Berlin",
        cityName: "Berlin",
        city: "DE::BE::Berlin::Berlin",
        continent: "Europe",
        timezone: "Europe/Berlin",
      }),
    ]);

    expect(
      generateDemoOverviewPageTab(SITE_ID, { limit: 5 }, "path"),
    ).toMatchObject({
      ok: true,
      data: expect.arrayContaining([
        expect.objectContaining({ label: "/home" }),
      ]),
    });
    expect(
      generateDemoOverviewSourceTab(SITE_ID, { limit: 5 }, "link"),
    ).toEqual({
      ok: true,
      data: [
        {
          label: "https://search.example/result",
          views: 1,
          sessions: 1,
          visitors: 1,
        },
      ],
    });
    expect(
      generateDemoOverviewClientTab(SITE_ID, { limit: 5 }, "browser"),
    ).toMatchObject({
      ok: true,
      data: expect.arrayContaining([
        expect.objectContaining({ label: "Chrome" }),
        expect.objectContaining({ label: "Safari" }),
      ]),
    });
    expect(
      generateDemoOverviewGeoTab(SITE_ID, { limit: 5, geo: "US" }, "country"),
    ).toMatchObject({
      ok: true,
      data: expect.arrayContaining([
        expect.objectContaining({ label: "DE" }),
        expect.objectContaining({ label: "US" }),
      ]),
    });
    expect(
      generateDemoGeoPoints(SITE_ID, {
        limit: 50,
        applyGeoFilter: "1",
        geo: "DE::BE::Berlin",
      }),
    ).toMatchObject({
      ok: true,
      data: expect.arrayContaining([
        expect.objectContaining({ country: "US" }),
        expect.objectContaining({ country: "DE" }),
      ]),
      countryCounts: expect.arrayContaining([
        expect.objectContaining({ country: "DE" }),
      ]),
      cityCounts: expect.arrayContaining([
        expect.objectContaining({ label: "San Francisco" }),
        expect.objectContaining({ label: "Berlin" }),
      ]),
    });
  });

  it("returns geo point region drilldowns and ignores geo filters by default", () => {
    setFacts([
      makeVisit({
        visitId: "sf",
        sessionId: "s1",
        visitorId: "u1",
        country: "US",
        region: "US::CA::California",
        city: "US::CA::California::San Francisco",
      }),
      makeVisit({
        visitId: "ny",
        sessionId: "s2",
        visitorId: "u2",
        startedAt: BASE_TIME + 1_000,
        country: "US",
        region: "US::NY::New York",
        city: "US::NY::New York::New York",
      }),
    ]);

    const unfilteredResult = generateDemoGeoPoints(SITE_ID, {
      limit: 50,
      applyGeoFilter: "false",
      geo: "US",
    });
    expect(mockApplyDemoFilters).toHaveBeenLastCalledWith(
      expect.any(Object),
      expect.not.objectContaining({ geo: expect.any(String) }),
    );
    expect(unfilteredResult).toMatchObject({
      ok: true,
      regionCounts: [],
      cityCounts: [],
    });

    const result = generateDemoGeoPoints(SITE_ID, {
      limit: 50,
      applyGeoFilter: "true",
      geo: "US",
    });

    expect(result).toMatchObject({
      ok: true,
      regionCounts: expect.arrayContaining([
        expect.objectContaining({
          value: "US::CA::California",
          label: "California",
        }),
        expect.objectContaining({
          value: "US::NY::New York",
          label: "New York",
        }),
      ]),
      cityCounts: [],
    });
  });

  it("builds team dashboard site cards and trend buckets for valid and empty teams", () => {
    const dashboard = generateDemoTeamDashboard("demo-team-001", {
      from: BASE_TIME - 3_600_000,
      to: BASE_TIME,
      interval: "hour",
      timeZone: "UTC",
    }) as any;
    expect(dashboard).toMatchObject({
      ok: true,
      data: {
        sites: expect.arrayContaining([
          expect.objectContaining({
            teamId: "demo-team-001",
            overview: expect.objectContaining({ views: expect.any(Number) }),
            changeRates: expect.objectContaining({
              pagesPerSession: null,
            }),
          }),
        ]),
        trend: expect.arrayContaining([
          expect.objectContaining({
            bucket: expect.any(Number),
            sites: expect.arrayContaining([
              expect.objectContaining({
                siteId: expect.any(String),
                views: expect.any(Number),
                visitors: expect.any(Number),
              }),
            ]),
          }),
        ]),
      },
    });

    expect(
      generateDemoTeamDashboard("missing-team", {
        from: BASE_TIME - 1,
        to: BASE_TIME,
      }),
    ).toMatchObject({
      ok: true,
      data: {
        sites: [],
        trend: expect.arrayContaining([expect.objectContaining({ sites: [] })]),
      },
    });
  });

  it("builds team dashboard with default params and null previous-window changes", () => {
    const dashboard = generateDemoTeamDashboard("demo-team-001", {}) as any;

    expect(dashboard).toMatchObject({
      ok: true,
      data: {
        sites: expect.arrayContaining([
          expect.objectContaining({
            changeRates: expect.objectContaining({
              views: null,
              sessions: null,
              visitors: null,
            }),
          }),
        ]),
        trend: expect.arrayContaining([
          expect.objectContaining({
            timestampMs: expect.any(Number),
            sites: expect.any(Array),
          }),
        ]),
      },
    });
  });

  it("summarizes performance for overall, route, country, and empty journeys", () => {
    const visits = [
      makeVisit({
        visitId: "desktop",
        sessionId: "s1",
        visitorId: "u1",
        pathname: "/home",
        country: "US",
      }),
      makeVisit({
        visitId: "mobile-blog",
        sessionId: "s2",
        visitorId: "u2",
        startedAt: BASE_TIME + 3_600_000,
        pathname: "/blog/post",
        browser: "Safari",
        deviceType: "Mobile",
        country: "DE",
        durationMs: 60_000,
      }),
    ];
    const dataset = setFacts(visits);
    dataset.viewWeight = 2;

    const result = generateDemoPerformance(SITE_ID, {
      from: BASE_TIME,
      to: BASE_TIME + 2 * 3_600_000,
      interval: "hour",
      timeZone: "UTC",
      limit: 3,
    });
    expect(result).toMatchObject({ ok: true, interval: "hour" });
    expect(result.summaries).toMatchObject({
      lcp: expect.objectContaining({ samples: 4 }),
      cls: expect.objectContaining({ samples: 4 }),
    });
    expect(result.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ pathname: "/home", views: 2 }),
        expect.objectContaining({ pathname: "/blog/post", views: 2 }),
      ]),
    );
    expect(result.countries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ country: "US", views: 2 }),
        expect.objectContaining({ country: "DE", views: 2 }),
      ]),
    );
    expect(result.trends).toMatchObject({
      ttfb: [
        expect.objectContaining({ samples: 2 }),
        expect.objectContaining({ samples: 2 }),
        expect.objectContaining({ samples: 0 }),
      ],
    });
  });

  it("returns null performance aggregates when no samples are available", () => {
    setFacts([]);

    expect(summarizeDemoJourneyPerformance(SITE_ID, [])).toMatchObject({
      ttfb: { avg: null, p75: null, min: null, max: null, samples: 0 },
      cls: { avg: null, p75: null, min: null, max: null, samples: 0 },
    });

    const result = generateDemoPerformance(SITE_ID, {
      from: BASE_TIME,
      to: BASE_TIME + 3_600_000,
      interval: "hour",
      timeZone: "UTC",
    });

    expect(result).toMatchObject({
      ok: true,
      summaries: {
        ttfb: { avg: null, p50: null, p75: null, p95: null, samples: 0 },
        cls: { avg: null, p50: null, p75: null, p95: null, samples: 0 },
      },
      routes: [],
      countries: [],
    });
  });

  it("builds browser and client cross breakdowns with unknown and Other buckets", () => {
    setFacts([
      makeVisit({
        visitId: "chrome-desktop",
        sessionId: "s1",
        visitorId: "u1",
        browser: "Chrome",
        browserVersion: "138",
        osVersion: "Windows 11",
        deviceType: "Desktop",
      }),
      makeVisit({
        visitId: "chrome-unknown-version",
        sessionId: "s2",
        visitorId: "u2",
        browser: "Chrome",
        browserVersion: "",
        osVersion: "",
        deviceType: "Mobile",
      }),
      makeVisit({
        visitId: "safari",
        sessionId: "s3",
        visitorId: "u3",
        browser: "Safari",
        browserVersion: "18",
        osVersion: "iOS 18",
        deviceType: "Mobile",
      }),
      makeVisit({
        visitId: "firefox",
        sessionId: "s4",
        visitorId: "u4",
        browser: "Firefox",
        browserVersion: "140",
        osVersion: "Linux",
        deviceType: "Desktop",
      }),
    ]);

    const versions = generateDemoBrowserVersionBreakdown(SITE_ID, {
      browserLimit: 1,
      versionLimit: 1,
    });
    expect(versions).toMatchObject({
      ok: true,
      data: [
        expect.objectContaining({
          browser: "Chrome",
          versions: expect.arrayContaining([
            expect.objectContaining({ key: expect.any(String) }),
          ]),
        }),
      ],
    });

    const browserCross = generateDemoBrowserCrossBreakdown(SITE_ID, {
      browserLimit: 1,
      osLimit: 1,
      deviceTypeLimit: 1,
    });
    expect(browserCross).toMatchObject({
      ok: true,
      operatingSystem: {
        columns: expect.arrayContaining([
          expect.objectContaining({ key: "other", isOther: true }),
        ]),
        rows: expect.arrayContaining([
          expect.objectContaining({ key: "other", isOther: true }),
        ]),
      },
      deviceType: {
        totalVisitors: expect.any(Number),
      },
    });

    expect(
      generateDemoClientCrossBreakdown(SITE_ID, {
        primaryDimension: "browser",
        secondaryDimension: "browser",
      }),
    ).toEqual({
      ok: true,
      data: { columns: [], rows: [], totalVisitors: 0 },
    });

    const clientCross = generateDemoClientCrossBreakdown(SITE_ID, {
      primaryDimension: "browser",
      secondaryDimension: "operatingSystem",
      primaryLimit: 1,
      secondaryLimit: 1,
    });
    expect(clientCross).toMatchObject({
      ok: true,
      data: {
        columns: expect.arrayContaining([
          expect.objectContaining({ key: "other", isOther: true }),
        ]),
        rows: expect.arrayContaining([
          expect.objectContaining({ key: "other", isOther: true }),
        ]),
        totalVisitors: expect.any(Number),
      },
    });
  });

  it("wraps demo client-cross breakdowns in the analytics response envelope", () => {
    setFacts([
      makeVisit({
        visitId: "chrome",
        sessionId: "s1",
        visitorId: "u1",
        browser: "Chrome",
        osVersion: "Windows 11",
      }),
      makeVisit({
        visitId: "safari",
        sessionId: "s2",
        visitorId: "u2",
        browser: "Safari",
        osVersion: "iOS 18",
      }),
    ]);

    const payload = generateDemoClientCrossBreakdown(SITE_ID, {
      primaryDimension: "browser",
      secondaryDimension: "operatingSystem",
    }) as Record<string, unknown>;

    expect(payload).toMatchObject({
      ok: true,
      data: expect.objectContaining({
        columns: expect.any(Array),
        rows: expect.any(Array),
        totalVisitors: expect.any(Number),
      }),
    });
    expect(payload).not.toHaveProperty("columns");
    expect(payload).not.toHaveProperty("rows");
    expect(payload).not.toHaveProperty("totalVisitors");
  });

  it("lists and details journeys with search, pagination, metrics, and null fallbacks", () => {
    const visits = [
      makeVisit({
        visitId: "u1-first",
        sessionId: "s1",
        visitorId: "u1",
        startedAt: BASE_TIME,
        pathname: "/landing",
        referrerHost: "search.example",
        referrerUrl: "https://search.example/result",
      }),
      makeVisit({
        visitId: "u1-custom",
        sessionId: "s1",
        visitorId: "u1",
        startedAt: BASE_TIME + 2_000,
        pathname: "/checkout",
        eventType: "purchase",
        durationMs: 5_000,
      }),
      makeVisit({
        visitId: "u2-only",
        sessionId: "s2",
        visitorId: "u2",
        startedAt: BASE_TIME + 4_000,
        pathname: "/pricing",
        title: "Pricing",
        screenSize: "390x844",
      }),
    ];
    const dataset = setFacts(visits);
    dataset.sessions.get("s1")!.weight = 2;
    dataset.visitors.get("u1")!.weight = 3;

    const visitors = generateDemoVisitors(SITE_ID, {
      page: 1,
      pageSize: 1,
      search: "checkout",
      sortBy: "views",
      sortDir: "asc",
    });
    expect(visitors).toMatchObject({
      ok: true,
      data: [
        expect.objectContaining({
          visitorId: "u1",
          views: 2,
          sessions: 2,
          events: 1,
        }),
      ],
      meta: { page: 1, pageSize: 1, returned: 1, hasMore: false },
    });

    const sessions = generateDemoSessions(SITE_ID, {
      page: 1,
      pageSize: 1,
      search: "pricing",
      sortBy: "durationMs",
    });
    expect(sessions).toMatchObject({
      ok: true,
      data: [expect.objectContaining({ sessionId: "s2", views: 1 })],
    });

    expect(generateDemoVisitorDetail(SITE_ID, { visitorId: "" })).toEqual({
      ok: true,
      data: null,
    });
    const visitorDetail = generateDemoVisitorDetail(SITE_ID, {
      visitorId: "u1",
      timeZone: "UTC",
    });
    expect(visitorDetail).toMatchObject({
      ok: true,
      data: {
        visitor: { visitorId: "u1", views: 2, sessions: 1, events: 1 },
        metrics: {
          totalEvents: 1,
          conversionEvents: 1,
          daysActive: 1,
        },
        sessions: [expect.objectContaining({ sessionId: "s1" })],
        performance: {
          lcp: expect.objectContaining({ samples: 2 }),
        },
      },
    });

    expect(
      generateDemoSessionDetail(SITE_ID, { sessionId: "missing" }),
    ).toEqual({ ok: true, data: null });
    const sessionDetail = generateDemoSessionDetail(SITE_ID, {
      sessionId: "s1",
    });
    expect(sessionDetail).toMatchObject({
      ok: true,
      data: {
        session: { sessionId: "s1", views: 2, events: 1 },
        events: expect.arrayContaining([
          expect.objectContaining({ kind: "session_start" }),
          expect.objectContaining({ kind: "custom", eventType: "purchase" }),
        ]),
        locationPoints: expect.arrayContaining([
          expect.objectContaining({ country: "US" }),
        ]),
      },
    });
  });
});

function setFacts(visits: DemoVisitFact[]): DemoFactDataset {
  const dataset = makeDataset(visits);
  mockBuildDemoFactDataset.mockReturnValue(dataset);
  mockApplyDemoFilters.mockReturnValue(makeFiltered(visits));
  return dataset;
}

function makeDataset(visits: DemoVisitFact[]): DemoFactDataset {
  const dataset: DemoFactDataset = {
    from: BASE_TIME,
    to: BASE_TIME + 2 * 3_600_000,
    viewWeight: 1,
    visits,
    sessions: new Map(),
    visitors: new Map(),
  };
  for (const visit of visits) {
    if (!dataset.sessions.has(visit.sessionId)) {
      dataset.sessions.set(visit.sessionId, {
        sessionId: visit.sessionId,
        visitorId: visit.visitorId,
        entryPath: visit.pathname,
        exitPath: visit.pathname,
        weight: 1,
      });
    } else {
      const session = dataset.sessions.get(visit.sessionId)!;
      session.exitPath = visit.pathname;
    }
    if (!dataset.visitors.has(visit.visitorId)) {
      dataset.visitors.set(visit.visitorId, {
        visitorId: visit.visitorId,
        weight: 1,
      });
    }
  }
  return dataset;
}

function makeFiltered(visits: DemoVisitFact[]): DemoFilteredFacts {
  const sessions = new Set(visits.map((visit) => visit.sessionId));
  const visitors = new Set(visits.map((visit) => visit.visitorId));
  const visitsBySession = new Map<string, number>();
  for (const visit of visits) {
    visitsBySession.set(
      visit.sessionId,
      (visitsBySession.get(visit.sessionId) ?? 0) + 1,
    );
  }
  return { visits, sessions, visitors, visitsBySession };
}

function makeVisit(overrides: Partial<DemoVisitFact> = {}): DemoVisitFact {
  return {
    visitId: "visit-1",
    sessionId: "s1",
    visitorId: "u1",
    startedAt: BASE_TIME,
    pathname: "/home",
    title: "Home",
    hostname: "example.test",
    referrerHost: "",
    referrerUrl: "",
    browser: "Chrome",
    browserVersion: "138",
    osVersion: "Windows 11",
    deviceType: "Desktop",
    language: "en-US",
    screenSize: "1920x1080",
    country: "US",
    regionCode: "CA",
    regionName: "California",
    region: "US::CA::California",
    cityName: "San Francisco",
    city: "US::CA::California::San Francisco",
    continent: "North America",
    timezone: "America/Los_Angeles",
    organization: "Example ISP",
    latitude: 37.7749,
    longitude: -122.4194,
    eventType: "pageview",
    durationMs: 1000,
    ...overrides,
  };
}
