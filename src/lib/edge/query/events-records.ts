import { readCustomEventDetail } from "@/lib/edge/custom-event-read";
import type { Env } from "@/lib/edge/types";

import type {
  DashboardFilters,
  EventRecordRow,
  EventRecordSortKey,
  ListSort,
  QueryWindow,
} from "./core";
import {
  buildEventAnalyticsSourceCte,
  buildEventFilterSql,
  buildVisitSourceCte,
  eventRecordOrderBy,
  eventSourceBindings,
  mapEventRecord,
  queryD1All,
  visitSourceBindings,
} from "./core";

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
