import { browserEngineCaseSql } from "@/lib/browser-engine";
import type { Env } from "@/lib/edge/types";
import { coerceNumber } from "@/lib/edge/utils";

import type {
  BrowserCrossAggregateRow,
  BrowserCrossBreakdownDimensionDataRow,
  BrowserCrossBreakdownDimensionRow,
  BrowserCrossBreakdownItemRow,
  BrowserTrendBucketRow,
  BrowserTrendPointRow,
  BrowserTrendSeriesRow,
  BrowserVersionAggregateRow,
  BrowserVersionBreakdownRow,
  BrowserVersionSliceRow,
  ClientCrossAggregateRow,
  ClientDimensionKey,
  DashboardFilters,
  Interval,
  QueryWindow,
  ReferrerRadarRow,
  UtmDimensionKey,
} from "./core";
import {
  appendSqlConditions,
  badRequest,
  BROWSER_CROSS_OTHER_BROWSER_TOKEN,
  BROWSER_CROSS_OTHER_DIMENSION_TOKEN,
  BROWSER_CROSS_UNKNOWN_TOKEN,
  BROWSER_VERSION_UNKNOWN_TOKEN,
  browserMajorVersionExpr,
  buildTimeBuckets,
  buildVisitFilterSql,
  buildVisitSourceCte,
  CLIENT_CROSS_OTHER_PRIMARY_TOKEN,
  CLIENT_CROSS_OTHER_SECONDARY_TOKEN,
  CLIENT_CROSS_UNKNOWN_TOKEN,
  clientDimensionDefinition,
  jsonResponse,
  parseFilters,
  parseInterval,
  parseLimit,
  parseQueryLimit,
  parseWindow,
  queryD1All,
  referrerDomainDimensionDefinition,
  SHARE_TREND_OTHER_KEY,
  SHARE_TREND_OTHER_LABEL,
  SHARE_TREND_OTHER_TOKEN,
  shareTrendSeriesKey,
  timeBucketCase,
  timeBucketTimestamp,
  utmDimensionDefinition,
  visitSourceBindings,
} from "./core";

export async function queryBrowserTrendFromD1(
  env: Env,
  siteId: string,
  window: QueryWindow,
  interval: Interval,
  filters: DashboardFilters,
  limit: number,
): Promise<{
  series: BrowserTrendSeriesRow[];
  data: BrowserTrendPointRow[];
}> {
  return queryShareTrendFromD1(
    env,
    siteId,
    window,
    interval,
    filters,
    limit,
    "TRIM(COALESCE(browser, ''))",
    "browser",
  );
}

export async function queryBrowserEngineTrendFromD1(
  env: Env,
  siteId: string,
  window: QueryWindow,
  interval: Interval,
  filters: DashboardFilters,
  limit: number,
): Promise<{
  series: BrowserTrendSeriesRow[];
  data: BrowserTrendPointRow[];
}> {
  return queryShareTrendFromD1(
    env,
    siteId,
    window,
    interval,
    filters,
    limit,
    browserEngineCaseSql("browser", "os"),
    "engine",
  );
}

export async function queryBrowserVersionBreakdownFromD1(
  env: Env,
  siteId: string,
  window: QueryWindow,
  filters: DashboardFilters,
  browserLimit: number,
  versionLimit: number,
): Promise<BrowserVersionBreakdownRow[]> {
  const filter = buildVisitFilterSql(filters);
  const normalizedBrowserLimit =
    Number.isFinite(browserLimit) && browserLimit > 0
      ? Math.max(1, Math.floor(browserLimit))
      : null;
  const normalizedVersionLimit = Math.min(Math.max(1, versionLimit), 8);
  const topBrowsersSql = `
WITH
${buildVisitSourceCte()},
filtered_visits AS (
  SELECT
    TRIM(COALESCE(browser, '')) AS browser,
    visitor_id AS visitorId,
    session_id AS sessionId
  FROM visit_source
  ${filter.clause}
)
SELECT
  browser,
  count(*) AS views,
  count(DISTINCT CASE WHEN visitorId != '' THEN visitorId ELSE NULL END) AS visitors,
  count(DISTINCT CASE WHEN sessionId != '' THEN sessionId ELSE NULL END) AS sessions
FROM filtered_visits
WHERE browser != ''
GROUP BY browser
ORDER BY visitors DESC, views DESC, sessions DESC, browser ASC
${normalizedBrowserLimit ? "LIMIT ?" : ""}
`;
  const topBrowsers = (
    await queryD1All<Record<string, unknown>>(env, topBrowsersSql, [
      ...visitSourceBindings(siteId, window),
      ...filter.bindings,
      ...(normalizedBrowserLimit ? [normalizedBrowserLimit] : []),
    ])
  )
    .map((row) => ({
      browser: String(row.browser ?? "").trim(),
      views: Number(row.views ?? 0),
      visitors: Number(row.visitors ?? 0),
      sessions: Number(row.sessions ?? 0),
    }))
    .filter((row) => row.browser.length > 0 && row.visitors > 0);

  if (topBrowsers.length === 0) {
    return [];
  }

  const topBrowserLabels = topBrowsers.map((row) => row.browser);
  const topBrowserPlaceholders = topBrowserLabels.map(() => "?").join(", ");
  const versionsSql = `
WITH
${buildVisitSourceCte()},
filtered_visits AS (
  SELECT
    TRIM(COALESCE(browser, '')) AS browser,
    ${browserMajorVersionExpr()} AS browserVersion,
    visitor_id AS visitorId,
    session_id AS sessionId
  FROM visit_source
  ${filter.clause}
)
SELECT
  browser,
  CASE
    WHEN browserVersion != '' THEN browserVersion
    ELSE '${BROWSER_VERSION_UNKNOWN_TOKEN}'
  END AS version,
  count(*) AS views,
  count(DISTINCT CASE WHEN visitorId != '' THEN visitorId ELSE NULL END) AS visitors,
  count(DISTINCT CASE WHEN sessionId != '' THEN sessionId ELSE NULL END) AS sessions
FROM filtered_visits
WHERE browser != '' AND browser IN (${topBrowserPlaceholders})
GROUP BY browser, version
ORDER BY browser ASC, visitors DESC, views DESC, sessions DESC, version ASC
`;
  const versionRows = (
    await queryD1All<Record<string, unknown>>(env, versionsSql, [
      ...visitSourceBindings(siteId, window),
      ...filter.bindings,
      ...topBrowserLabels,
    ])
  )
    .map(
      (row) =>
        ({
          browser: String(row.browser ?? "").trim(),
          version: String(row.version ?? "").trim(),
          views: Number(row.views ?? 0),
          visitors: Number(row.visitors ?? 0),
          sessions: Number(row.sessions ?? 0),
        }) satisfies BrowserVersionAggregateRow,
    )
    .filter((row) => row.browser.length > 0 && row.visitors > 0);

  const versionsByBrowser = new Map<string, BrowserVersionAggregateRow[]>();
  for (const row of versionRows) {
    const bucket = versionsByBrowser.get(row.browser) ?? [];
    bucket.push(row);
    versionsByBrowser.set(row.browser, bucket);
  }

  return topBrowsers.map((browserRow) => {
    const rows = versionsByBrowser.get(browserRow.browser) ?? [];
    const usedKeys = new Set<string>(["other", "unknown"]);
    const versions: BrowserVersionSliceRow[] = [];
    let otherViews = 0;
    let otherVisitors = 0;
    let otherSessions = 0;

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      if (index < normalizedVersionLimit) {
        if (row.version === BROWSER_VERSION_UNKNOWN_TOKEN) {
          versions.push({
            key: "unknown",
            label: "Unknown",
            views: row.views,
            visitors: row.visitors,
            sessions: row.sessions,
            isUnknown: true,
          });
        } else {
          versions.push({
            key: shareTrendSeriesKey(row.version, usedKeys, "version"),
            label: row.version,
            views: row.views,
            visitors: row.visitors,
            sessions: row.sessions,
          });
        }
        continue;
      }

      otherViews += row.views;
      otherVisitors += row.visitors;
      otherSessions += row.sessions;
    }

    if (otherVisitors > 0) {
      versions.push({
        key: "other",
        label: SHARE_TREND_OTHER_LABEL,
        views: otherViews,
        visitors: otherVisitors,
        sessions: otherSessions,
        isOther: true,
      });
    }

    return {
      browser: browserRow.browser,
      views: browserRow.views,
      visitors: browserRow.visitors,
      sessions: browserRow.sessions,
      versions,
    };
  });
}

export async function queryBrowserCrossDimensionFromD1(
  env: Env,
  siteId: string,
  window: QueryWindow,
  filters: DashboardFilters,
  browserLimit: number,
  dimensionLimit: number,
  dimensionExpr: string,
  fallbackKeyBase: string,
): Promise<BrowserCrossBreakdownDimensionDataRow> {
  const filter = buildVisitFilterSql(filters);
  const normalizedBrowserLimit = Math.min(Math.max(1, browserLimit), 12);
  const normalizedDimensionLimit = Math.min(Math.max(1, dimensionLimit), 8);
  const browserExpr = "TRIM(COALESCE(browser, ''))";
  const normalizedDimensionExpr = `CASE WHEN ${dimensionExpr} != '' THEN ${dimensionExpr} ELSE '${BROWSER_CROSS_UNKNOWN_TOKEN}' END`;
  const topBrowsersSql = `
WITH
${buildVisitSourceCte()},
filtered_visits AS (
  SELECT
    ${browserExpr} AS browser,
    visitor_id AS visitorId,
    session_id AS sessionId
  FROM visit_source
  ${filter.clause}
)
SELECT
  browser,
  count(*) AS views,
  count(DISTINCT CASE WHEN visitorId != '' THEN visitorId ELSE NULL END) AS visitors,
  count(DISTINCT CASE WHEN sessionId != '' THEN sessionId ELSE NULL END) AS sessions
FROM filtered_visits
WHERE browser != ''
GROUP BY browser
ORDER BY visitors DESC, views DESC, sessions DESC, browser ASC
LIMIT ?
`;
  const topBrowsers = (
    await queryD1All<Record<string, unknown>>(env, topBrowsersSql, [
      ...visitSourceBindings(siteId, window),
      ...filter.bindings,
      normalizedBrowserLimit,
    ])
  )
    .map((row) => ({
      browser: String(row.browser ?? "").trim(),
      views: Number(row.views ?? 0),
      visitors: Number(row.visitors ?? 0),
      sessions: Number(row.sessions ?? 0),
    }))
    .filter((row) => row.browser.length > 0 && row.visitors > 0);

  if (topBrowsers.length === 0) {
    return {
      columns: [],
      rows: [],
      totalVisitors: 0,
    };
  }

  const topDimensionsSql = `
WITH
${buildVisitSourceCte()},
filtered_visits AS (
  SELECT
    ${browserExpr} AS browser,
    ${normalizedDimensionExpr} AS dimension,
    visitor_id AS visitorId,
    session_id AS sessionId
  FROM visit_source
  ${filter.clause}
)
SELECT
  dimension,
  count(*) AS views,
  count(DISTINCT CASE WHEN visitorId != '' THEN visitorId ELSE NULL END) AS visitors,
  count(DISTINCT CASE WHEN sessionId != '' THEN sessionId ELSE NULL END) AS sessions
FROM filtered_visits
WHERE browser != ''
GROUP BY dimension
ORDER BY visitors DESC, views DESC, sessions DESC, dimension ASC
LIMIT ?
`;
  const topDimensions = (
    await queryD1All<Record<string, unknown>>(env, topDimensionsSql, [
      ...visitSourceBindings(siteId, window),
      ...filter.bindings,
      normalizedDimensionLimit,
    ])
  )
    .map((row) => ({
      dimension:
        String(row.dimension ?? "").trim() || BROWSER_CROSS_UNKNOWN_TOKEN,
      views: Number(row.views ?? 0),
      visitors: Number(row.visitors ?? 0),
      sessions: Number(row.sessions ?? 0),
    }))
    .filter((row) => row.visitors > 0);

  if (topDimensions.length === 0) {
    return {
      columns: [],
      rows: [],
      totalVisitors: 0,
    };
  }

  const topBrowserLabels = topBrowsers.map((row) => row.browser);
  const topDimensionLabels = topDimensions.map((row) => row.dimension);
  const topBrowserPlaceholders = topBrowserLabels.map(() => "?").join(", ");
  const topDimensionPlaceholders = topDimensionLabels.map(() => "?").join(", ");
  const pairsSql = `
WITH
${buildVisitSourceCte()},
filtered_visits AS (
  SELECT
    ${browserExpr} AS browser,
    ${normalizedDimensionExpr} AS dimension,
    visitor_id AS visitorId,
    session_id AS sessionId
  FROM visit_source
  ${filter.clause}
),
normalized_visits AS (
  SELECT
    CASE
      WHEN browser IN (${topBrowserPlaceholders}) THEN browser
      ELSE '${BROWSER_CROSS_OTHER_BROWSER_TOKEN}'
    END AS browserBucket,
    CASE
      WHEN dimension IN (${topDimensionPlaceholders}) THEN dimension
      ELSE '${BROWSER_CROSS_OTHER_DIMENSION_TOKEN}'
    END AS dimensionBucket,
    visitorId,
    sessionId
  FROM filtered_visits
  WHERE browser != ''
)
SELECT
  browserBucket AS browser,
  dimensionBucket AS dimension,
  count(*) AS views,
  count(DISTINCT CASE WHEN visitorId != '' THEN visitorId ELSE NULL END) AS visitors,
  count(DISTINCT CASE WHEN sessionId != '' THEN sessionId ELSE NULL END) AS sessions
FROM normalized_visits
GROUP BY browserBucket, dimensionBucket
ORDER BY browser ASC, dimension ASC
`;
  const pairRows = (
    await queryD1All<Record<string, unknown>>(env, pairsSql, [
      ...visitSourceBindings(siteId, window),
      ...filter.bindings,
      ...topBrowserLabels,
      ...topDimensionLabels,
    ])
  )
    .map(
      (row) =>
        ({
          browser: String(row.browser ?? "").trim(),
          dimension: String(row.dimension ?? "").trim(),
          views: Number(row.views ?? 0),
          visitors: Number(row.visitors ?? 0),
          sessions: Number(row.sessions ?? 0),
        }) satisfies BrowserCrossAggregateRow,
    )
    .filter(
      (row) =>
        row.browser.length > 0 && row.dimension.length > 0 && row.visitors > 0,
    );

  const rowBuckets = new Map<
    string,
    {
      views: number;
      visitors: number;
      sessions: number;
      cells: Map<string, { views: number; visitors: number; sessions: number }>;
    }
  >();
  const columnBuckets = new Map<
    string,
    { views: number; visitors: number; sessions: number }
  >();

  for (const row of pairRows) {
    const rowBucket = rowBuckets.get(row.browser) ?? {
      views: 0,
      visitors: 0,
      sessions: 0,
      cells: new Map<
        string,
        { views: number; visitors: number; sessions: number }
      >(),
    };
    rowBucket.views += row.views;
    rowBucket.visitors += row.visitors;
    rowBucket.sessions += row.sessions;
    const existingCell = rowBucket.cells.get(row.dimension) ?? {
      views: 0,
      visitors: 0,
      sessions: 0,
    };
    existingCell.views += row.views;
    existingCell.visitors += row.visitors;
    existingCell.sessions += row.sessions;
    rowBucket.cells.set(row.dimension, existingCell);
    rowBuckets.set(row.browser, rowBucket);

    const columnBucket = columnBuckets.get(row.dimension) ?? {
      views: 0,
      visitors: 0,
      sessions: 0,
    };
    columnBucket.views += row.views;
    columnBucket.visitors += row.visitors;
    columnBucket.sessions += row.sessions;
    columnBuckets.set(row.dimension, columnBucket);
  }

  const columnKeySet = new Set<string>(["other", "unknown"]);
  const columnDescriptors: Array<{
    bucket: string;
    item: BrowserCrossBreakdownItemRow;
  }> = topDimensions.map((row) => {
    if (row.dimension === BROWSER_CROSS_UNKNOWN_TOKEN) {
      return {
        bucket: row.dimension,
        item: {
          key: "unknown",
          label: "Unknown",
          views: row.views,
          visitors: row.visitors,
          sessions: row.sessions,
          isUnknown: true,
        } satisfies BrowserCrossBreakdownItemRow,
      };
    }

    return {
      bucket: row.dimension,
      item: {
        key: shareTrendSeriesKey(row.dimension, columnKeySet, fallbackKeyBase),
        label: row.dimension,
        views: row.views,
        visitors: row.visitors,
        sessions: row.sessions,
      } satisfies BrowserCrossBreakdownItemRow,
    };
  });

  if (columnBuckets.has(BROWSER_CROSS_OTHER_DIMENSION_TOKEN)) {
    const otherColumn = columnBuckets.get(
      BROWSER_CROSS_OTHER_DIMENSION_TOKEN,
    ) ?? {
      views: 0,
      visitors: 0,
      sessions: 0,
    };
    columnDescriptors.push({
      bucket: BROWSER_CROSS_OTHER_DIMENSION_TOKEN,
      item: {
        key: "other",
        label: SHARE_TREND_OTHER_LABEL,
        views: otherColumn.views,
        visitors: otherColumn.visitors,
        sessions: otherColumn.sessions,
        isOther: true,
      } satisfies BrowserCrossBreakdownItemRow,
    });
  }

  const rowKeySet = new Set<string>(["other"]);
  const rowDescriptors: Array<{
    bucket: string;
    item: BrowserCrossBreakdownItemRow;
  }> = topBrowsers.map((row) => ({
    bucket: row.browser,
    item: {
      key: shareTrendSeriesKey(row.browser, rowKeySet, "browser"),
      label: row.browser,
      views: row.views,
      visitors: row.visitors,
      sessions: row.sessions,
    } satisfies BrowserCrossBreakdownItemRow,
  }));

  if (rowBuckets.has(BROWSER_CROSS_OTHER_BROWSER_TOKEN)) {
    const otherRow = rowBuckets.get(BROWSER_CROSS_OTHER_BROWSER_TOKEN) ?? {
      views: 0,
      visitors: 0,
      sessions: 0,
      cells: new Map<
        string,
        { views: number; visitors: number; sessions: number }
      >(),
    };
    rowDescriptors.push({
      bucket: BROWSER_CROSS_OTHER_BROWSER_TOKEN,
      item: {
        key: "other",
        label: SHARE_TREND_OTHER_LABEL,
        views: otherRow.views,
        visitors: otherRow.visitors,
        sessions: otherRow.sessions,
        isOther: true,
      } satisfies BrowserCrossBreakdownItemRow,
    });
  }

  const columns = columnDescriptors.map((column) => column.item);
  const rows = rowDescriptors
    .map((row) => {
      const bucket = rowBuckets.get(row.bucket) ?? {
        views: row.item.views,
        visitors: row.item.visitors,
        sessions: row.item.sessions,
        cells: new Map<
          string,
          { views: number; visitors: number; sessions: number }
        >(),
      };
      const cells = columnDescriptors.map((column) => {
        const cell = bucket.cells.get(column.bucket) ?? {
          views: 0,
          visitors: 0,
          sessions: 0,
        };
        return {
          key: column.item.key,
          label: column.item.label,
          views: cell.views,
          visitors: cell.visitors,
          sessions: cell.sessions,
          ...(column.item.isOther ? { isOther: true } : {}),
          ...(column.item.isUnknown ? { isUnknown: true } : {}),
        } satisfies BrowserCrossBreakdownItemRow;
      });

      return {
        ...row.item,
        views: bucket.views,
        visitors: bucket.visitors,
        sessions: bucket.sessions,
        cells,
      } satisfies BrowserCrossBreakdownDimensionRow;
    })
    .filter((row) => row.visitors > 0);

  return {
    columns,
    rows,
    totalVisitors: rows.reduce((sum, row) => sum + row.visitors, 0),
  };
}

export async function queryBrowserCrossBreakdownFromD1(
  env: Env,
  siteId: string,
  window: QueryWindow,
  filters: DashboardFilters,
  browserLimit: number,
  osLimit: number,
  deviceTypeLimit: number,
): Promise<{
  operatingSystem: BrowserCrossBreakdownDimensionDataRow;
  deviceType: BrowserCrossBreakdownDimensionDataRow;
}> {
  const [operatingSystem, deviceType] = await Promise.all([
    queryBrowserCrossDimensionFromD1(
      env,
      siteId,
      window,
      filters,
      browserLimit,
      osLimit,
      "TRIM(COALESCE(os, ''))",
      "os",
    ),
    queryBrowserCrossDimensionFromD1(
      env,
      siteId,
      window,
      filters,
      browserLimit,
      deviceTypeLimit,
      "TRIM(COALESCE(device_type, ''))",
      "device",
    ),
  ]);

  return {
    operatingSystem,
    deviceType,
  };
}

export async function queryShareTrendFromD1(
  env: Env,
  siteId: string,
  window: QueryWindow,
  interval: Interval,
  filters: DashboardFilters,
  limit: number,
  labelExpr: string,
  fallbackKeyBase: string,
): Promise<{
  series: BrowserTrendSeriesRow[];
  data: BrowserTrendPointRow[];
}> {
  const filter = buildVisitFilterSql(filters);
  const buckets = buildTimeBuckets(window, interval);
  const bucket = timeBucketCase(buckets, "started_at");
  const normalizedLimit = Math.min(Math.max(1, limit), 12);
  const topSql = `
WITH
${buildVisitSourceCte()},
filtered_visits AS (
  SELECT
    visit_id AS visitId,
    started_at AS startedAt,
    ${labelExpr} AS labelValue,
    visitor_id AS visitorId,
    session_id AS sessionId
  FROM visit_source
  ${filter.clause}
),
visitor_latest AS (
  SELECT
    visitorId,
    labelValue AS assignedLabel
  FROM (
    SELECT
      visitorId,
      labelValue,
      startedAt,
      visitId,
      ROW_NUMBER() OVER (
        PARTITION BY visitorId
        ORDER BY startedAt DESC, visitId DESC
      ) AS rowNumber
    FROM filtered_visits
    WHERE visitorId != ''
  )
  WHERE rowNumber = 1
),
assigned_visits AS (
  SELECT
    visitor_latest.assignedLabel AS label,
    filtered_visits.visitorId AS visitorId,
    filtered_visits.sessionId AS sessionId
  FROM visitor_latest
  INNER JOIN filtered_visits
    ON filtered_visits.visitorId = visitor_latest.visitorId
)
SELECT
  label,
  count(*) AS views,
  count(DISTINCT visitorId) AS visitors,
  count(DISTINCT CASE WHEN sessionId != '' THEN sessionId ELSE NULL END) AS sessions
FROM assigned_visits
WHERE label != ''
GROUP BY label
ORDER BY visitors DESC, views DESC, sessions DESC, label ASC
LIMIT ?
`;
  const topRows = (
    await queryD1All<Record<string, unknown>>(env, topSql, [
      ...visitSourceBindings(siteId, window),
      ...filter.bindings,
      normalizedLimit,
    ])
  )
    .map((row) => ({
      label: String(row.label ?? "").trim(),
      views: Number(row.views ?? 0),
      visitors: Number(row.visitors ?? 0),
      sessions: Number(row.sessions ?? 0),
    }))
    .filter((row) => row.label.length > 0 && row.visitors > 0);

  const topLabels = topRows.map((row) => row.label);
  const topLabelPlaceholders = topLabels.map(() => "?").join(", ");
  const assignmentCaseExpr =
    topLabels.length > 0
      ? `CASE WHEN assignedLabel != '' AND assignedLabel IN (${topLabelPlaceholders}) THEN assignedLabel ELSE '${SHARE_TREND_OTHER_TOKEN}' END`
      : `'${SHARE_TREND_OTHER_TOKEN}'`;

  const seriesSql = `
WITH
${buildVisitSourceCte()},
filtered_visits AS (
  SELECT
    visit_id AS visitId,
    started_at AS startedAt,
    ${labelExpr} AS labelValue,
    visitor_id AS visitorId,
    session_id AS sessionId
  FROM visit_source
  ${filter.clause}
),
visitor_latest AS (
  SELECT
    visitorId,
    labelValue AS assignedLabel
  FROM (
    SELECT
      visitorId,
      labelValue,
      startedAt,
      visitId,
      ROW_NUMBER() OVER (
        PARTITION BY visitorId
        ORDER BY startedAt DESC, visitId DESC
      ) AS rowNumber
    FROM filtered_visits
    WHERE visitorId != ''
  )
  WHERE rowNumber = 1
),
assigned_visits AS (
  SELECT
    ${assignmentCaseExpr} AS label,
    filtered_visits.visitorId AS visitorId,
    filtered_visits.sessionId AS sessionId
  FROM visitor_latest
  INNER JOIN filtered_visits
    ON filtered_visits.visitorId = visitor_latest.visitorId
)
SELECT
  label,
  count(*) AS views,
  count(DISTINCT visitorId) AS visitors,
  count(DISTINCT CASE WHEN sessionId != '' THEN sessionId ELSE NULL END) AS sessions
FROM assigned_visits
GROUP BY label
ORDER BY visitors DESC, views DESC, sessions DESC, label ASC
`;
  const seriesRows = (
    await queryD1All<Record<string, unknown>>(env, seriesSql, [
      ...visitSourceBindings(siteId, window),
      ...filter.bindings,
      ...topLabels,
    ])
  )
    .map((row) => ({
      label: String(row.label ?? "").trim(),
      views: Number(row.views ?? 0),
      visitors: Number(row.visitors ?? 0),
      sessions: Number(row.sessions ?? 0),
    }))
    .filter((row) => row.label.length > 0 && row.visitors > 0);

  if (seriesRows.length === 0) {
    return {
      series: [],
      data: [],
    };
  }

  const bucketSql = `
WITH
${buildVisitSourceCte()},
filtered_visits AS (
  SELECT
    ${bucket.sql} AS bucket,
    visit_id AS visitId,
    started_at AS startedAt,
    ${labelExpr} AS labelValue,
    visitor_id AS visitorId,
    session_id AS sessionId
  FROM visit_source
  ${filter.clause}
),
bucket_visitor_latest AS (
  SELECT
    bucket,
    visitorId,
    labelValue AS assignedLabel
  FROM (
    SELECT
      bucket,
      visitorId,
      labelValue,
      startedAt,
      visitId,
      ROW_NUMBER() OVER (
        PARTITION BY bucket, visitorId
        ORDER BY startedAt DESC, visitId DESC
      ) AS rowNumber
    FROM filtered_visits
    WHERE visitorId != ''
  )
  WHERE rowNumber = 1
),
assigned_visits AS (
  SELECT
    filtered_visits.bucket AS bucket,
    ${assignmentCaseExpr} AS label,
    filtered_visits.visitorId AS visitorId,
    filtered_visits.sessionId AS sessionId
  FROM bucket_visitor_latest
  INNER JOIN filtered_visits
    ON filtered_visits.bucket = bucket_visitor_latest.bucket
    AND filtered_visits.visitorId = bucket_visitor_latest.visitorId
)
SELECT
  bucket,
  label,
  count(*) AS views,
  count(DISTINCT visitorId) AS visitors,
  count(DISTINCT CASE WHEN sessionId != '' THEN sessionId ELSE NULL END) AS sessions
FROM assigned_visits
GROUP BY bucket, label
ORDER BY bucket ASC, label ASC
`;
  const bucketRows = (
    await queryD1All<Record<string, unknown>>(env, bucketSql, [
      ...visitSourceBindings(siteId, window),
      ...bucket.bindings,
      ...filter.bindings,
      ...topLabels,
    ])
  ).map(
    (row) =>
      ({
        bucket: Number(row.bucket ?? 0),
        label: String(row.label ?? "").trim(),
        views: Number(row.views ?? 0),
        visitors: Number(row.visitors ?? 0),
        sessions: Number(row.sessions ?? 0),
      }) satisfies BrowserTrendBucketRow,
  );

  const seriesByLabel = new Map(
    seriesRows.map((row) => [row.label, row] as const),
  );
  const usedKeys = new Set<string>([SHARE_TREND_OTHER_KEY]);
  const series: BrowserTrendSeriesRow[] = [];
  const keyByLabel = new Map<string, string>();

  for (const label of topLabels) {
    const row = seriesByLabel.get(label);
    if (!row || row.visitors <= 0) continue;
    const key = shareTrendSeriesKey(label, usedKeys, fallbackKeyBase);
    keyByLabel.set(label, key);
    series.push({
      key,
      label,
      views: row.views,
      visitors: row.visitors,
      sessions: row.sessions,
    });
  }

  const otherRow = seriesByLabel.get(SHARE_TREND_OTHER_TOKEN);
  if (otherRow && otherRow.visitors > 0) {
    keyByLabel.set(SHARE_TREND_OTHER_TOKEN, SHARE_TREND_OTHER_KEY);
    series.push({
      key: SHARE_TREND_OTHER_KEY,
      label: SHARE_TREND_OTHER_LABEL,
      views: otherRow.views,
      visitors: otherRow.visitors,
      sessions: otherRow.sessions,
      isOther: true,
    });
  }

  const hasBucketOther = bucketRows.some(
    (row) => row.label === SHARE_TREND_OTHER_TOKEN && row.visitors > 0,
  );
  if (!otherRow && hasBucketOther) {
    keyByLabel.set(SHARE_TREND_OTHER_TOKEN, SHARE_TREND_OTHER_KEY);
    series.push({
      key: SHARE_TREND_OTHER_KEY,
      label: SHARE_TREND_OTHER_LABEL,
      views: 0,
      visitors: 0,
      sessions: 0,
      isOther: true,
    });
  }

  if (series.length === 0) {
    return {
      series: [],
      data: [],
    };
  }

  const createEmptyPoint = (bucket: number): BrowserTrendPointRow => ({
    bucket,
    timestampMs: timeBucketTimestamp(buckets, bucket),
    totalVisitors: 0,
    visitorsBySeries: Object.fromEntries(series.map((item) => [item.key, 0])),
  });

  const pointsByBucket = new Map<number, BrowserTrendPointRow>();
  for (const row of bucketRows) {
    const key = keyByLabel.get(row.label);
    if (!key) continue;
    const point =
      pointsByBucket.get(row.bucket) ?? createEmptyPoint(row.bucket);
    point.visitorsBySeries[key] = row.visitors;
    point.totalVisitors += row.visitors;
    pointsByBucket.set(row.bucket, point);
  }

  const data: BrowserTrendPointRow[] = [];
  for (const item of buckets) {
    data.push(pointsByBucket.get(item.index) ?? createEmptyPoint(item.index));
  }

  return {
    series,
    data,
  };
}

export async function queryClientDimensionTrendFromD1(
  env: Env,
  siteId: string,
  window: QueryWindow,
  interval: Interval,
  filters: DashboardFilters,
  dimension: ClientDimensionKey,
  limit: number,
): Promise<{
  series: BrowserTrendSeriesRow[];
  data: BrowserTrendPointRow[];
}> {
  const definition = clientDimensionDefinition(dimension);
  return queryShareTrendFromD1(
    env,
    siteId,
    window,
    interval,
    filters,
    limit,
    definition.labelExpr,
    definition.fallbackKeyBase,
  );
}

export async function queryUtmDimensionTrendFromD1(
  env: Env,
  siteId: string,
  window: QueryWindow,
  interval: Interval,
  filters: DashboardFilters,
  dimension: UtmDimensionKey,
  limit: number,
): Promise<{
  series: BrowserTrendSeriesRow[];
  data: BrowserTrendPointRow[];
}> {
  const definition = utmDimensionDefinition(dimension);
  return queryShareTrendFromD1(
    env,
    siteId,
    window,
    interval,
    filters,
    limit,
    definition.labelExpr,
    definition.fallbackKeyBase,
  );
}

export async function queryReferrerTrendFromD1(
  env: Env,
  siteId: string,
  window: QueryWindow,
  interval: Interval,
  filters: DashboardFilters,
  limit: number,
): Promise<{
  series: BrowserTrendSeriesRow[];
  data: BrowserTrendPointRow[];
}> {
  const definition = referrerDomainDimensionDefinition();
  return queryShareTrendFromD1(
    env,
    siteId,
    window,
    interval,
    filters,
    limit,
    definition.labelExpr,
    definition.fallbackKeyBase,
  );
}

export async function queryClientCrossDimensionFromD1(
  env: Env,
  siteId: string,
  window: QueryWindow,
  filters: DashboardFilters,
  primaryLimit: number,
  secondaryLimit: number,
  primaryDimension: ClientDimensionKey,
  secondaryDimension: ClientDimensionKey,
): Promise<BrowserCrossBreakdownDimensionDataRow> {
  const filter = buildVisitFilterSql(filters);
  const normalizedPrimaryLimit = Math.min(Math.max(1, primaryLimit), 12);
  const normalizedSecondaryLimit = Math.min(Math.max(1, secondaryLimit), 8);
  const primaryDefinition = clientDimensionDefinition(primaryDimension);
  const secondaryDefinition = clientDimensionDefinition(secondaryDimension);
  const primaryExpr = primaryDefinition.labelExpr;
  const normalizedSecondaryExpr = `CASE WHEN ${secondaryDefinition.labelExpr} != '' THEN ${secondaryDefinition.labelExpr} ELSE '${CLIENT_CROSS_UNKNOWN_TOKEN}' END`;

  const topPrimarySql = `
WITH
${buildVisitSourceCte()},
filtered_visits AS (
  SELECT
    ${primaryExpr} AS primaryValue,
    visitor_id AS visitorId,
    session_id AS sessionId
  FROM visit_source
  ${filter.clause}
)
SELECT
  primaryValue,
  count(*) AS views,
  count(DISTINCT CASE WHEN visitorId != '' THEN visitorId ELSE NULL END) AS visitors,
  count(DISTINCT CASE WHEN sessionId != '' THEN sessionId ELSE NULL END) AS sessions
FROM filtered_visits
WHERE primaryValue != ''
GROUP BY primaryValue
ORDER BY visitors DESC, views DESC, sessions DESC, primaryValue ASC
LIMIT ?
`;
  const topPrimaryRows = (
    await queryD1All<Record<string, unknown>>(env, topPrimarySql, [
      ...visitSourceBindings(siteId, window),
      ...filter.bindings,
      normalizedPrimaryLimit,
    ])
  )
    .map((row) => ({
      value: String(row.primaryValue ?? "").trim(),
      views: Number(row.views ?? 0),
      visitors: Number(row.visitors ?? 0),
      sessions: Number(row.sessions ?? 0),
    }))
    .filter((row) => row.value.length > 0 && row.visitors > 0);

  if (topPrimaryRows.length === 0) {
    return {
      columns: [],
      rows: [],
      totalVisitors: 0,
    };
  }

  const topSecondarySql = `
WITH
${buildVisitSourceCte()},
filtered_visits AS (
  SELECT
    ${primaryExpr} AS primaryValue,
    ${normalizedSecondaryExpr} AS secondaryValue,
    visitor_id AS visitorId,
    session_id AS sessionId
  FROM visit_source
  ${filter.clause}
)
SELECT
  secondaryValue,
  count(*) AS views,
  count(DISTINCT CASE WHEN visitorId != '' THEN visitorId ELSE NULL END) AS visitors,
  count(DISTINCT CASE WHEN sessionId != '' THEN sessionId ELSE NULL END) AS sessions
FROM filtered_visits
WHERE primaryValue != ''
GROUP BY secondaryValue
ORDER BY visitors DESC, views DESC, sessions DESC, secondaryValue ASC
LIMIT ?
`;
  const topSecondaryRows = (
    await queryD1All<Record<string, unknown>>(env, topSecondarySql, [
      ...visitSourceBindings(siteId, window),
      ...filter.bindings,
      normalizedSecondaryLimit,
    ])
  )
    .map((row) => ({
      value:
        String(row.secondaryValue ?? "").trim() || CLIENT_CROSS_UNKNOWN_TOKEN,
      views: Number(row.views ?? 0),
      visitors: Number(row.visitors ?? 0),
      sessions: Number(row.sessions ?? 0),
    }))
    .filter((row) => row.visitors > 0);

  if (topSecondaryRows.length === 0) {
    return {
      columns: [],
      rows: [],
      totalVisitors: 0,
    };
  }

  const topPrimaryLabels = topPrimaryRows.map((row) => row.value);
  const topSecondaryLabels = topSecondaryRows.map((row) => row.value);
  const topPrimaryPlaceholders = topPrimaryLabels.map(() => "?").join(", ");
  const topSecondaryPlaceholders = topSecondaryLabels.map(() => "?").join(", ");
  const pairsSql = `
WITH
${buildVisitSourceCte()},
filtered_visits AS (
  SELECT
    ${primaryExpr} AS primaryValue,
    ${normalizedSecondaryExpr} AS secondaryValue,
    visitor_id AS visitorId,
    session_id AS sessionId
  FROM visit_source
  ${filter.clause}
),
normalized_visits AS (
  SELECT
    CASE
      WHEN primaryValue IN (${topPrimaryPlaceholders}) THEN primaryValue
      ELSE '${CLIENT_CROSS_OTHER_PRIMARY_TOKEN}'
    END AS primaryBucket,
    CASE
      WHEN secondaryValue IN (${topSecondaryPlaceholders}) THEN secondaryValue
      ELSE '${CLIENT_CROSS_OTHER_SECONDARY_TOKEN}'
    END AS secondaryBucket,
    visitorId,
    sessionId
  FROM filtered_visits
  WHERE primaryValue != ''
)
SELECT
  primaryBucket AS primaryValue,
  secondaryBucket AS secondaryValue,
  count(*) AS views,
  count(DISTINCT CASE WHEN visitorId != '' THEN visitorId ELSE NULL END) AS visitors,
  count(DISTINCT CASE WHEN sessionId != '' THEN sessionId ELSE NULL END) AS sessions
FROM normalized_visits
GROUP BY primaryBucket, secondaryBucket
ORDER BY primaryValue ASC, secondaryValue ASC
`;
  const pairRows = (
    await queryD1All<Record<string, unknown>>(env, pairsSql, [
      ...visitSourceBindings(siteId, window),
      ...filter.bindings,
      ...topPrimaryLabels,
      ...topSecondaryLabels,
    ])
  )
    .map(
      (row) =>
        ({
          primary: String(row.primaryValue ?? "").trim(),
          secondary: String(row.secondaryValue ?? "").trim(),
          views: Number(row.views ?? 0),
          visitors: Number(row.visitors ?? 0),
          sessions: Number(row.sessions ?? 0),
        }) satisfies ClientCrossAggregateRow,
    )
    .filter(
      (row) =>
        row.primary.length > 0 && row.secondary.length > 0 && row.visitors > 0,
    );

  const rowBuckets = new Map<
    string,
    {
      views: number;
      visitors: number;
      sessions: number;
      cells: Map<string, { views: number; visitors: number; sessions: number }>;
    }
  >();
  const columnBuckets = new Map<
    string,
    { views: number; visitors: number; sessions: number }
  >();

  for (const row of pairRows) {
    const rowBucket = rowBuckets.get(row.primary) ?? {
      views: 0,
      visitors: 0,
      sessions: 0,
      cells: new Map<
        string,
        { views: number; visitors: number; sessions: number }
      >(),
    };
    rowBucket.views += row.views;
    rowBucket.visitors += row.visitors;
    rowBucket.sessions += row.sessions;
    const existingCell = rowBucket.cells.get(row.secondary) ?? {
      views: 0,
      visitors: 0,
      sessions: 0,
    };
    existingCell.views += row.views;
    existingCell.visitors += row.visitors;
    existingCell.sessions += row.sessions;
    rowBucket.cells.set(row.secondary, existingCell);
    rowBuckets.set(row.primary, rowBucket);

    const columnBucket = columnBuckets.get(row.secondary) ?? {
      views: 0,
      visitors: 0,
      sessions: 0,
    };
    columnBucket.views += row.views;
    columnBucket.visitors += row.visitors;
    columnBucket.sessions += row.sessions;
    columnBuckets.set(row.secondary, columnBucket);
  }

  const columnKeySet = new Set<string>(["other", "unknown"]);
  const columnDescriptors: Array<{
    bucket: string;
    item: BrowserCrossBreakdownItemRow;
  }> = topSecondaryRows.map((row) => {
    if (row.value === CLIENT_CROSS_UNKNOWN_TOKEN) {
      return {
        bucket: row.value,
        item: {
          key: "unknown",
          label: "Unknown",
          views: row.views,
          visitors: row.visitors,
          sessions: row.sessions,
          isUnknown: true,
        } satisfies BrowserCrossBreakdownItemRow,
      };
    }

    return {
      bucket: row.value,
      item: {
        key: shareTrendSeriesKey(
          row.value,
          columnKeySet,
          secondaryDefinition.fallbackKeyBase,
        ),
        label: row.value,
        views: row.views,
        visitors: row.visitors,
        sessions: row.sessions,
      } satisfies BrowserCrossBreakdownItemRow,
    };
  });

  if (columnBuckets.has(CLIENT_CROSS_OTHER_SECONDARY_TOKEN)) {
    const otherColumn = columnBuckets.get(
      CLIENT_CROSS_OTHER_SECONDARY_TOKEN,
    ) ?? {
      views: 0,
      visitors: 0,
      sessions: 0,
    };
    columnDescriptors.push({
      bucket: CLIENT_CROSS_OTHER_SECONDARY_TOKEN,
      item: {
        key: "other",
        label: SHARE_TREND_OTHER_LABEL,
        views: otherColumn.views,
        visitors: otherColumn.visitors,
        sessions: otherColumn.sessions,
        isOther: true,
      } satisfies BrowserCrossBreakdownItemRow,
    });
  }

  const rowKeySet = new Set<string>(["other"]);
  const rowDescriptors: Array<{
    bucket: string;
    item: BrowserCrossBreakdownItemRow;
  }> = topPrimaryRows.map((row) => ({
    bucket: row.value,
    item: {
      key: shareTrendSeriesKey(
        row.value,
        rowKeySet,
        primaryDefinition.fallbackKeyBase,
      ),
      label: row.value,
      views: row.views,
      visitors: row.visitors,
      sessions: row.sessions,
    } satisfies BrowserCrossBreakdownItemRow,
  }));

  if (rowBuckets.has(CLIENT_CROSS_OTHER_PRIMARY_TOKEN)) {
    const otherRow = rowBuckets.get(CLIENT_CROSS_OTHER_PRIMARY_TOKEN) ?? {
      views: 0,
      visitors: 0,
      sessions: 0,
      cells: new Map<
        string,
        { views: number; visitors: number; sessions: number }
      >(),
    };
    rowDescriptors.push({
      bucket: CLIENT_CROSS_OTHER_PRIMARY_TOKEN,
      item: {
        key: "other",
        label: SHARE_TREND_OTHER_LABEL,
        views: otherRow.views,
        visitors: otherRow.visitors,
        sessions: otherRow.sessions,
        isOther: true,
      } satisfies BrowserCrossBreakdownItemRow,
    });
  }

  const columns = columnDescriptors.map((column) => column.item);
  const rows = rowDescriptors
    .map((row) => {
      const bucket = rowBuckets.get(row.bucket) ?? {
        views: row.item.views,
        visitors: row.item.visitors,
        sessions: row.item.sessions,
        cells: new Map<
          string,
          { views: number; visitors: number; sessions: number }
        >(),
      };
      const cells = columnDescriptors.map((column) => {
        const cell = bucket.cells.get(column.bucket) ?? {
          views: 0,
          visitors: 0,
          sessions: 0,
        };
        return {
          key: column.item.key,
          label: column.item.label,
          views: cell.views,
          visitors: cell.visitors,
          sessions: cell.sessions,
          ...(column.item.isOther ? { isOther: true } : {}),
          ...(column.item.isUnknown ? { isUnknown: true } : {}),
        } satisfies BrowserCrossBreakdownItemRow;
      });

      return {
        ...row.item,
        views: bucket.views,
        visitors: bucket.visitors,
        sessions: bucket.sessions,
        cells,
      } satisfies BrowserCrossBreakdownDimensionRow;
    })
    .filter((row) => row.visitors > 0);

  return {
    columns,
    rows,
    totalVisitors: rows.reduce((sum, row) => sum + row.visitors, 0),
  };
}

export async function handleBrowserTrend(
  env: Env,
  siteId: string,
  url: URL,
): Promise<Response> {
  const window = parseWindow(url);
  if (!window) return badRequest("Invalid time window");
  const filters = parseFilters(url);
  const interval = parseInterval(url);
  const limit = parseLimit(url, 5, 12);
  const trend = await queryBrowserTrendFromD1(
    env,
    siteId,
    window,
    interval,
    filters,
    limit,
  );
  return jsonResponse({
    ok: true,
    interval,
    series: trend.series,
    data: trend.data,
  });
}

export async function handleBrowserEngineTrend(
  env: Env,
  siteId: string,
  url: URL,
): Promise<Response> {
  const window = parseWindow(url);
  if (!window) return badRequest("Invalid time window");
  const filters = parseFilters(url);
  const interval = parseInterval(url);
  const limit = parseLimit(url, 5, 8);
  const trend = await queryBrowserEngineTrendFromD1(
    env,
    siteId,
    window,
    interval,
    filters,
    limit,
  );
  return jsonResponse({
    ok: true,
    interval,
    series: trend.series,
    data: trend.data,
  });
}

export async function handleBrowserVersionBreakdown(
  env: Env,
  siteId: string,
  url: URL,
): Promise<Response> {
  const window = parseWindow(url);
  if (!window) return badRequest("Invalid time window");
  const filters = parseFilters(url);
  const rawBrowserLimit = coerceNumber(url.searchParams.get("browserLimit"), 0);
  const browserLimit =
    Number.isFinite(rawBrowserLimit ?? NaN) && (rawBrowserLimit ?? 0) > 0
      ? Math.max(1, Math.floor(rawBrowserLimit ?? 0))
      : 0;
  const versionLimit = Math.min(
    8,
    Math.max(
      1,
      Math.floor(coerceNumber(url.searchParams.get("versionLimit"), 5) ?? 5),
    ),
  );
  const data = await queryBrowserVersionBreakdownFromD1(
    env,
    siteId,
    window,
    filters,
    browserLimit,
    versionLimit,
  );
  return jsonResponse({
    ok: true,
    data,
  });
}

export async function handleBrowserCrossBreakdown(
  env: Env,
  siteId: string,
  url: URL,
): Promise<Response> {
  const window = parseWindow(url);
  if (!window) return badRequest("Invalid time window");
  const filters = parseFilters(url);
  const browserLimit = parseQueryLimit(url, "browserLimit", 8, 1, 12);
  const osLimit = parseQueryLimit(url, "osLimit", 6, 1, 8);
  const deviceTypeLimit = parseQueryLimit(url, "deviceTypeLimit", 5, 1, 8);
  const data = await queryBrowserCrossBreakdownFromD1(
    env,
    siteId,
    window,
    filters,
    browserLimit,
    osLimit,
    deviceTypeLimit,
  );
  return jsonResponse({
    ok: true,
    operatingSystem: data.operatingSystem,
    deviceType: data.deviceType,
  });
}

export async function queryBrowserRadarFromD1(
  env: Env,
  siteId: string,
  window: QueryWindow,
  filters: DashboardFilters,
): Promise<
  Array<{
    browser: string;
    sessions: number;
    bounces: number;
    avgDurationMs: number;
    avgDepth: number;
    visitors: number;
    returningVisitors: number;
    avgFrequency: number;
    trafficShare: number;
  }>
> {
  const filter = buildVisitFilterSql(filters);

  const sql = `
WITH
${buildVisitSourceCte()},

filtered_visits AS (
  SELECT
    visit_id,
    visitor_id,
    session_id,
    TRIM(COALESCE(browser, '')) AS browser,
    CASE WHEN duration_ms IS NOT NULL AND duration_ms >= 0
         THEN duration_ms ELSE 0 END AS safe_duration_ms
  FROM visit_source
  ${filter.clause}
),

session_level AS (
  SELECT
    browser,
    session_id,
    count(*) AS visit_count,
    sum(safe_duration_ms) AS session_duration
  FROM filtered_visits
  WHERE browser != '' AND session_id != ''
  GROUP BY browser, session_id
),

browser_session_agg AS (
  SELECT
    browser,
    count(*) AS sessions,
    sum(CASE WHEN visit_count = 1 THEN 1 ELSE 0 END) AS bounces,
    CASE WHEN count(*) > 0
         THEN CAST(sum(session_duration) AS REAL) / count(*)
         ELSE 0 END AS avgDurationMs,
    CASE WHEN count(*) > 0
         THEN CAST(sum(visit_count) AS REAL) / count(*)
         ELSE 0 END AS avgDepth
  FROM session_level
  GROUP BY browser
),

visitor_level AS (
  SELECT
    browser,
    visitor_id,
    count(DISTINCT CASE WHEN session_id != '' THEN session_id ELSE NULL END) AS session_count
  FROM filtered_visits
  WHERE browser != '' AND visitor_id != ''
  GROUP BY browser, visitor_id
),

browser_visitor_agg AS (
  SELECT
    browser,
    count(*) AS visitors,
    sum(CASE WHEN session_count > 1 THEN 1 ELSE 0 END) AS returningVisitors,
    CASE WHEN count(*) > 0
         THEN CAST(sum(session_count) AS REAL) / count(*)
         ELSE 0 END AS avgFrequency
  FROM visitor_level
  GROUP BY browser
),

total_visitors AS (
  SELECT count(DISTINCT CASE WHEN visitor_id != '' THEN visitor_id ELSE NULL END) AS total
  FROM filtered_visits
  WHERE browser != ''
)

SELECT
  bsa.browser,
  bsa.sessions,
  bsa.bounces,
  bsa.avgDurationMs,
  bsa.avgDepth,
  bva.visitors,
  bva.returningVisitors,
  bva.avgFrequency,
  CASE WHEN tv.total > 0
       THEN CAST(bva.visitors AS REAL) / tv.total
       ELSE 0 END AS trafficShare
FROM browser_session_agg bsa
INNER JOIN browser_visitor_agg bva ON bsa.browser = bva.browser
CROSS JOIN total_visitors tv
ORDER BY bva.visitors DESC
`;

  const rows = await queryD1All<Record<string, unknown>>(env, sql, [
    ...visitSourceBindings(siteId, window),
    ...filter.bindings,
  ]);

  return rows
    .map((row) => ({
      browser: String(row.browser ?? "").trim(),
      sessions: Number(row.sessions ?? 0),
      bounces: Number(row.bounces ?? 0),
      avgDurationMs: Number(row.avgDurationMs ?? 0),
      avgDepth: Number(row.avgDepth ?? 0),
      visitors: Number(row.visitors ?? 0),
      returningVisitors: Number(row.returningVisitors ?? 0),
      avgFrequency: Number(row.avgFrequency ?? 0),
      trafficShare: Number(row.trafficShare ?? 0),
    }))
    .filter((row) => row.browser.length > 0 && row.visitors > 0);
}

export async function handleBrowserRadar(
  env: Env,
  siteId: string,
  url: URL,
): Promise<Response> {
  const window = parseWindow(url);
  if (!window) return badRequest("Invalid time window");
  const filters = parseFilters(url);
  const rows = await queryBrowserRadarFromD1(env, siteId, window, filters);
  const data = rows.map((row) => ({
    browser: row.browser,
    visitors: row.visitors,
    sessions: row.sessions,
    metrics: {
      duration: row.avgDurationMs,
      engagement:
        row.sessions > 0
          ? Number(((row.sessions - row.bounces) / row.sessions).toFixed(6))
          : 0,
      depth: row.avgDepth,
      loyalty:
        row.visitors > 0
          ? Number((row.returningVisitors / row.visitors).toFixed(6))
          : 0,
      frequency: row.avgFrequency,
      traffic: row.trafficShare,
    },
  }));
  return jsonResponse({ ok: true, data });
}

export async function queryReferrerRadarFromD1(
  env: Env,
  siteId: string,
  window: QueryWindow,
  filters: DashboardFilters,
  limit: number,
): Promise<ReferrerRadarRow[]> {
  const filter = buildVisitFilterSql(filters);

  const sql = `
WITH
${buildVisitSourceCte()},

filtered_visits AS (
  SELECT
    visit_id,
    visitor_id,
    session_id,
    TRIM(COALESCE(referrer_host, '')) AS referrer,
    CASE WHEN duration_ms IS NOT NULL AND duration_ms >= 0
         THEN duration_ms ELSE 0 END AS safe_duration_ms
  FROM visit_source
  ${filter.clause}
),

session_level AS (
  SELECT
    referrer,
    session_id,
    count(*) AS visit_count,
    sum(safe_duration_ms) AS session_duration
  FROM filtered_visits
  WHERE session_id != ''
  GROUP BY referrer, session_id
),

referrer_session_agg AS (
  SELECT
    referrer,
    count(*) AS sessions,
    sum(CASE WHEN visit_count = 1 THEN 1 ELSE 0 END) AS bounces,
    CASE WHEN count(*) > 0
         THEN CAST(sum(session_duration) AS REAL) / count(*)
         ELSE 0 END AS avgDurationMs,
    CASE WHEN count(*) > 0
         THEN CAST(sum(visit_count) AS REAL) / count(*)
         ELSE 0 END AS avgDepth
  FROM session_level
  GROUP BY referrer
),

visitor_level AS (
  SELECT
    referrer,
    visitor_id,
    count(DISTINCT CASE WHEN session_id != '' THEN session_id ELSE NULL END) AS session_count
  FROM filtered_visits
  WHERE visitor_id != ''
  GROUP BY referrer, visitor_id
),

referrer_visitor_agg AS (
  SELECT
    referrer,
    count(*) AS visitors,
    sum(CASE WHEN session_count > 1 THEN 1 ELSE 0 END) AS returningVisitors,
    CASE WHEN count(*) > 0
         THEN CAST(sum(session_count) AS REAL) / count(*)
         ELSE 0 END AS avgFrequency
  FROM visitor_level
  GROUP BY referrer
),

total_visitors AS (
  SELECT count(DISTINCT CASE WHEN visitor_id != '' THEN visitor_id ELSE NULL END) AS total
  FROM filtered_visits
)

SELECT
  rsa.referrer,
  rsa.sessions,
  rsa.bounces,
  rsa.avgDurationMs,
  rsa.avgDepth,
  rva.visitors,
  rva.returningVisitors,
  rva.avgFrequency,
  CASE WHEN tv.total > 0
       THEN CAST(rva.visitors AS REAL) / tv.total
       ELSE 0 END AS trafficShare
FROM referrer_session_agg rsa
INNER JOIN referrer_visitor_agg rva ON rsa.referrer = rva.referrer
CROSS JOIN total_visitors tv
ORDER BY rva.visitors DESC, rsa.sessions DESC, rsa.referrer ASC
LIMIT ?
`;

  const rows = await queryD1All<Record<string, unknown>>(env, sql, [
    ...visitSourceBindings(siteId, window),
    ...filter.bindings,
    limit,
  ]);

  return rows
    .map((row) => ({
      referrer: String(row.referrer ?? "").trim(),
      sessions: Number(row.sessions ?? 0),
      bounces: Number(row.bounces ?? 0),
      avgDurationMs: Number(row.avgDurationMs ?? 0),
      avgDepth: Number(row.avgDepth ?? 0),
      visitors: Number(row.visitors ?? 0),
      returningVisitors: Number(row.returningVisitors ?? 0),
      avgFrequency: Number(row.avgFrequency ?? 0),
      trafficShare: Number(row.trafficShare ?? 0),
    }))
    .filter((row) => row.visitors > 0);
}

export async function handleReferrerRadar(
  env: Env,
  siteId: string,
  url: URL,
): Promise<Response> {
  const window = parseWindow(url);
  if (!window) return badRequest("Invalid time window");
  const filters = parseFilters(url);
  const limit = parseLimit(url, 24, 48);
  const rows = await queryReferrerRadarFromD1(
    env,
    siteId,
    window,
    filters,
    limit,
  );
  const data = rows.map((row) => ({
    referrer: row.referrer,
    visitors: row.visitors,
    sessions: row.sessions,
    metrics: {
      duration: row.avgDurationMs,
      engagement:
        row.sessions > 0
          ? Number(((row.sessions - row.bounces) / row.sessions).toFixed(6))
          : 0,
      depth: row.avgDepth,
      loyalty:
        row.visitors > 0
          ? Number((row.returningVisitors / row.visitors).toFixed(6))
          : 0,
      frequency: row.avgFrequency,
      traffic: row.trafficShare,
    },
  }));
  return jsonResponse({ ok: true, data });
}

export async function handleClientDimensionTrend(
  env: Env,
  siteId: string,
  url: URL,
): Promise<Response> {
  const dimension = parseClientDimensionKey(url.searchParams.get("dimension"));
  if (!dimension) return badRequest("Invalid client dimension");
  const window = parseWindow(url);
  if (!window) return badRequest("Invalid time window");
  const filters = parseFilters(url);
  const interval = parseInterval(url);
  const limit = parseLimit(url, 5, 8);
  const trend = await queryClientDimensionTrendFromD1(
    env,
    siteId,
    window,
    interval,
    filters,
    dimension,
    limit,
  );
  return jsonResponse({
    ok: true,
    interval,
    series: trend.series,
    data: trend.data,
  });
}

export async function handleUtmDimensionTrend(
  env: Env,
  siteId: string,
  url: URL,
): Promise<Response> {
  const dimension = parseUtmDimensionKey(url.searchParams.get("dimension"));
  if (!dimension) return badRequest("Invalid UTM dimension");
  const window = parseWindow(url);
  if (!window) return badRequest("Invalid time window");
  const filters = parseFilters(url);
  const interval = parseInterval(url);
  const limit = parseLimit(url, 5, 8);
  const trend = await queryUtmDimensionTrendFromD1(
    env,
    siteId,
    window,
    interval,
    filters,
    dimension,
    limit,
  );
  return jsonResponse({
    ok: true,
    interval,
    series: trend.series,
    data: trend.data,
  });
}

export async function handleReferrerDimensionTrend(
  env: Env,
  siteId: string,
  url: URL,
): Promise<Response> {
  const window = parseWindow(url);
  if (!window) return badRequest("Invalid time window");
  const filters = parseFilters(url);
  const interval = parseInterval(url);
  const limit = parseLimit(url, 5, 8);
  const trend = await queryReferrerTrendFromD1(
    env,
    siteId,
    window,
    interval,
    filters,
    limit,
  );
  return jsonResponse({
    ok: true,
    interval,
    series: trend.series,
    data: trend.data,
  });
}

export async function handleClientCrossBreakdown(
  env: Env,
  siteId: string,
  url: URL,
): Promise<Response> {
  const primaryDimension = parseClientDimensionKey(
    url.searchParams.get("primaryDimension"),
  );
  if (!primaryDimension) return badRequest("Invalid primary dimension");
  const secondaryDimension = parseClientDimensionKey(
    url.searchParams.get("secondaryDimension"),
  );
  if (!secondaryDimension) return badRequest("Invalid secondary dimension");
  if (primaryDimension === secondaryDimension) {
    return badRequest("Primary and secondary dimensions must differ");
  }
  const window = parseWindow(url);
  if (!window) return badRequest("Invalid time window");
  const filters = parseFilters(url);
  const primaryLimit = parseQueryLimit(url, "primaryLimit", 5, 1, 12);
  const secondaryLimit = parseQueryLimit(url, "secondaryLimit", 6, 1, 8);
  const data = await queryClientCrossDimensionFromD1(
    env,
    siteId,
    window,
    filters,
    primaryLimit,
    secondaryLimit,
    primaryDimension,
    secondaryDimension,
  );
  return jsonResponse(data);
}

export function parseClientDimensionKey(
  value: string | null,
): ClientDimensionKey | null {
  const normalized = String(value ?? "").trim();
  if (
    normalized === "browser" ||
    normalized === "operatingSystem" ||
    normalized === "osVersion" ||
    normalized === "deviceType" ||
    normalized === "language" ||
    normalized === "screenSize"
  ) {
    return normalized as ClientDimensionKey;
  }
  return null;
}

export function parseUtmDimensionKey(
  value: string | null,
): UtmDimensionKey | null {
  const normalized = String(value ?? "").trim();
  if (
    normalized === "source" ||
    normalized === "medium" ||
    normalized === "campaign" ||
    normalized === "term" ||
    normalized === "content"
  ) {
    return normalized as UtmDimensionKey;
  }
  return null;
}
