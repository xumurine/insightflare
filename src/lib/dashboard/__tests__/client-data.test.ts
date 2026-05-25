/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  decodeHashLabel,
  decodeQueryLabel,
  emptyOverviewClientDimensionTabsData,
  emptyOverviewGeoDimensionTabsData,
  emptyOverviewGeoPointsData,
  fetchBrowserCrossBreakdown,
  fetchBrowserEngineTrend,
  fetchBrowserRadar,
  fetchBrowserTrend,
  fetchBrowserVersionBreakdown,
  fetchClientCrossBreakdown,
  fetchClientDimensionTrend,
  fetchDashboardFilterOptions,
  fetchEventRecordDetail,
  fetchEventsRecords,
  fetchEventsSummary,
  fetchEventsTrend,
  fetchEventTypeDetail,
  fetchEventTypeFieldValues,
  fetchEventTypesTab,
  fetchOverview,
  fetchOverviewClientDimensionTab,
  fetchOverviewGeoDimensionTab,
  fetchOverviewGeoPoints,
  fetchOverviewPageCardTab,
  fetchOverviewSourceCardTab,
  fetchPageCardTabs,
  fetchPageHashTab,
  fetchPageQueryTab,
  fetchPages,
  fetchPagesDashboard,
  fetchPagesShareTrend,
  fetchPerformance,
  fetchReferrerRadar,
  fetchReferrers,
  fetchReferrerTrend,
  fetchRetention,
  fetchSessionDetail,
  fetchSessions,
  fetchTrend,
  fetchUtmDimension,
  fetchUtmTrend,
  fetchVisitorDetail,
  fetchVisitors,
  normalizeOverviewRows,
  toQueryString,
  withFilters,
} from "@/lib/dashboard/client-data";

describe("Dashboard Client Data Processing Utilities", () => {
  describe("normalizeOverviewRows", () => {
    it("should correctly normalize standard valid rows", () => {
      const input = [
        { label: "Chrome", views: 120, sessions: 60, visitors: 45 },
        { label: "Firefox", views: 40, sessions: 20, visitors: 15 },
      ];
      const result = normalizeOverviewRows(input);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        label: "Chrome",
        views: 120,
        sessions: 60,
        visitors: 45,
      });
      expect(result[1]).toEqual({
        label: "Firefox",
        views: 40,
        sessions: 20,
        visitors: 15,
      });
    });

    it("should safely fall back label to value if label is missing", () => {
      const input = [{ value: "Safari", views: 10 }];
      const result = normalizeOverviewRows(input);
      expect(result[0].label).toBe("Safari");
    });

    it("should handle missing fields and string values gracefully by fallback to zero", () => {
      const input = [{ label: "Opera", views: "50", sessions: undefined }];
      const result = normalizeOverviewRows(input);
      expect(result[0].views).toBe(50);
      expect(result[0].sessions).toBe(0);
      expect(result[0].visitors).toBe(0);
    });

    it("should return empty array for non-array inputs", () => {
      expect(normalizeOverviewRows(undefined)).toEqual([]);
      expect(normalizeOverviewRows(null as any)).toEqual([]);
      expect(normalizeOverviewRows({} as any)).toEqual([]);
    });
  });

  describe("decodeHashLabel & decodeQueryLabel", () => {
    it("should parse simple hashes and queries adding prefixes if missing", () => {
      expect(decodeHashLabel("pricing")).toBe("#pricing");
      expect(decodeHashLabel("#pricing")).toBe("#pricing");

      expect(decodeQueryLabel("ref=google")).toBe("?ref=google");
      expect(decodeQueryLabel("?ref=google")).toBe("?ref=google");
    });

    it("should decode encoded URL fragments correctly", () => {
      // %E4%B8%AD%E6%96%87 is "中文"
      expect(decodeHashLabel("%E4%B8%AD%E6%96%87")).toBe("#中文");
      expect(decodeQueryLabel("q=%E4%B8%AD%E6%96%87")).toBe("?q=中文");
    });

    it("should gracefully handle malformed URL encoding without crashing", () => {
      const malformed = "%E0%A%AB"; // Invalid URI sequence
      expect(decodeHashLabel(malformed)).toBe(`#${malformed}`);
      expect(decodeQueryLabel(malformed)).toBe(`?${malformed}`);
    });

    it("should return empty string for empty inputs", () => {
      expect(decodeHashLabel("")).toBe("");
      expect(decodeHashLabel("   ")).toBe("");
      expect(decodeQueryLabel(null as any)).toBe("");
    });
  });

  describe("toQueryString & withFilters", () => {
    it("should compile flat objects into valid URI query parameters", () => {
      const params = { siteId: "123", limit: 10 };
      expect(toQueryString(params)).toBe("?siteId=123&limit=10");
      expect(toQueryString({})).toBe("");
      expect(toQueryString(undefined)).toBe("");
    });

    it("should correctly map filters into request parameters object", () => {
      const baseParams = { siteId: "123" };
      const filters = {
        country: "US",
        browser: "Chrome",
        path: "/docs",
        eventPayloadFilters: [
          { path: "user.role", operator: "eq", value: "admin" },
        ],
      };

      const withResult = withFilters(baseParams, filters as any);
      expect(withResult.siteId).toBe("123");
      expect(withResult.country).toBe("US");
      expect(withResult.browser).toBe("Chrome");
      expect(withResult.path).toBe("/docs");
      expect(withResult.eventPayloadFilters).toBeTypeOf("string");
      expect(JSON.parse(withResult.eventPayloadFilters as string)).toEqual(
        filters.eventPayloadFilters,
      );
    });

    it("should skip mapping filters if filters object is empty or undefined", () => {
      const baseParams = { siteId: "123" };
      expect(withFilters(baseParams, undefined)).toEqual(baseParams);
    });
  });

  describe("API Data Fetching in Demo Mode", () => {
    const mockWindow = {
      preset: "24h" as const,
      from: Date.now() - 24 * 60 * 60 * 1000,
      to: Date.now(),
      timeZone: "UTC",
      interval: "hour" as const,
    };

    beforeAll(() => {
      process.env.NEXT_PUBLIC_DEMO_MODE = "1";
    });

    afterAll(() => {
      delete process.env.NEXT_PUBLIC_DEMO_MODE;
    });

    it("should fetch all dashboard metrics correctly under demo mode", async () => {
      // 1. Overview
      const overview = await fetchOverview("demo-site-001", mockWindow);
      expect(overview).toBeDefined();

      // 2. Trend
      const trend = await fetchTrend("demo-site-001", mockWindow);
      expect(trend).toBeDefined();

      // 3. Pages
      const pages = await fetchPages("demo-site-001", mockWindow);
      expect(pages).toBeDefined();

      // 4. Visitors & detail
      const visitors = await fetchVisitors("demo-site-001", mockWindow);
      expect(visitors).toBeDefined();
      const visitorDetail = await fetchVisitorDetail(
        "demo-site-001",
        "visitor-1",
      );
      expect(visitorDetail).toBeDefined();

      // 5. Sessions & detail
      const sessions = await fetchSessions("demo-site-001", mockWindow);
      expect(sessions).toBeDefined();
      const sessionDetail = await fetchSessionDetail(
        "demo-site-001",
        "session-1",
      );
      expect(sessionDetail).toBeDefined();

      // 6. Events & Records
      const eventsSummary = await fetchEventsSummary(
        "demo-site-001",
        mockWindow,
      );
      expect(eventsSummary).toBeDefined();
      const eventsTrend = await fetchEventsTrend("demo-site-001", mockWindow);
      expect(eventsTrend).toBeDefined();
      const eventsRecords = await fetchEventsRecords(
        "demo-site-001",
        mockWindow,
      );
      expect(eventsRecords).toBeDefined();
      const eventTypeDetail = await fetchEventTypeDetail(
        "demo-site-001",
        mockWindow,
        "Click",
      );
      expect(eventTypeDetail).toBeDefined();
      const eventTypeFieldValues = await fetchEventTypeFieldValues(
        "demo-site-001",
        mockWindow,
        "Click",
        "btn",
        "string",
      );
      expect(eventTypeFieldValues).toBeDefined();
      const eventRecordDetail = await fetchEventRecordDetail(
        "demo-site-001",
        "event-1",
      );
      expect(eventRecordDetail).toBeDefined();

      // 7. Performance & Retention
      const performance = await fetchPerformance("demo-site-001", mockWindow);
      expect(performance).toBeDefined();
      const retention = await fetchRetention("demo-site-001", mockWindow);
      expect(retention).toBeDefined();

      // 8. Pages & Share Trend & Referrers
      const pagesDashboard = await fetchPagesDashboard(
        "demo-site-001",
        mockWindow,
      );
      expect(pagesDashboard).toBeDefined();
      const pagesShareTrend = await fetchPagesShareTrend(
        "demo-site-001",
        mockWindow,
      );
      expect(pagesShareTrend).toBeDefined();
      const pageCardTabs = await fetchPageCardTabs("demo-site-001", mockWindow);
      expect(pageCardTabs).toBeDefined();
      const referrers = await fetchReferrers("demo-site-001", mockWindow);
      expect(referrers).toBeDefined();

      // 9. UTM
      const utmDimension = await fetchUtmDimension(
        "demo-site-001",
        mockWindow,
        "source",
      );
      expect(utmDimension).toBeDefined();
      const utmTrend = await fetchUtmTrend(
        "demo-site-001",
        mockWindow,
        "source",
      );
      expect(utmTrend).toBeDefined();

      // 10. Geo & Maps
      const geoPoints = await fetchOverviewGeoPoints(
        "demo-site-001",
        mockWindow,
      );
      expect(geoPoints).toBeDefined();

      // 11. Overview Tabs
      const overviewPageCardTab = await fetchOverviewPageCardTab(
        "demo-site-001",
        mockWindow,
        "path",
      );
      expect(overviewPageCardTab).toBeDefined();
      const pageHashTab = await fetchPageHashTab("demo-site-001", mockWindow);
      expect(pageHashTab).toBeDefined();
      const pageQueryTab = await fetchPageQueryTab("demo-site-001", mockWindow);
      expect(pageQueryTab).toBeDefined();
      const overviewSourceCardTab = await fetchOverviewSourceCardTab(
        "demo-site-001",
        mockWindow,
        "domain",
      );
      expect(overviewSourceCardTab).toBeDefined();
      const eventTypesTab = await fetchEventTypesTab(
        "demo-site-001",
        mockWindow,
      );
      expect(eventTypesTab).toBeDefined();
      const referrerTrend = await fetchReferrerTrend(
        "demo-site-001",
        mockWindow,
      );
      expect(referrerTrend).toBeDefined();

      // 12. Client Dimensions
      const clientDimensionTab = await fetchOverviewClientDimensionTab(
        "demo-site-001",
        mockWindow,
        "browser",
      );
      expect(clientDimensionTab).toBeDefined();
      const geoDimensionTab = await fetchOverviewGeoDimensionTab(
        "demo-site-001",
        mockWindow,
        "country",
      );
      expect(geoDimensionTab).toBeDefined();
      const filterOptions = await fetchDashboardFilterOptions(
        "demo-site-001",
        mockWindow,
        "country",
      );
      expect(filterOptions).toBeDefined();

      // 13. Advanced breakdowns
      const clientDimensionTrend = await fetchClientDimensionTrend(
        "demo-site-001",
        mockWindow,
        "browser",
      );
      expect(clientDimensionTrend).toBeDefined();
      const clientCrossBreakdown = await fetchClientCrossBreakdown(
        "demo-site-001",
        mockWindow,
        "browser",
        "deviceType",
      );
      expect(clientCrossBreakdown).toBeDefined();
      const browserTrend = await fetchBrowserTrend("demo-site-001", mockWindow);
      expect(browserTrend).toBeDefined();
      const browserEngineTrend = await fetchBrowserEngineTrend(
        "demo-site-001",
        mockWindow,
      );
      expect(browserEngineTrend).toBeDefined();
      const browserVersionBreakdown = await fetchBrowserVersionBreakdown(
        "demo-site-001",
        mockWindow,
      );
      expect(browserVersionBreakdown).toBeDefined();
      const browserCrossBreakdown = await fetchBrowserCrossBreakdown(
        "demo-site-001",
        mockWindow,
      );
      expect(browserCrossBreakdown).toBeDefined();
      const browserRadar = await fetchBrowserRadar("demo-site-001", mockWindow);
      expect(browserRadar).toBeDefined();
      const referrerRadar = await fetchReferrerRadar(
        "demo-site-001",
        mockWindow,
      );
      expect(referrerRadar).toBeDefined();
    });

    it("should handle empty parameter fallbacks gracefully", async () => {
      // Test invalid inputs resulting in empty return datasets
      const emptyVisDetail = await fetchVisitorDetail("demo-site-001", "");
      expect(emptyVisDetail.data).toBeNull();

      const emptySesDetail = await fetchSessionDetail("demo-site-001", "");
      expect(emptySesDetail.data).toBeNull();

      const emptyEvtDetail = await fetchEventTypeDetail(
        "demo-site-001",
        mockWindow,
        "",
      );
      expect(emptyEvtDetail.summary.events).toBe(0);

      const emptyEvtField = await fetchEventTypeFieldValues(
        "demo-site-001",
        mockWindow,
        "",
        "",
        "string",
      );
      expect(emptyEvtField.data).toHaveLength(0);

      const emptyEvtRecord = await fetchEventRecordDetail("demo-site-001", "");
      expect(emptyEvtRecord.data).toBeNull();

      // Call exported empty objects
      expect(emptyOverviewClientDimensionTabsData()).toBeDefined();
      expect(emptyOverviewGeoDimensionTabsData()).toBeDefined();
      expect(emptyOverviewGeoPointsData()).toBeDefined();
    });
  });
});
