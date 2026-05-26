import { describe, expect, it } from "vitest";

import {
  emptyEventFieldValues,
  emptyEventsRecords,
  emptyEventTypeDetail,
  emptyOverviewClientDimensionTabs,
  emptyOverviewGeoDimensionTabs,
  emptyOverviewGeoPoints,
  emptyPerformance,
  emptyTrend,
  emptyVisitors,
} from "@/lib/dashboard/client-empty-data";

describe("dashboard client empty data builders", () => {
  it("builds isolated empty trend and performance payloads", () => {
    const trend = emptyTrend("hour");
    const performance = emptyPerformance("day");

    expect(trend).toEqual({
      ok: true,
      interval: "hour",
      data: [],
    });
    expect(performance.interval).toBe("day");
    expect(performance.summaries.lcp).toEqual({
      avg: null,
      p50: null,
      p75: null,
      p95: null,
      samples: 0,
    });
    expect(performance.trends.lcp).toEqual([]);

    performance.trends.lcp.push({
      bucket: 0,
      timestampMs: 1,
      avg: 10,
      p50: 9,
      p75: 11,
      p95: 20,
      samples: 2,
    });
    expect(emptyPerformance("day").trends.lcp).toEqual([]);
  });

  it("preserves requested empty metadata values", () => {
    expect(emptyEventsRecords(33).meta).toMatchObject({
      page: 1,
      pageSize: 33,
      returned: 0,
      hasMore: false,
      nextPage: null,
    });
    expect(emptyEventTypeDetail("Signup").summary.eventTypes).toBe(1);
    expect(emptyEventTypeDetail("").summary.eventTypes).toBe(0);
    expect(emptyEventFieldValues("payload.plan", "string")).toEqual({
      ok: true,
      fieldPath: "payload.plan",
      fieldValueType: "string",
      data: [],
    });
  });

  it("builds empty dashboard dimension containers", () => {
    expect(emptyVisitors().meta.pageSize).toBe(0);
    expect(emptyOverviewGeoPoints()).toEqual({
      ok: true,
      data: [],
      countryCounts: [],
      regionCounts: [],
      cityCounts: [],
    });
    expect(emptyOverviewClientDimensionTabs()).toEqual({
      browser: [],
      osVersion: [],
      deviceType: [],
      language: [],
      screenSize: [],
    });
    expect(emptyOverviewGeoDimensionTabs()).toEqual({
      country: [],
      region: [],
      city: [],
      continent: [],
      timezone: [],
      organization: [],
    });
  });
});
