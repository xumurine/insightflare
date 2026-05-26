import { readCustomEventDetail } from "@/lib/edge/custom-event-read";
import type { Env } from "@/lib/edge/types";

import type {
  DashboardFilters,
  DimensionRow,
  EventAnalyticsContextCards,
  EventFieldRow,
  EventFieldValueRow,
  EventRecordRow,
  EventRecordSortKey,
  EventSummaryCards,
  EventSummaryRow,
  EventTrendPointRow,
  EventTrendSeriesRow,
  EventTypeTrendPointRow,
  GeoTabRow,
  Interval,
  ListSort,
  QueryWindow,
} from "./core";
import {
  badRequest,
  buildCustomEventSourceCte,
  buildEventAnalyticsSourceCte,
  buildEventFilteredSourceCte,
  buildEventFilterSql,
  buildTimeBuckets,
  buildVisitFilterSql,
  buildVisitSourceCte,
  cityValueExpr,
  clientDimensionDefinition,
  customEventJsonTypeCode,
  eventRecordOrderBy,
  eventSourceBindings,
  jsonResponse,
  mapEventAnalyticsContextCards,
  mapEventField,
  mapEventFieldValue,
  mapEventRecord,
  mapEventSummaryCards,
  mapTabs,
  parseEventFieldPath,
  parseEventFieldValueType,
  parseEventId,
  parseEventName,
  parseEventRecordSort,
  parseFilters,
  parseInterval,
  parseLimit,
  parseListSearch,
  parseQueryLimit,
  parseWindow,
  queryD1All,
  regionValueExpr,
  SHARE_TREND_OTHER_KEY,
  SHARE_TREND_OTHER_LABEL,
  SHARE_TREND_OTHER_TOKEN,
  shareTrendSeriesKey,
  timeBucketCase,
  timeBucketTimestamp,
  visitSourceBindings,
} from "./core";

async function queryCustomEventNamesFromD1(
  env: Env,
  siteId: string,
  window: QueryWindow,
  filters: DashboardFilters,
  limit: number,
): Promise<DimensionRow[]> {
  const filter = buildVisitFilterSql(filters, "vc");
  const sql = `
WITH
${buildVisitSourceCte()},
${buildCustomEventSourceCte()},
event_with_context AS (
  SELECT
    e.event_id,
    e.event_name,
    COALESCE(vs.session_id, '') AS session_id,
    COALESCE(vs.visitor_id, '') AS visitor_id,
    COALESCE(vs.country, '') AS country,
    COALESCE(vs.region, '') AS region,
    COALESCE(vs.region_code, '') AS region_code,
    COALESCE(vs.city, '') AS city,
    COALESCE(vs.pathname, '') AS pathname,
    COALESCE(vs.title, '') AS title,
    COALESCE(vs.hostname, '') AS hostname,
    COALESCE(vs.referrer_host, '') AS referrer_host,
    COALESCE(vs.referrer_url, '') AS referrer_url,
    COALESCE(vs.device_type, '') AS device_type,
    COALESCE(vs.browser, '') AS browser,
    COALESCE(vs.os, '') AS os,
    COALESCE(vs.os_version, '') AS os_version,
    COALESCE(vs.language, '') AS language,
    COALESCE(vs.screen_width, 0) AS screen_width,
    COALESCE(vs.screen_height, 0) AS screen_height
  FROM event_source e
  LEFT JOIN visit_source vs
    ON vs.site_id = e.site_id
   AND vs.visit_id = e.visit_id
),
filtered_events AS (
  SELECT *
  FROM event_with_context vc
  ${filter.clause}
),
event_rollup AS (
  SELECT
    COALESCE(event_name, '') AS value,
    count(*) AS views,
    count(DISTINCT CASE WHEN session_id != '' THEN session_id ELSE NULL END) AS sessions,
    count(DISTINCT CASE WHEN visitor_id != '' THEN visitor_id ELSE NULL END) AS visitors
  FROM filtered_events
  GROUP BY value
)
SELECT value, views, sessions, visitors
FROM event_rollup
WHERE TRIM(value) != ''
ORDER BY views DESC, sessions DESC, value ASC
LIMIT ?
`;
  return (
    await queryD1All<Record<string, unknown>>(env, sql, [
      ...visitSourceBindings(siteId, window),
      ...eventSourceBindings(siteId, window),
      ...filter.bindings,
      limit,
    ])
  ).map((row) => ({
    value: String(row.value ?? ""),
    views: Number(row.views ?? 0),
    sessions: Number(row.sessions ?? 0),
    visitors: Number(row.visitors ?? 0),
  }));
}

export async function queryEventTypeAggregate(
  env: Env,
  siteId: string,
  window: QueryWindow,
  filters: DashboardFilters,
  limit: number,
): Promise<DimensionRow[]> {
  return queryCustomEventNamesFromD1(env, siteId, window, filters, limit);
}

export async function queryEventSummaryMetricsFromD1(
  env: Env,
  siteId: string,
  window: QueryWindow,
  filters: DashboardFilters,
): Promise<EventSummaryRow> {
  const source = buildEventFilteredSourceCte(siteId, window, filters);
  const [summaryRow] = await queryD1All<EventSummaryRow>(
    env,
    `${source.cte}
SELECT
  count(*) AS events,
  count(DISTINCT event_name) AS eventTypes,
  count(DISTINCT CASE WHEN session_id != '' THEN session_id ELSE NULL END) AS sessions,
  count(DISTINCT CASE WHEN visitor_id != '' THEN visitor_id ELSE NULL END) AS visitors
FROM filtered_events
`,
    source.bindings,
  );
  return (
    summaryRow ?? {
      events: 0,
      eventTypes: 0,
      sessions: 0,
      visitors: 0,
    }
  );
}

export async function queryEventsSummaryFromD1(
  env: Env,
  siteId: string,
  window: QueryWindow,
  filters: DashboardFilters,
): Promise<{
  summary: EventSummaryRow;
  cards: EventSummaryCards;
}> {
  const source = buildEventFilteredSourceCte(siteId, window, filters);
  const dimensionSql = (expr: string) => `${source.cte}
SELECT
  ${expr} AS value,
  count(*) AS views,
  count(DISTINCT CASE WHEN session_id != '' THEN session_id ELSE NULL END) AS sessions,
  count(DISTINCT CASE WHEN visitor_id != '' THEN visitor_id ELSE NULL END) AS visitors
FROM filtered_events
GROUP BY value
HAVING TRIM(COALESCE(value, '')) != ''
ORDER BY views DESC, sessions DESC, value ASC
LIMIT ?
`;
  const readDimension = (expr: string) =>
    queryD1All<DimensionRow>(env, dimensionSql(expr), [
      ...source.bindings,
      100,
    ]);

  const [summary, eventNames, path, title, hostname] = await Promise.all([
    queryEventSummaryMetricsFromD1(env, siteId, window, filters),
    readDimension("event_name"),
    readDimension("pathname"),
    readDimension("title"),
    readDimension("hostname"),
  ]);

  return {
    summary,
    cards: {
      event: {
        name: eventNames,
      },
      page: {
        path,
        title,
        hostname,
      },
    },
  };
}

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

export async function queryEventsTrendFromD1(
  env: Env,
  siteId: string,
  window: QueryWindow,
  interval: Interval,
  filters: DashboardFilters,
  limit: number,
  eventName?: string,
) {
  const filter = buildEventFilterSql(filters, "es", { eventName });
  const sourceBindings = [
    ...visitSourceBindings(siteId, window),
    ...eventSourceBindings(siteId, window),
  ];
  const filterBindings = filter.bindings;
  const baseCte = `
WITH
${buildVisitSourceCte()},
${buildEventAnalyticsSourceCte()},
filtered_events AS (
  SELECT *
  FROM event_source es
  ${filter.clause}
)`;
  const seriesRows = await queryD1All<EventTrendSeriesRow>(
    env,
    `${baseCte}
SELECT
  event_name AS eventName,
  count(*) AS events,
  count(DISTINCT CASE WHEN session_id != '' THEN session_id ELSE NULL END) AS sessions,
  count(DISTINCT CASE WHEN visitor_id != '' THEN visitor_id ELSE NULL END) AS visitors
FROM filtered_events
GROUP BY event_name
ORDER BY events DESC, sessions DESC, eventName ASC
LIMIT ?
`,
    [...sourceBindings, ...filterBindings, limit],
  );
  const buckets = buildTimeBuckets(window, interval);
  const bucket = timeBucketCase(buckets, "occurred_at");
  const seriesKeyByName = new Map<string, string>();
  const usedKeys = new Set<string>();
  for (const row of seriesRows) {
    seriesKeyByName.set(
      row.eventName,
      shareTrendSeriesKey(row.eventName, usedKeys, "event"),
    );
  }
  const seriesNames = seriesRows.map((row) => row.eventName);
  const namesClause =
    seriesNames.length > 0
      ? `CASE WHEN event_name IN (${seriesNames.map(() => "?").join(", ")}) THEN event_name ELSE ? END`
      : "?";
  const trendRows = await queryD1All<EventTrendPointRow>(
    env,
    `${baseCte},
bucketed AS (
  SELECT
    ${bucket.sql} AS bucket,
    ${namesClause} AS seriesName,
    count(*) AS events
  FROM filtered_events
  GROUP BY bucket, seriesName
)
SELECT
  bucket,
  seriesName AS seriesKey,
  events
FROM bucketed
WHERE bucket IS NOT NULL
ORDER BY bucket ASC
`,
    [
      ...sourceBindings,
      ...filterBindings,
      ...seriesNames,
      SHARE_TREND_OTHER_TOKEN,
    ],
  );
  const hasOther = trendRows.some(
    (row) => String(row.seriesKey) === SHARE_TREND_OTHER_TOKEN,
  );
  const [otherSeriesRow] = hasOther
    ? await queryD1All<EventTrendSeriesRow>(
        env,
        `${baseCte}
SELECT
  ? AS eventName,
  count(*) AS events,
  count(DISTINCT CASE WHEN session_id != '' THEN session_id ELSE NULL END) AS sessions,
  count(DISTINCT CASE WHEN visitor_id != '' THEN visitor_id ELSE NULL END) AS visitors
FROM filtered_events
${seriesNames.length > 0 ? `WHERE event_name NOT IN (${seriesNames.map(() => "?").join(", ")})` : ""}
`,
        [
          ...sourceBindings,
          ...filterBindings,
          SHARE_TREND_OTHER_LABEL,
          ...seriesNames,
        ],
      )
    : [];
  const series: Array<{
    key: string;
    eventName: string;
    label: string;
    events: number;
    sessions: number;
    visitors: number;
    isOther?: boolean;
  }> = seriesRows.map((row) => ({
    key: seriesKeyByName.get(row.eventName) ?? row.eventName,
    eventName: row.eventName,
    label: row.eventName,
    events: row.events,
    sessions: row.sessions,
    visitors: row.visitors,
  }));
  if (hasOther) {
    series.push({
      key: SHARE_TREND_OTHER_KEY,
      eventName: SHARE_TREND_OTHER_LABEL,
      label: SHARE_TREND_OTHER_LABEL,
      events:
        Number(otherSeriesRow?.events ?? 0) ||
        trendRows
          .filter((row) => String(row.seriesKey) === SHARE_TREND_OTHER_TOKEN)
          .reduce((sum, row) => sum + Number(row.events ?? 0), 0),
      sessions: Number(otherSeriesRow?.sessions ?? 0),
      visitors: Number(otherSeriesRow?.visitors ?? 0),
      isOther: true,
    });
  }
  const data = buckets.map((item) => ({
    bucket: item.index,
    timestampMs: item.timestampMs,
    totalEvents: 0,
    eventsBySeries: {} as Record<string, number>,
  }));
  for (const row of trendRows) {
    const bucketIndex = Number(row.bucket ?? -1);
    const point = data[bucketIndex];
    if (!point) continue;
    const rawSeries = String(row.seriesKey ?? "");
    const key =
      rawSeries === SHARE_TREND_OTHER_TOKEN
        ? SHARE_TREND_OTHER_KEY
        : (seriesKeyByName.get(rawSeries) ?? rawSeries);
    const events = Number(row.events ?? 0);
    point.eventsBySeries[key] = events;
    point.totalEvents += events;
  }
  return { series, data };
}

export async function queryEventTypeTrendFromD1(
  env: Env,
  siteId: string,
  window: QueryWindow,
  interval: Interval,
  filters: DashboardFilters,
  eventName: string,
) {
  const filter = buildEventFilterSql(filters, "es", { eventName });
  const sourceBindings = [
    ...visitSourceBindings(siteId, window),
    ...eventSourceBindings(siteId, window),
  ];
  const buckets = buildTimeBuckets(window, interval);
  const bucket = timeBucketCase(buckets, "occurred_at");
  const rows = await queryD1All<EventTypeTrendPointRow>(
    env,
    `
WITH
${buildVisitSourceCte()},
${buildEventAnalyticsSourceCte()},
filtered_events AS (
  SELECT *
  FROM event_source es
  ${filter.clause}
),
bucketed AS (
  SELECT
    ${bucket.sql} AS bucket,
    count(*) AS events,
    count(DISTINCT CASE WHEN visitor_id != '' THEN visitor_id ELSE NULL END) AS visitors
  FROM filtered_events
  GROUP BY bucket
)
SELECT
  bucket,
  events,
  visitors
FROM bucketed
WHERE bucket IS NOT NULL
ORDER BY bucket ASC
`,
    [...sourceBindings, ...filter.bindings],
  );
  const data = buckets.map((item) => ({
    bucket: item.index,
    timestampMs: item.timestampMs,
    events: 0,
    visitors: 0,
  }));
  for (const row of rows) {
    const bucketIndex = Number(row.bucket ?? -1);
    const point = data[bucketIndex];
    if (!point) continue;
    point.events = Number(row.events ?? 0);
    point.visitors = Number(row.visitors ?? 0);
  }
  return { data };
}

export async function queryEventRecordsFromD1(
  env: Env,
  siteId: string,
  window: QueryWindow,
  filters: DashboardFilters,
  options: {
    limit: number;
    offset: number;
    sort: ListSort<EventRecordSortKey>;
    search?: string;
    eventName?: string;
  },
): Promise<EventRecordRow[]> {
  const filter = buildEventFilterSql(filters, "es", {
    eventName: options.eventName,
    search: options.search,
  });
  const sql = `
WITH
${buildVisitSourceCte()},
${buildEventAnalyticsSourceCte()},
filtered_events AS (
  SELECT *
  FROM event_source es
  ${filter.clause}
)
SELECT
  event_id AS eventId,
  event_name AS eventName,
  occurred_at AS occurredAt,
  received_at AS receivedAt,
  sequence,
  visit_id AS visitId,
  session_id AS sessionId,
  visitor_id AS visitorId,
  pathname,
  title,
  hostname,
  referrer_host AS referrerHost,
  country,
  region,
  browser,
  browser_version AS browserVersion,
  os,
  os_version AS osVersion,
  device_type AS deviceType,
  node_count AS nodeCount,
  value_count AS valueCount
FROM filtered_events
ORDER BY ${eventRecordOrderBy(options.sort)}
LIMIT ?
OFFSET ?
`;
  return queryD1All<EventRecordRow>(env, sql, [
    ...visitSourceBindings(siteId, window),
    ...eventSourceBindings(siteId, window),
    ...filter.bindings,
    options.limit,
    options.offset,
  ]);
}

export async function queryEventTypeOverviewFromD1(
  env: Env,
  siteId: string,
  window: QueryWindow,
  filters: DashboardFilters,
  eventName: string,
) {
  const scopedSummary = await queryEventSummaryMetricsFromD1(
    env,
    siteId,
    window,
    filters,
  );
  const eventFilter = buildEventFilterSql(filters, "es", { eventName });
  const bindings = [
    ...visitSourceBindings(siteId, window),
    ...eventSourceBindings(siteId, window),
    ...eventFilter.bindings,
  ];
  const baseCte = `
WITH
${buildVisitSourceCte()},
${buildEventAnalyticsSourceCte()},
filtered_events AS (
  SELECT *
  FROM event_source es
  ${eventFilter.clause}
)`;
  const [summaryRow] = await queryD1All<EventSummaryRow>(
    env,
    `${baseCte}
SELECT
  count(*) AS events,
  count(DISTINCT event_name) AS eventTypes,
  count(DISTINCT CASE WHEN session_id != '' THEN session_id ELSE NULL END) AS sessions,
  count(DISTINCT CASE WHEN visitor_id != '' THEN visitor_id ELSE NULL END) AS visitors
FROM filtered_events
`,
    bindings,
  );
  const dimensionSql = (expr: string) => `${baseCte}
SELECT
  ${expr} AS value,
  count(*) AS views,
  count(DISTINCT CASE WHEN session_id != '' THEN session_id ELSE NULL END) AS sessions,
  count(DISTINCT CASE WHEN visitor_id != '' THEN visitor_id ELSE NULL END) AS visitors
FROM filtered_events
GROUP BY value
HAVING TRIM(COALESCE(value, '')) != ''
ORDER BY views DESC, sessions DESC, value ASC
LIMIT 8
`;
  const readDimension = (expr: string) =>
    queryD1All<DimensionRow>(env, dimensionSql(expr), bindings);
  const [pages, countries, devices, browsers] = await Promise.all([
    readDimension("pathname"),
    readDimension("country"),
    readDimension("device_type"),
    readDimension("browser"),
  ]);
  const summary = summaryRow ?? {
    events: 0,
    eventTypes: 0,
    sessions: 0,
    visitors: 0,
  };
  return {
    summary: {
      events: Number(summary.events ?? 0),
      eventTypes: Number(summary.eventTypes ?? 0),
      sessions: Number(summary.sessions ?? 0),
      visitors: Number(summary.visitors ?? 0),
      avgEventsPerSession:
        Number(summary.sessions ?? 0) > 0
          ? Number(summary.events ?? 0) / Number(summary.sessions ?? 0)
          : 0,
      shareOfAllEvents:
        Number(scopedSummary.events ?? 0) > 0
          ? Number(summary.events ?? 0) / Number(scopedSummary.events ?? 0)
          : 0,
    },
    breakdowns: {
      pages,
      countries,
      devices,
      browsers,
    },
  };
}

export async function queryEventFieldsFromD1(
  env: Env,
  siteId: string,
  window: QueryWindow,
  filters: DashboardFilters,
  eventName: string,
  limit: number,
): Promise<EventFieldRow[]> {
  const filter = buildEventFilterSql(filters, "es", { eventName });
  const sql = `
WITH
${buildVisitSourceCte()},
${buildEventAnalyticsSourceCte()},
filtered_events AS (
  SELECT *
  FROM event_source es
  ${filter.clause}
),
field_rows AS (
  SELECT
    p.path,
    v.value_type AS valueType,
    v.event_pk,
    v.occurred_at,
    v.string_value AS stringValue,
    v.number_value AS numberValue,
    v.boolean_value AS booleanValue
  FROM custom_event_json_values v
  INNER JOIN custom_event_json_paths p
    ON p.id = v.path_id
  INNER JOIN filtered_events fe
    ON fe.event_pk = v.event_pk
)
SELECT
  path,
  valueType,
  count(DISTINCT event_pk) AS events,
  count(*) AS occurrences,
  MIN(occurred_at) AS firstSeenAt,
  MAX(occurred_at) AS lastSeenAt,
  MIN(stringValue) AS stringValue,
  MIN(numberValue) AS numberValue,
  MIN(booleanValue) AS booleanValue
FROM field_rows
GROUP BY path, valueType
ORDER BY events DESC, occurrences DESC, path ASC
LIMIT ?
`;
  return queryD1All<EventFieldRow>(env, sql, [
    ...visitSourceBindings(siteId, window),
    ...eventSourceBindings(siteId, window),
    ...filter.bindings,
    limit,
  ]);
}

export async function queryEventFieldValuesFromD1(
  env: Env,
  siteId: string,
  window: QueryWindow,
  filters: DashboardFilters,
  eventName: string,
  fieldPath: string,
  fieldValueType: string,
  limit: number,
): Promise<EventFieldValueRow[]> {
  const filter = buildEventFilterSql(filters, "es", { eventName });
  const valueTypeCode = customEventJsonTypeCode(fieldValueType);
  if (valueTypeCode === null) return [];
  const sql = `
WITH
${buildVisitSourceCte()},
${buildEventAnalyticsSourceCte()},
filtered_events AS (
  SELECT *
  FROM event_source es
  ${filter.clause}
),
field_rows AS (
  SELECT
    v.value_type AS valueType,
    v.event_pk,
    v.occurred_at,
    v.string_value AS stringValue,
    v.number_value AS numberValue,
    v.boolean_value AS booleanValue
  FROM custom_event_json_values v
  INNER JOIN custom_event_json_paths p
    ON p.id = v.path_id
  INNER JOIN filtered_events fe
    ON fe.event_pk = v.event_pk
  WHERE p.path = ? AND v.value_type = ?
)
SELECT
  valueType,
  count(DISTINCT event_pk) AS events,
  count(*) AS occurrences,
  MIN(occurred_at) AS firstSeenAt,
  MAX(occurred_at) AS lastSeenAt,
  MIN(stringValue) AS stringValue,
  MIN(numberValue) AS numberValue,
  MIN(booleanValue) AS booleanValue
FROM field_rows
GROUP BY valueType, stringValue, numberValue, booleanValue
ORDER BY occurrences DESC, events DESC, stringValue ASC, numberValue ASC, booleanValue ASC
LIMIT ?
`;
  return queryD1All<EventFieldValueRow>(env, sql, [
    ...visitSourceBindings(siteId, window),
    ...eventSourceBindings(siteId, window),
    ...filter.bindings,
    fieldPath,
    valueTypeCode,
    limit,
  ]);
}

export async function queryEventRecordDetailFromD1(
  env: Env,
  siteId: string,
  eventId: string,
) {
  const rows = await queryD1All<EventRecordRow>(
    env,
    `
WITH
event_source AS (
  SELECT
    ce.event_id,
    ce.site_id,
    ce.visit_id,
    cen.name AS event_name,
    ce.occurred_at,
    ce.received_at,
    ce.sequence,
    ce.node_count,
    ce.value_count,
    v.visitor_id,
    v.session_id,
    v.pathname,
    v.hostname,
    v.title,
    v.referrer_host,
    v.country,
    v.region,
    v.browser,
    v.browser_version,
    v.os,
    v.os_version,
    v.device_type
  FROM custom_events ce
  INNER JOIN custom_event_names cen
    ON cen.id = ce.event_name_id
  INNER JOIN visits v
    ON v.site_id = ce.site_id
   AND v.visit_id = ce.visit_id
  WHERE ce.site_id = ? AND ce.event_id = ?
)
SELECT
  event_id AS eventId,
  event_name AS eventName,
  occurred_at AS occurredAt,
  received_at AS receivedAt,
  sequence,
  visit_id AS visitId,
  session_id AS sessionId,
  visitor_id AS visitorId,
  pathname,
  title,
  hostname,
  referrer_host AS referrerHost,
  country,
  region,
  browser,
  browser_version AS browserVersion,
  os,
  os_version AS osVersion,
  device_type AS deviceType,
  node_count AS nodeCount,
  value_count AS valueCount
FROM event_source
LIMIT 1
`,
    [siteId, eventId],
  );
  const record = rows[0];
  if (!record) return null;
  const detail = await readCustomEventDetail(env, siteId, eventId);
  return {
    event: mapEventRecord(record),
    context: {
      visitId: record.visitId,
      sessionId: record.sessionId,
      visitorId: record.visitorId,
      pathname: record.pathname,
      title: record.title,
      hostname: record.hostname,
      referrerHost: record.referrerHost,
      country: record.country,
      region: record.region,
      browser: record.browser,
      browserVersion: record.browserVersion,
      os: record.os,
      osVersion: record.osVersion,
      deviceType: record.deviceType,
    },
    eventData: detail?.eventData ?? {},
  };
}

export async function handleEventTypes(
  env: Env,
  siteId: string,
  url: URL,
): Promise<Response> {
  const window = parseWindow(url);
  if (!window) return badRequest("Invalid time window");
  const filters = parseFilters(url);
  const limit = parseLimit(url, 20, 200);
  const rows = await queryEventTypeAggregate(
    env,
    siteId,
    window,
    filters,
    limit,
  );
  return jsonResponse({ ok: true, data: mapTabs(rows) });
}

export async function handleEventsSummary(
  env: Env,
  siteId: string,
  url: URL,
): Promise<Response> {
  const window = parseWindow(url);
  if (!window) return badRequest("Invalid time window");
  const filters = parseFilters(url);
  const data = await queryEventsSummaryFromD1(env, siteId, window, filters);
  return jsonResponse({
    ok: true,
    summary: {
      events: Number(data.summary.events ?? 0),
      eventTypes: Number(data.summary.eventTypes ?? 0),
      sessions: Number(data.summary.sessions ?? 0),
      visitors: Number(data.summary.visitors ?? 0),
      avgEventsPerSession:
        Number(data.summary.sessions ?? 0) > 0
          ? Number(data.summary.events ?? 0) /
            Number(data.summary.sessions ?? 0)
          : 0,
    },
    cards: mapEventSummaryCards(data.cards),
  });
}

export async function handleEventsTrend(
  env: Env,
  siteId: string,
  url: URL,
): Promise<Response> {
  const window = parseWindow(url);
  if (!window) return badRequest("Invalid time window");
  const filters = parseFilters(url);
  const interval = parseInterval(url);
  const limit = parseLimit(url, 8, 12);
  const eventName = parseEventName(url);
  const trend = await queryEventsTrendFromD1(
    env,
    siteId,
    window,
    interval,
    filters,
    limit,
    eventName,
  );
  return jsonResponse({ ok: true, interval, ...trend });
}

export async function handleEventsRecords(
  env: Env,
  siteId: string,
  url: URL,
): Promise<Response> {
  const window = parseWindow(url);
  if (!window) return badRequest("Invalid time window");
  const filters = parseFilters(url);
  const page = parseQueryLimit(url, "page", 1, 1, 10_000);
  const pageSize = parseQueryLimit(url, "pageSize", 80, 1, 120);
  const sort = parseEventRecordSort(url);
  const search = parseListSearch(url);
  const eventName = parseEventName(url);
  const rows = await queryEventRecordsFromD1(env, siteId, window, filters, {
    limit: pageSize + 1,
    offset: (page - 1) * pageSize,
    sort,
    search,
    eventName,
  });
  const hasMore = rows.length > pageSize;
  const currentRows = hasMore ? rows.slice(0, pageSize) : rows;
  return jsonResponse({
    ok: true,
    data: currentRows.map(mapEventRecord),
    meta: {
      page,
      pageSize,
      returned: currentRows.length,
      hasMore,
      nextPage: hasMore ? page + 1 : null,
    },
  });
}

export async function handleEventTypeDetail(
  env: Env,
  siteId: string,
  url: URL,
): Promise<Response> {
  const eventName = parseEventName(url);
  if (!eventName) return badRequest("eventName is required");
  const window = parseWindow(url);
  if (!window) return badRequest("Invalid time window");
  const filters = parseFilters(url);
  const interval = parseInterval(url);
  const [overview, trend, fields, cards] = await Promise.all([
    queryEventTypeOverviewFromD1(env, siteId, window, filters, eventName),
    queryEventTypeTrendFromD1(
      env,
      siteId,
      window,
      interval,
      filters,
      eventName,
    ),
    queryEventFieldsFromD1(env, siteId, window, filters, eventName, 100),
    queryEventAnalyticsContextCardsFromD1(
      env,
      siteId,
      window,
      filters,
      100,
      eventName,
    ),
  ]);
  return jsonResponse({
    ok: true,
    eventName,
    summary: overview.summary,
    trend,
    breakdowns: {
      pages: mapTabs(overview.breakdowns.pages),
      countries: mapTabs(overview.breakdowns.countries),
      devices: mapTabs(overview.breakdowns.devices),
      browsers: mapTabs(overview.breakdowns.browsers),
    },
    cards: mapEventAnalyticsContextCards(cards),
    fields: fields.map(mapEventField),
  });
}

export async function handleEventTypeFieldValues(
  env: Env,
  siteId: string,
  url: URL,
): Promise<Response> {
  const eventName = parseEventName(url);
  const fieldPath = parseEventFieldPath(url);
  const fieldValueType = parseEventFieldValueType(url);
  if (!eventName) return badRequest("eventName is required");
  if (!fieldPath) return badRequest("fieldPath is required");
  if (!fieldValueType) return badRequest("fieldValueType is required");
  const window = parseWindow(url);
  if (!window) return badRequest("Invalid time window");
  const filters = parseFilters(url);
  const limit = parseLimit(url, 25, 100);
  const rows = await queryEventFieldValuesFromD1(
    env,
    siteId,
    window,
    filters,
    eventName,
    fieldPath,
    fieldValueType,
    limit,
  );
  return jsonResponse({
    ok: true,
    fieldPath,
    fieldValueType,
    data: rows.map(mapEventFieldValue),
  });
}

export async function handleEventRecordDetail(
  env: Env,
  siteId: string,
  url: URL,
): Promise<Response> {
  const eventId = parseEventId(url);
  if (!eventId) return badRequest("eventId is required");
  const detail = await queryEventRecordDetailFromD1(env, siteId, eventId);
  return jsonResponse({ ok: true, data: detail });
}
