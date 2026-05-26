import { describe, expect, it, vi } from "vitest";

import type { QueryWindow } from "@/lib/edge/query/core";
import {
  BROWSER_CROSS_OTHER_BROWSER_TOKEN,
  BROWSER_CROSS_OTHER_DIMENSION_TOKEN,
  BROWSER_CROSS_UNKNOWN_TOKEN,
  CLIENT_CROSS_OTHER_PRIMARY_TOKEN,
  CLIENT_CROSS_OTHER_SECONDARY_TOKEN,
  CLIENT_CROSS_UNKNOWN_TOKEN,
  SHARE_TREND_OTHER_KEY,
  SHARE_TREND_OTHER_LABEL,
  SHARE_TREND_OTHER_TOKEN,
} from "@/lib/edge/query/core";
import {
  queryBrowserCrossDimensionFromD1,
  queryBrowserVersionBreakdownFromD1,
} from "@/lib/edge/query/technology/browser";
import { queryClientCrossDimensionFromD1 } from "@/lib/edge/query/technology/client-cross";
import {
  queryBrowserRadarFromD1,
  queryReferrerRadarFromD1,
} from "@/lib/edge/query/technology/radar";
import { queryShareTrendFromD1 } from "@/lib/edge/query/technology/share-trend";
import type { Env } from "@/lib/edge/types";

type D1Row = Record<string, unknown>;

interface QueryCall {
  sql: string;
  bindings: Array<string | number | null>;
}

const siteId = "site-technology";
const window: QueryWindow = {
  fromMs: Date.UTC(2026, 0, 1, 0),
  toMs: Date.UTC(2026, 0, 1, 2),
  nowMs: Date.UTC(2026, 0, 1, 3),
  timeZone: "UTC",
};

function createD1Env(resultSets: D1Row[][]): {
  env: Env;
  calls: QueryCall[];
} {
  const calls: QueryCall[] = [];
  const pendingResults = [...resultSets];
  const prepare = vi.fn((sql: string) => ({
    bind: vi.fn((...bindings: Array<string | number | null>) => ({
      all: vi.fn(async () => {
        calls.push({ sql, bindings });
        return { results: pendingResults.shift() ?? [] };
      }),
    })),
  }));

  return {
    env: {
      DB: { prepare },
      DAILY_SALT_SECRET: "test-secret",
      INGEST_DO: {},
    } as unknown as Env,
    calls,
  };
}

function visitBindings() {
  return [
    siteId,
    window.fromMs,
    window.toMs,
    siteId,
    window.fromMs,
    window.toMs,
  ];
}

describe("edge technology query coverage", () => {
  it("returns an empty browser version breakdown without a browser limit", async () => {
    const { env, calls } = createD1Env([[]]);

    await expect(
      queryBrowserVersionBreakdownFromD1(
        env,
        siteId,
        window,
        {},
        Number.NaN,
        2,
      ),
    ).resolves.toEqual([]);

    expect(calls).toHaveLength(1);
    expect(calls[0].sql).not.toContain("LIMIT ?");
    expect(calls[0].bindings).toEqual(visitBindings());
  });

  it("maps browser cross dimensions with unknown and other buckets", async () => {
    const { env, calls } = createD1Env([
      [
        { browser: "Chrome", views: 10, visitors: 8, sessions: 5 },
        { browser: "Safari", views: 7, visitors: 4, sessions: 4 },
        { browser: "Edge", views: 5, visitors: 3, sessions: 3 },
        { browser: "", views: 9, visitors: 9, sessions: 9 },
        { browser: "Ignored", views: 9, visitors: 0, sessions: 0 },
      ],
      [
        { dimension: "Windows", views: 8, visitors: 7, sessions: 5 },
        { dimension: "", views: 2, visitors: 2, sessions: 2 },
        { dimension: "Ignored", views: 9, visitors: 0, sessions: 0 },
      ],
      [
        {
          browser: "Chrome",
          dimension: "Windows",
          views: 4,
          visitors: 4,
          sessions: 3,
        },
        {
          browser: "Chrome",
          dimension: BROWSER_CROSS_UNKNOWN_TOKEN,
          views: 1,
          visitors: 1,
          sessions: 1,
        },
        {
          browser: "Chrome",
          dimension: BROWSER_CROSS_OTHER_DIMENSION_TOKEN,
          views: 2,
          visitors: 2,
          sessions: 2,
        },
        {
          browser: "Safari",
          dimension: "Windows",
          views: 3,
          visitors: 3,
          sessions: 2,
        },
        {
          browser: BROWSER_CROSS_OTHER_BROWSER_TOKEN,
          dimension: "Windows",
          views: 2,
          visitors: 2,
          sessions: 1,
        },
        {
          browser: BROWSER_CROSS_OTHER_BROWSER_TOKEN,
          dimension: BROWSER_CROSS_OTHER_DIMENSION_TOKEN,
          views: 1,
          visitors: 1,
          sessions: 1,
        },
        {
          browser: "",
          dimension: "Windows",
          views: 9,
          visitors: 9,
          sessions: 9,
        },
        {
          browser: "Chrome",
          dimension: "",
          views: 9,
          visitors: 9,
          sessions: 9,
        },
        {
          browser: "Chrome",
          dimension: "Windows",
          views: 9,
          visitors: 0,
          sessions: 0,
        },
      ],
    ]);

    const result = await queryBrowserCrossDimensionFromD1(
      env,
      siteId,
      window,
      {},
      99,
      0,
      "TRIM(COALESCE(os, ''))",
      "os",
    );

    expect(result.columns).toEqual([
      { key: "windows", label: "Windows", views: 8, visitors: 7, sessions: 5 },
      {
        key: "unknown",
        label: "Unknown",
        views: 2,
        visitors: 2,
        sessions: 2,
        isUnknown: true,
      },
      {
        key: "other",
        label: SHARE_TREND_OTHER_LABEL,
        views: 3,
        visitors: 3,
        sessions: 3,
        isOther: true,
      },
    ]);
    expect(result.rows).toEqual([
      {
        key: "chrome",
        label: "Chrome",
        views: 7,
        visitors: 7,
        sessions: 6,
        cells: [
          {
            key: "windows",
            label: "Windows",
            views: 4,
            visitors: 4,
            sessions: 3,
          },
          {
            key: "unknown",
            label: "Unknown",
            views: 1,
            visitors: 1,
            sessions: 1,
            isUnknown: true,
          },
          {
            key: "other",
            label: SHARE_TREND_OTHER_LABEL,
            views: 2,
            visitors: 2,
            sessions: 2,
            isOther: true,
          },
        ],
      },
      {
        key: "safari",
        label: "Safari",
        views: 3,
        visitors: 3,
        sessions: 2,
        cells: [
          {
            key: "windows",
            label: "Windows",
            views: 3,
            visitors: 3,
            sessions: 2,
          },
          {
            key: "unknown",
            label: "Unknown",
            views: 0,
            visitors: 0,
            sessions: 0,
            isUnknown: true,
          },
          {
            key: "other",
            label: SHARE_TREND_OTHER_LABEL,
            views: 0,
            visitors: 0,
            sessions: 0,
            isOther: true,
          },
        ],
      },
      {
        key: "edge",
        label: "Edge",
        views: 5,
        visitors: 3,
        sessions: 3,
        cells: [
          {
            key: "windows",
            label: "Windows",
            views: 0,
            visitors: 0,
            sessions: 0,
          },
          {
            key: "unknown",
            label: "Unknown",
            views: 0,
            visitors: 0,
            sessions: 0,
            isUnknown: true,
          },
          {
            key: "other",
            label: SHARE_TREND_OTHER_LABEL,
            views: 0,
            visitors: 0,
            sessions: 0,
            isOther: true,
          },
        ],
      },
      {
        key: "other",
        label: SHARE_TREND_OTHER_LABEL,
        views: 3,
        visitors: 3,
        sessions: 2,
        isOther: true,
        cells: [
          {
            key: "windows",
            label: "Windows",
            views: 2,
            visitors: 2,
            sessions: 1,
          },
          {
            key: "unknown",
            label: "Unknown",
            views: 0,
            visitors: 0,
            sessions: 0,
            isUnknown: true,
          },
          {
            key: "other",
            label: SHARE_TREND_OTHER_LABEL,
            views: 1,
            visitors: 1,
            sessions: 1,
            isOther: true,
          },
        ],
      },
    ]);
    expect(result.totalVisitors).toBe(16);
    expect(calls[0].bindings.at(-1)).toBe(12);
    expect(calls[1].bindings.at(-1)).toBe(1);
  });

  it("returns empty browser cross dimensions when top buckets are missing", async () => {
    const noBrowsers = createD1Env([[]]);
    const noDimensions = createD1Env([
      [{ browser: "Chrome", views: 1, visitors: 1, sessions: 1 }],
      [],
    ]);

    await expect(
      queryBrowserCrossDimensionFromD1(
        noBrowsers.env,
        siteId,
        window,
        {},
        3,
        3,
        "TRIM(COALESCE(os, ''))",
        "os",
      ),
    ).resolves.toEqual({ columns: [], rows: [], totalVisitors: 0 });
    await expect(
      queryBrowserCrossDimensionFromD1(
        noDimensions.env,
        siteId,
        window,
        {},
        3,
        3,
        "TRIM(COALESCE(os, ''))",
        "os",
      ),
    ).resolves.toEqual({ columns: [], rows: [], totalVisitors: 0 });

    expect(noBrowsers.calls).toHaveLength(1);
    expect(noDimensions.calls).toHaveLength(2);
  });

  it("maps client cross dimensions with unknown and other buckets", async () => {
    const { env } = createD1Env([
      [
        { primaryValue: "Chrome", views: 10, visitors: 8, sessions: 5 },
        { primaryValue: "Safari", views: 7, visitors: 4, sessions: 4 },
        { primaryValue: "Edge", views: 5, visitors: 3, sessions: 3 },
      ],
      [
        { secondaryValue: "desktop", views: 8, visitors: 7, sessions: 5 },
        { secondaryValue: "", views: 2, visitors: 2, sessions: 2 },
      ],
      [
        {
          primaryValue: "Chrome",
          secondaryValue: "desktop",
          views: 4,
          visitors: 4,
          sessions: 3,
        },
        {
          primaryValue: "Chrome",
          secondaryValue: CLIENT_CROSS_UNKNOWN_TOKEN,
          views: 1,
          visitors: 1,
          sessions: 1,
        },
        {
          primaryValue: "Chrome",
          secondaryValue: CLIENT_CROSS_OTHER_SECONDARY_TOKEN,
          views: 2,
          visitors: 2,
          sessions: 2,
        },
        {
          primaryValue: "Safari",
          secondaryValue: "desktop",
          views: 3,
          visitors: 3,
          sessions: 2,
        },
        {
          primaryValue: CLIENT_CROSS_OTHER_PRIMARY_TOKEN,
          secondaryValue: "desktop",
          views: 2,
          visitors: 2,
          sessions: 1,
        },
        {
          primaryValue: CLIENT_CROSS_OTHER_PRIMARY_TOKEN,
          secondaryValue: CLIENT_CROSS_OTHER_SECONDARY_TOKEN,
          views: 1,
          visitors: 1,
          sessions: 1,
        },
      ],
    ]);

    const result = await queryClientCrossDimensionFromD1(
      env,
      siteId,
      window,
      {},
      3,
      2,
      "browser",
      "deviceType",
    );

    expect(result.columns).toEqual([
      { key: "desktop", label: "desktop", views: 8, visitors: 7, sessions: 5 },
      {
        key: "unknown",
        label: "Unknown",
        views: 2,
        visitors: 2,
        sessions: 2,
        isUnknown: true,
      },
      {
        key: "other",
        label: SHARE_TREND_OTHER_LABEL,
        views: 3,
        visitors: 3,
        sessions: 3,
        isOther: true,
      },
    ]);
    expect(result.rows.map((row) => row.key)).toEqual([
      "chrome",
      "safari",
      "edge",
      "other",
    ]);
    expect(result.rows[0].cells).toEqual([
      { key: "desktop", label: "desktop", views: 4, visitors: 4, sessions: 3 },
      {
        key: "unknown",
        label: "Unknown",
        views: 1,
        visitors: 1,
        sessions: 1,
        isUnknown: true,
      },
      {
        key: "other",
        label: SHARE_TREND_OTHER_LABEL,
        views: 2,
        visitors: 2,
        sessions: 2,
        isOther: true,
      },
    ]);
    expect(result.rows[2]).toMatchObject({
      key: "edge",
      label: "Edge",
      views: 5,
      visitors: 3,
      sessions: 3,
    });
    expect(result.rows[3]).toMatchObject({
      key: "other",
      label: SHARE_TREND_OTHER_LABEL,
      views: 3,
      visitors: 3,
      sessions: 2,
      isOther: true,
    });
    expect(result.totalVisitors).toBe(16);
  });

  it("returns empty client cross dimensions when top buckets are missing", async () => {
    const noPrimary = createD1Env([[]]);
    const noSecondary = createD1Env([
      [{ primaryValue: "Chrome", views: 1, visitors: 1, sessions: 1 }],
      [],
    ]);

    await expect(
      queryClientCrossDimensionFromD1(
        noPrimary.env,
        siteId,
        window,
        {},
        3,
        3,
        "browser",
        "deviceType",
      ),
    ).resolves.toEqual({ columns: [], rows: [], totalVisitors: 0 });
    await expect(
      queryClientCrossDimensionFromD1(
        noSecondary.env,
        siteId,
        window,
        {},
        3,
        3,
        "browser",
        "deviceType",
      ),
    ).resolves.toEqual({ columns: [], rows: [], totalVisitors: 0 });

    expect(noPrimary.calls).toHaveLength(1);
    expect(noSecondary.calls).toHaveLength(2);
  });

  it("adds a synthetic other trend series when only bucket rows contain other", async () => {
    const { env } = createD1Env([
      [{ label: "Chrome", views: 5, visitors: 3, sessions: 2 }],
      [{ label: "Chrome", views: 5, visitors: 3, sessions: 2 }],
      [
        { bucket: 0, label: "Chrome", views: 3, visitors: 2, sessions: 1 },
        {
          bucket: 1,
          label: SHARE_TREND_OTHER_TOKEN,
          views: 2,
          visitors: 1,
          sessions: 1,
        },
      ],
    ]);

    const result = await queryShareTrendFromD1(
      env,
      siteId,
      window,
      "hour",
      {},
      3,
      "TRIM(COALESCE(browser, ''))",
      "browser",
    );

    expect(result.series).toEqual([
      { key: "chrome", label: "Chrome", views: 5, visitors: 3, sessions: 2 },
      {
        key: SHARE_TREND_OTHER_KEY,
        label: SHARE_TREND_OTHER_LABEL,
        views: 0,
        visitors: 0,
        sessions: 0,
        isOther: true,
      },
    ]);
    expect(result.data[0].visitorsBySeries).toEqual({ chrome: 2, other: 0 });
    expect(result.data[1].visitorsBySeries).toEqual({ chrome: 0, other: 1 });
  });

  it("returns no share trend data when selected top labels have no series rows", async () => {
    const { env } = createD1Env([
      [{ label: "Chrome", views: 5, visitors: 3, sessions: 2 }],
      [{ label: "Firefox", views: 4, visitors: 2, sessions: 2 }],
      [{ bucket: 0, label: "Firefox", views: 4, visitors: 2, sessions: 2 }],
    ]);

    await expect(
      queryShareTrendFromD1(
        env,
        siteId,
        window,
        "hour",
        {},
        3,
        "TRIM(COALESCE(browser, ''))",
        "browser",
      ),
    ).resolves.toEqual({ series: [], data: [] });
  });

  it("defaults nullable radar metrics while filtering invalid rows", async () => {
    const browserEnv = createD1Env([
      [
        { browser: " Chrome ", visitors: "3" },
        { browser: "", visitors: 10 },
        { browser: "No visitors", visitors: 0 },
      ],
    ]);
    const referrerEnv = createD1Env([
      [
        { referrer: null, visitors: "2" },
        { referrer: "news.example", visitors: 0 },
      ],
    ]);

    await expect(
      queryBrowserRadarFromD1(browserEnv.env, siteId, window, {
        browser: "Chrome",
      }),
    ).resolves.toEqual([
      {
        browser: "Chrome",
        sessions: 0,
        bounces: 0,
        avgDurationMs: 0,
        avgDepth: 0,
        visitors: 3,
        returningVisitors: 0,
        avgFrequency: 0,
        trafficShare: 0,
      },
    ]);
    await expect(
      queryReferrerRadarFromD1(referrerEnv.env, siteId, window, {}, 5),
    ).resolves.toEqual([
      {
        referrer: "",
        sessions: 0,
        bounces: 0,
        avgDurationMs: 0,
        avgDepth: 0,
        visitors: 2,
        returningVisitors: 0,
        avgFrequency: 0,
        trafficShare: 0,
      },
    ]);

    expect(browserEnv.calls[0].bindings).toEqual([
      ...visitBindings(),
      "Chrome",
    ]);
    expect(referrerEnv.calls[0].bindings).toEqual([...visitBindings(), 5]);
  });
});
