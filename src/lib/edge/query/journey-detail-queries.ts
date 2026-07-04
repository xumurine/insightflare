import type { Env } from "@/lib/edge/types";

import type { JourneyEventRow, SessionRow, VisitorRow } from "./core";
import {
  buildDetailCustomEventSourceCte,
  buildTargetVisitSourceCte,
  detailCustomEventSourceBindings,
  queryD1All,
  targetVisitSourceBindings,
} from "./core";
import { querySessionLocationPointsFromD1 } from "./journey-geo-queries";
import type { DetailTarget } from "./journey-helpers";
import {
  averageGapMs,
  detailTargetColumn,
  mapJourneyEventRow,
  mapSessionRow,
  mapVisitorRow,
  percentile,
  reportingDateKey,
  sessionLeaveEvent,
  sessionStartEvent,
  summarizeActivity,
  summarizeEventDistribution,
  summarizeJourneyPerformance,
  summarizeVisitedPages,
} from "./journey-helpers";

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
