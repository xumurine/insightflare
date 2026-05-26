import { describe, expect, it, vi } from "vitest";

import type { DashboardFilters, QueryWindow } from "@/lib/edge/query/core";
import {
  handlePerformance,
  queryPerformanceCountriesFromD1,
  queryPerformanceRoutesFromD1,
  queryPerformanceSummariesFromD1,
  queryPerformanceTrendFromD1,
} from "@/lib/edge/query/performance";
import type { Env } from "@/lib/edge/types";

interface PreparedQuery {
  sql: string;
  bindings: Array<string | number | null>;
}

function createD1Env(rowSets: Record<string, unknown>[][] = []) {
  const calls: PreparedQuery[] = [];
  const prepare = vi.fn((sql: string) => {
    const call: PreparedQuery = { sql, bindings: [] };
    calls.push(call);
    return {
      bind: vi.fn((...bindings: Array<string | number | null>) => {
        call.bindings = bindings;
        return {
          all: vi.fn(async () => ({ results: rowSets.shift() ?? [] })),
        };
      }),
    };
  });

  return {
    env: { DB: { prepare } as unknown as D1Database } as Env,
    calls,
    prepare,
  };
}

const siteId = "site-1";
const window: QueryWindow = {
  fromMs: Date.UTC(2026, 0, 2, 1, 30),
  toMs: Date.UTC(2026, 0, 2, 3, 5),
  nowMs: Date.UTC(2026, 0, 2, 3, 5),
  timeZone: "UTC",
};
const visitBindings = [
  siteId,
  window.fromMs,
  window.toMs,
  siteId,
  window.fromMs,
  window.toMs,
];

describe("edge query performance D1 helpers", () => {
  it("maps metric summaries, leaves missing metrics empty, and binds filters", async () => {
    const { env, calls } = createD1Env([
      [
        {
          metric: "ttfb",
          samples: "4",
          avgValue: "50.1234",
          p50: 40,
          p75: 60.9876,
          p95: 80.4567,
        },
        {
          metric: "lcp",
          samples: 8,
          avgValue: 123.4567,
          p50: 100,
          p75: 150.1114,
          p95: 250.9999,
        },
        {
          metric: "unknown",
          samples: 99,
          avgValue: 999,
          p50: 999,
          p75: 999,
          p95: 999,
        },
      ],
    ]);
    const filters: DashboardFilters = {
      country: "US",
      hostname: "Example.COM",
      clientDeviceType: "desktop",
    };

    const result = await queryPerformanceSummariesFromD1(
      env,
      siteId,
      window,
      filters,
    );

    expect(result).toEqual({
      ttfb: { avg: 50.123, p50: 40, p75: 60.988, p95: 80.457, samples: 4 },
      fcp: { avg: null, p50: null, p75: null, p95: null, samples: 0 },
      lcp: {
        avg: 123.457,
        p50: 100,
        p75: 150.111,
        p95: 251,
        samples: 8,
      },
      cls: { avg: null, p50: null, p75: null, p95: null, samples: 0 },
      inp: { avg: null, p50: null, p75: null, p95: null, samples: 0 },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.sql).toContain("metric_thresholds AS");
    expect(calls[0]?.sql).toContain("FROM visits_archive");
    expect(calls[0]?.sql).toContain("perf_cls AS metricValue");
    expect(calls[0]?.bindings).toEqual([
      ...visitBindings,
      "us",
      "example.com",
      "desktop",
    ]);
  });

  it("maps metric trend buckets and constrains the requested metric column", async () => {
    const { env, calls } = createD1Env([
      [
        {
          bucket: "0",
          samples: "3",
          avgValue: 100.3333,
          p50: 80,
          p75: 120.5555,
          p95: 250.9999,
        },
        {
          bucket: 1,
          samples: 5,
          avgValue: "200",
          p50: 190,
          p75: 220,
          p95: 250,
        },
      ],
    ]);

    const result = await queryPerformanceTrendFromD1(
      env,
      siteId,
      window,
      "hour",
      { path: "/pricing" },
      "lcp",
    );

    expect(result).toEqual([
      {
        bucket: 0,
        timestampMs: Date.UTC(2026, 0, 2, 1),
        avg: 100.333,
        p50: 80,
        p75: 120.556,
        p95: 251,
        samples: 3,
      },
      {
        bucket: 1,
        timestampMs: Date.UTC(2026, 0, 2, 2),
        avg: 200,
        p50: 190,
        p75: 220,
        p95: 250,
        samples: 5,
      },
    ]);
    expect(calls[0]?.sql).toContain("perf_lcp_ms AS metricValue");
    expect(calls[0]?.sql).toContain("perf_lcp_ms IS NOT NULL");
    expect(calls[0]?.sql).toContain("ORDER BY thresholds.bucket ASC");
    expect(calls[0]?.bindings).toEqual([...visitBindings, "/pricing"]);
  });

  it("groups route metrics by normalized pathname and preserves empty metric buckets", async () => {
    const { env, calls } = createD1Env([
      [
        {
          pathname: " /pricing ",
          metric: "lcp",
          views: "9",
          samples: "3",
          avgValue: 100.4444,
          p50: 90,
          p75: 120,
          p95: 150,
        },
        {
          pathname: "/pricing",
          metric: "ttfb",
          views: 9,
          samples: 2,
          avgValue: 50,
          p50: 40,
          p75: 60,
          p95: 70,
        },
        {
          pathname: "",
          metric: "fcp",
          views: 2,
          samples: 1,
          avgValue: 80,
          p50: 80,
          p75: 80,
          p95: 80,
        },
        {
          pathname: "/ignored",
          metric: "bad",
          views: 99,
          samples: 99,
          avgValue: 999,
          p50: 999,
          p75: 999,
          p95: 999,
        },
      ],
    ]);

    const result = await queryPerformanceRoutesFromD1(
      env,
      siteId,
      window,
      { browser: "Chrome" },
      2,
    );

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      pathname: "/pricing",
      views: 9,
      metrics: {
        ttfb: { avg: 50, p50: 40, p75: 60, p95: 70, samples: 2 },
        lcp: { avg: 100.444, p50: 90, p75: 120, p95: 150, samples: 3 },
        cls: { avg: null, p50: null, p75: null, p95: null, samples: 0 },
      },
    });
    expect(result[1]).toMatchObject({
      pathname: "/",
      views: 2,
      metrics: {
        fcp: { avg: 80, p50: 80, p75: 80, p95: 80, samples: 1 },
        inp: { avg: null, p50: null, p75: null, p95: null, samples: 0 },
      },
    });
    expect(calls[0]?.sql).toContain("path_views AS");
    expect(calls[0]?.sql).toContain("LIMIT ?");
    expect(calls[0]?.bindings).toEqual([...visitBindings, "Chrome", 2]);
  });

  it("groups country metrics by uppercase country and skips invalid rows", async () => {
    const { env, calls } = createD1Env([
      [
        {
          country: " us ",
          metric: "ttfb",
          views: "6",
          samples: "3",
          avgValue: 30.3333,
          p50: 20,
          p75: 40,
          p95: 50,
        },
        {
          country: "US",
          metric: "cls",
          views: 6,
          samples: 1,
          avgValue: 0.1234,
          p50: 0.1,
          p75: 0.12,
          p95: 0.2,
        },
        {
          country: "ca",
          metric: "fcp",
          views: 2,
          samples: 1,
          avgValue: 111.1111,
          p50: 111.1111,
          p75: 111.1111,
          p95: 111.1111,
        },
        {
          country: "",
          metric: "lcp",
          views: 1,
          samples: 1,
          avgValue: 999,
          p50: 999,
          p75: 999,
          p95: 999,
        },
        {
          country: "MX",
          metric: "bad",
          views: 1,
          samples: 1,
          avgValue: 999,
          p50: 999,
          p75: 999,
          p95: 999,
        },
      ],
    ]);

    const result = await queryPerformanceCountriesFromD1(env, siteId, window, {
      geoContinent: "NA",
      geoOrganization: "Example ISP",
    });

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      country: "US",
      views: 6,
      metrics: {
        ttfb: { avg: 30.333, p50: 20, p75: 40, p95: 50, samples: 3 },
        cls: { avg: 0.123, p50: 0.1, p75: 0.12, p95: 0.2, samples: 1 },
        inp: { avg: null, p50: null, p75: null, p95: null, samples: 0 },
      },
    });
    expect(result[1]).toMatchObject({
      country: "CA",
      views: 2,
      metrics: {
        fcp: {
          avg: 111.111,
          p50: 111.111,
          p75: 111.111,
          p95: 111.111,
          samples: 1,
        },
      },
    });
    expect(calls[0]?.sql).toContain("country_views AS");
    expect(calls[0]?.sql).toContain("UPPER(TRIM(COALESCE(country, '')))");
    expect(calls[0]?.bindings).toEqual([...visitBindings, "NA", "Example ISP"]);
  });

  it("rejects invalid handlePerformance windows before querying D1", async () => {
    const { env, prepare } = createD1Env();

    const response = await handlePerformance(
      env,
      siteId,
      new URL("https://edge.test/performance?from=20&to=10"),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Invalid time window",
    });
    expect(prepare).not.toHaveBeenCalled();
  });
});
