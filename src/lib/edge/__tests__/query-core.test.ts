import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  appendSqlConditions,
  buildEventFilterSql,
  buildEventPayloadFilterSql,
  buildTimeBuckets,
  buildVisitFilterSql,
  DIRECT_REFERRER_FILTER_VALUE,
  emptyPerformanceRouteMetrics,
  eventRecordOrderBy,
  mapOverviewAggregate,
  mapTabs,
  mapTrendRows,
  mapVisitPerformanceMetrics,
  parseEventPayloadFilters,
  parseEventRecordSort,
  parseFilters,
  parseGeoFilterValue,
  parseInterval,
  parseLimit,
  parseQueryLimit,
  parseSessionListSort,
  parseVisitorListSort,
  parseWindow,
  performanceMetricColumn,
  type QueryWindow,
  RETENTION_DAYS,
  shareTrendSeriesKey,
  sourceLabel,
  timeBucketCase,
  timeBucketTimestamp,
} from "@/lib/edge/query/core";

const fixedNow = Date.UTC(2026, 4, 26, 8);

function url(search = "") {
  return new URL(`https://edge.test/query${search}`);
}

describe("edge query core parsers", () => {
  beforeEach(() => {
    vi.spyOn(Date, "now").mockReturnValue(fixedNow);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parses valid windows, defaults, and invalid ranges", () => {
    expect(
      parseWindow(
        url("?from=1700000000123.9&to=1700003600999.5&tz=Asia/Tokyo"),
      ),
    ).toEqual({
      fromMs: 1_700_000_000_123,
      toMs: 1_700_003_600_999,
      nowMs: fixedNow,
      timeZone: "Asia/Tokyo",
    });

    expect(parseWindow(url("?timeZone=Bad/Zone"))).toEqual({
      fromMs: fixedNow - 86_400_000,
      toMs: fixedNow,
      nowMs: fixedNow,
      timeZone: "UTC",
    });

    expect(parseWindow(url("?from=-1&to=10"))).toBeNull();
    expect(parseWindow(url("?from=20&to=10"))).toBeNull();
  });

  it("parses intervals and clamps limits", () => {
    expect(parseInterval(url("?interval=HOUR"))).toBe("hour");
    expect(parseInterval(url("?interval=minute"))).toBe("minute");
    expect(parseInterval(url("?interval=bad"))).toBe("day");

    expect(parseLimit(url("?limit=12.9"), 20, 50)).toBe(12);
    expect(parseLimit(url("?limit=0"), 20, 50)).toBe(20);
    expect(parseLimit(url("?limit=250"), 20, 50)).toBe(50);

    expect(parseQueryLimit(url("?pageSize=12.9"), "pageSize", 20, 5, 50)).toBe(
      12,
    );
    expect(parseQueryLimit(url("?pageSize=1"), "pageSize", 20, 5, 50)).toBe(5);
    expect(parseQueryLimit(url("?pageSize=500"), "pageSize", 20, 5, 50)).toBe(
      50,
    );
    expect(parseQueryLimit(url("?pageSize=nope"), "pageSize", 20, 5, 50)).toBe(
      20,
    );
  });

  it("parses list sort keys and falls back to defaults", () => {
    expect(
      parseVisitorListSort(url("?sortBy=firstSeenAt&sortDir=asc")),
    ).toEqual({ key: "firstSeenAt", direction: "asc" });
    expect(parseVisitorListSort(url("?sortBy=unknown&sortDir=asc"))).toEqual({
      key: "lastSeenAt",
      direction: "desc",
    });

    expect(parseSessionListSort(url("?sortBy=durationMs"))).toEqual({
      key: "durationMs",
      direction: "desc",
    });
    expect(parseSessionListSort(url("?sortBy=lastSeenAt&sortDir=asc"))).toEqual(
      {
        key: "startedAt",
        direction: "desc",
      },
    );

    expect(parseEventRecordSort(url("?sortBy=pathname&sortDir=asc"))).toEqual({
      key: "pathname",
      direction: "asc",
    });
    expect(parseEventRecordSort(url("?sortBy=views&sortDir=asc"))).toEqual({
      key: "occurredAt",
      direction: "desc",
    });
  });

  it("normalizes dashboard filters and event payload filter rules", () => {
    const payloadFilters = JSON.stringify([
      { path: "$.plan.name", operator: "!=", value: " pro " },
      { path: "/totals/paid", operator: "eq", value: 42 },
      { path: "flags[0].enabled", operator: "ne", value: true },
      { path: "empty", value: null },
      { path: "/", value: "skip" },
      { path: "bad", value: { unsupported: true } },
    ]);

    expect(parseEventPayloadFilters(payloadFilters)).toEqual([
      { path: "/plan/name", operator: "ne", value: " pro " },
      { path: "/totals/paid", operator: "eq", value: 42 },
      { path: "/flags/*/enabled", operator: "ne", value: true },
      { path: "/empty", operator: "eq", value: null },
    ]);

    const parsed = parseFilters(
      url(
        `?country= US &device=desktop&browser= Chrome &path=%20/docs%20` +
          `&query=ref%3Dhome&title=Docs&hostname=Example.COM` +
          `&entry=/&exit=/pricing&sourceDomain=News.Example` +
          `&sourceLink=https%3A%2F%2Fnews.example%2Fpost` +
          `&clientBrowser=Safari&clientOsVersion=17&clientDeviceType=mobile` +
          `&clientLanguage=en-US&clientScreenSize=390x844` +
          `&geoCountry=CA&geoRegion=CA%3A%3ABC%3A%3ABritish%20Columbia` +
          `&geoContinent=NA&geoTimezone=America%2FVancouver` +
          `&geoOrganization=Example%20ISP` +
          `&eventPayloadFilters=${encodeURIComponent(payloadFilters)}`,
      ),
    );

    expect(parsed).toMatchObject({
      country: "US",
      device: "desktop",
      browser: "Chrome",
      path: "/docs",
      query: "ref=home",
      title: "Docs",
      hostname: "Example.COM",
      entry: "/",
      exit: "/pricing",
      sourceDomain: "News.Example",
      sourceLink: "https://news.example/post",
      clientBrowser: "Safari",
      clientOsVersion: "17",
      clientDeviceType: "mobile",
      clientLanguage: "en-US",
      clientScreenSize: "390x844",
      geo: "CA",
      geoContinent: "NA",
      geoTimezone: "America/Vancouver",
      geoOrganization: "Example ISP",
      eventPayloadFilters: [
        { path: "/plan/name", operator: "ne", value: " pro " },
        { path: "/totals/paid", operator: "eq", value: 42 },
        { path: "/flags/*/enabled", operator: "ne", value: true },
        { path: "/empty", operator: "eq", value: null },
      ],
    });

    expect(parseEventPayloadFilters("not json")).toBeUndefined();
    expect(
      parseEventPayloadFilters(JSON.stringify({ path: "/plan" })),
    ).toBeUndefined();
  });
});

describe("edge query core time helpers", () => {
  const nowMs = Date.UTC(2026, 4, 26);
  const cutoff = nowMs - RETENTION_DAYS * 86_400_000;

  function window(fromMs: number, toMs: number): QueryWindow {
    return { fromMs, toMs, nowMs, timeZone: "UTC" };
  }

  it("labels query windows by detail/archive coverage", () => {
    expect(sourceLabel(window(cutoff, nowMs))).toBe("detail");
    expect(sourceLabel(window(cutoff - 1, cutoff))).toBe("mixed");
    expect(sourceLabel(window(cutoff - 86_400_000, cutoff - 1))).toBe(
      "archive",
    );
  });

  it("builds zoned buckets and SQL bucket cases", () => {
    const queryWindow: QueryWindow = {
      fromMs: Date.UTC(2026, 0, 2, 1, 30),
      toMs: Date.UTC(2026, 0, 2, 3, 5),
      nowMs,
      timeZone: "UTC",
    };

    const buckets = buildTimeBuckets(queryWindow, "hour");

    expect(buckets).toEqual([
      {
        index: 0,
        timestampMs: Date.UTC(2026, 0, 2, 1),
        fromMs: Date.UTC(2026, 0, 2, 1),
        toMs: Date.UTC(2026, 0, 2, 2),
      },
      {
        index: 1,
        timestampMs: Date.UTC(2026, 0, 2, 2),
        fromMs: Date.UTC(2026, 0, 2, 2),
        toMs: Date.UTC(2026, 0, 2, 3),
      },
      {
        index: 2,
        timestampMs: Date.UTC(2026, 0, 2, 3),
        fromMs: Date.UTC(2026, 0, 2, 3),
        toMs: Date.UTC(2026, 0, 2, 4),
      },
    ]);

    expect(timeBucketTimestamp(buckets, 1)).toBe(Date.UTC(2026, 0, 2, 2));
    expect(timeBucketTimestamp(buckets, 99)).toBe(0);

    expect(timeBucketCase(buckets.slice(0, 2), "started_at")).toEqual({
      sql:
        `CASE WHEN started_at >= ${Date.UTC(2026, 0, 2, 1)} ` +
        `AND started_at < ${Date.UTC(2026, 0, 2, 2)} THEN 0 ` +
        `WHEN started_at >= ${Date.UTC(2026, 0, 2, 2)} ` +
        `AND started_at < ${Date.UTC(2026, 0, 2, 3)} THEN 1 ELSE NULL END`,
      bindings: [],
    });
  });
});

describe("edge query core mappers", () => {
  it("maps overview aggregate rows with derived rates", () => {
    expect(
      mapOverviewAggregate(
        {
          views: 10,
          sessions: 4,
          visitors: 3,
          bounces: 1,
          totalDuration: 1_001,
          durationViews: 2,
        },
        { approximateVisitors: true },
      ),
    ).toEqual({
      views: 10,
      sessions: 4,
      visitors: 3,
      bounces: 1,
      totalDurationMs: 1_001,
      avgDurationMs: 250,
      bounceRate: 0.25,
      approximateVisitors: true,
    });
  });

  it("maps trend rows and tab rows", () => {
    expect(
      mapTrendRows(
        [
          {
            bucket: 2,
            timestampMs: 123,
            views: 8,
            visitors: 5,
            sessions: 2,
            bounces: 1,
            totalDuration: 999,
            durationViews: 0,
          },
        ],
        "mixed",
      ),
    ).toEqual([
      {
        bucket: 2,
        timestampMs: 123,
        views: 8,
        visitors: 5,
        sessions: 2,
        bounces: 1,
        totalDurationMs: 999,
        avgDurationMs: 500,
        source: "mixed",
      },
    ]);

    expect(
      mapTabs([
        { value: "/docs", views: 7, sessions: 4, visitors: 3 },
        { value: "", views: 1, sessions: 1, visitors: 1 },
      ]),
    ).toEqual([
      { label: "/docs", views: 7, sessions: 4, visitors: 3 },
      { label: "", views: 1, sessions: 1, visitors: 1 },
    ]);
  });
});

describe("edge query core share trend keys", () => {
  it("normalizes labels and avoids collisions", () => {
    const usedKeys = new Set<string>();

    expect(shareTrendSeriesKey("Chrome 124", usedKeys, "series")).toBe(
      "chrome-124",
    );
    expect(shareTrendSeriesKey("Chrome/124", usedKeys, "series")).toBe(
      "chrome-124-2",
    );
    expect(shareTrendSeriesKey("   !!!   ", usedKeys, "series")).toBe("series");
    expect(shareTrendSeriesKey("", usedKeys, "series")).toBe("series-2");
    expect([...usedKeys]).toEqual([
      "chrome-124",
      "chrome-124-2",
      "series",
      "series-2",
    ]);
  });
});

describe("edge query core SQL helpers", () => {
  it("appends SQL conditions without dropping existing clauses", () => {
    expect(
      appendSqlConditions("", ["", " started_at >= ? ", "site_id = ?"]),
    ).toBe("WHERE started_at >= ? AND site_id = ?");
    expect(
      appendSqlConditions("WHERE status = 'active'", [
        "started_at >= ?",
        "  ",
        "started_at < ?",
      ]),
    ).toBe("WHERE status = 'active' AND started_at >= ? AND started_at < ?");
  });

  it("builds visit filters for direct traffic, client dimensions, and geo values", () => {
    const filter = buildVisitFilterSql(
      {
        country: "US",
        sourceDomain: DIRECT_REFERRER_FILTER_VALUE,
        sourceLink: "HTTPS://REF.EXAMPLE/POST",
        clientOsVersion: "macOS 14",
        clientScreenSize: "1440x900",
        geo: "US::CA::California::San Francisco",
      },
      "v",
    );

    expect(filter.clause).toContain("LOWER(TRIM(COALESCE(v.country, ''))) = ?");
    expect(filter.clause).toContain("TRIM(COALESCE(v.referrer_host, '')) = ''");
    expect(filter.clause).toContain(
      "LOWER(TRIM(COALESCE(v.referrer_url, ''))) = ?",
    );
    expect(filter.clause).toContain("v.os || ' ' || v.os_version");
    expect(filter.clause).toContain(
      "CAST(v.screen_width AS TEXT) || 'x' || CAST(v.screen_height AS TEXT)",
    );
    expect(filter.clause).toContain(
      "UPPER(TRIM(CASE WHEN TRIM(COALESCE(v.region_code, '')) != '' THEN v.region_code ELSE v.region END)) IN (?, ?)",
    );
    expect(filter.clause).toContain("LOWER(TRIM(COALESCE(v.city, ''))) = ?");
    expect(filter.bindings).toEqual([
      "us",
      "https://ref.example/post",
      "macOS 14",
      "1440x900",
      "us",
      "CA",
      "CALIFORNIA",
      "san francisco",
    ]);
  });

  it("parses geo filter values and removes geo filters without mutating other keys", () => {
    expect(parseGeoFilterValue("US::CA::California::San Francisco")).toEqual({
      country: "US",
      regionCode: "CA",
      regionName: "California",
      city: "San Francisco",
    });
    expect(parseGeoFilterValue("bad")).toBeNull();
  });

  it("builds event payload and event filters with typed bindings", () => {
    const payload = buildEventPayloadFilterSql(
      {
        eventPayloadFilters: [
          { path: "$.plan", operator: "eq", value: "pro" },
          { path: "/paid", operator: "ne", value: true },
          { path: "/score", operator: "eq", value: 42 },
          { path: "/missing", operator: "ne", value: null },
        ],
      },
      "ev",
    );

    expect(payload.clauses).toHaveLength(4);
    expect(payload.clauses.join("\n")).toContain("epv0.event_pk = ev.event_pk");
    expect(payload.clauses.join("\n")).toContain(
      "COALESCE(epv0.string_value, '') = ?",
    );
    expect(payload.clauses.join("\n")).toContain("epv1.boolean_value != ?");
    expect(payload.clauses.join("\n")).toContain("epv2.number_value = ?");
    expect(payload.clauses.join("\n")).toContain("epv3.value_type != ?");
    expect(payload.bindings).toEqual([
      "/plan",
      1,
      "pro",
      "/paid",
      3,
      1,
      "/score",
      2,
      42,
      "/missing",
      0,
    ]);

    const eventFilter = buildEventFilterSql(
      {
        browser: "Chrome",
        eventPayloadFilters: [{ path: "/plan", operator: "eq", value: "pro" }],
      },
      "ev",
      { eventName: "signup", search: "Checkout" },
    );

    expect(eventFilter.clause).toContain("TRIM(COALESCE(ev.browser, '')) = ?");
    expect(eventFilter.clause).toContain(
      "TRIM(COALESCE(ev.event_name, '')) = ?",
    );
    expect(eventFilter.clause).toContain(
      "LOWER(TRIM(COALESCE(ev.event_id, ''))) LIKE ?",
    );
    expect(eventFilter.bindings).toEqual([
      "Chrome",
      "/plan",
      1,
      "pro",
      "signup",
      "%checkout%",
      "%checkout%",
      "%checkout%",
      "%checkout%",
      "%checkout%",
      "%checkout%",
      "%checkout%",
      "%checkout%",
    ]);
  });

  it("builds deterministic event ordering clauses", () => {
    expect(eventRecordOrderBy({ key: "eventName", direction: "asc" })).toBe(
      "eventName ASC, occurredAt DESC, eventId DESC",
    );
    expect(eventRecordOrderBy({ key: "pathname", direction: "desc" })).toBe(
      "pathname DESC, occurredAt DESC, eventId DESC",
    );
    expect(eventRecordOrderBy({ key: "occurredAt", direction: "asc" })).toBe(
      "occurredAt ASC, eventId ASC",
    );
  });
});

describe("edge query core performance helpers", () => {
  it("maps visit performance metrics with nullable and rounded values", () => {
    expect(
      mapVisitPerformanceMetrics({
        perfTtfbMs: "125.1234",
        perfFcpMs: "",
        perfLcpMs: "-1",
        perfCls: 0.12345,
        perfInpMs: Number.NaN,
      }),
    ).toEqual({
      ttfb: 125.123,
      fcp: null,
      lcp: null,
      cls: 0.123,
      inp: null,
    });
  });

  it("returns known performance metric columns and empty route metrics", () => {
    expect(performanceMetricColumn("lcp")).toBe("perf_lcp_ms");
    expect(emptyPerformanceRouteMetrics()).toEqual({
      ttfb: { avg: null, p50: null, p75: null, p95: null, samples: 0 },
      fcp: { avg: null, p50: null, p75: null, p95: null, samples: 0 },
      lcp: { avg: null, p50: null, p75: null, p95: null, samples: 0 },
      cls: { avg: null, p50: null, p75: null, p95: null, samples: 0 },
      inp: { avg: null, p50: null, p75: null, p95: null, samples: 0 },
    });
  });
});
