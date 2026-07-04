import type { Env } from "@/lib/edge/types";

import type {
  DashboardFilters,
  DimensionRow,
  EventAnalyticsContextCards,
  GeoTabRow,
  QueryWindow,
} from "./core";
import {
  buildEventFilteredSourceCte,
  cityValueExpr,
  clientDimensionDefinition,
  queryD1All,
  regionValueExpr,
} from "./core";

export async function queryEventDimensionRowsFromFilteredEvents(
  env: Env,
  baseCte: string,
  bindings: Array<string | number>,
  expr: string,
  limit: number,
  options?: {
    includeEmpty?: boolean;
  },
): Promise<DimensionRow[]> {
  const havingClause = options?.includeEmpty
    ? ""
    : "HAVING TRIM(COALESCE(value, '')) != ''";
  const sql = `${baseCte}
SELECT
  ${expr} AS value,
  count(*) AS views,
  count(DISTINCT CASE WHEN session_id != '' THEN session_id ELSE NULL END) AS sessions,
  count(DISTINCT CASE WHEN visitor_id != '' THEN visitor_id ELSE NULL END) AS visitors
FROM filtered_events
GROUP BY value
${havingClause}
ORDER BY views DESC, sessions DESC, visitors DESC, value ASC
LIMIT ?
`;
  return queryD1All<DimensionRow>(env, sql, [...bindings, limit]);
}

export async function queryEventGeoRowsFromFilteredEvents(
  env: Env,
  baseCte: string,
  bindings: Array<string | number>,
  valueExpr: string,
  labelExpr: string,
  limit: number,
): Promise<GeoTabRow[]> {
  const sql = `${baseCte}
SELECT
  ${valueExpr} AS value,
  ${labelExpr} AS label,
  count(*) AS views,
  count(DISTINCT CASE WHEN session_id != '' THEN session_id ELSE NULL END) AS sessions,
  count(DISTINCT CASE WHEN visitor_id != '' THEN visitor_id ELSE NULL END) AS visitors
FROM filtered_events
GROUP BY value, label
HAVING TRIM(COALESCE(value, '')) != ''
ORDER BY views DESC, sessions DESC, visitors DESC, label ASC
LIMIT ?
`;
  return queryD1All<GeoTabRow>(env, sql, [...bindings, limit]);
}

export async function queryEventSessionBoundaryRowsFromFilteredEvents(
  env: Env,
  baseCte: string,
  bindings: Array<string | number>,
  kind: "entry" | "exit",
  limit: number,
): Promise<DimensionRow[]> {
  const direction = kind === "entry" ? "ASC" : "DESC";
  const sql = `${baseCte},
event_with_session_edge AS (
  SELECT
    COALESCE((
      SELECT edge.pathname
      FROM visit_source edge
      WHERE edge.session_id = filtered_events.session_id
        AND TRIM(COALESCE(edge.pathname, '')) != ''
      ORDER BY edge.started_at ${direction}, edge.visit_id ${direction}
      LIMIT 1
    ), '') AS value,
    session_id,
    visitor_id
  FROM filtered_events
  WHERE TRIM(COALESCE(session_id, '')) != ''
)
SELECT
  value,
  count(*) AS views,
  count(DISTINCT CASE WHEN session_id != '' THEN session_id ELSE NULL END) AS sessions,
  count(DISTINCT CASE WHEN visitor_id != '' THEN visitor_id ELSE NULL END) AS visitors
FROM event_with_session_edge
GROUP BY value
HAVING TRIM(COALESCE(value, '')) != ''
ORDER BY views DESC, sessions DESC, visitors DESC, value ASC
LIMIT ?
`;
  return queryD1All<DimensionRow>(env, sql, [...bindings, limit]);
}

export async function queryEventAnalyticsContextCardsFromD1(
  env: Env,
  siteId: string,
  window: QueryWindow,
  filters: DashboardFilters,
  limit: number,
  eventName?: string,
): Promise<EventAnalyticsContextCards> {
  const source = buildEventFilteredSourceCte(
    siteId,
    window,
    filters,
    eventName,
  );
  const dimension = (expr: string) =>
    queryEventDimensionRowsFromFilteredEvents(
      env,
      source.cte,
      source.bindings,
      expr,
      limit,
    );
  const geo = (valueExpr: string, labelExpr = valueExpr) =>
    queryEventGeoRowsFromFilteredEvents(
      env,
      source.cte,
      source.bindings,
      valueExpr,
      labelExpr,
      limit,
    );

  const [
    path,
    query,
    title,
    hostname,
    entry,
    exit,
    sourceDomain,
    sourceLink,
    browser,
    osVersion,
    deviceType,
    language,
    screenSize,
    country,
    region,
    city,
    continent,
    timezone,
    organization,
  ] = await Promise.all([
    dimension("pathname"),
    dimension("query_string"),
    dimension("title"),
    dimension("hostname"),
    queryEventSessionBoundaryRowsFromFilteredEvents(
      env,
      source.cte,
      source.bindings,
      "entry",
      limit,
    ),
    queryEventSessionBoundaryRowsFromFilteredEvents(
      env,
      source.cte,
      source.bindings,
      "exit",
      limit,
    ),
    queryEventDimensionRowsFromFilteredEvents(
      env,
      source.cte,
      source.bindings,
      "referrer_host",
      limit,
      { includeEmpty: true },
    ),
    queryEventDimensionRowsFromFilteredEvents(
      env,
      source.cte,
      source.bindings,
      "referrer_url",
      limit,
      { includeEmpty: true },
    ),
    dimension(clientDimensionDefinition("browser").labelExpr),
    dimension(clientDimensionDefinition("osVersion").labelExpr),
    dimension(clientDimensionDefinition("deviceType").labelExpr),
    dimension(clientDimensionDefinition("language").labelExpr),
    dimension(clientDimensionDefinition("screenSize").labelExpr),
    geo("country"),
    geo(regionValueExpr()),
    geo(cityValueExpr()),
    geo("continent"),
    geo("timezone"),
    geo("as_organization"),
  ]);

  return {
    page: {
      path,
      query,
      title,
      hostname,
      entry,
      exit,
    },
    source: {
      domain: sourceDomain,
      link: sourceLink,
    },
    client: {
      browser,
      osVersion,
      deviceType,
      language,
      screenSize,
    },
    geo: {
      country,
      region,
      city,
      continent,
      timezone,
      organization,
    },
  };
}
