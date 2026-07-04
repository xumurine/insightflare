import type { Env } from "@/lib/edge/types";

import type {
  DashboardFilters,
  JourneyEventRow,
  ListSort,
  QueryWindow,
  SessionListSortKey,
  SessionRow,
  VisitorListSortKey,
  VisitorRow,
} from "./core";
import {
  browserMajorVersionExpr,
  buildCustomEventSourceCte,
  buildVisitFilterSql,
  buildVisitSourceCte,
  DEFAULT_SESSION_LIST_SORT,
  DEFAULT_VISITOR_LIST_SORT,
  eventSourceBindings,
  queryD1All,
  visitSourceBindings,
} from "./core";
import {
  buildJourneySearchSql,
  mapJourneyEventRow,
  mapSessionRow,
  mapVisitorRow,
  sessionListOrderBy,
  visitorListOrderBy,
  whereClauseWithTarget,
} from "./journey-helpers";

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
  ).map(mapVisitorRow);
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
