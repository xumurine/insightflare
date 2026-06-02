import type { Env } from "@/lib/edge/types";

import type {
  DashboardFilters,
  Interval,
  PerformanceCountryRow,
  PerformanceMetricKey,
  PerformanceRouteRow,
  PerformanceSummaryRow,
  PerformanceTrendPointRow,
  QueryWindow,
} from "./core";
import {
  appendSqlConditions,
  badRequest,
  buildTimeBuckets,
  buildVisitFilterSql,
  buildVisitSourceCte,
  emptyPerformanceRouteMetrics,
  jsonResponse,
  normalizePathname,
  parseFilters,
  parseInterval,
  parseLimit,
  parseWindow,
  PERFORMANCE_METRIC_COLUMNS,
  performanceMetricColumn,
  queryD1All,
  roundPerformanceValue,
  timeBucketCase,
  timeBucketTimestamp,
  visitSourceBindings,
} from "./core";

export async function queryPerformanceSummariesFromD1(
  env: Env,
  siteId: string,
  window: QueryWindow,
  filters: DashboardFilters,
): Promise<Record<PerformanceMetricKey, PerformanceSummaryRow>> {
  const filter = buildVisitFilterSql(filters);
  const sql = `
WITH
${buildVisitSourceCte()},
filtered_visits AS (
  SELECT *
  FROM visit_source
  ${filter.clause}
),
metric_visits AS (
  SELECT 'ttfb' AS metric, perf_ttfb_ms AS metricValue
  FROM filtered_visits
  WHERE perf_ttfb_ms IS NOT NULL
  UNION ALL
  SELECT 'fcp' AS metric, perf_fcp_ms AS metricValue
  FROM filtered_visits
  WHERE perf_fcp_ms IS NOT NULL
  UNION ALL
  SELECT 'lcp' AS metric, perf_lcp_ms AS metricValue
  FROM filtered_visits
  WHERE perf_lcp_ms IS NOT NULL
  UNION ALL
  SELECT 'cls' AS metric, perf_cls AS metricValue
  FROM filtered_visits
  WHERE perf_cls IS NOT NULL
  UNION ALL
  SELECT 'inp' AS metric, perf_inp_ms AS metricValue
  FROM filtered_visits
  WHERE perf_inp_ms IS NOT NULL
),
ordered_values AS (
  SELECT
    metric,
    metricValue,
    ROW_NUMBER() OVER (PARTITION BY metric ORDER BY metricValue ASC) AS rowNum,
    COUNT(*) OVER (PARTITION BY metric) AS sampleCount
  FROM metric_visits
),
metric_thresholds AS (
  SELECT
    metric,
    sampleCount,
    AVG(metricValue) AS avgValue,
    CAST(((sampleCount * 50) + 99) / 100 AS INTEGER) AS p50Rank,
    CAST(((sampleCount * 75) + 99) / 100 AS INTEGER) AS p75Rank,
    CAST(((sampleCount * 95) + 99) / 100 AS INTEGER) AS p95Rank
  FROM ordered_values
  GROUP BY metric, sampleCount
)
SELECT
  thresholds.metric AS metric,
  thresholds.sampleCount AS samples,
  thresholds.avgValue AS avgValue,
  MIN(CASE WHEN ordered.rowNum >= thresholds.p50Rank THEN ordered.metricValue END) AS p50,
  MIN(CASE WHEN ordered.rowNum >= thresholds.p75Rank THEN ordered.metricValue END) AS p75,
  MIN(CASE WHEN ordered.rowNum >= thresholds.p95Rank THEN ordered.metricValue END) AS p95
FROM metric_thresholds thresholds
JOIN ordered_values ordered
  ON ordered.metric = thresholds.metric
GROUP BY thresholds.metric, thresholds.sampleCount, thresholds.avgValue
`;
  const summaries: Record<PerformanceMetricKey, PerformanceSummaryRow> = {
    ttfb: { avg: null, p50: null, p75: null, p95: null, samples: 0 },
    fcp: { avg: null, p50: null, p75: null, p95: null, samples: 0 },
    lcp: { avg: null, p50: null, p75: null, p95: null, samples: 0 },
    cls: { avg: null, p50: null, p75: null, p95: null, samples: 0 },
    inp: { avg: null, p50: null, p75: null, p95: null, samples: 0 },
  };
  const rows = await queryD1All<Record<string, unknown>>(env, sql, [
    ...visitSourceBindings(siteId, window),
    ...filter.bindings,
  ]);
  for (const row of rows) {
    const metric = String(row.metric ?? "") as PerformanceMetricKey;
    if (!(metric in PERFORMANCE_METRIC_COLUMNS)) continue;
    summaries[metric] = {
      avg: roundPerformanceValue(row.avgValue),
      p50: roundPerformanceValue(row.p50),
      p75: roundPerformanceValue(row.p75),
      p95: roundPerformanceValue(row.p95),
      samples: Number(row.samples ?? 0),
    };
  }
  return summaries;
}

export async function queryPerformanceTrendFromD1(
  env: Env,
  siteId: string,
  window: QueryWindow,
  interval: Interval,
  filters: DashboardFilters,
  metric: PerformanceMetricKey,
): Promise<PerformanceTrendPointRow[]> {
  const filter = buildVisitFilterSql(filters);
  const buckets = buildTimeBuckets(window, interval);
  const bucket = timeBucketCase(buckets, "started_at");
  const column = performanceMetricColumn(metric);
  const filteredClause = appendSqlConditions(filter.clause, [
    `${column} IS NOT NULL`,
  ]);
  const sql = `
WITH
${buildVisitSourceCte()},
metric_visits AS (
  SELECT
    ${bucket.sql} AS bucket,
    ${column} AS metricValue
  FROM visit_source
  ${filteredClause}
),
ordered_values AS (
  SELECT
    bucket,
    metricValue,
    ROW_NUMBER() OVER (PARTITION BY bucket ORDER BY metricValue ASC) AS rowNum,
    COUNT(*) OVER (PARTITION BY bucket) AS sampleCount
  FROM metric_visits
),
bucket_thresholds AS (
  SELECT
    bucket,
    sampleCount,
    AVG(metricValue) AS avgValue,
    CAST(((sampleCount * 50) + 99) / 100 AS INTEGER) AS p50Rank,
    CAST(((sampleCount * 75) + 99) / 100 AS INTEGER) AS p75Rank,
    CAST(((sampleCount * 95) + 99) / 100 AS INTEGER) AS p95Rank
  FROM ordered_values
  GROUP BY bucket, sampleCount
)
SELECT
  thresholds.bucket AS bucket,
  thresholds.sampleCount AS samples,
  thresholds.avgValue AS avgValue,
  MIN(CASE WHEN ordered.rowNum >= thresholds.p50Rank THEN ordered.metricValue END) AS p50,
  MIN(CASE WHEN ordered.rowNum >= thresholds.p75Rank THEN ordered.metricValue END) AS p75,
  MIN(CASE WHEN ordered.rowNum >= thresholds.p95Rank THEN ordered.metricValue END) AS p95
FROM bucket_thresholds thresholds
JOIN ordered_values ordered
  ON ordered.bucket = thresholds.bucket
GROUP BY thresholds.bucket, thresholds.sampleCount, thresholds.avgValue
ORDER BY thresholds.bucket ASC
`;
  return (
    await queryD1All<Record<string, unknown>>(env, sql, [
      ...visitSourceBindings(siteId, window),
      ...bucket.bindings,
      ...filter.bindings,
    ])
  ).map((row) => ({
    bucket: Number(row.bucket ?? 0),
    timestampMs: timeBucketTimestamp(buckets, Number(row.bucket ?? 0)),
    avg: roundPerformanceValue(row.avgValue),
    p50: roundPerformanceValue(row.p50),
    p75: roundPerformanceValue(row.p75),
    p95: roundPerformanceValue(row.p95),
    samples: Number(row.samples ?? 0),
  }));
}

export async function queryPerformanceRoutesFromD1(
  env: Env,
  siteId: string,
  window: QueryWindow,
  filters: DashboardFilters,
  limit: number,
): Promise<PerformanceRouteRow[]> {
  const filter = buildVisitFilterSql(filters);
  const pathExpr = "COALESCE(NULLIF(trim(pathname), ''), '/')";
  const sql = `
WITH
${buildVisitSourceCte()},
filtered_visits AS (
  SELECT *
  FROM visit_source
  ${filter.clause}
),
path_views AS (
  SELECT
    ${pathExpr} AS pathname,
    count(*) AS views
  FROM filtered_visits
  GROUP BY pathname
  ORDER BY views DESC, pathname ASC
  LIMIT ?
),
metric_visits AS (
  SELECT ${pathExpr} AS pathname, 'ttfb' AS metric, perf_ttfb_ms AS metricValue
  FROM filtered_visits
  WHERE perf_ttfb_ms IS NOT NULL
  UNION ALL
  SELECT ${pathExpr} AS pathname, 'fcp' AS metric, perf_fcp_ms AS metricValue
  FROM filtered_visits
  WHERE perf_fcp_ms IS NOT NULL
  UNION ALL
  SELECT ${pathExpr} AS pathname, 'lcp' AS metric, perf_lcp_ms AS metricValue
  FROM filtered_visits
  WHERE perf_lcp_ms IS NOT NULL
  UNION ALL
  SELECT ${pathExpr} AS pathname, 'cls' AS metric, perf_cls AS metricValue
  FROM filtered_visits
  WHERE perf_cls IS NOT NULL
  UNION ALL
  SELECT ${pathExpr} AS pathname, 'inp' AS metric, perf_inp_ms AS metricValue
  FROM filtered_visits
  WHERE perf_inp_ms IS NOT NULL
),
scoped_metric_visits AS (
  SELECT metric_visits.*
  FROM metric_visits
  JOIN path_views ON path_views.pathname = metric_visits.pathname
),
ordered_values AS (
  SELECT
    pathname,
    metric,
    metricValue,
    ROW_NUMBER() OVER (PARTITION BY pathname, metric ORDER BY metricValue ASC) AS rowNum,
    COUNT(*) OVER (PARTITION BY pathname, metric) AS sampleCount
  FROM scoped_metric_visits
),
metric_thresholds AS (
  SELECT
    pathname,
    metric,
    sampleCount,
    AVG(metricValue) AS avgValue,
    CAST(((sampleCount * 50) + 99) / 100 AS INTEGER) AS p50Rank,
    CAST(((sampleCount * 75) + 99) / 100 AS INTEGER) AS p75Rank,
    CAST(((sampleCount * 95) + 99) / 100 AS INTEGER) AS p95Rank
  FROM ordered_values
  GROUP BY pathname, metric, sampleCount
)
SELECT
  thresholds.pathname AS pathname,
  thresholds.metric AS metric,
  path_views.views AS views,
  thresholds.sampleCount AS samples,
  thresholds.avgValue AS avgValue,
  MIN(CASE WHEN ordered.rowNum >= thresholds.p50Rank THEN ordered.metricValue END) AS p50,
  MIN(CASE WHEN ordered.rowNum >= thresholds.p75Rank THEN ordered.metricValue END) AS p75,
  MIN(CASE WHEN ordered.rowNum >= thresholds.p95Rank THEN ordered.metricValue END) AS p95
FROM metric_thresholds thresholds
JOIN ordered_values ordered
  ON ordered.pathname = thresholds.pathname
 AND ordered.metric = thresholds.metric
JOIN path_views ON path_views.pathname = thresholds.pathname
GROUP BY
  thresholds.pathname,
  thresholds.metric,
  path_views.views,
  thresholds.sampleCount,
  thresholds.avgValue
ORDER BY path_views.views DESC, thresholds.pathname ASC, thresholds.metric ASC
`;
  const rows = await queryD1All<Record<string, unknown>>(env, sql, [
    ...visitSourceBindings(siteId, window),
    ...filter.bindings,
    limit,
  ]);
  const byPath = new Map<string, PerformanceRouteRow>();

  for (const row of rows) {
    const pathname = normalizePathname(String(row.pathname ?? ""));
    const metric = String(row.metric ?? "") as PerformanceMetricKey;
    if (!(metric in PERFORMANCE_METRIC_COLUMNS)) continue;

    const current = byPath.get(pathname) ?? {
      pathname,
      views: Number(row.views ?? 0),
      metrics: emptyPerformanceRouteMetrics(),
    };
    current.metrics[metric] = {
      avg: roundPerformanceValue(row.avgValue),
      p50: roundPerformanceValue(row.p50),
      p75: roundPerformanceValue(row.p75),
      p95: roundPerformanceValue(row.p95),
      samples: Number(row.samples ?? 0),
    };
    byPath.set(pathname, current);
  }

  return [...byPath.values()];
}

export async function queryPerformanceCountriesFromD1(
  env: Env,
  siteId: string,
  window: QueryWindow,
  filters: DashboardFilters,
): Promise<PerformanceCountryRow[]> {
  const filter = buildVisitFilterSql(filters);
  const countryExpr = "UPPER(TRIM(COALESCE(country, '')))";
  const sql = `
WITH
${buildVisitSourceCte()},
filtered_visits AS (
  SELECT *
  FROM visit_source
  ${filter.clause}
),
country_views AS (
  SELECT
    ${countryExpr} AS country,
    count(*) AS views
  FROM filtered_visits
  WHERE ${countryExpr} != ''
  GROUP BY country
),
metric_visits AS (
  SELECT ${countryExpr} AS country, 'ttfb' AS metric, perf_ttfb_ms AS metricValue
  FROM filtered_visits
  WHERE ${countryExpr} != '' AND perf_ttfb_ms IS NOT NULL
  UNION ALL
  SELECT ${countryExpr} AS country, 'fcp' AS metric, perf_fcp_ms AS metricValue
  FROM filtered_visits
  WHERE ${countryExpr} != '' AND perf_fcp_ms IS NOT NULL
  UNION ALL
  SELECT ${countryExpr} AS country, 'lcp' AS metric, perf_lcp_ms AS metricValue
  FROM filtered_visits
  WHERE ${countryExpr} != '' AND perf_lcp_ms IS NOT NULL
  UNION ALL
  SELECT ${countryExpr} AS country, 'cls' AS metric, perf_cls AS metricValue
  FROM filtered_visits
  WHERE ${countryExpr} != '' AND perf_cls IS NOT NULL
  UNION ALL
  SELECT ${countryExpr} AS country, 'inp' AS metric, perf_inp_ms AS metricValue
  FROM filtered_visits
  WHERE ${countryExpr} != '' AND perf_inp_ms IS NOT NULL
),
ordered_values AS (
  SELECT
    country,
    metric,
    metricValue,
    ROW_NUMBER() OVER (PARTITION BY country, metric ORDER BY metricValue ASC) AS rowNum,
    COUNT(*) OVER (PARTITION BY country, metric) AS sampleCount
  FROM metric_visits
),
metric_thresholds AS (
  SELECT
    country,
    metric,
    sampleCount,
    AVG(metricValue) AS avgValue,
    CAST(((sampleCount * 50) + 99) / 100 AS INTEGER) AS p50Rank,
    CAST(((sampleCount * 75) + 99) / 100 AS INTEGER) AS p75Rank,
    CAST(((sampleCount * 95) + 99) / 100 AS INTEGER) AS p95Rank
  FROM ordered_values
  GROUP BY country, metric, sampleCount
)
SELECT
  thresholds.country AS country,
  thresholds.metric AS metric,
  country_views.views AS views,
  thresholds.sampleCount AS samples,
  thresholds.avgValue AS avgValue,
  MIN(CASE WHEN ordered.rowNum >= thresholds.p50Rank THEN ordered.metricValue END) AS p50,
  MIN(CASE WHEN ordered.rowNum >= thresholds.p75Rank THEN ordered.metricValue END) AS p75,
  MIN(CASE WHEN ordered.rowNum >= thresholds.p95Rank THEN ordered.metricValue END) AS p95
FROM metric_thresholds thresholds
JOIN ordered_values ordered
  ON ordered.country = thresholds.country
 AND ordered.metric = thresholds.metric
JOIN country_views ON country_views.country = thresholds.country
GROUP BY
  thresholds.country,
  thresholds.metric,
  country_views.views,
  thresholds.sampleCount,
  thresholds.avgValue
ORDER BY country_views.views DESC, thresholds.country ASC, thresholds.metric ASC
`;
  const rows = await queryD1All<Record<string, unknown>>(env, sql, [
    ...visitSourceBindings(siteId, window),
    ...filter.bindings,
  ]);
  const byCountry = new Map<string, PerformanceCountryRow>();

  for (const row of rows) {
    const country = String(row.country ?? "")
      .trim()
      .toUpperCase();
    const metric = String(row.metric ?? "") as PerformanceMetricKey;
    if (!country || !(metric in PERFORMANCE_METRIC_COLUMNS)) continue;

    const current = byCountry.get(country) ?? {
      country,
      views: Number(row.views ?? 0),
      metrics: emptyPerformanceRouteMetrics(),
    };
    current.metrics[metric] = {
      avg: roundPerformanceValue(row.avgValue),
      p50: roundPerformanceValue(row.p50),
      p75: roundPerformanceValue(row.p75),
      p95: roundPerformanceValue(row.p95),
      samples: Number(row.samples ?? 0),
    };
    byCountry.set(country, current);
  }

  return [...byCountry.values()];
}

export async function handlePerformance(
  env: Env,
  siteId: string,
  url: URL,
): Promise<Response> {
  const window = parseWindow(url);
  if (!window) return badRequest("Invalid time window");
  const filters = parseFilters(url);
  const interval = parseInterval(url);
  const routeLimit = parseLimit(url, 18, 50);
  const [summaries, ttfb, fcp, lcp, cls, inp, routes, countries] =
    await Promise.all([
      queryPerformanceSummariesFromD1(env, siteId, window, filters),
      queryPerformanceTrendFromD1(
        env,
        siteId,
        window,
        interval,
        filters,
        "ttfb",
      ),
      queryPerformanceTrendFromD1(
        env,
        siteId,
        window,
        interval,
        filters,
        "fcp",
      ),
      queryPerformanceTrendFromD1(
        env,
        siteId,
        window,
        interval,
        filters,
        "lcp",
      ),
      queryPerformanceTrendFromD1(
        env,
        siteId,
        window,
        interval,
        filters,
        "cls",
      ),
      queryPerformanceTrendFromD1(
        env,
        siteId,
        window,
        interval,
        filters,
        "inp",
      ),
      queryPerformanceRoutesFromD1(env, siteId, window, filters, routeLimit),
      queryPerformanceCountriesFromD1(env, siteId, window, filters),
    ]);

  return jsonResponse({
    ok: true,
    interval,
    summaries,
    trends: {
      ttfb,
      fcp,
      lcp,
      cls,
      inp,
    },
    routes,
    countries,
  });
}
