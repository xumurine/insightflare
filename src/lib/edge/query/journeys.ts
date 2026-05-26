import {
  buildLocalityLocationValue,
  buildRegionLocationValue,
} from "@/lib/dashboard/geo-location";
import {
  resolveReportingTimeZone,
  zonedParts,
} from "@/lib/dashboard/time-zone";
import type { Env } from "@/lib/edge/types";

import type {
  DashboardFilters,
  GeoCountryCountRow,
  GeoDimensionCountRow,
  GeoPointAggregate,
  GeoPointRow,
  Interval,
  JourneyEventCountRow,
  JourneyEventRow,
  JourneyPageCountRow,
  JourneyPerformanceSummaryRow,
  ListSort,
  PerformanceMetricKey,
  QueryWindow,
  SessionListSortKey,
  SessionRow,
  SortDirection,
  VisitorActivityRow,
  VisitorListSortKey,
  VisitorRow,
} from "./core";
import {
  badRequest,
  browserMajorVersionExpr,
  buildCustomEventSourceCte,
  buildDetailCustomEventSourceCte,
  buildTargetVisitSourceCte,
  buildTimeBuckets,
  buildVisitFilterSql,
  buildVisitSourceCte,
  DEFAULT_SESSION_LIST_SORT,
  DEFAULT_VISITOR_LIST_SORT,
  detailCustomEventSourceBindings,
  emptyVisitPerformanceMetrics,
  eventSourceBindings,
  jsonResponse,
  mapVisitors,
  mapVisitPerformanceMetrics,
  parseFilters,
  parseGeoFilterValue,
  parseLimit,
  parseListSearch,
  parseQueryLimit,
  parseSessionListSort,
  parseVisitorListSort,
  parseWindow,
  PERFORMANCE_METRIC_KEYS,
  queryD1All,
  roundPerformanceValue,
  targetVisitSourceBindings,
  timeBucketCase,
  timeBucketTimestamp,
  visitSourceBindings,
} from "./core";

export async function queryVisitorAggregate(
  env: Env,
  siteId: string,
  window: QueryWindow,
  filters: DashboardFilters,
  limit: number,
  offset = 0,
  sort: ListSort<VisitorListSortKey> = DEFAULT_VISITOR_LIST_SORT,
  search?: string,
): Promise<VisitorRow[]> {
  return queryVisitorsFromD1(
    env,
    siteId,
    window,
    filters,
    limit,
    undefined,
    offset,
    sort,
    search,
  );
}

export async function queryGeoPointAggregate(
  env: Env,
  siteId: string,
  window: QueryWindow,
  filters: DashboardFilters,
  limit: number,
): Promise<GeoPointAggregate> {
  return queryGeoPointsFromD1(env, siteId, window, filters, limit);
}

export async function handleVisitors(
  env: Env,
  siteId: string,
  url: URL,
): Promise<Response> {
  const window = parseWindow(url);
  if (!window) return badRequest("Invalid time window");
  const filters = parseFilters(url);
  const paged =
    url.searchParams.has("page") || url.searchParams.has("pageSize");
  const page = paged ? parseQueryLimit(url, "page", 1, 1, 10_000) : 1;
  const pageSize = paged
    ? parseQueryLimit(url, "pageSize", 80, 1, 120)
    : parseLimit(url, 20, 200);
  const offset = paged ? (page - 1) * pageSize : 0;
  const sort = parseVisitorListSort(url);
  const search = parseListSearch(url);
  const requestedRows = await queryVisitorAggregate(
    env,
    siteId,
    window,
    filters,
    paged ? pageSize + 1 : pageSize,
    offset,
    sort,
    search,
  );
  const hasMore = paged && requestedRows.length > pageSize;
  const rows = hasMore ? requestedRows.slice(0, pageSize) : requestedRows;
  return jsonResponse({
    ok: true,
    data: mapVisitors(rows),
    meta: {
      page,
      pageSize,
      returned: rows.length,
      hasMore,
      nextPage: hasMore ? page + 1 : null,
    },
  });
}

export async function handleSessions(
  env: Env,
  siteId: string,
  url: URL,
): Promise<Response> {
  const window = parseWindow(url);
  if (!window) return badRequest("Invalid time window");
  const filters = parseFilters(url);
  const paged =
    url.searchParams.has("page") || url.searchParams.has("pageSize");
  const page = paged ? parseQueryLimit(url, "page", 1, 1, 10_000) : 1;
  const pageSize = paged
    ? parseQueryLimit(url, "pageSize", 80, 1, 120)
    : parseLimit(url, 100, 500);
  const offset = paged ? (page - 1) * pageSize : 0;
  const sort = parseSessionListSort(url);
  const search = parseListSearch(url);
  const requestedRows = await querySessionsFromD1(
    env,
    siteId,
    window,
    filters,
    paged ? pageSize + 1 : pageSize,
    undefined,
    offset,
    sort,
    search,
  );
  const hasMore = paged && requestedRows.length > pageSize;
  const rows = hasMore ? requestedRows.slice(0, pageSize) : requestedRows;
  return jsonResponse({
    ok: true,
    data: rows,
    meta: {
      page,
      pageSize,
      returned: rows.length,
      hasMore,
      nextPage: hasMore ? page + 1 : null,
    },
  });
}

export async function handleVisitorDetail(
  env: Env,
  siteId: string,
  url: URL,
): Promise<Response> {
  const visitorId = (url.searchParams.get("visitorId") || "").trim();
  if (!visitorId) return badRequest("Missing visitorId");
  const timeZone = resolveReportingTimeZone(
    url.searchParams.get("timeZone") || url.searchParams.get("tz"),
  );
  const detail = await queryVisitorDetailFromD1(
    env,
    siteId,
    visitorId,
    timeZone,
  );
  return jsonResponse({ ok: true, data: detail });
}

export async function handleSessionDetail(
  env: Env,
  siteId: string,
  url: URL,
): Promise<Response> {
  const sessionId = (url.searchParams.get("sessionId") || "").trim();
  if (!sessionId) return badRequest("Missing sessionId");
  const detail = await querySessionDetailFromD1(env, siteId, sessionId);
  return jsonResponse({ ok: true, data: detail });
}

export async function handleRetention(
  env: Env,
  siteId: string,
  url: URL,
): Promise<Response> {
  const window = parseWindow(url);
  if (!window) return badRequest("Invalid time window");
  const filters = parseFilters(url);
  const rawGranularity =
    url.searchParams.get("granularity") ||
    url.searchParams.get("interval") ||
    "week";
  const granularity =
    rawGranularity === "minute" ||
    rawGranularity === "hour" ||
    rawGranularity === "day" ||
    rawGranularity === "week" ||
    rawGranularity === "month"
      ? rawGranularity
      : "week";

  const buckets = buildTimeBuckets(window, granularity);
  const bucket = timeBucketCase(buckets, "started_at");

  const filter = buildVisitFilterSql(filters);
  const filterAndClause = filter.clause
    ? filter.clause.replace(/^WHERE\s+/i, "AND ")
    : "";
  const sql = `
WITH
${buildVisitSourceCte()},
filtered_visits AS (
  SELECT
    visitor_id,
    started_at,
    ${bucket.sql} AS bucket
  FROM visit_source
  WHERE visitor_id != ''
  ${filterAndClause}
),
cohort_assign AS (
  SELECT
    visitor_id,
    MIN(bucket) AS cohort_bucket
  FROM filtered_visits
  WHERE bucket IS NOT NULL
  GROUP BY visitor_id
),
return_data AS (
  SELECT
    ca.cohort_bucket,
    fv.bucket AS visit_bucket,
    fv.visitor_id
  FROM filtered_visits fv
  JOIN cohort_assign ca ON fv.visitor_id = ca.visitor_id
  WHERE fv.bucket IS NOT NULL
)
SELECT
  cohort_bucket AS cohortBucket,
  visit_bucket AS visitBucket,
  COUNT(DISTINCT visitor_id) AS visitors
FROM return_data
GROUP BY cohort_bucket, visit_bucket
ORDER BY cohort_bucket ASC, visit_bucket ASC
`;

  const rows = await queryD1All<Record<string, unknown>>(env, sql, [
    ...visitSourceBindings(siteId, window),
    ...bucket.bindings,
    ...filter.bindings,
  ]);

  const cohortMap = new Map<
    number,
    { size: number; periods: Map<number, number> }
  >();
  for (const row of rows) {
    const cb = Number(row.cohortBucket ?? 0);
    const vb = Number(row.visitBucket ?? 0);
    const visitors = Number(row.visitors ?? 0);

    if (!cohortMap.has(cb)) {
      cohortMap.set(cb, { size: 0, periods: new Map() });
    }
    const cohort = cohortMap.get(cb)!;
    cohort.periods.set(vb, visitors);
    if (vb === cb) {
      cohort.size = visitors;
    }
  }

  const cohorts = Array.from(cohortMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([bucket, { size, periods }]) => ({
      bucket: timeBucketTimestamp(buckets, bucket),
      size,
      periods: Array.from(periods.entries())
        .sort(([a], [b]) => a - b)
        .map(([vb, visitors]) => {
          const index = Math.max(0, vb - bucket);
          return {
            index,
            visitors,
            rate: size > 0 ? visitors / size : 0,
          };
        }),
    }));

  return jsonResponse({ ok: true, granularity, cohorts });
}

export async function queryVisitorsFromD1(
  env: Env,
  siteId: string,
  window: QueryWindow,
  filters: DashboardFilters,
  limit: number,
  targetVisitorId?: string,
  offset = 0,
  sort: ListSort<VisitorListSortKey> = DEFAULT_VISITOR_LIST_SORT,
  search?: string,
): Promise<VisitorRow[]> {
  const filter = buildVisitFilterSql(filters);
  const searchSql = buildJourneySearchSql(search);
  const searchCte = searchSql
    ? `,
matched_visitors AS (
  SELECT DISTINCT visitor_id
  FROM filtered_visits
  WHERE visitor_id != '' AND ${searchSql.condition}
)`
    : "";
  const searchWhere = searchSql
    ? "AND fv.visitor_id IN (SELECT visitor_id FROM matched_visitors)"
    : "";
  const targetClause = targetVisitorId
    ? whereClauseWithTarget(filter.clause, {
        column: "visitor_id",
        value: targetVisitorId,
      })
    : filter.clause;
  const sql = `
WITH
${buildVisitSourceCte()},
${buildCustomEventSourceCte()},
filtered_visits AS (
  SELECT *
  FROM visit_source
  ${targetClause}
)
${searchCte}
SELECT
  fv.visitor_id AS visitorId,
  COALESCE((
    SELECT latest.session_id
    FROM filtered_visits latest
    WHERE latest.visitor_id = fv.visitor_id
    ORDER BY latest.started_at DESC, latest.visit_id DESC
    LIMIT 1
  ), '') AS sessionId,
  MIN(fv.started_at) AS firstSeenAt,
  MAX(fv.started_at) AS lastSeenAt,
  count(*) AS views,
  count(DISTINCT CASE WHEN fv.session_id != '' THEN fv.session_id ELSE NULL END) AS sessions,
  (
    SELECT count(*)
    FROM event_source es
    WHERE es.visitor_id = fv.visitor_id
  ) AS events,
  COALESCE((
    SELECT latest.country
    FROM filtered_visits latest
    WHERE latest.visitor_id = fv.visitor_id
    ORDER BY latest.started_at DESC, latest.visit_id DESC
    LIMIT 1
  ), '') AS country,
  COALESCE((
    SELECT latest.region
    FROM filtered_visits latest
    WHERE latest.visitor_id = fv.visitor_id
    ORDER BY latest.started_at DESC, latest.visit_id DESC
    LIMIT 1
  ), '') AS region,
  COALESCE((
    SELECT latest.region_code
    FROM filtered_visits latest
    WHERE latest.visitor_id = fv.visitor_id
    ORDER BY latest.started_at DESC, latest.visit_id DESC
    LIMIT 1
  ), '') AS regionCode,
  COALESCE((
    SELECT latest.city
    FROM filtered_visits latest
    WHERE latest.visitor_id = fv.visitor_id
    ORDER BY latest.started_at DESC, latest.visit_id DESC
    LIMIT 1
  ), '') AS city,
  COALESCE((
    SELECT first.referrer_host
    FROM filtered_visits first
    WHERE first.visitor_id = fv.visitor_id
    ORDER BY first.started_at ASC, first.visit_id ASC
    LIMIT 1
  ), '') AS referrerHost,
  COALESCE((
    SELECT first.referrer_url
    FROM filtered_visits first
    WHERE first.visitor_id = fv.visitor_id
    ORDER BY first.started_at ASC, first.visit_id ASC
    LIMIT 1
  ), '') AS referrerUrl,
  COALESCE((
    SELECT latest.browser
    FROM filtered_visits latest
    WHERE latest.visitor_id = fv.visitor_id
    ORDER BY latest.started_at DESC, latest.visit_id DESC
    LIMIT 1
  ), '') AS browser,
  COALESCE((
    SELECT ${browserMajorVersionExpr("latest")}
    FROM filtered_visits latest
    WHERE latest.visitor_id = fv.visitor_id
    ORDER BY latest.started_at DESC, latest.visit_id DESC
    LIMIT 1
  ), '') AS browserVersion,
  COALESCE((
    SELECT latest.os
    FROM filtered_visits latest
    WHERE latest.visitor_id = fv.visitor_id
    ORDER BY latest.started_at DESC, latest.visit_id DESC
    LIMIT 1
  ), '') AS os,
  COALESCE((
    SELECT latest.os_version
    FROM filtered_visits latest
    WHERE latest.visitor_id = fv.visitor_id
    ORDER BY latest.started_at DESC, latest.visit_id DESC
    LIMIT 1
  ), '') AS osVersion,
  COALESCE((
    SELECT latest.device_type
    FROM filtered_visits latest
    WHERE latest.visitor_id = fv.visitor_id
    ORDER BY latest.started_at DESC, latest.visit_id DESC
    LIMIT 1
  ), '') AS deviceType,
  (
    SELECT latest.screen_width
    FROM filtered_visits latest
    WHERE latest.visitor_id = fv.visitor_id
    ORDER BY latest.started_at DESC, latest.visit_id DESC
    LIMIT 1
  ) AS screenWidth,
  (
    SELECT latest.screen_height
    FROM filtered_visits latest
    WHERE latest.visitor_id = fv.visitor_id
    ORDER BY latest.started_at DESC, latest.visit_id DESC
    LIMIT 1
  ) AS screenHeight
FROM filtered_visits fv
WHERE fv.visitor_id != ''
  ${searchWhere}
GROUP BY fv.visitor_id
ORDER BY ${visitorListOrderBy(sort)}
LIMIT ? OFFSET ?
`;
  return (
    await queryD1All<Record<string, unknown>>(env, sql, [
      ...visitSourceBindings(siteId, window),
      ...eventSourceBindings(siteId, window),
      ...(targetVisitorId ? [targetVisitorId] : []),
      ...filter.bindings,
      ...(searchSql?.bindings ?? []),
      limit,
      offset,
    ])
  ).map((row) => ({
    visitorId: String(row.visitorId ?? ""),
    sessionId: String(row.sessionId ?? ""),
    firstSeenAt: Number(row.firstSeenAt ?? 0),
    lastSeenAt: Number(row.lastSeenAt ?? 0),
    views: Number(row.views ?? 0),
    sessions: Number(row.sessions ?? 0),
    events: Number(row.events ?? 0),
    country: String(row.country ?? ""),
    region: String(row.region ?? ""),
    regionCode: String(row.regionCode ?? ""),
    city: String(row.city ?? ""),
    referrerHost: String(row.referrerHost ?? ""),
    referrerUrl: String(row.referrerUrl ?? ""),
    browser: String(row.browser ?? ""),
    browserVersion: String(row.browserVersion ?? ""),
    os: String(row.os ?? ""),
    osVersion: String(row.osVersion ?? ""),
    deviceType: String(row.deviceType ?? ""),
    screenWidth:
      row.screenWidth === null ? null : Number(row.screenWidth ?? 0) || null,
    screenHeight:
      row.screenHeight === null ? null : Number(row.screenHeight ?? 0) || null,
  }));
}

export function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

export function nullableCoordinate(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function sessionDurationMs(
  startedAt: number,
  endedAt: number,
  totalDurationMs: number,
  hasDurationAggregate: boolean,
): number {
  if (hasDurationAggregate && Number.isFinite(totalDurationMs)) {
    return Math.max(0, Math.round(totalDurationMs));
  }
  if (
    Number.isFinite(startedAt) &&
    Number.isFinite(endedAt) &&
    endedAt > startedAt
  ) {
    return Math.max(0, Math.round(endedAt - startedAt));
  }
  return Math.max(0, Math.round(totalDurationMs || 0));
}

export function whereClauseWithTarget(
  filterClause: string,
  target?: { column: string; value: string },
): string {
  if (!target) return filterClause;
  const filterAndClause = filterClause
    ? filterClause.replace(/^WHERE\s+/i, "AND ")
    : "";
  return `WHERE ${target.column} = ? ${filterAndClause}`;
}

export function escapeLikeSearch(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

export function buildJourneySearchSql(
  search: string | undefined,
  alias = "",
): { condition: string; bindings: string[] } | null {
  const normalized = search?.trim();
  if (!normalized) return null;
  const prefix = alias ? `${alias}.` : "";
  const pattern = `%${escapeLikeSearch(normalized.toLowerCase())}%`;
  const expressions = [
    `${prefix}visitor_id`,
    `${prefix}session_id`,
    `${prefix}pathname`,
    `${prefix}query_string`,
    `${prefix}hash_fragment`,
    `${prefix}hostname`,
    `${prefix}title`,
    `${prefix}referrer_host`,
    `${prefix}referrer_url`,
    `CASE WHEN TRIM(COALESCE(${prefix}referrer_host, '')) = '' THEN 'direct' ELSE ${prefix}referrer_host END`,
    `${prefix}country`,
    `${prefix}region`,
    `${prefix}region_code`,
    `${prefix}city`,
    `${prefix}browser`,
    `${prefix}browser_version`,
    `TRIM(COALESCE(${prefix}browser, '') || ' ' || COALESCE(${prefix}browser_version, ''))`,
    `${prefix}os`,
    `${prefix}os_version`,
    `TRIM(COALESCE(${prefix}os, '') || ' ' || COALESCE(${prefix}os_version, ''))`,
    `${prefix}device_type`,
  ].map(
    (expression) =>
      `LOWER(TRIM(COALESCE(${expression}, ''))) LIKE ? ESCAPE '\\'`,
  );

  return {
    condition: `(${expressions.join(" OR ")})`,
    bindings: Array.from({ length: expressions.length }, () => pattern),
  };
}

export function directionSql(direction: SortDirection): "ASC" | "DESC" {
  return direction === "asc" ? "ASC" : "DESC";
}

export function visitorListOrderBy(sort: ListSort<VisitorListSortKey>): string {
  const column: Record<VisitorListSortKey, string> = {
    firstSeenAt: "firstSeenAt",
    lastSeenAt: "lastSeenAt",
    sessions: "sessions",
    views: "views",
  };
  return `${column[sort.key]} ${directionSql(sort.direction)}, lastSeenAt DESC, visitorId ASC`;
}

export function sessionListOrderBy(sort: ListSort<SessionListSortKey>): string {
  const column: Record<SessionListSortKey, string> = {
    startedAt: "startedAt",
    durationMs: "totalDurationMs",
    views: "views",
  };
  return `${column[sort.key]} ${directionSql(sort.direction)}, startedAt DESC, sessionId ASC`;
}

export function mapSessionRow(row: Record<string, unknown>): SessionRow {
  const startedAt = Number(row.startedAt ?? 0);
  const endedAt = Number(row.endedAt ?? startedAt);
  const views = Number(row.views ?? 0);
  return {
    sessionId: String(row.sessionId ?? ""),
    visitorId: String(row.visitorId ?? ""),
    startedAt,
    endedAt,
    durationMs: sessionDurationMs(
      startedAt,
      endedAt,
      Number(row.totalDurationMs ?? row.durationMs ?? 0),
      Object.prototype.hasOwnProperty.call(row, "totalDurationMs"),
    ),
    active: Boolean(Number(row.active ?? 0)),
    views,
    events: Number(row.events ?? 0),
    bounce: Boolean(Number(row.bounce ?? (views <= 1 ? 1 : 0))),
    entryPath: String(row.entryPath ?? ""),
    exitPath: String(row.exitPath ?? ""),
    referrerHost: String(row.referrerHost ?? ""),
    referrerUrl: String(row.referrerUrl ?? ""),
    country: String(row.country ?? ""),
    region: String(row.region ?? ""),
    regionCode: String(row.regionCode ?? ""),
    city: String(row.city ?? ""),
    latitude: nullableCoordinate(row.latitude),
    longitude: nullableCoordinate(row.longitude),
    browser: String(row.browser ?? ""),
    browserVersion: String(row.browserVersion ?? ""),
    os: String(row.os ?? ""),
    osVersion: String(row.osVersion ?? ""),
    deviceType: String(row.deviceType ?? ""),
    screenWidth: nullableNumber(row.screenWidth),
    screenHeight: nullableNumber(row.screenHeight),
    performance: mapVisitPerformanceMetrics(row),
  };
}

export function mapGeoPointRow(row: Record<string, unknown>): GeoPointRow {
  return {
    latitude: Number(row.latitude ?? 0),
    longitude: Number(row.longitude ?? 0),
    timestampMs: Number(row.timestampMs ?? 0),
    country: String(row.country ?? ""),
    region: String(row.region ?? ""),
    regionCode: String(row.regionCode ?? ""),
    city: String(row.city ?? ""),
  };
}

export async function querySessionsFromD1(
  env: Env,
  siteId: string,
  window: QueryWindow,
  filters: DashboardFilters,
  limit: number,
  target?: { type: "visitor" | "session"; value: string },
  offset = 0,
  sort: ListSort<SessionListSortKey> = DEFAULT_SESSION_LIST_SORT,
  search?: string,
): Promise<SessionRow[]> {
  const filter = buildVisitFilterSql(filters);
  const searchSql = buildJourneySearchSql(search);
  const searchCte = searchSql
    ? `,
matched_sessions AS (
  SELECT DISTINCT session_id
  FROM filtered_visits
  WHERE session_id != '' AND ${searchSql.condition}
)`
    : "";
  const searchWhere = searchSql
    ? "AND fv.session_id IN (SELECT session_id FROM matched_sessions)"
    : "";
  const targetColumn =
    target?.type === "visitor"
      ? "visitor_id"
      : target?.type === "session"
        ? "session_id"
        : "";
  const targetClause = target
    ? whereClauseWithTarget(filter.clause, {
        column: targetColumn,
        value: target.value,
      })
    : filter.clause;
  const sql = `
WITH
${buildVisitSourceCte()},
${buildCustomEventSourceCte()},
filtered_visits AS (
  SELECT *
  FROM visit_source
  ${targetClause}
)
${searchCte}
SELECT
  fv.session_id AS sessionId,
  COALESCE((
    SELECT edge.visitor_id
    FROM filtered_visits edge
    WHERE edge.session_id = fv.session_id
    ORDER BY edge.started_at ASC, edge.visit_id ASC
    LIMIT 1
  ), '') AS visitorId,
  MIN(fv.started_at) AS startedAt,
  MAX(COALESCE(fv.ended_at, fv.last_activity_at, fv.started_at)) AS endedAt,
  SUM(COALESCE(fv.duration_ms, 0)) AS totalDurationMs,
  MAX(CASE WHEN LOWER(COALESCE(fv.status, '')) = 'open' THEN 1 ELSE 0 END) AS active,
  count(*) AS views,
  (
    SELECT count(*)
    FROM event_source es
    WHERE es.session_id = fv.session_id
  ) AS events,
  CASE WHEN count(*) <= 1 THEN 1 ELSE 0 END AS bounce,
  COALESCE((
    SELECT edge.pathname
    FROM filtered_visits edge
    WHERE edge.session_id = fv.session_id
    ORDER BY edge.started_at ASC, edge.visit_id ASC
    LIMIT 1
  ), '') AS entryPath,
  COALESCE((
    SELECT edge.pathname
    FROM filtered_visits edge
    WHERE edge.session_id = fv.session_id
    ORDER BY edge.started_at DESC, edge.visit_id DESC
    LIMIT 1
  ), '') AS exitPath,
  COALESCE((
    SELECT edge.referrer_host
    FROM filtered_visits edge
    WHERE edge.session_id = fv.session_id
    ORDER BY edge.started_at ASC, edge.visit_id ASC
    LIMIT 1
  ), '') AS referrerHost,
  COALESCE((
    SELECT edge.referrer_url
    FROM filtered_visits edge
    WHERE edge.session_id = fv.session_id
    ORDER BY edge.started_at ASC, edge.visit_id ASC
    LIMIT 1
  ), '') AS referrerUrl,
  COALESCE((
    SELECT edge.country
    FROM filtered_visits edge
    WHERE edge.session_id = fv.session_id
    ORDER BY edge.started_at ASC, edge.visit_id ASC
    LIMIT 1
  ), '') AS country,
  COALESCE((
    SELECT edge.region
    FROM filtered_visits edge
    WHERE edge.session_id = fv.session_id
    ORDER BY edge.started_at ASC, edge.visit_id ASC
    LIMIT 1
  ), '') AS region,
  COALESCE((
    SELECT edge.region_code
    FROM filtered_visits edge
    WHERE edge.session_id = fv.session_id
    ORDER BY edge.started_at ASC, edge.visit_id ASC
    LIMIT 1
  ), '') AS regionCode,
  COALESCE((
    SELECT edge.city
    FROM filtered_visits edge
    WHERE edge.session_id = fv.session_id
    ORDER BY edge.started_at ASC, edge.visit_id ASC
    LIMIT 1
  ), '') AS city,
  (
    SELECT edge.latitude
    FROM filtered_visits edge
    WHERE edge.session_id = fv.session_id
      AND edge.latitude IS NOT NULL
      AND edge.longitude IS NOT NULL
      AND ABS(edge.latitude) <= 90
      AND ABS(edge.longitude) <= 180
    ORDER BY edge.started_at ASC, edge.visit_id ASC
    LIMIT 1
  ) AS latitude,
  (
    SELECT edge.longitude
    FROM filtered_visits edge
    WHERE edge.session_id = fv.session_id
      AND edge.latitude IS NOT NULL
      AND edge.longitude IS NOT NULL
      AND ABS(edge.latitude) <= 90
      AND ABS(edge.longitude) <= 180
    ORDER BY edge.started_at ASC, edge.visit_id ASC
    LIMIT 1
  ) AS longitude,
  COALESCE((
    SELECT edge.browser
    FROM filtered_visits edge
    WHERE edge.session_id = fv.session_id
    ORDER BY edge.started_at ASC, edge.visit_id ASC
    LIMIT 1
  ), '') AS browser,
  COALESCE((
    SELECT ${browserMajorVersionExpr("edge")}
    FROM filtered_visits edge
    WHERE edge.session_id = fv.session_id
    ORDER BY edge.started_at ASC, edge.visit_id ASC
    LIMIT 1
  ), '') AS browserVersion,
  COALESCE((
    SELECT edge.os
    FROM filtered_visits edge
    WHERE edge.session_id = fv.session_id
    ORDER BY edge.started_at ASC, edge.visit_id ASC
    LIMIT 1
  ), '') AS os,
  COALESCE((
    SELECT edge.os_version
    FROM filtered_visits edge
    WHERE edge.session_id = fv.session_id
    ORDER BY edge.started_at ASC, edge.visit_id ASC
    LIMIT 1
  ), '') AS osVersion,
  COALESCE((
    SELECT edge.device_type
    FROM filtered_visits edge
    WHERE edge.session_id = fv.session_id
    ORDER BY edge.started_at ASC, edge.visit_id ASC
    LIMIT 1
  ), '') AS deviceType,
  (
    SELECT edge.screen_width
    FROM filtered_visits edge
    WHERE edge.session_id = fv.session_id
    ORDER BY edge.started_at ASC, edge.visit_id ASC
    LIMIT 1
  ) AS screenWidth,
  (
    SELECT edge.screen_height
    FROM filtered_visits edge
    WHERE edge.session_id = fv.session_id
    ORDER BY edge.started_at ASC, edge.visit_id ASC
    LIMIT 1
  ) AS screenHeight
FROM filtered_visits fv
WHERE fv.session_id != ''
  ${searchWhere}
GROUP BY fv.session_id
ORDER BY ${sessionListOrderBy(sort)}
LIMIT ? OFFSET ?
`;
  return (
    await queryD1All<Record<string, unknown>>(env, sql, [
      ...visitSourceBindings(siteId, window),
      ...eventSourceBindings(siteId, window),
      ...(target ? [target.value] : []),
      ...filter.bindings,
      ...(searchSql?.bindings ?? []),
      limit,
      offset,
    ])
  ).map(mapSessionRow);
}

export function mapJourneyEventRow(
  row: Record<string, unknown>,
): JourneyEventRow {
  const kind = String(row.kind ?? "pageview");
  return {
    id: String(row.id ?? ""),
    kind:
      kind === "custom"
        ? "custom"
        : kind === "session_start"
          ? "session_start"
          : kind === "leave"
            ? "leave"
            : "pageview",
    eventType: String(row.eventType ?? ""),
    occurredAt: Number(row.occurredAt ?? 0),
    visitId: String(row.visitId ?? ""),
    sessionId: String(row.sessionId ?? ""),
    visitorId: String(row.visitorId ?? ""),
    pathname: String(row.pathname ?? ""),
    hash: String(row.hash ?? ""),
    title: String(row.title ?? ""),
    hostname: String(row.hostname ?? ""),
    referrerHost: String(row.referrerHost ?? ""),
    referrerUrl: String(row.referrerUrl ?? ""),
    country: String(row.country ?? ""),
    region: String(row.region ?? ""),
    city: String(row.city ?? ""),
    browser: String(row.browser ?? ""),
    browserVersion: String(row.browserVersion ?? ""),
    os: String(row.os ?? ""),
    osVersion: String(row.osVersion ?? ""),
    deviceType: String(row.deviceType ?? ""),
    screenWidth: nullableNumber(row.screenWidth),
    screenHeight: nullableNumber(row.screenHeight),
    durationMs: Math.max(0, Number(row.durationMs ?? 0)),
    performance: mapVisitPerformanceMetrics(row),
  };
}

export function sessionStartEvent(session: SessionRow): JourneyEventRow {
  return {
    id: `session-start:${session.sessionId}`,
    kind: "session_start",
    eventType: "session start",
    occurredAt: session.startedAt,
    visitId: "",
    sessionId: session.sessionId,
    visitorId: session.visitorId,
    pathname: session.entryPath,
    hash: "",
    title: "",
    hostname: "",
    referrerHost: session.referrerHost,
    referrerUrl: session.referrerUrl,
    country: session.country,
    region: session.region,
    city: session.city,
    browser: session.browser,
    browserVersion: session.browserVersion,
    os: session.os,
    osVersion: session.osVersion,
    deviceType: session.deviceType,
    screenWidth: session.screenWidth,
    screenHeight: session.screenHeight,
    durationMs: 0,
    performance: emptyVisitPerformanceMetrics(),
  };
}

export function sessionLeaveEvent(
  session: SessionRow,
  events: JourneyEventRow[],
): JourneyEventRow | null {
  if (session.active) return null;
  if (!Number.isFinite(session.endedAt) || session.endedAt <= 0) return null;
  if (
    Number.isFinite(session.startedAt) &&
    session.endedAt < session.startedAt
  ) {
    return null;
  }

  const latestPageEvent = events.reduce<JourneyEventRow | null>(
    (latest, event) =>
      event.kind === "pageview" &&
      (!latest || event.occurredAt > latest.occurredAt)
        ? event
        : latest,
    null,
  );
  const pathname =
    session.exitPath.trim() ||
    latestPageEvent?.pathname.trim() ||
    session.entryPath.trim();
  if (!pathname) return null;

  const base = latestPageEvent ?? sessionStartEvent(session);
  return {
    ...base,
    id: `session-leave:${session.sessionId}`,
    kind: "leave",
    eventType: "leave",
    occurredAt: Math.max(session.endedAt, session.startedAt),
    visitId: latestPageEvent?.visitId ?? "",
    sessionId: session.sessionId,
    visitorId: session.visitorId,
    pathname,
    durationMs: 0,
    performance: emptyVisitPerformanceMetrics(),
  };
}

export async function queryJourneyEventsFromD1(
  env: Env,
  siteId: string,
  window: QueryWindow,
  filters: DashboardFilters,
  target: { type: "visitor" | "session"; value: string },
  limit: number,
): Promise<JourneyEventRow[]> {
  const filter = buildVisitFilterSql(filters);
  const targetColumn = target.type === "visitor" ? "visitor_id" : "session_id";
  const targetClause = whereClauseWithTarget(filter.clause, {
    column: targetColumn,
    value: target.value,
  });
  const sql = `
WITH
${buildVisitSourceCte()},
${buildCustomEventSourceCte()},
filtered_visits AS (
  SELECT *
  FROM visit_source
  ${targetClause}
),
page_events AS (
  SELECT
    visit_id AS id,
    'pageview' AS kind,
    'pageview' AS eventType,
    started_at AS occurredAt,
    visit_id AS visitId,
    session_id AS sessionId,
    visitor_id AS visitorId,
    pathname,
    hash_fragment AS hash,
    title,
    hostname,
    referrer_host AS referrerHost,
    referrer_url AS referrerUrl,
    country,
    region,
    city,
    browser,
    browser_version AS browserVersion,
    os,
    os_version AS osVersion,
    device_type AS deviceType,
    screen_width AS screenWidth,
    screen_height AS screenHeight,
    COALESCE(duration_ms, 0) AS durationMs,
    perf_ttfb_ms AS perfTtfbMs,
    perf_fcp_ms AS perfFcpMs,
    perf_lcp_ms AS perfLcpMs,
    perf_cls AS perfCls,
    perf_inp_ms AS perfInpMs
  FROM filtered_visits
),
custom_event_rows AS (
  SELECT
    es.event_id AS id,
    'custom' AS kind,
    es.event_name AS eventType,
    es.occurred_at AS occurredAt,
    es.visit_id AS visitId,
    fv.session_id AS sessionId,
    fv.visitor_id AS visitorId,
    COALESCE(NULLIF(es.pathname, ''), fv.pathname) AS pathname,
    COALESCE(NULLIF(es.hash_fragment, ''), fv.hash_fragment) AS hash,
    COALESCE(NULLIF(es.title, ''), fv.title) AS title,
    COALESCE(NULLIF(es.hostname, ''), fv.hostname) AS hostname,
    COALESCE(NULLIF(es.referrer_host, ''), fv.referrer_host) AS referrerHost,
    COALESCE(NULLIF(es.referrer_url, ''), fv.referrer_url) AS referrerUrl,
    COALESCE(NULLIF(es.country, ''), fv.country) AS country,
    COALESCE(NULLIF(es.region, ''), fv.region) AS region,
    COALESCE(NULLIF(es.city, ''), fv.city) AS city,
    COALESCE(NULLIF(es.browser, ''), fv.browser) AS browser,
    fv.browser_version AS browserVersion,
    COALESCE(NULLIF(es.os, ''), fv.os) AS os,
    COALESCE(NULLIF(es.os_version, ''), fv.os_version) AS osVersion,
    COALESCE(NULLIF(es.device_type, ''), fv.device_type) AS deviceType,
    COALESCE(es.screen_width, fv.screen_width) AS screenWidth,
    COALESCE(es.screen_height, fv.screen_height) AS screenHeight,
    0 AS durationMs,
    fv.perf_ttfb_ms AS perfTtfbMs,
    fv.perf_fcp_ms AS perfFcpMs,
    fv.perf_lcp_ms AS perfLcpMs,
    fv.perf_cls AS perfCls,
    fv.perf_inp_ms AS perfInpMs
  FROM event_source es
  INNER JOIN filtered_visits fv
    ON fv.visit_id = es.visit_id
)
SELECT *
FROM (
  SELECT * FROM page_events
  UNION ALL
  SELECT * FROM custom_event_rows
)
ORDER BY occurredAt DESC, id DESC
LIMIT ?
`;
  return (
    await queryD1All<Record<string, unknown>>(env, sql, [
      ...visitSourceBindings(siteId, window),
      ...eventSourceBindings(siteId, window),
      target.value,
      ...filter.bindings,
      limit,
    ])
  ).map(mapJourneyEventRow);
}

export function summarizeVisitedPages(
  events: JourneyEventRow[],
): JourneyPageCountRow[] {
  const pages = new Map<string, number>();
  for (const event of events) {
    if (event.kind !== "pageview") continue;
    const pathname = event.pathname.trim() || "/";
    pages.set(pathname, (pages.get(pathname) ?? 0) + 1);
  }
  return Array.from(pages.entries())
    .map(([pathname, views]) => ({ pathname, views }))
    .sort(
      (left, right) =>
        right.views - left.views || left.pathname.localeCompare(right.pathname),
    )
    .slice(0, 50);
}

export function summarizeEventDistribution(
  events: JourneyEventRow[],
): JourneyEventCountRow[] {
  const counts = new Map<string, number>();
  for (const event of events) {
    const label = event.eventType.trim() || event.kind;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([eventType, count]) => ({ eventType, count }))
    .sort(
      (left, right) =>
        right.count - left.count ||
        left.eventType.localeCompare(right.eventType),
    )
    .slice(0, 50);
}

export function emptyJourneyPerformanceSummary(): JourneyPerformanceSummaryRow {
  return Object.fromEntries(
    PERFORMANCE_METRIC_KEYS.map((metric) => [
      metric,
      { avg: null, p75: null, min: null, max: null, samples: 0 },
    ]),
  ) as JourneyPerformanceSummaryRow;
}

export function summarizeJourneyPerformance(
  events: JourneyEventRow[],
): JourneyPerformanceSummaryRow {
  const valuesByMetric = new Map<PerformanceMetricKey, number[]>(
    PERFORMANCE_METRIC_KEYS.map((metric) => [metric, []]),
  );
  const seenVisits = new Set<string>();

  for (const event of events) {
    if (event.kind !== "pageview") continue;
    const visitId = event.visitId.trim();
    if (visitId && seenVisits.has(visitId)) continue;
    if (visitId) seenVisits.add(visitId);

    for (const metric of PERFORMANCE_METRIC_KEYS) {
      const value = event.performance[metric];
      if (value == null || !Number.isFinite(value)) continue;
      valuesByMetric.get(metric)?.push(value);
    }
  }

  const summary = emptyJourneyPerformanceSummary();
  for (const metric of PERFORMANCE_METRIC_KEYS) {
    const values = valuesByMetric.get(metric) ?? [];
    if (values.length === 0) continue;
    const total = values.reduce((sum, value) => sum + value, 0);
    summary[metric] = {
      avg: roundPerformanceValue(total / values.length),
      p75: roundPerformanceValue(percentile(values, 75)),
      min: roundPerformanceValue(Math.min(...values)),
      max: roundPerformanceValue(Math.max(...values)),
      samples: values.length,
    };
  }
  return summary;
}

export function reportingDateKey(
  timestampMs: number,
  timeZone: string,
): string {
  const parts = zonedParts(timestampMs, timeZone);
  const month = String(parts.month).padStart(2, "0");
  const day = String(parts.day).padStart(2, "0");
  return `${parts.year}-${month}-${day}`;
}

export function summarizeActivity(
  events: JourneyEventRow[],
  timeZone: string,
): VisitorActivityRow[] {
  const counts = new Map<string, number>();
  for (const event of events) {
    if (!Number.isFinite(event.occurredAt) || event.occurredAt <= 0) continue;
    const date = reportingDateKey(event.occurredAt, timeZone);
    counts.set(date, (counts.get(date) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((left, right) => left.date.localeCompare(right.date));
}

export function percentile(values: number[], percentileValue: number): number {
  const filtered = values
    .filter((value) => Number.isFinite(value) && value >= 0)
    .sort((left, right) => left - right);
  if (filtered.length === 0) return 0;
  const index = Math.min(
    filtered.length - 1,
    Math.max(0, Math.ceil((percentileValue / 100) * filtered.length) - 1),
  );
  return filtered[index] ?? 0;
}

export function averageGapMs(values: number[]): number {
  const sorted = values
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((left, right) => left - right);
  if (sorted.length < 2) return 0;
  let total = 0;
  for (let index = 1; index < sorted.length; index += 1) {
    total += sorted[index] - sorted[index - 1];
  }
  return Math.round(total / (sorted.length - 1));
}

export type DetailTarget = { type: "visitor" | "session"; value: string };

export function detailTargetColumn(
  target: DetailTarget,
): "visitor_id" | "session_id" {
  return target.type === "visitor" ? "visitor_id" : "session_id";
}

export function mapVisitorRow(row: Record<string, unknown>): VisitorRow {
  return {
    visitorId: String(row.visitorId ?? ""),
    sessionId: String(row.sessionId ?? ""),
    firstSeenAt: Number(row.firstSeenAt ?? 0),
    lastSeenAt: Number(row.lastSeenAt ?? 0),
    views: Number(row.views ?? 0),
    sessions: Number(row.sessions ?? 0),
    events: Number(row.events ?? 0),
    country: String(row.country ?? ""),
    region: String(row.region ?? ""),
    regionCode: String(row.regionCode ?? ""),
    city: String(row.city ?? ""),
    referrerHost: String(row.referrerHost ?? ""),
    referrerUrl: String(row.referrerUrl ?? ""),
    browser: String(row.browser ?? ""),
    browserVersion: String(row.browserVersion ?? ""),
    os: String(row.os ?? ""),
    osVersion: String(row.osVersion ?? ""),
    deviceType: String(row.deviceType ?? ""),
    screenWidth:
      row.screenWidth === null ? null : Number(row.screenWidth ?? 0) || null,
    screenHeight:
      row.screenHeight === null ? null : Number(row.screenHeight ?? 0) || null,
  };
}

export async function queryVisitorForDetailFromD1(
  env: Env,
  siteId: string,
  visitorId: string,
): Promise<VisitorRow | null> {
  const sql = `
WITH
${buildTargetVisitSourceCte("visitor_id")},
filtered_visits AS (
  SELECT *
  FROM visit_source
),
${buildDetailCustomEventSourceCte()}
SELECT
  fv.visitor_id AS visitorId,
  COALESCE((
    SELECT latest.session_id
    FROM filtered_visits latest
    WHERE latest.visitor_id = fv.visitor_id
    ORDER BY latest.started_at DESC, latest.visit_id DESC
    LIMIT 1
  ), '') AS sessionId,
  MIN(fv.started_at) AS firstSeenAt,
  MAX(fv.started_at) AS lastSeenAt,
  count(*) AS views,
  count(DISTINCT CASE WHEN fv.session_id != '' THEN fv.session_id ELSE NULL END) AS sessions,
  (
    SELECT count(*)
    FROM event_source es
    WHERE es.visitor_id = fv.visitor_id
  ) AS events,
  COALESCE((
    SELECT latest.country
    FROM filtered_visits latest
    WHERE latest.visitor_id = fv.visitor_id
    ORDER BY latest.started_at DESC, latest.visit_id DESC
    LIMIT 1
  ), '') AS country,
  COALESCE((
    SELECT latest.region
    FROM filtered_visits latest
    WHERE latest.visitor_id = fv.visitor_id
    ORDER BY latest.started_at DESC, latest.visit_id DESC
    LIMIT 1
  ), '') AS region,
  COALESCE((
    SELECT latest.region_code
    FROM filtered_visits latest
    WHERE latest.visitor_id = fv.visitor_id
    ORDER BY latest.started_at DESC, latest.visit_id DESC
    LIMIT 1
  ), '') AS regionCode,
  COALESCE((
    SELECT latest.city
    FROM filtered_visits latest
    WHERE latest.visitor_id = fv.visitor_id
    ORDER BY latest.started_at DESC, latest.visit_id DESC
    LIMIT 1
  ), '') AS city,
  COALESCE((
    SELECT first.referrer_host
    FROM filtered_visits first
    WHERE first.visitor_id = fv.visitor_id
    ORDER BY first.started_at ASC, first.visit_id ASC
    LIMIT 1
  ), '') AS referrerHost,
  COALESCE((
    SELECT first.referrer_url
    FROM filtered_visits first
    WHERE first.visitor_id = fv.visitor_id
    ORDER BY first.started_at ASC, first.visit_id ASC
    LIMIT 1
  ), '') AS referrerUrl,
  COALESCE((
    SELECT latest.browser
    FROM filtered_visits latest
    WHERE latest.visitor_id = fv.visitor_id
    ORDER BY latest.started_at DESC, latest.visit_id DESC
    LIMIT 1
  ), '') AS browser,
  COALESCE((
    SELECT latest.browser_version
    FROM filtered_visits latest
    WHERE latest.visitor_id = fv.visitor_id
    ORDER BY latest.started_at DESC, latest.visit_id DESC
    LIMIT 1
  ), '') AS browserVersion,
  COALESCE((
    SELECT latest.os
    FROM filtered_visits latest
    WHERE latest.visitor_id = fv.visitor_id
    ORDER BY latest.started_at DESC, latest.visit_id DESC
    LIMIT 1
  ), '') AS os,
  COALESCE((
    SELECT latest.os_version
    FROM filtered_visits latest
    WHERE latest.visitor_id = fv.visitor_id
    ORDER BY latest.started_at DESC, latest.visit_id DESC
    LIMIT 1
  ), '') AS osVersion,
  COALESCE((
    SELECT latest.device_type
    FROM filtered_visits latest
    WHERE latest.visitor_id = fv.visitor_id
    ORDER BY latest.started_at DESC, latest.visit_id DESC
    LIMIT 1
  ), '') AS deviceType,
  (
    SELECT latest.screen_width
    FROM filtered_visits latest
    WHERE latest.visitor_id = fv.visitor_id
    ORDER BY latest.started_at DESC, latest.visit_id DESC
    LIMIT 1
  ) AS screenWidth,
  (
    SELECT latest.screen_height
    FROM filtered_visits latest
    WHERE latest.visitor_id = fv.visitor_id
    ORDER BY latest.started_at DESC, latest.visit_id DESC
    LIMIT 1
  ) AS screenHeight
FROM filtered_visits fv
WHERE fv.visitor_id != ''
GROUP BY fv.visitor_id
LIMIT 1
`;
  const rows = await queryD1All<Record<string, unknown>>(env, sql, [
    ...targetVisitSourceBindings(siteId, visitorId),
    ...detailCustomEventSourceBindings(siteId),
  ]);
  return rows[0] ? mapVisitorRow(rows[0]) : null;
}

export async function querySessionsForDetailFromD1(
  env: Env,
  siteId: string,
  target: DetailTarget,
): Promise<SessionRow[]> {
  const sql = `
WITH
${buildTargetVisitSourceCte(detailTargetColumn(target))},
filtered_visits AS (
  SELECT *
  FROM visit_source
),
${buildDetailCustomEventSourceCte()}
SELECT
  fv.session_id AS sessionId,
  COALESCE((
    SELECT edge.visitor_id
    FROM filtered_visits edge
    WHERE edge.session_id = fv.session_id
    ORDER BY edge.started_at ASC, edge.visit_id ASC
    LIMIT 1
  ), '') AS visitorId,
  MIN(fv.started_at) AS startedAt,
  MAX(COALESCE(fv.ended_at, fv.last_activity_at, fv.started_at)) AS endedAt,
  SUM(COALESCE(fv.duration_ms, 0)) AS totalDurationMs,
  MAX(CASE WHEN LOWER(COALESCE(fv.status, '')) = 'open' THEN 1 ELSE 0 END) AS active,
  count(*) AS views,
  (
    SELECT count(*)
    FROM event_source es
    WHERE es.session_id = fv.session_id
  ) AS events,
  CASE WHEN count(*) <= 1 THEN 1 ELSE 0 END AS bounce,
  COALESCE((
    SELECT edge.pathname
    FROM filtered_visits edge
    WHERE edge.session_id = fv.session_id
    ORDER BY edge.started_at ASC, edge.visit_id ASC
    LIMIT 1
  ), '') AS entryPath,
  COALESCE((
    SELECT edge.pathname
    FROM filtered_visits edge
    WHERE edge.session_id = fv.session_id
    ORDER BY edge.started_at DESC, edge.visit_id DESC
    LIMIT 1
  ), '') AS exitPath,
  COALESCE((
    SELECT edge.referrer_host
    FROM filtered_visits edge
    WHERE edge.session_id = fv.session_id
    ORDER BY edge.started_at ASC, edge.visit_id ASC
    LIMIT 1
  ), '') AS referrerHost,
  COALESCE((
    SELECT edge.referrer_url
    FROM filtered_visits edge
    WHERE edge.session_id = fv.session_id
    ORDER BY edge.started_at ASC, edge.visit_id ASC
    LIMIT 1
  ), '') AS referrerUrl,
  COALESCE((
    SELECT edge.country
    FROM filtered_visits edge
    WHERE edge.session_id = fv.session_id
    ORDER BY edge.started_at ASC, edge.visit_id ASC
    LIMIT 1
  ), '') AS country,
  COALESCE((
    SELECT edge.region
    FROM filtered_visits edge
    WHERE edge.session_id = fv.session_id
    ORDER BY edge.started_at ASC, edge.visit_id ASC
    LIMIT 1
  ), '') AS region,
  COALESCE((
    SELECT edge.region_code
    FROM filtered_visits edge
    WHERE edge.session_id = fv.session_id
    ORDER BY edge.started_at ASC, edge.visit_id ASC
    LIMIT 1
  ), '') AS regionCode,
  COALESCE((
    SELECT edge.city
    FROM filtered_visits edge
    WHERE edge.session_id = fv.session_id
    ORDER BY edge.started_at ASC, edge.visit_id ASC
    LIMIT 1
  ), '') AS city,
  (
    SELECT edge.latitude
    FROM filtered_visits edge
    WHERE edge.session_id = fv.session_id
      AND edge.latitude IS NOT NULL
      AND edge.longitude IS NOT NULL
      AND ABS(edge.latitude) <= 90
      AND ABS(edge.longitude) <= 180
    ORDER BY edge.started_at ASC, edge.visit_id ASC
    LIMIT 1
  ) AS latitude,
  (
    SELECT edge.longitude
    FROM filtered_visits edge
    WHERE edge.session_id = fv.session_id
      AND edge.latitude IS NOT NULL
      AND edge.longitude IS NOT NULL
      AND ABS(edge.latitude) <= 90
      AND ABS(edge.longitude) <= 180
    ORDER BY edge.started_at ASC, edge.visit_id ASC
    LIMIT 1
  ) AS longitude,
  COALESCE((
    SELECT edge.browser
    FROM filtered_visits edge
    WHERE edge.session_id = fv.session_id
    ORDER BY edge.started_at ASC, edge.visit_id ASC
    LIMIT 1
  ), '') AS browser,
  COALESCE((
    SELECT edge.browser_version
    FROM filtered_visits edge
    WHERE edge.session_id = fv.session_id
    ORDER BY edge.started_at ASC, edge.visit_id ASC
    LIMIT 1
  ), '') AS browserVersion,
  COALESCE((
    SELECT edge.os
    FROM filtered_visits edge
    WHERE edge.session_id = fv.session_id
    ORDER BY edge.started_at ASC, edge.visit_id ASC
    LIMIT 1
  ), '') AS os,
  COALESCE((
    SELECT edge.os_version
    FROM filtered_visits edge
    WHERE edge.session_id = fv.session_id
    ORDER BY edge.started_at ASC, edge.visit_id ASC
    LIMIT 1
  ), '') AS osVersion,
  COALESCE((
    SELECT edge.device_type
    FROM filtered_visits edge
    WHERE edge.session_id = fv.session_id
    ORDER BY edge.started_at ASC, edge.visit_id ASC
    LIMIT 1
  ), '') AS deviceType,
  (
    SELECT edge.screen_width
    FROM filtered_visits edge
    WHERE edge.session_id = fv.session_id
    ORDER BY edge.started_at ASC, edge.visit_id ASC
    LIMIT 1
  ) AS screenWidth,
  (
    SELECT edge.screen_height
    FROM filtered_visits edge
    WHERE edge.session_id = fv.session_id
    ORDER BY edge.started_at ASC, edge.visit_id ASC
    LIMIT 1
  ) AS screenHeight
FROM filtered_visits fv
WHERE fv.session_id != ''
GROUP BY fv.session_id
ORDER BY startedAt DESC, sessionId ASC
`;
  return (
    await queryD1All<Record<string, unknown>>(env, sql, [
      ...targetVisitSourceBindings(siteId, target.value),
      ...detailCustomEventSourceBindings(siteId),
    ])
  ).map(mapSessionRow);
}

export async function queryJourneyEventsForDetailFromD1(
  env: Env,
  siteId: string,
  target: DetailTarget,
): Promise<JourneyEventRow[]> {
  const sql = `
WITH
${buildTargetVisitSourceCte(detailTargetColumn(target))},
filtered_visits AS (
  SELECT *
  FROM visit_source
),
${buildDetailCustomEventSourceCte()},
page_events AS (
  SELECT
    visit_id AS id,
    'pageview' AS kind,
    'pageview' AS eventType,
    started_at AS occurredAt,
    visit_id AS visitId,
    session_id AS sessionId,
    visitor_id AS visitorId,
    pathname,
    hash_fragment AS hash,
    title,
    hostname,
    referrer_host AS referrerHost,
    referrer_url AS referrerUrl,
    country,
    region,
    city,
    browser,
    browser_version AS browserVersion,
    os,
    os_version AS osVersion,
    device_type AS deviceType,
    screen_width AS screenWidth,
    screen_height AS screenHeight,
    COALESCE(duration_ms, 0) AS durationMs,
    perf_ttfb_ms AS perfTtfbMs,
    perf_fcp_ms AS perfFcpMs,
    perf_lcp_ms AS perfLcpMs,
    perf_cls AS perfCls,
    perf_inp_ms AS perfInpMs
  FROM filtered_visits
),
custom_event_rows AS (
  SELECT
    event_id AS id,
    'custom' AS kind,
    event_name AS eventType,
    occurred_at AS occurredAt,
    visit_id AS visitId,
    session_id AS sessionId,
    visitor_id AS visitorId,
    pathname,
    hash_fragment AS hash,
    title,
    hostname,
    referrer_host AS referrerHost,
    referrer_url AS referrerUrl,
    country,
    region,
    city,
    browser,
    browser_version AS browserVersion,
    os,
    os_version AS osVersion,
    device_type AS deviceType,
    screen_width AS screenWidth,
    screen_height AS screenHeight,
    0 AS durationMs,
    perf_ttfb_ms AS perfTtfbMs,
    perf_fcp_ms AS perfFcpMs,
    perf_lcp_ms AS perfLcpMs,
    perf_cls AS perfCls,
    perf_inp_ms AS perfInpMs
  FROM event_source
)
SELECT *
FROM (
  SELECT * FROM page_events
  UNION ALL
  SELECT * FROM custom_event_rows
)
ORDER BY occurredAt DESC, id DESC
`;
  return (
    await queryD1All<Record<string, unknown>>(env, sql, [
      ...targetVisitSourceBindings(siteId, target.value),
      ...detailCustomEventSourceBindings(siteId),
    ])
  ).map(mapJourneyEventRow);
}

export async function queryVisitorDetailFromD1(
  env: Env,
  siteId: string,
  visitorId: string,
  timeZone: string,
) {
  const [visitor, sessions, baseEvents] = await Promise.all([
    queryVisitorForDetailFromD1(env, siteId, visitorId),
    querySessionsForDetailFromD1(env, siteId, {
      type: "visitor",
      value: visitorId,
    }),
    queryJourneyEventsForDetailFromD1(env, siteId, {
      type: "visitor",
      value: visitorId,
    }),
  ]);
  if (!visitor) return null;

  const events = [...sessions.map(sessionStartEvent), ...baseEvents].sort(
    (left, right) =>
      right.occurredAt - left.occurredAt || right.id.localeCompare(left.id),
  );
  const customEventCount = baseEvents.filter(
    (event) => event.kind === "custom",
  ).length;
  const sessionCount = sessions.length;
  const views = baseEvents.filter((event) => event.kind === "pageview").length;
  const bounces = sessions.filter((session) => session.bounce).length;
  const durationValues = sessions.map((session) => session.durationMs);
  const durationTotal = durationValues.reduce((sum, value) => sum + value, 0);
  const daysActive = new Set(
    events
      .filter((event) => event.occurredAt > 0)
      .map((event) => reportingDateKey(event.occurredAt, timeZone)),
  ).size;

  return {
    visitor,
    metrics: {
      totalEvents: customEventCount,
      sessions: sessionCount,
      views,
      avgEventsPerSession:
        sessionCount > 0 ? customEventCount / sessionCount : 0,
      bounceRate: sessionCount > 0 ? bounces / sessionCount : 0,
      avgDurationMs:
        sessionCount > 0 ? Math.round(durationTotal / sessionCount) : 0,
      p90DurationMs: percentile(durationValues, 90),
      firstSeenAt: visitor.firstSeenAt,
      lastSeenAt: visitor.lastSeenAt,
      daysActive,
      conversionEvents: customEventCount,
      avgTimeBetweenSessionsMs: averageGapMs(
        sessions.map((session) => session.startedAt),
      ),
    },
    sessions,
    events,
    visitedPages: summarizeVisitedPages(events),
    eventDistribution: summarizeEventDistribution(events),
    activity: summarizeActivity(events, timeZone),
    performance: summarizeJourneyPerformance(events),
  };
}

export async function querySessionDetailFromD1(
  env: Env,
  siteId: string,
  sessionId: string,
) {
  const [sessions, baseEvents, locationPoints] = await Promise.all([
    querySessionsForDetailFromD1(env, siteId, {
      type: "session",
      value: sessionId,
    }),
    queryJourneyEventsForDetailFromD1(env, siteId, {
      type: "session",
      value: sessionId,
    }),
    querySessionLocationPointsFromD1(env, siteId, sessionId),
  ]);
  const session = sessions.find((item) => item.sessionId === sessionId);
  if (!session) return null;

  const events = [
    sessionStartEvent(session),
    ...baseEvents,
    sessionLeaveEvent(session, baseEvents),
  ]
    .filter((event): event is JourneyEventRow => event !== null)
    .sort(
      (left, right) =>
        right.occurredAt - left.occurredAt || right.id.localeCompare(left.id),
    );

  return {
    session,
    locationPoints,
    events,
    visitedPages: summarizeVisitedPages(events),
    eventDistribution: summarizeEventDistribution(events),
    performance: summarizeJourneyPerformance(events),
  };
}

export async function querySessionLocationPointsFromD1(
  env: Env,
  siteId: string,
  sessionId: string,
): Promise<GeoPointRow[]> {
  const sql = `
WITH
${buildTargetVisitSourceCte("session_id")},
filtered_visits AS (
  SELECT *
  FROM visit_source
)
SELECT
  latitude,
  longitude,
  started_at AS timestampMs,
  country,
  region,
  region_code AS regionCode,
  city
FROM filtered_visits
WHERE
  latitude IS NOT NULL
  AND longitude IS NOT NULL
  AND ABS(latitude) <= 90
  AND ABS(longitude) <= 180
ORDER BY timestampMs ASC, visit_id ASC
`;
  return (
    await queryD1All<Record<string, unknown>>(env, sql, [
      ...targetVisitSourceBindings(siteId, sessionId),
    ])
  ).map(mapGeoPointRow);
}

export async function queryGeoPointsFromD1(
  env: Env,
  siteId: string,
  window: QueryWindow,
  filters: DashboardFilters,
  limit: number,
): Promise<GeoPointAggregate> {
  const filter = buildVisitFilterSql(filters);
  const parsedGeo = parseGeoFilterValue(filters.geo);
  const pointsSql = `
WITH
${buildVisitSourceCte()},
filtered_visits AS (
  SELECT *
  FROM visit_source
  ${filter.clause}
)
SELECT
  latitude,
  longitude,
  started_at AS timestampMs,
  country,
  region,
  region_code AS regionCode,
  city
FROM filtered_visits
WHERE
  latitude IS NOT NULL
  AND longitude IS NOT NULL
  AND ABS(latitude) <= 90
  AND ABS(longitude) <= 180
ORDER BY timestampMs DESC
LIMIT ?
`;
  const points = (
    await queryD1All<Record<string, unknown>>(env, pointsSql, [
      ...visitSourceBindings(siteId, window),
      ...filter.bindings,
      limit,
    ])
  ).map(mapGeoPointRow);

  const countryCounts: GeoCountryCountRow[] = [];
  const regionCounts: GeoDimensionCountRow[] = [];
  const cityCounts: GeoDimensionCountRow[] = [];

  if (!parsedGeo?.country) {
    const countrySql = `
WITH
${buildVisitSourceCte()},
filtered_visits AS (
  SELECT
    country,
    session_id AS sessionId,
    visitor_id AS visitorId
  FROM visit_source
  ${filter.clause}
)
SELECT
  country,
  count(*) AS views,
  count(DISTINCT CASE WHEN sessionId != '' THEN sessionId ELSE NULL END) AS sessions,
  count(DISTINCT CASE WHEN visitorId != '' THEN visitorId ELSE NULL END) AS visitors
FROM filtered_visits
GROUP BY country
ORDER BY views DESC, sessions DESC, country ASC
LIMIT 300
`;
    countryCounts.push(
      ...(
        await queryD1All<Record<string, unknown>>(env, countrySql, [
          ...visitSourceBindings(siteId, window),
          ...filter.bindings,
        ])
      ).map((row) => ({
        country: String(row.country ?? ""),
        views: Number(row.views ?? 0),
        sessions: Number(row.sessions ?? 0),
        visitors: Number(row.visitors ?? 0),
      })),
    );
  } else if (!parsedGeo.regionCode && !parsedGeo.regionName) {
    const regionSql = `
WITH
${buildVisitSourceCte()},
filtered_visits AS (
  SELECT
    country,
    region,
    region_code AS regionCode,
    session_id AS sessionId,
    visitor_id AS visitorId
  FROM visit_source
  ${filter.clause}
)
SELECT
  country,
  regionCode,
  region,
  count(*) AS views,
  count(DISTINCT CASE WHEN sessionId != '' THEN sessionId ELSE NULL END) AS sessions,
  count(DISTINCT CASE WHEN visitorId != '' THEN visitorId ELSE NULL END) AS visitors
FROM filtered_visits
WHERE
  TRIM(COALESCE(country, '')) != ''
  AND (
    TRIM(COALESCE(regionCode, '')) != ''
    OR TRIM(COALESCE(region, '')) != ''
  )
GROUP BY country, regionCode, region
ORDER BY views DESC, sessions DESC, region ASC, regionCode ASC
LIMIT 400
`;
    regionCounts.push(
      ...(
        await queryD1All<Record<string, unknown>>(env, regionSql, [
          ...visitSourceBindings(siteId, window),
          ...filter.bindings,
        ])
      )
        .map((row) => {
          const country = String(row.country ?? "")
            .trim()
            .toUpperCase();
          const regionCode = String(row.regionCode ?? "")
            .trim()
            .toUpperCase();
          const regionName = String(row.region ?? "").trim() || regionCode;
          const value = buildRegionLocationValue(
            country,
            regionCode || regionName,
            regionName || regionCode,
          );
          if (!value) return null;
          return {
            value,
            label: regionName || regionCode,
            views: Number(row.views ?? 0),
            sessions: Number(row.sessions ?? 0),
            visitors: Number(row.visitors ?? 0),
          };
        })
        .filter((row): row is GeoDimensionCountRow => Boolean(row)),
    );
  } else {
    const citySql = `
WITH
${buildVisitSourceCte()},
filtered_visits AS (
  SELECT
    country,
    region,
    region_code AS regionCode,
    city,
    session_id AS sessionId,
    visitor_id AS visitorId
  FROM visit_source
  ${filter.clause}
)
SELECT
  country,
  regionCode,
  region,
  city,
  count(*) AS views,
  count(DISTINCT CASE WHEN sessionId != '' THEN sessionId ELSE NULL END) AS sessions,
  count(DISTINCT CASE WHEN visitorId != '' THEN visitorId ELSE NULL END) AS visitors
FROM filtered_visits
WHERE
  TRIM(COALESCE(country, '')) != ''
  AND TRIM(COALESCE(city, '')) != ''
GROUP BY country, regionCode, region, city
ORDER BY views DESC, sessions DESC, city ASC
LIMIT 600
`;
    cityCounts.push(
      ...(
        await queryD1All<Record<string, unknown>>(env, citySql, [
          ...visitSourceBindings(siteId, window),
          ...filter.bindings,
        ])
      )
        .map((row) => {
          const country = String(row.country ?? "")
            .trim()
            .toUpperCase();
          const regionCode = String(row.regionCode ?? "")
            .trim()
            .toUpperCase();
          const regionName = String(row.region ?? "").trim() || regionCode;
          const city = String(row.city ?? "").trim();
          const value = buildLocalityLocationValue(
            country,
            regionCode || null,
            regionName || null,
            city,
          );
          if (!value || !city) return null;
          return {
            value,
            label: city,
            views: Number(row.views ?? 0),
            sessions: Number(row.sessions ?? 0),
            visitors: Number(row.visitors ?? 0),
          };
        })
        .filter((row): row is GeoDimensionCountRow => Boolean(row)),
    );
  }

  return {
    points,
    countryCounts,
    regionCounts,
    cityCounts,
  };
}
