import type {
  BrowserTrendBucketRow,
  BrowserTrendPointRow,
  BrowserTrendSeriesRow,
  ClientDimensionKey,
  DashboardFilters,
  Interval,
  QueryWindow,
  UtmDimensionKey,
} from "@/lib/edge/query/core";
import {
  buildTimeBuckets,
  buildVisitFilterSql,
  buildVisitSourceCte,
  clientDimensionDefinition,
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
} from "@/lib/edge/query/core";
import type { Env } from "@/lib/edge/types";

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
