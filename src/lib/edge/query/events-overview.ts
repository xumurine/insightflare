import type { Env } from "@/lib/edge/types";

import type {
  DashboardFilters,
  DimensionRow,
  EventSummaryRow,
  QueryWindow,
} from "./core";
import {
  buildEventAnalyticsSourceCte,
  buildEventFilterSql,
  buildVisitSourceCte,
  eventSourceBindings,
  queryD1All,
  visitSourceBindings,
} from "./core";
import { queryEventSummaryMetricsFromD1 } from "./events-summary";

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
