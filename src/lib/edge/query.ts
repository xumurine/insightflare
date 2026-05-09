import { browserEngineCaseSql } from "@/lib/browser-engine";
import {
  buildLocalityLocationValue,
  buildRegionLocationValue,
  parseGeoLocationValue,
} from "@/lib/dashboard/geo-location";
import {
  addZonedInterval,
  resolveReportingTimeZone,
  startOfZonedInterval,
  zonedParts,
} from "@/lib/dashboard/time-zone";

import { withDashboardCache } from "./dashboard-cache";
import { requireSession } from "./session-auth";
import type { Env } from "./types";
import { coerceNumber, ONE_DAY_MS, ONE_HOUR_MS } from "./utils";

const RETENTION_DAYS = 365;
const PRIVATE_CACHE_HEADERS = {
  "cache-control": "private, no-store",
  vary: "authorization, cookie",
};
const PUBLIC_CACHE_HEADERS = {
  "cache-control": "public, max-age=60, s-maxage=60",
  "access-control-allow-origin": "*",
};
const PUBLIC_PRIVACY = {
  queryHashDetails: "hidden",
  visitorTrajectories: "hidden",
  detailedReferrerUrl: "hidden",
} as const;

type Interval = "minute" | "hour" | "day" | "week" | "month";

interface QueryWindow {
  fromMs: number;
  toMs: number;
  nowMs: number;
  timeZone: string;
}

interface SiteRow {
  id: string;
  name: string;
  domain: string;
}

interface TeamSiteRow {
  id: string;
  teamId: string;
  name: string;
  domain: string;
  publicEnabled: number;
  publicSlug: string | null;
  createdAt: number;
  updatedAt: number;
}

interface DashboardFilters {
  country?: string;
  device?: string;
  browser?: string;
  path?: string;
  query?: string;
  title?: string;
  hostname?: string;
  entry?: string;
  exit?: string;
  sourceDomain?: string;
  sourceLink?: string;
  clientBrowser?: string;
  clientOsVersion?: string;
  clientDeviceType?: string;
  clientLanguage?: string;
  clientScreenSize?: string;
  geo?: string;
  geoContinent?: string;
  geoTimezone?: string;
  geoOrganization?: string;
}

type SortDirection = "asc" | "desc";
type VisitorListSortKey = "firstSeenAt" | "lastSeenAt" | "sessions" | "views";
type SessionListSortKey = "startedAt" | "durationMs" | "views";

interface ListSort<Key extends string> {
  key: Key;
  direction: SortDirection;
}

const DEFAULT_VISITOR_LIST_SORT: ListSort<VisitorListSortKey> = {
  key: "lastSeenAt",
  direction: "desc",
};
const DEFAULT_SESSION_LIST_SORT: ListSort<SessionListSortKey> = {
  key: "startedAt",
  direction: "desc",
};

interface OverviewAggregateRow {
  views: number;
  sessions: number;
  visitors: number;
  bounces: number;
  totalDuration: number;
  durationViews: number;
}

interface TrendAggregateRow extends OverviewAggregateRow {
  bucket: number;
  timestampMs: number;
}

interface BrowserTrendSeriesRow {
  key: string;
  label: string;
  views: number;
  visitors: number;
  sessions: number;
  isOther?: boolean;
}

interface BrowserTrendBucketRow {
  bucket: number;
  label: string;
  views: number;
  visitors: number;
  sessions: number;
}

interface BrowserTrendPointRow {
  bucket: number;
  timestampMs: number;
  totalVisitors: number;
  visitorsBySeries: Record<string, number>;
}

type PerformanceMetricKey = "ttfb" | "fcp" | "lcp" | "cls" | "inp";

interface VisitPerformanceMetricsRow {
  ttfb: number | null;
  fcp: number | null;
  lcp: number | null;
  cls: number | null;
  inp: number | null;
}

interface JourneyPerformanceMetricSummaryRow {
  avg: number | null;
  p75: number | null;
  min: number | null;
  max: number | null;
  samples: number;
}

type JourneyPerformanceSummaryRow = Record<
  PerformanceMetricKey,
  JourneyPerformanceMetricSummaryRow
>;

interface PerformanceSummaryRow {
  avg: number | null;
  p50: number | null;
  p75: number | null;
  p95: number | null;
  samples: number;
}

interface PerformanceTrendPointRow {
  bucket: number;
  timestampMs: number;
  avg: number | null;
  p50: number | null;
  p75: number | null;
  p95: number | null;
  samples: number;
}

interface PerformanceRouteMetricRow {
  avg: number | null;
  p50: number | null;
  p75: number | null;
  p95: number | null;
  samples: number;
}

interface PerformanceRouteRow {
  pathname: string;
  views: number;
  metrics: Record<PerformanceMetricKey, PerformanceRouteMetricRow>;
}

interface PerformanceCountryRow {
  country: string;
  views: number;
  metrics: Record<PerformanceMetricKey, PerformanceRouteMetricRow>;
}

interface BrowserVersionAggregateRow {
  browser: string;
  version: string;
  views: number;
  visitors: number;
  sessions: number;
}

interface BrowserVersionSliceRow {
  key: string;
  label: string;
  views: number;
  visitors: number;
  sessions: number;
  isOther?: boolean;
  isUnknown?: boolean;
}

interface BrowserVersionBreakdownRow {
  browser: string;
  views: number;
  visitors: number;
  sessions: number;
  versions: BrowserVersionSliceRow[];
}

interface BrowserCrossBreakdownItemRow {
  key: string;
  label: string;
  views: number;
  visitors: number;
  sessions: number;
  isOther?: boolean;
  isUnknown?: boolean;
}

interface BrowserCrossBreakdownDimensionRow extends BrowserCrossBreakdownItemRow {
  cells: BrowserCrossBreakdownItemRow[];
}

interface BrowserCrossBreakdownDimensionDataRow {
  columns: BrowserCrossBreakdownItemRow[];
  rows: BrowserCrossBreakdownDimensionRow[];
  totalVisitors: number;
}

interface BrowserCrossAggregateRow {
  browser: string;
  dimension: string;
  views: number;
  visitors: number;
  sessions: number;
}

interface ClientCrossAggregateRow {
  primary: string;
  secondary: string;
  views: number;
  visitors: number;
  sessions: number;
}

interface DimensionRow {
  value: string;
  views: number;
  sessions: number;
  visitors: number;
}

interface GeoTabRow {
  value: string;
  label: string;
  views: number;
  sessions: number;
  visitors: number;
}

interface PageRow {
  pathname: string;
  query: string;
  hash: string;
  views: number;
  sessions: number;
}

interface PageCardAggregateRow extends OverviewAggregateRow {
  pathname: string;
}

interface PageCardTitleRow {
  pathname: string;
  title: string;
  views: number;
}

interface PageCardTrendRow {
  pathname: string;
  bucket: number;
  timestampMs: number;
  views: number;
  visitors: number;
}

interface ReferrerRow {
  referrer: string;
  views: number;
  sessions: number;
  visitors: number;
}

interface ReferrerRadarRow {
  referrer: string;
  sessions: number;
  bounces: number;
  avgDurationMs: number;
  avgDepth: number;
  visitors: number;
  returningVisitors: number;
  avgFrequency: number;
  trafficShare: number;
}

interface VisitorRow {
  visitorId: string;
  sessionId?: string;
  firstSeenAt: number;
  lastSeenAt: number;
  views: number;
  sessions: number;
  events?: number;
  country?: string;
  region?: string;
  regionCode?: string;
  city?: string;
  referrerHost?: string;
  referrerUrl?: string;
  browser?: string;
  browserVersion?: string;
  os?: string;
  osVersion?: string;
  deviceType?: string;
  screenWidth?: number | null;
  screenHeight?: number | null;
}

interface SessionRow {
  sessionId: string;
  visitorId: string;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  active: boolean;
  views: number;
  events: number;
  bounce: boolean;
  entryPath: string;
  exitPath: string;
  referrerHost: string;
  referrerUrl: string;
  country: string;
  region: string;
  regionCode: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
  browser: string;
  browserVersion: string;
  os: string;
  osVersion: string;
  deviceType: string;
  screenWidth: number | null;
  screenHeight: number | null;
  performance: VisitPerformanceMetricsRow;
}

interface JourneyEventRow {
  id: string;
  kind: "session_start" | "pageview" | "leave" | "custom";
  eventType: string;
  occurredAt: number;
  visitId: string;
  sessionId: string;
  visitorId: string;
  pathname: string;
  hash: string;
  title: string;
  hostname: string;
  referrerHost: string;
  referrerUrl: string;
  country: string;
  region: string;
  city: string;
  browser: string;
  browserVersion: string;
  os: string;
  osVersion: string;
  deviceType: string;
  screenWidth: number | null;
  screenHeight: number | null;
  durationMs: number;
  performance: VisitPerformanceMetricsRow;
}

interface JourneyPageCountRow {
  pathname: string;
  views: number;
}

interface JourneyEventCountRow {
  eventType: string;
  count: number;
}

interface VisitorActivityRow {
  date: string;
  count: number;
}

interface GeoPointRow {
  latitude: number;
  longitude: number;
  timestampMs: number;
  country: string;
  region: string;
  regionCode: string;
  city: string;
}

interface GeoCountryCountRow {
  country: string;
  views: number;
  sessions: number;
  visitors: number;
}

interface GeoDimensionCountRow {
  value: string;
  label: string;
  views: number;
  sessions: number;
  visitors: number;
}

interface GeoPointAggregate {
  points: GeoPointRow[];
  countryCounts: GeoCountryCountRow[];
  regionCounts: GeoDimensionCountRow[];
  cityCounts: GeoDimensionCountRow[];
}

type ClientDimensionKey =
  | "browser"
  | "operatingSystem"
  | "osVersion"
  | "deviceType"
  | "language"
  | "screenSize";

type UtmDimensionKey = "source" | "medium" | "campaign" | "term" | "content";

interface ClientDimensionTabs {
  browser: DimensionRow[];
  osVersion: DimensionRow[];
  deviceType: DimensionRow[];
  language: DimensionRow[];
  screenSize: DimensionRow[];
}

interface GeoDimensionTabs {
  country: GeoTabRow[];
  region: GeoTabRow[];
  city: GeoTabRow[];
  continent: GeoTabRow[];
  timezone: GeoTabRow[];
  organization: GeoTabRow[];
}

interface PublicSiteEnvelope {
  slug: string;
  name: string;
  domain: string;
}

interface PreferredSourceResult<T> {
  value: T;
  source: "ae" | "d1";
  approximateVisitors?: boolean;
}

interface SiteQueryResponseOptions {
  publicSite?: PublicSiteEnvelope;
}

type FilterOptionKey = keyof DashboardFilters;

interface DashboardFilterOption {
  value: string;
  label: string;
  group?: "country" | "region" | "city";
}

const jsonResponse = (
  payload: unknown,
  status = 200,
  extraHeaders?: Record<string, string>,
) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(extraHeaders ?? {}),
    },
  });

const badRequest = (message: string, extraHeaders?: Record<string, string>) =>
  jsonResponse({ ok: false, error: message }, 400, extraHeaders);
const unauthorized = (
  message = "Unauthorized",
  extraHeaders?: Record<string, string>,
) => jsonResponse({ ok: false, error: message }, 401, extraHeaders);
const notFound = (
  message = "Not Found",
  extraHeaders?: Record<string, string>,
) => jsonResponse({ ok: false, error: message }, 404, extraHeaders);
const notAllowed = (extraHeaders?: Record<string, string>) =>
  jsonResponse({ ok: false, error: "Method Not Allowed" }, 405, extraHeaders);

function parseWindow(url: URL): QueryWindow | null {
  const nowMs = Date.now();
  const defaultFrom = nowMs - ONE_DAY_MS;
  const fromMs = Math.floor(
    coerceNumber(url.searchParams.get("from"), defaultFrom) ?? defaultFrom,
  );
  const toMs = Math.floor(
    coerceNumber(url.searchParams.get("to"), nowMs) ?? nowMs,
  );
  const timeZone = resolveReportingTimeZone(
    url.searchParams.get("timeZone") || url.searchParams.get("tz"),
  );
  if (
    !Number.isFinite(fromMs) ||
    !Number.isFinite(toMs) ||
    fromMs < 0 ||
    toMs < fromMs
  ) {
    return null;
  }
  return { fromMs, toMs, nowMs, timeZone };
}

function parseLimit(url: URL, fallback = 20, max = 500): number {
  const value = Math.floor(
    coerceNumber(url.searchParams.get("limit"), fallback) ?? fallback,
  );
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(max, value);
}

function parseInterval(url: URL): Interval {
  const raw = (url.searchParams.get("interval") || "day").toLowerCase();
  if (raw === "minute" || raw === "hour" || raw === "week" || raw === "month")
    return raw;
  return "day";
}

function parseBooleanSearchParam(url: URL, key: string): boolean {
  const value = (url.searchParams.get(key) || "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

function parseQueryLimit(
  url: URL,
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const value = Math.floor(
    coerceNumber(url.searchParams.get(key), fallback) ?? fallback,
  );
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function parseSortDirection(url: URL): SortDirection {
  return (url.searchParams.get("sortDir") || "").trim().toLowerCase() === "asc"
    ? "asc"
    : "desc";
}

function parseVisitorListSort(url: URL): ListSort<VisitorListSortKey> {
  const key = (url.searchParams.get("sortBy") || "").trim();
  if (
    key === "firstSeenAt" ||
    key === "lastSeenAt" ||
    key === "sessions" ||
    key === "views"
  ) {
    return { key, direction: parseSortDirection(url) };
  }
  return DEFAULT_VISITOR_LIST_SORT;
}

function parseSessionListSort(url: URL): ListSort<SessionListSortKey> {
  const key = (url.searchParams.get("sortBy") || "").trim();
  if (key === "startedAt" || key === "durationMs" || key === "views") {
    return { key, direction: parseSortDirection(url) };
  }
  return DEFAULT_SESSION_LIST_SORT;
}

function parseListSearch(url: URL): string | undefined {
  const raw = url.searchParams.get("search") ?? url.searchParams.get("q");
  if (typeof raw !== "string") return undefined;
  const normalized = raw.trim().slice(0, 160);
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeFilterValue(value: string | null): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().slice(0, 120);
  return normalized.length > 0 ? normalized : undefined;
}

function parseFilters(url: URL): DashboardFilters {
  const geo =
    normalizeFilterValue(url.searchParams.get("geo")) ||
    normalizeFilterValue(url.searchParams.get("geoCountry")) ||
    normalizeFilterValue(url.searchParams.get("geoRegion")) ||
    normalizeFilterValue(url.searchParams.get("geoCity"));
  return {
    country: normalizeFilterValue(url.searchParams.get("country")),
    device: normalizeFilterValue(url.searchParams.get("device")),
    browser: normalizeFilterValue(url.searchParams.get("browser")),
    path: normalizeFilterValue(url.searchParams.get("path")),
    query: normalizeFilterValue(url.searchParams.get("query")),
    title: normalizeFilterValue(url.searchParams.get("title")),
    hostname: normalizeFilterValue(url.searchParams.get("hostname")),
    entry: normalizeFilterValue(url.searchParams.get("entry")),
    exit: normalizeFilterValue(url.searchParams.get("exit")),
    sourceDomain: normalizeFilterValue(url.searchParams.get("sourceDomain")),
    sourceLink: normalizeFilterValue(url.searchParams.get("sourceLink")),
    clientBrowser: normalizeFilterValue(url.searchParams.get("clientBrowser")),
    clientOsVersion: normalizeFilterValue(
      url.searchParams.get("clientOsVersion"),
    ),
    clientDeviceType: normalizeFilterValue(
      url.searchParams.get("clientDeviceType"),
    ),
    clientLanguage: normalizeFilterValue(
      url.searchParams.get("clientLanguage"),
    ),
    clientScreenSize: normalizeFilterValue(
      url.searchParams.get("clientScreenSize"),
    ),
    geo,
    geoContinent: normalizeFilterValue(url.searchParams.get("geoContinent")),
    geoTimezone: normalizeFilterValue(url.searchParams.get("geoTimezone")),
    geoOrganization: normalizeFilterValue(
      url.searchParams.get("geoOrganization"),
    ),
  };
}

function parseFilterOptionKey(url: URL): FilterOptionKey | null {
  const raw = normalizeFilterValue(url.searchParams.get("filterKey"));
  if (!raw) return null;
  const keys: FilterOptionKey[] = [
    "country",
    "device",
    "browser",
    "path",
    "title",
    "hostname",
    "entry",
    "exit",
    "sourceDomain",
    "sourceLink",
    "clientBrowser",
    "clientOsVersion",
    "clientDeviceType",
    "clientLanguage",
    "clientScreenSize",
    "geo",
    "geoContinent",
    "geoTimezone",
    "geoOrganization",
  ];
  return keys.includes(raw as FilterOptionKey)
    ? (raw as FilterOptionKey)
    : null;
}

function withoutFilterKey(
  filters: DashboardFilters,
  key: FilterOptionKey,
): DashboardFilters {
  const next = { ...filters };
  delete next[key];
  return next;
}

function appendSqlConditions(baseClause: string, conditions: string[]): string {
  const normalizedConditions = conditions
    .map((condition) => condition.trim())
    .filter((condition) => condition.length > 0);
  if (normalizedConditions.length === 0) return baseClause;
  if (baseClause.trim().length > 0) {
    return `${baseClause} AND ${normalizedConditions.join(" AND ")}`;
  }
  return `WHERE ${normalizedConditions.join(" AND ")}`;
}

function sourceLabel(window: QueryWindow): "detail" | "archive" | "mixed" {
  const archiveCutoff = window.nowMs - RETENTION_DAYS * ONE_DAY_MS;
  if (window.toMs < archiveCutoff) return "archive";
  if (window.fromMs < archiveCutoff) return "mixed";
  return "detail";
}

function avgDuration(totalDuration: number, sessions: number): number {
  if (sessions <= 0) return 0;
  return Math.round(totalDuration / sessions);
}

function bounceRate(bounces: number, sessions: number): number {
  if (sessions <= 0) return 0;
  return Number((bounces / sessions).toFixed(6));
}

function percentChange(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0)
    return null;
  return ((current - previous) / previous) * 100;
}

function intervalBucketMs(interval: Interval): number {
  if (interval === "minute") return 60_000;
  if (interval === "hour") return ONE_HOUR_MS;
  if (interval === "day") return ONE_DAY_MS;
  if (interval === "week") return 7 * ONE_DAY_MS;
  return 30 * ONE_DAY_MS;
}

interface TimeBucket {
  index: number;
  timestampMs: number;
  fromMs: number;
  toMs: number;
}

interface TimeBucketCase {
  sql: string;
  bindings: number[];
}

function sqlIntegerLiteral(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error("Invalid time bucket boundary");
  }
  return String(Math.trunc(value));
}

function buildTimeBuckets(
  window: QueryWindow,
  interval: Interval,
): TimeBucket[] {
  const buckets: TimeBucket[] = [];
  let current = startOfZonedInterval(window.fromMs, interval, window.timeZone);
  const hardLimit = 2000;

  for (let index = 0; index < hardLimit && current <= window.toMs; index += 1) {
    let next = addZonedInterval(current, interval, window.timeZone);
    if (!Number.isFinite(next) || next <= current) {
      next = current + intervalBucketMs(interval);
    }
    buckets.push({
      index,
      timestampMs: current,
      fromMs: current,
      toMs: next,
    });
    current = next;
  }

  if (buckets.length === 0) {
    const fallbackStart = Math.max(0, Math.floor(window.fromMs));
    buckets.push({
      index: 0,
      timestampMs: fallbackStart,
      fromMs: fallbackStart,
      toMs: Math.max(fallbackStart + 1, Math.floor(window.toMs) + 1),
    });
  }

  return buckets;
}

function timeBucketCase(
  buckets: TimeBucket[],
  columnExpression: string,
): TimeBucketCase {
  const clauses = buckets.map((bucket) => {
    return `WHEN ${columnExpression} >= ${sqlIntegerLiteral(bucket.fromMs)} AND ${columnExpression} < ${sqlIntegerLiteral(bucket.toMs)} THEN ${bucket.index}`;
  });
  return {
    sql: `CASE ${clauses.join(" ")} ELSE NULL END`,
    bindings: [],
  };
}

function timeBucketTimestamp(
  buckets: TimeBucket[],
  bucketIndex: number,
): number {
  return buckets[bucketIndex]?.timestampMs ?? 0;
}

const SHARE_TREND_OTHER_KEY = "other";
const SHARE_TREND_OTHER_LABEL = "Other";
const SHARE_TREND_OTHER_TOKEN = "__share_trend_other__";
const BROWSER_VERSION_UNKNOWN_TOKEN = "__browser_version_unknown__";
const BROWSER_CROSS_UNKNOWN_TOKEN = "__browser_cross_unknown__";
const BROWSER_CROSS_OTHER_BROWSER_TOKEN = "__browser_cross_other_browser__";
const BROWSER_CROSS_OTHER_DIMENSION_TOKEN = "__browser_cross_other_dimension__";
const CLIENT_CROSS_UNKNOWN_TOKEN = "__client_cross_unknown__";
const CLIENT_CROSS_OTHER_PRIMARY_TOKEN = "__client_cross_other_primary__";
const CLIENT_CROSS_OTHER_SECONDARY_TOKEN = "__client_cross_other_secondary__";

const PERFORMANCE_METRIC_COLUMNS: Record<PerformanceMetricKey, string> = {
  ttfb: "perf_ttfb_ms",
  fcp: "perf_fcp_ms",
  lcp: "perf_lcp_ms",
  cls: "perf_cls",
  inp: "perf_inp_ms",
};
const PERFORMANCE_METRIC_KEYS = Object.keys(
  PERFORMANCE_METRIC_COLUMNS,
) as PerformanceMetricKey[];

function shareTrendSeriesKey(
  label: string,
  usedKeys: Set<string>,
  fallbackBase: string,
): string {
  const normalized = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const base = normalized || fallbackBase;
  let candidate = base;
  let suffix = 2;

  while (usedKeys.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  usedKeys.add(candidate);
  return candidate;
}

function normalizePathname(pathname: string): string {
  const normalized = String(pathname || "").trim();
  return normalized.length > 0 ? normalized : "/";
}

function formatPageLabel(
  pathname: string,
  query = "",
  hash = "",
  includeDetails = false,
): string {
  const base = normalizePathname(pathname);
  if (!includeDetails) return base;
  return `${base}${query || ""}${hash || ""}`;
}

function osVersionExpr(alias = ""): string {
  const prefix = alias ? `${alias}.` : "";
  return `trim(CASE WHEN ${prefix}os != '' AND ${prefix}os_version != '' THEN ${prefix}os || ' ' || ${prefix}os_version WHEN ${prefix}os != '' THEN ${prefix}os WHEN ${prefix}os_version != '' THEN ${prefix}os_version ELSE '' END)`;
}

function browserMajorVersionExpr(alias = ""): string {
  const prefix = alias ? `${alias}.` : "";
  return `trim(CASE WHEN ${prefix}browser_version = '' THEN '' WHEN instr(${prefix}browser_version, '.') > 0 THEN substr(${prefix}browser_version, 1, instr(${prefix}browser_version, '.') - 1) ELSE ${prefix}browser_version END)`;
}

function screenSizeExpr(alias = ""): string {
  const prefix = alias ? `${alias}.` : "";
  return `CASE WHEN ${prefix}screen_width > 0 AND ${prefix}screen_height > 0 THEN CAST(${prefix}screen_width AS TEXT) || 'x' || CAST(${prefix}screen_height AS TEXT) ELSE '' END`;
}

function clientDimensionDefinition(
  dimension: ClientDimensionKey,
  alias = "",
): { labelExpr: string; fallbackKeyBase: string } {
  if (dimension === "browser") {
    return {
      labelExpr: `TRIM(COALESCE(${alias ? `${alias}.` : ""}browser, ''))`,
      fallbackKeyBase: "browser",
    };
  }
  if (dimension === "operatingSystem") {
    return {
      labelExpr: `TRIM(COALESCE(${alias ? `${alias}.` : ""}os, ''))`,
      fallbackKeyBase: "os",
    };
  }
  if (dimension === "osVersion") {
    return {
      labelExpr: osVersionExpr(alias),
      fallbackKeyBase: "os-version",
    };
  }
  if (dimension === "deviceType") {
    return {
      labelExpr: `TRIM(COALESCE(${alias ? `${alias}.` : ""}device_type, ''))`,
      fallbackKeyBase: "device",
    };
  }
  if (dimension === "language") {
    return {
      labelExpr: `TRIM(COALESCE(${alias ? `${alias}.` : ""}language, ''))`,
      fallbackKeyBase: "language",
    };
  }
  return {
    labelExpr: screenSizeExpr(alias),
    fallbackKeyBase: "screen",
  };
}

function utmDimensionDefinition(
  dimension: UtmDimensionKey,
  alias = "",
): { labelExpr: string; fallbackKeyBase: string } {
  const prefix = alias ? `${alias}.` : "";

  if (dimension === "source") {
    return {
      labelExpr: `TRIM(COALESCE(${prefix}utm_source, ''))`,
      fallbackKeyBase: "utm-source",
    };
  }
  if (dimension === "medium") {
    return {
      labelExpr: `TRIM(COALESCE(${prefix}utm_medium, ''))`,
      fallbackKeyBase: "utm-medium",
    };
  }
  if (dimension === "campaign") {
    return {
      labelExpr: `TRIM(COALESCE(${prefix}utm_campaign, ''))`,
      fallbackKeyBase: "utm-campaign",
    };
  }
  if (dimension === "term") {
    return {
      labelExpr: `TRIM(COALESCE(${prefix}utm_term, ''))`,
      fallbackKeyBase: "utm-term",
    };
  }

  return {
    labelExpr: `TRIM(COALESCE(${prefix}utm_content, ''))`,
    fallbackKeyBase: "utm-content",
  };
}

function referrerDomainDimensionDefinition(alias = ""): {
  labelExpr: string;
  fallbackKeyBase: string;
} {
  const prefix = alias ? `${alias}.` : "";

  return {
    labelExpr: `CASE WHEN TRIM(COALESCE(${prefix}referrer_host, '')) != '' THEN TRIM(COALESCE(${prefix}referrer_host, '')) ELSE '${DIRECT_REFERRER_FILTER_VALUE}' END`,
    fallbackKeyBase: "referrer-domain",
  };
}

function siteQueryHeaders(
  options: SiteQueryResponseOptions,
): Record<string, string> {
  return options.publicSite ? PUBLIC_CACHE_HEADERS : PRIVATE_CACHE_HEADERS;
}

function siteQueryResponse(
  siteId: string,
  payload: Record<string, unknown>,
  options: SiteQueryResponseOptions = {},
): Response {
  const body = options.publicSite
    ? { ...payload, site: options.publicSite, privacy: PUBLIC_PRIVACY }
    : { ...payload, siteId };
  return jsonResponse(body, 200, siteQueryHeaders(options));
}

function parseBooleanFlag(url: URL, key: string): boolean {
  return parseBooleanSearchParam(url, key);
}

function mapOverviewAggregate(
  row: OverviewAggregateRow,
  options?: { approximateVisitors?: boolean },
) {
  return {
    views: row.views,
    sessions: row.sessions,
    visitors: row.visitors,
    bounces: row.bounces,
    totalDurationMs: row.totalDuration,
    avgDurationMs: avgDuration(row.totalDuration, row.sessions),
    bounceRate: bounceRate(row.bounces, row.sessions),
    approximateVisitors: Boolean(options?.approximateVisitors),
  };
}

function emptyOverviewAggregateRow(): OverviewAggregateRow {
  return {
    views: 0,
    sessions: 0,
    visitors: 0,
    bounces: 0,
    totalDuration: 0,
    durationViews: 0,
  };
}

function mapPageCardMetrics(row: OverviewAggregateRow) {
  const overview = mapOverviewAggregate(row);
  return {
    views: overview.views,
    visitors: overview.visitors,
    sessions: overview.sessions,
    bounceRate: overview.bounceRate,
    pagesPerSession:
      overview.sessions > 0 ? overview.views / overview.sessions : 0,
    avgDurationMs: overview.avgDurationMs,
  };
}

function mapTrendRows(
  rows: TrendAggregateRow[],
  source: "detail" | "archive" | "mixed",
) {
  return rows.map((row) => ({
    bucket: row.bucket,
    timestampMs: row.timestampMs,
    views: row.views,
    visitors: row.visitors,
    sessions: row.sessions,
    bounces: row.bounces,
    totalDurationMs: row.totalDuration,
    avgDurationMs: avgDuration(row.totalDuration, row.sessions),
    source,
  }));
}

function mapPages(rows: PageRow[]) {
  return rows.map((row) => ({
    pathname: row.pathname,
    query: row.query,
    hash: row.hash,
    views: row.views,
    sessions: row.sessions,
  }));
}

function mapTabs(rows: DimensionRow[]) {
  return rows.map((row) => ({
    label: row.value,
    views: row.views,
    sessions: row.sessions,
    visitors: row.visitors,
  }));
}

function mapGeoTabs(rows: GeoTabRow[]) {
  return rows.map((row) => ({
    value: row.value,
    label: row.label,
    views: row.views,
    sessions: row.sessions,
    visitors: row.visitors,
  }));
}

function mapReferrers(rows: ReferrerRow[]) {
  return rows.map((row) => ({
    referrer: row.referrer,
    views: row.views,
    sessions: row.sessions,
  }));
}

function mapVisitors(rows: VisitorRow[]) {
  return rows.map((row) => ({
    visitorId: row.visitorId,
    sessionId: row.sessionId ?? "",
    firstSeenAt: row.firstSeenAt,
    lastSeenAt: row.lastSeenAt,
    views: row.views,
    sessions: row.sessions,
    events: row.events ?? 0,
    country: row.country ?? "",
    region: row.region ?? "",
    regionCode: row.regionCode ?? "",
    city: row.city ?? "",
    referrerHost: row.referrerHost ?? "",
    referrerUrl: row.referrerUrl ?? "",
    browser: row.browser ?? "",
    browserVersion: row.browserVersion ?? "",
    os: row.os ?? "",
    osVersion: row.osVersion ?? "",
    deviceType: row.deviceType ?? "",
    screenWidth: row.screenWidth ?? null,
    screenHeight: row.screenHeight ?? null,
  }));
}

function dedupeFilterOptions(
  options: DashboardFilterOption[],
): DashboardFilterOption[] {
  const seen = new Set<string>();
  const deduped: DashboardFilterOption[] = [];
  for (const option of options) {
    const value = String(option.value ?? "").trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    deduped.push({
      value,
      label: String(option.label ?? value).trim() || value,
      ...(option.group ? { group: option.group } : {}),
    });
  }
  return deduped;
}

function mapDimensionRowsToFilterOptions(
  rows: DimensionRow[],
): DashboardFilterOption[] {
  return dedupeFilterOptions(
    rows.map((row) => {
      const value = String(row.value ?? "").trim();
      return {
        value,
        label: value,
      };
    }),
  );
}

function mapReferrerRowsToFilterOptions(
  rows: ReferrerRow[],
): DashboardFilterOption[] {
  return dedupeFilterOptions(
    rows.map((row) => {
      const value = String(row.referrer ?? "").trim();
      if (!value) {
        return {
          value: DIRECT_REFERRER_FILTER_VALUE,
          label: DIRECT_REFERRER_FILTER_VALUE,
        };
      }
      return {
        value,
        label: value,
      };
    }),
  );
}

function mapGeoRowsToFilterOptions(
  rows: DimensionRow[],
  group: "country" | "region" | "city",
): DashboardFilterOption[] {
  return dedupeFilterOptions(
    rows.map((row) => {
      const value = String(row.value ?? "").trim();
      if (!value) {
        return {
          value: "",
          label: "",
          group,
        };
      }
      const parsed = parseGeoFilterValue(value);
      if (group === "country") {
        return {
          value,
          label: parsed?.country || value,
          group,
        };
      }
      if (group === "region") {
        return {
          value,
          label:
            parsed?.regionName ||
            parsed?.regionCode ||
            parsed?.country ||
            value,
          group,
        };
      }
      return {
        value,
        label:
          parsed?.city ||
          parsed?.regionName ||
          parsed?.regionCode ||
          parsed?.country ||
          value,
        group,
      };
    }),
  );
}

interface DimensionAccumulator {
  views: number;
  sessions: Set<string>;
  visitors: Set<string>;
}

interface GeoDimensionAccumulator extends DimensionAccumulator {
  visitors: Set<string>;
}

function addDimensionValue(
  buckets: Map<string, DimensionAccumulator>,
  rawValue: string,
  sessionId: string,
  visitorId?: string,
): void {
  const value = rawValue.trim();
  if (!value) return;
  const bucket = buckets.get(value) ?? {
    views: 0,
    sessions: new Set<string>(),
    visitors: new Set<string>(),
  };
  bucket.views += 1;
  if (sessionId) bucket.sessions.add(sessionId);
  if (visitorId) bucket.visitors.add(visitorId);
  buckets.set(value, bucket);
}

function finalizeDimensionBuckets(
  buckets: Map<string, DimensionAccumulator>,
  limit: number,
): DimensionRow[] {
  return [...buckets.entries()]
    .map(([value, bucket]) => ({
      value,
      views: bucket.views,
      sessions: bucket.sessions.size,
      visitors: bucket.visitors.size,
    }))
    .sort(
      (left, right) =>
        right.views - left.views ||
        right.sessions - left.sessions ||
        left.value.localeCompare(right.value),
    )
    .slice(0, limit);
}

function addGeoDimensionValue(
  buckets: Map<string, GeoDimensionAccumulator>,
  rawValue: string,
  sessionId: string,
  visitorId: string,
): void {
  const value = rawValue.trim();
  if (!value) return;
  const bucket = buckets.get(value) ?? {
    views: 0,
    sessions: new Set<string>(),
    visitors: new Set<string>(),
  };
  bucket.views += 1;
  if (sessionId) bucket.sessions.add(sessionId);
  if (visitorId) bucket.visitors.add(visitorId);
  buckets.set(value, bucket);
}

function finalizeGeoDimensionBuckets(
  buckets: Map<string, GeoDimensionAccumulator>,
  limit: number,
  labelResolver?: (value: string) => string,
): GeoTabRow[] {
  return [...buckets.entries()]
    .map(([value, bucket]) => ({
      value,
      label: labelResolver ? labelResolver(value) : value,
      views: bucket.views,
      sessions: bucket.sessions.size,
      visitors: bucket.visitors.size,
    }))
    .sort(
      (left, right) =>
        right.views - left.views ||
        right.sessions - left.sessions ||
        right.visitors - left.visitors ||
        left.label.localeCompare(right.label),
    )
    .slice(0, limit);
}

function geoTabLabel(value: string, tab: OverviewGeoTabKey): string {
  const parsed = parseGeoFilterValue(value);
  if (tab === "country") {
    return parsed?.country || value;
  }
  if (tab === "region") {
    return parsed?.regionName || parsed?.regionCode || parsed?.country || value;
  }
  if (tab === "city") {
    return (
      parsed?.city ||
      parsed?.regionName ||
      parsed?.regionCode ||
      parsed?.country ||
      value
    );
  }
  return value;
}

async function resolvePrivateSite(
  request: Request,
  env: Env,
  url: URL,
): Promise<SiteRow | Response> {
  const session = await requireSession(request, env);
  if (!session) return unauthorized("Unauthorized", PRIVATE_CACHE_HEADERS);

  const siteId = normalizeFilterValue(url.searchParams.get("siteId"));
  if (!siteId) return badRequest("siteId is required", PRIVATE_CACHE_HEADERS);

  if (session.systemRole === "admin") {
    const site = await env.DB.prepare(
      "SELECT id,name,domain FROM sites WHERE id=? LIMIT 1",
    )
      .bind(siteId)
      .first<SiteRow>();
    return site ?? notFound("Site not found", PRIVATE_CACHE_HEADERS);
  }

  const site = await env.DB.prepare(
    `
      SELECT s.id, s.name, s.domain
      FROM sites s
      INNER JOIN teams t ON t.id = s.team_id
      LEFT JOIN team_members tm ON tm.team_id = s.team_id AND tm.user_id = ?
      WHERE s.id = ? AND (t.owner_user_id = ? OR tm.user_id IS NOT NULL)
      LIMIT 1
    `,
  )
    .bind(session.userId, siteId, session.userId)
    .first<SiteRow>();
  return site ?? notFound("Site not found", PRIVATE_CACHE_HEADERS);
}

async function resolvePrivateTeam(
  request: Request,
  env: Env,
  url: URL,
): Promise<{ id: string } | Response> {
  const session = await requireSession(request, env);
  if (!session) return unauthorized("Unauthorized", PRIVATE_CACHE_HEADERS);

  const teamId = normalizeFilterValue(url.searchParams.get("teamId"));
  if (!teamId) return badRequest("teamId is required", PRIVATE_CACHE_HEADERS);

  if (session.systemRole === "admin") {
    const team = await env.DB.prepare("SELECT id FROM teams WHERE id=? LIMIT 1")
      .bind(teamId)
      .first<{ id: string }>();
    return team ?? notFound("Team not found", PRIVATE_CACHE_HEADERS);
  }

  const team = await env.DB.prepare(
    `
      SELECT t.id
      FROM teams t
      LEFT JOIN team_members tm ON tm.team_id = t.id AND tm.user_id = ?
      WHERE t.id = ? AND (t.owner_user_id = ? OR tm.user_id IS NOT NULL)
      LIMIT 1
    `,
  )
    .bind(session.userId, teamId, session.userId)
    .first<{ id: string }>();
  return team ?? notFound("Team not found", PRIVATE_CACHE_HEADERS);
}

async function fetchPublicSite(
  env: Env,
  url: URL,
): Promise<SiteRow | Response> {
  const segments = url.pathname.split("/").filter(Boolean);
  const slug = decodeURIComponent(segments[2] || "").trim();
  if (!slug) return notFound("Public site not found", PUBLIC_CACHE_HEADERS);

  const site = await env.DB.prepare(
    "SELECT id,name,domain FROM sites WHERE public_enabled=1 AND public_slug=? LIMIT 1",
  )
    .bind(slug)
    .first<SiteRow>();
  return site ?? notFound("Public site not found", PUBLIC_CACHE_HEADERS);
}

function regionValueExpr(): string {
  return "CASE WHEN TRIM(country) = '' AND TRIM(region_code) = '' AND TRIM(region) = '' THEN '' ELSE TRIM(country) || '::' || CASE WHEN TRIM(region_code) != '' THEN TRIM(region_code) ELSE TRIM(region) END || '::' || TRIM(region) END";
}

function cityValueExpr(): string {
  return "CASE WHEN TRIM(country) = '' AND TRIM(region_code) = '' AND TRIM(region) = '' AND TRIM(city) = '' THEN '' ELSE TRIM(country) || '::' || CASE WHEN TRIM(region_code) != '' THEN TRIM(region_code) ELSE TRIM(region) END || '::' || TRIM(region) || '::' || TRIM(city) END";
}

const VISIT_SOURCE_COLUMNS = `
    visit_id, site_id, visitor_id, session_id, status, started_at, last_activity_at,
    ended_at, finalized_at, duration_ms, duration_source, exit_reason,
    pathname, query_string, hash_fragment, hostname, title, referrer_url, referrer_host,
    utm_source, utm_medium, utm_campaign, utm_term, utm_content,
    is_eu, country, region, region_code, city, continent, latitude, longitude,
    postal_code, metro_code, timezone, as_organization, ua_raw, browser, browser_version,
    os, os_version, device_type, screen_width, screen_height, language,
    perf_ttfb_ms, perf_fcp_ms, perf_lcp_ms, perf_cls, perf_inp_ms,
    ae_synced_at
  `;

const CUSTOM_EVENT_SOURCE_COLUMNS = `
  event_id, site_id, visit_id, visitor_id, session_id, occurred_at,
  event_name, event_data_json, pathname, query_string, hash_fragment, hostname,
  title, referrer_url, referrer_host, country, region, city, browser, os,
  os_version, device_type, language, timezone, screen_width, screen_height,
  ae_synced_at
`;

function buildVisitSourceCte(): string {
  return `
visit_source AS (
  SELECT ${VISIT_SOURCE_COLUMNS}
  FROM visits
  WHERE site_id = ? AND started_at BETWEEN ? AND ?
  UNION ALL
  SELECT ${VISIT_SOURCE_COLUMNS}
  FROM visits_archive
  WHERE site_id = ? AND started_at BETWEEN ? AND ?
)`;
}

function buildCustomEventSourceCte(): string {
  return `
event_source AS (
  SELECT ${CUSTOM_EVENT_SOURCE_COLUMNS}
  FROM custom_events
  WHERE site_id = ? AND occurred_at BETWEEN ? AND ?
  UNION ALL
  SELECT ${CUSTOM_EVENT_SOURCE_COLUMNS}
  FROM custom_events_archive
  WHERE site_id = ? AND occurred_at BETWEEN ? AND ?
)`;
}

function buildTargetVisitSourceCte(
  targetColumn: "session_id" | "visitor_id",
): string {
  return `
visit_source AS (
  SELECT ${VISIT_SOURCE_COLUMNS}
  FROM visits
  WHERE site_id = ? AND ${targetColumn} = ?
  UNION ALL
  SELECT ${VISIT_SOURCE_COLUMNS}
  FROM visits_archive
  WHERE site_id = ? AND ${targetColumn} = ?
)`;
}

function buildDetailCustomEventSourceCte(): string {
  return `
event_source AS (
  SELECT
    ce.event_id, ce.site_id, ce.visit_id, fv.visitor_id, fv.session_id,
    ce.occurred_at, ce.event_name, ce.event_data_json,
    fv.pathname, fv.query_string,
    COALESCE(NULLIF(ce.hash_fragment, ''), fv.hash_fragment) AS hash_fragment,
    fv.hostname, fv.title,
    fv.referrer_url, fv.referrer_host, fv.country, fv.region, fv.city,
    fv.browser, fv.browser_version, fv.os, fv.os_version, fv.device_type,
    fv.language, fv.timezone, fv.screen_width, fv.screen_height,
    fv.perf_ttfb_ms, fv.perf_fcp_ms, fv.perf_lcp_ms, fv.perf_cls, fv.perf_inp_ms,
    ce.ae_synced_at
  FROM custom_events ce
  INNER JOIN filtered_visits fv
    ON fv.site_id = ce.site_id AND fv.visit_id = ce.visit_id
  WHERE ce.site_id = ?
  UNION ALL
  SELECT
    ce.event_id, ce.site_id, ce.visit_id, fv.visitor_id, fv.session_id,
    ce.occurred_at, ce.event_name, ce.event_data_json,
    fv.pathname, fv.query_string,
    COALESCE(NULLIF(ce.hash_fragment, ''), fv.hash_fragment) AS hash_fragment,
    fv.hostname, fv.title,
    fv.referrer_url, fv.referrer_host, fv.country, fv.region, fv.city,
    fv.browser, fv.browser_version, fv.os, fv.os_version, fv.device_type,
    fv.language, fv.timezone, fv.screen_width, fv.screen_height,
    fv.perf_ttfb_ms, fv.perf_fcp_ms, fv.perf_lcp_ms, fv.perf_cls, fv.perf_inp_ms,
    ce.ae_synced_at
  FROM custom_events_archive ce
  INNER JOIN filtered_visits fv
    ON fv.site_id = ce.site_id AND fv.visit_id = ce.visit_id
  WHERE ce.site_id = ?
)`;
}

function visitSourceBindings(
  siteId: string,
  window: QueryWindow,
): Array<string | number> {
  return [
    siteId,
    window.fromMs,
    window.toMs,
    siteId,
    window.fromMs,
    window.toMs,
  ];
}

function eventSourceBindings(
  siteId: string,
  window: QueryWindow,
): Array<string | number> {
  return [
    siteId,
    window.fromMs,
    window.toMs,
    siteId,
    window.fromMs,
    window.toMs,
  ];
}

function targetVisitSourceBindings(
  siteId: string,
  targetValue: string,
): Array<string | number> {
  return [siteId, targetValue, siteId, targetValue];
}

function detailCustomEventSourceBindings(
  siteId: string,
): Array<string | number> {
  return [siteId, siteId];
}

function buildVisitSourceCteForSites(siteCount: number): string {
  const placeholders = Array.from({ length: siteCount }, () => "?").join(", ");
  return `
visit_source AS (
  SELECT ${VISIT_SOURCE_COLUMNS}
  FROM visits
  WHERE site_id IN (${placeholders}) AND started_at BETWEEN ? AND ?
  UNION ALL
  SELECT ${VISIT_SOURCE_COLUMNS}
  FROM visits_archive
  WHERE site_id IN (${placeholders}) AND started_at BETWEEN ? AND ?
)`;
}

function visitSourceBindingsForSites(
  siteIds: string[],
  window: QueryWindow,
): Array<string | number> {
  return [
    ...siteIds,
    window.fromMs,
    window.toMs,
    ...siteIds,
    window.fromMs,
    window.toMs,
  ];
}

const DIRECT_REFERRER_FILTER_VALUE = "__direct__";

interface ParsedGeoFilter {
  country: string;
  regionCode?: string;
  regionName?: string;
  city?: string;
}

function parseGeoFilterValue(
  value: string | undefined,
): ParsedGeoFilter | null {
  const parsed = parseGeoLocationValue(value);
  if (!parsed) return null;

  return {
    country: parsed.countryCode,
    ...(parsed.regionCode ? { regionCode: parsed.regionCode } : {}),
    ...(parsed.regionName ? { regionName: parsed.regionName } : {}),
    ...(parsed.level === "locality" && parsed.localityName
      ? { city: parsed.localityName }
      : {}),
  };
}

function withoutGeoFilter(filters: DashboardFilters): DashboardFilters {
  return {
    ...filters,
    geo: undefined,
  };
}

function buildVisitFilterSql(
  filters: DashboardFilters,
  alias = "",
): { clause: string; bindings: string[] } {
  const prefix = alias ? `${alias}.` : "";
  const clauses: string[] = [];
  const bindings: string[] = [];

  const equalsTrimmed = (column: string, value: string) => {
    clauses.push(`TRIM(COALESCE(${column}, '')) = ?`);
    bindings.push(value);
  };
  const equalsCaseInsensitive = (column: string, value: string) => {
    clauses.push(`LOWER(TRIM(COALESCE(${column}, ''))) = ?`);
    bindings.push(value.toLowerCase());
  };

  if (filters.country) {
    equalsCaseInsensitive(`${prefix}country`, filters.country);
  }
  if (filters.device) {
    equalsTrimmed(`${prefix}device_type`, filters.device);
  }
  if (filters.browser) {
    equalsTrimmed(`${prefix}browser`, filters.browser);
  }
  if (filters.path) {
    equalsTrimmed(`${prefix}pathname`, filters.path);
  }
  if (filters.query) {
    equalsTrimmed(`${prefix}query_string`, filters.query);
  }
  if (filters.title) {
    equalsTrimmed(`${prefix}title`, filters.title);
  }
  if (filters.hostname) {
    equalsCaseInsensitive(`${prefix}hostname`, filters.hostname);
  }
  if (filters.entry) {
    clauses.push(`TRIM(COALESCE(${prefix}session_id, '')) != ''`);
    clauses.push(
      `COALESCE((SELECT edge.pathname FROM visit_source edge WHERE edge.session_id = ${prefix}session_id ORDER BY edge.started_at ASC, edge.visit_id ASC LIMIT 1), '') = ?`,
    );
    bindings.push(filters.entry);
  }
  if (filters.exit) {
    clauses.push(`TRIM(COALESCE(${prefix}session_id, '')) != ''`);
    clauses.push(
      `COALESCE((SELECT edge.pathname FROM visit_source edge WHERE edge.session_id = ${prefix}session_id ORDER BY edge.started_at DESC, edge.visit_id DESC LIMIT 1), '') = ?`,
    );
    bindings.push(filters.exit);
  }
  if (filters.sourceDomain) {
    if (filters.sourceDomain === DIRECT_REFERRER_FILTER_VALUE) {
      clauses.push(`TRIM(COALESCE(${prefix}referrer_host, '')) = ''`);
    } else {
      equalsCaseInsensitive(`${prefix}referrer_host`, filters.sourceDomain);
    }
  }
  if (filters.sourceLink) {
    if (filters.sourceLink === DIRECT_REFERRER_FILTER_VALUE) {
      clauses.push(`TRIM(COALESCE(${prefix}referrer_url, '')) = ''`);
    } else {
      equalsCaseInsensitive(`${prefix}referrer_url`, filters.sourceLink);
    }
  }
  if (filters.clientBrowser) {
    equalsTrimmed(`${prefix}browser`, filters.clientBrowser);
  }
  if (filters.clientOsVersion) {
    equalsTrimmed(osVersionExpr(alias), filters.clientOsVersion);
  }
  if (filters.clientDeviceType) {
    equalsTrimmed(`${prefix}device_type`, filters.clientDeviceType);
  }
  if (filters.clientLanguage) {
    equalsTrimmed(`${prefix}language`, filters.clientLanguage);
  }
  if (filters.clientScreenSize) {
    equalsTrimmed(screenSizeExpr(alias), filters.clientScreenSize);
  }
  if (filters.geoContinent) {
    equalsTrimmed(`${prefix}continent`, filters.geoContinent);
  }
  if (filters.geoTimezone) {
    equalsTrimmed(`${prefix}timezone`, filters.geoTimezone);
  }
  if (filters.geoOrganization) {
    equalsTrimmed(`${prefix}as_organization`, filters.geoOrganization);
  }

  const parsedGeo = parseGeoFilterValue(filters.geo);
  if (parsedGeo?.country) {
    equalsCaseInsensitive(`${prefix}country`, parsedGeo.country);
  }
  if (parsedGeo?.regionCode || parsedGeo?.regionName) {
    const geoRegionTokens = Array.from(
      new Set(
        [parsedGeo.regionCode, parsedGeo.regionName]
          .map((value) =>
            String(value ?? "")
              .trim()
              .toUpperCase(),
          )
          .filter((value) => value.length > 0),
      ),
    );
    if (geoRegionTokens.length > 0) {
      clauses.push(
        `UPPER(TRIM(CASE WHEN TRIM(COALESCE(${prefix}region_code, '')) != '' THEN ${prefix}region_code ELSE ${prefix}region END)) IN (${geoRegionTokens.map(() => "?").join(", ")})`,
      );
      bindings.push(...geoRegionTokens);
    }
  }
  if (parsedGeo?.city) {
    equalsCaseInsensitive(`${prefix}city`, parsedGeo.city);
  }

  return clauses.length > 0
    ? { clause: `WHERE ${clauses.join(" AND ")}`, bindings }
    : { clause: "", bindings: [] };
}

async function queryD1All<T extends Record<string, unknown>>(
  env: Env,
  sql: string,
  bindings: Array<string | number | null>,
): Promise<T[]> {
  const result = await env.DB.prepare(sql)
    .bind(...bindings)
    .all<T>();
  return result.results;
}

function performanceMetricColumn(metric: PerformanceMetricKey): string {
  return PERFORMANCE_METRIC_COLUMNS[metric];
}

function roundPerformanceValue(value: unknown): number | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.round(numeric * 1000) / 1000;
}

function nullablePerformanceValue(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return Math.round(numeric * 1000) / 1000;
}

function emptyVisitPerformanceMetrics(): VisitPerformanceMetricsRow {
  return {
    ttfb: null,
    fcp: null,
    lcp: null,
    cls: null,
    inp: null,
  };
}

function mapVisitPerformanceMetrics(
  row: Record<string, unknown>,
): VisitPerformanceMetricsRow {
  return {
    ttfb: nullablePerformanceValue(row.perfTtfbMs),
    fcp: nullablePerformanceValue(row.perfFcpMs),
    lcp: nullablePerformanceValue(row.perfLcpMs),
    cls: nullablePerformanceValue(row.perfCls),
    inp: nullablePerformanceValue(row.perfInpMs),
  };
}

function emptyPerformanceRouteMetric(): PerformanceRouteMetricRow {
  return {
    avg: null,
    p50: null,
    p75: null,
    p95: null,
    samples: 0,
  };
}

function emptyPerformanceRouteMetrics(): Record<
  PerformanceMetricKey,
  PerformanceRouteMetricRow
> {
  return {
    ttfb: emptyPerformanceRouteMetric(),
    fcp: emptyPerformanceRouteMetric(),
    lcp: emptyPerformanceRouteMetric(),
    cls: emptyPerformanceRouteMetric(),
    inp: emptyPerformanceRouteMetric(),
  };
}

async function queryPerformanceSummariesFromD1(
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

async function queryPerformanceTrendFromD1(
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

async function queryPerformanceRoutesFromD1(
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

async function queryPerformanceCountriesFromD1(
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

async function queryOverviewFromD1(
  env: Env,
  siteId: string,
  window: QueryWindow,
  filters: DashboardFilters,
): Promise<OverviewAggregateRow> {
  const filter = buildVisitFilterSql(filters);
  const sql = `
WITH
${buildVisitSourceCte()},
filtered_visits AS (
  SELECT *
  FROM visit_source
  ${filter.clause}
),
session_rollup AS (
  SELECT session_id, count(*) AS visit_count
  FROM filtered_visits
  WHERE session_id != ''
  GROUP BY session_id
)
SELECT
  count(*) AS views,
  count(DISTINCT CASE WHEN session_id != '' THEN session_id ELSE NULL END) AS sessions,
  count(DISTINCT CASE WHEN visitor_id != '' THEN visitor_id ELSE NULL END) AS visitors,
  COALESCE((SELECT count(*) FROM session_rollup WHERE visit_count = 1), 0) AS bounces,
  COALESCE(sum(CASE WHEN duration_ms IS NOT NULL AND duration_ms >= 0 THEN duration_ms ELSE 0 END), 0) AS totalDuration,
  COALESCE(sum(CASE WHEN duration_ms IS NOT NULL AND duration_ms >= 0 THEN 1 ELSE 0 END), 0) AS durationViews
FROM filtered_visits
`;
  const row =
    (
      await queryD1All<Record<string, unknown>>(env, sql, [
        ...visitSourceBindings(siteId, window),
        ...filter.bindings,
      ])
    )[0] ?? {};
  return {
    views: Number(row.views ?? 0),
    sessions: Number(row.sessions ?? 0),
    visitors: Number(row.visitors ?? 0),
    bounces: Number(row.bounces ?? 0),
    totalDuration: Number(row.totalDuration ?? 0),
    durationViews: Number(row.durationViews ?? 0),
  };
}

async function queryTrendFromD1(
  env: Env,
  siteId: string,
  window: QueryWindow,
  interval: Interval,
  filters: DashboardFilters,
): Promise<TrendAggregateRow[]> {
  const filter = buildVisitFilterSql(filters);
  const buckets = buildTimeBuckets(window, interval);
  const visitBucket = timeBucketCase(buckets, "started_at");
  const sessionBucket = timeBucketCase(buckets, "session_started_at");
  const sql = `
WITH
${buildVisitSourceCte()},
filtered_visits AS (
  SELECT *
  FROM visit_source
  ${filter.clause}
),
visit_bucket_rollup AS (
  SELECT
    ${visitBucket.sql} AS bucket,
    count(*) AS views,
    count(DISTINCT CASE WHEN visitor_id != '' THEN visitor_id ELSE NULL END) AS visitors,
    COALESCE(sum(CASE WHEN duration_ms IS NOT NULL AND duration_ms >= 0 THEN duration_ms ELSE 0 END), 0) AS totalDuration,
    COALESCE(sum(CASE WHEN duration_ms IS NOT NULL AND duration_ms >= 0 THEN 1 ELSE 0 END), 0) AS durationViews
  FROM filtered_visits
  GROUP BY bucket
),
session_rollup AS (
  SELECT
    session_id,
    MIN(started_at) AS session_started_at,
    count(*) AS visit_count
  FROM filtered_visits
  WHERE session_id != ''
  GROUP BY session_id
),
session_bucket_rollup AS (
  SELECT
    ${sessionBucket.sql} AS bucket,
    count(*) AS sessions,
    COALESCE(sum(CASE WHEN visit_count = 1 THEN 1 ELSE 0 END), 0) AS bounces
  FROM session_rollup
  GROUP BY bucket
),
combined AS (
  SELECT bucket, views, visitors, 0 AS sessions, 0 AS bounces, totalDuration, durationViews FROM visit_bucket_rollup
  UNION ALL
  SELECT bucket, 0 AS views, 0 AS visitors, sessions, bounces, 0 AS totalDuration, 0 AS durationViews FROM session_bucket_rollup
)
SELECT
  bucket,
  sum(views) AS views,
  sum(visitors) AS visitors,
  sum(sessions) AS sessions,
  sum(bounces) AS bounces,
  sum(totalDuration) AS totalDuration,
  sum(durationViews) AS durationViews
FROM combined
GROUP BY bucket
ORDER BY bucket ASC
`;
  return (
    await queryD1All<Record<string, unknown>>(env, sql, [
      ...visitSourceBindings(siteId, window),
      ...filter.bindings,
      ...visitBucket.bindings,
      ...sessionBucket.bindings,
    ])
  ).map((row) => ({
    bucket: Number(row.bucket ?? 0),
    timestampMs: timeBucketTimestamp(buckets, Number(row.bucket ?? 0)),
    views: Number(row.views ?? 0),
    visitors: Number(row.visitors ?? 0),
    sessions: Number(row.sessions ?? 0),
    bounces: Number(row.bounces ?? 0),
    totalDuration: Number(row.totalDuration ?? 0),
    durationViews: Number(row.durationViews ?? 0),
  }));
}

async function queryBrowserTrendFromD1(
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

async function queryBrowserEngineTrendFromD1(
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

async function queryBrowserVersionBreakdownFromD1(
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

async function queryBrowserCrossDimensionFromD1(
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

async function queryBrowserCrossBreakdownFromD1(
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

async function queryShareTrendFromD1(
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

async function queryClientDimensionTrendFromD1(
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

async function queryUtmDimensionTrendFromD1(
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

async function queryReferrerTrendFromD1(
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

async function queryClientCrossDimensionFromD1(
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

async function queryTeamOverviewFromD1(
  env: Env,
  siteIds: string[],
  window: QueryWindow,
): Promise<Map<string, OverviewAggregateRow>> {
  if (siteIds.length === 0) return new Map();
  const sql = `
WITH
${buildVisitSourceCteForSites(siteIds.length)},
session_rollup AS (
  SELECT site_id AS siteId, session_id, count(*) AS visit_count
  FROM visit_source
  WHERE session_id != ''
  GROUP BY siteId, session_id
),
combined AS (
  SELECT
    site_id AS siteId,
    count(*) AS views,
    count(DISTINCT CASE WHEN session_id != '' THEN session_id ELSE NULL END) AS sessions,
    count(DISTINCT CASE WHEN visitor_id != '' THEN visitor_id ELSE NULL END) AS visitors,
    0 AS bounces,
    COALESCE(sum(CASE WHEN duration_ms IS NOT NULL AND duration_ms >= 0 THEN duration_ms ELSE 0 END), 0) AS totalDuration,
    COALESCE(sum(CASE WHEN duration_ms IS NOT NULL AND duration_ms >= 0 THEN 1 ELSE 0 END), 0) AS durationViews
  FROM visit_source
  GROUP BY siteId
  UNION ALL
  SELECT
    siteId,
    0 AS views,
    0 AS sessions,
    0 AS visitors,
    COALESCE(sum(CASE WHEN visit_count = 1 THEN 1 ELSE 0 END), 0) AS bounces,
    0 AS totalDuration,
    0 AS durationViews
  FROM session_rollup
  GROUP BY siteId
)
SELECT
  siteId,
  sum(views) AS views,
  sum(sessions) AS sessions,
  sum(visitors) AS visitors,
  sum(bounces) AS bounces,
  sum(totalDuration) AS totalDuration,
  sum(durationViews) AS durationViews
FROM combined
GROUP BY siteId
`;
  const rows = await queryD1All<Record<string, unknown>>(
    env,
    sql,
    visitSourceBindingsForSites(siteIds, window),
  );
  return new Map(
    rows.map((row) => [
      String(row.siteId ?? ""),
      {
        views: Number(row.views ?? 0),
        sessions: Number(row.sessions ?? 0),
        visitors: Number(row.visitors ?? 0),
        bounces: Number(row.bounces ?? 0),
        totalDuration: Number(row.totalDuration ?? 0),
        durationViews: Number(row.durationViews ?? 0),
      } satisfies OverviewAggregateRow,
    ]),
  );
}

interface TeamTrendRow {
  siteId: string;
  bucket: number;
  timestampMs: number;
  views: number;
  visitors: number;
}

async function queryTeamTrendFromD1(
  env: Env,
  siteIds: string[],
  window: QueryWindow,
  interval: Interval,
): Promise<TeamTrendRow[]> {
  if (siteIds.length === 0) return [];
  const buckets = buildTimeBuckets(window, interval);
  const bucket = timeBucketCase(buckets, "started_at");
  const sql = `
WITH
${buildVisitSourceCteForSites(siteIds.length)}
SELECT
  site_id AS siteId,
  ${bucket.sql} AS bucket,
  count(*) AS views,
  count(DISTINCT CASE WHEN visitor_id != '' THEN visitor_id ELSE NULL END) AS visitors
FROM visit_source
GROUP BY siteId, bucket
ORDER BY bucket ASC, siteId ASC
`;
  return (
    await queryD1All<Record<string, unknown>>(env, sql, [
      ...visitSourceBindingsForSites(siteIds, window),
      ...bucket.bindings,
    ])
  ).map((row) => ({
    siteId: String(row.siteId ?? ""),
    bucket: Number(row.bucket ?? 0),
    timestampMs: timeBucketTimestamp(buckets, Number(row.bucket ?? 0)),
    views: Number(row.views ?? 0),
    visitors: Number(row.visitors ?? 0),
  }));
}

async function queryTopPagesFromD1(
  env: Env,
  siteId: string,
  window: QueryWindow,
  limit: number,
  includeDetails: boolean,
  filters: DashboardFilters,
): Promise<PageRow[]> {
  const filter = buildVisitFilterSql(filters);
  const queryExpr = includeDetails ? "query_string" : "''";
  const hashExpr = includeDetails ? "hash_fragment" : "''";
  const sql = `
WITH
${buildVisitSourceCte()},
filtered_visits AS (
  SELECT *
  FROM visit_source
  ${filter.clause}
)
SELECT
  pathname,
  ${queryExpr} AS queryValue,
  ${hashExpr} AS hashValue,
  count(*) AS views,
  count(DISTINCT CASE WHEN session_id != '' THEN session_id ELSE NULL END) AS sessions
FROM filtered_visits
GROUP BY pathname, queryValue, hashValue
ORDER BY views DESC, pathname ASC
LIMIT ?
`;
  return (
    await queryD1All<Record<string, unknown>>(env, sql, [
      ...visitSourceBindings(siteId, window),
      ...filter.bindings,
      limit,
    ])
  ).map((row) => ({
    pathname: String(row.pathname ?? ""),
    query: String(row.queryValue ?? ""),
    hash: String(row.hashValue ?? ""),
    views: Number(row.views ?? 0),
    sessions: Number(row.sessions ?? 0),
  }));
}

async function queryPagesFromD1(
  env: Env,
  siteId: string,
  window: QueryWindow,
  filters: DashboardFilters,
  limit: number,
  includeDetails: boolean,
): Promise<PageRow[]> {
  return queryTopPagesFromD1(
    env,
    siteId,
    window,
    limit,
    includeDetails,
    filters,
  );
}
async function queryOverviewAggregate(
  env: Env,
  siteId: string,
  window: QueryWindow,
  filters: DashboardFilters,
): Promise<PreferredSourceResult<OverviewAggregateRow>> {
  return {
    value: await queryOverviewFromD1(env, siteId, window, filters),
    source: "d1",
    approximateVisitors: false,
  };
}

async function queryTrendAggregate(
  env: Env,
  siteId: string,
  window: QueryWindow,
  interval: Interval,
  filters: DashboardFilters,
): Promise<PreferredSourceResult<TrendAggregateRow[]>> {
  return {
    value: await queryTrendFromD1(env, siteId, window, interval, filters),
    source: "d1",
  };
}

async function queryPagesAggregate(
  env: Env,
  siteId: string,
  window: QueryWindow,
  filters: DashboardFilters,
  limit: number,
  includeDetails: boolean,
): Promise<PageRow[]> {
  return queryPagesFromD1(env, siteId, window, filters, limit, includeDetails);
}

async function queryPageTabsAggregate(
  env: Env,
  siteId: string,
  window: QueryWindow,
  filters: DashboardFilters,
  limit: number,
): Promise<{
  path: DimensionRow[];
  title: DimensionRow[];
  hostname: DimensionRow[];
  entry: DimensionRow[];
  exit: DimensionRow[];
}> {
  return queryPageTabsFromD1(env, siteId, window, filters, limit);
}

async function queryPageCardMetricsFromD1(
  env: Env,
  siteId: string,
  window: QueryWindow,
  filters: DashboardFilters,
  options?: {
    pathnames?: string[];
    limit?: number;
    offset?: number;
  },
): Promise<PageCardAggregateRow[]> {
  const filter = buildVisitFilterSql(filters);
  const requestedPathnames = Array.from(
    new Set(
      (options?.pathnames ?? [])
        .map((pathname) => String(pathname ?? "").trim())
        .filter((pathname) => pathname.length > 0),
    ),
  );
  const pathnameCondition =
    requestedPathnames.length > 0
      ? `TRIM(COALESCE(pathname, '')) IN (${requestedPathnames.map(() => "?").join(", ")})`
      : "";
  const filteredClause = appendSqlConditions(filter.clause, [
    `TRIM(COALESCE(pathname, '')) != ''`,
    pathnameCondition,
  ]);
  const hasLimit = typeof options?.limit === "number";
  const sql = `
WITH
${buildVisitSourceCte()},
filtered_visits AS (
  SELECT
    pathname,
    session_id AS sessionId,
    visitor_id AS visitorId,
    duration_ms AS durationMs
  FROM visit_source
  ${filteredClause}
),
path_rollup AS (
  SELECT
    pathname,
    count(*) AS views,
    count(DISTINCT CASE WHEN sessionId != '' THEN sessionId ELSE NULL END) AS sessions,
    count(DISTINCT CASE WHEN visitorId != '' THEN visitorId ELSE NULL END) AS visitors,
    COALESCE(sum(CASE WHEN durationMs IS NOT NULL AND durationMs >= 0 THEN durationMs ELSE 0 END), 0) AS totalDuration
  FROM filtered_visits
  GROUP BY pathname
),
path_session_rollup AS (
  SELECT
    pathname,
    sessionId,
    count(*) AS visitCount
  FROM filtered_visits
  WHERE sessionId != ''
  GROUP BY pathname, sessionId
),
path_bounce_rollup AS (
  SELECT
    pathname,
    count(*) AS bounces
  FROM path_session_rollup
  WHERE visitCount = 1
  GROUP BY pathname
)
SELECT
  pr.pathname AS pathname,
  pr.views AS views,
  pr.sessions AS sessions,
  pr.visitors AS visitors,
  COALESCE(pb.bounces, 0) AS bounces,
  pr.totalDuration AS totalDuration,
  0 AS durationViews
FROM path_rollup pr
LEFT JOIN path_bounce_rollup pb ON pb.pathname = pr.pathname
ORDER BY pr.views DESC, pr.sessions DESC, pr.pathname ASC
${hasLimit ? "LIMIT ? OFFSET ?" : ""}
`;
  return (
    await queryD1All<Record<string, unknown>>(env, sql, [
      ...visitSourceBindings(siteId, window),
      ...filter.bindings,
      ...requestedPathnames,
      ...(hasLimit
        ? [options?.limit ?? 0, Math.max(0, options?.offset ?? 0)]
        : []),
    ])
  ).map((row) => ({
    pathname: String(row.pathname ?? ""),
    views: Number(row.views ?? 0),
    sessions: Number(row.sessions ?? 0),
    visitors: Number(row.visitors ?? 0),
    bounces: Number(row.bounces ?? 0),
    totalDuration: Number(row.totalDuration ?? 0),
    durationViews: Number(row.durationViews ?? 0),
  }));
}

async function queryPageCardTitlesFromD1(
  env: Env,
  siteId: string,
  window: QueryWindow,
  filters: DashboardFilters,
  pathnames: string[],
  titleLimit: number,
): Promise<PageCardTitleRow[]> {
  const requestedPathnames = Array.from(
    new Set(
      pathnames
        .map((pathname) => String(pathname ?? "").trim())
        .filter((pathname) => pathname.length > 0),
    ),
  );
  if (requestedPathnames.length === 0) return [];

  const filter = buildVisitFilterSql(filters);
  const filteredClause = appendSqlConditions(filter.clause, [
    `TRIM(COALESCE(pathname, '')) IN (${requestedPathnames.map(() => "?").join(", ")})`,
  ]);
  const sql = `
WITH
${buildVisitSourceCte()},
filtered_visits AS (
  SELECT pathname, title
  FROM visit_source
  ${filteredClause}
),
title_rollup AS (
  SELECT
    pathname,
    TRIM(COALESCE(title, '')) AS title,
    count(*) AS views
  FROM filtered_visits
  WHERE TRIM(COALESCE(title, '')) != ''
  GROUP BY pathname, TRIM(COALESCE(title, ''))
),
ranked_titles AS (
  SELECT
    pathname,
    title,
    views,
    ROW_NUMBER() OVER (PARTITION BY pathname ORDER BY views DESC, title ASC) AS titleRank
  FROM title_rollup
)
SELECT
  pathname,
  title,
  views
FROM ranked_titles
WHERE titleRank <= ?
ORDER BY pathname ASC, titleRank ASC
`;
  return (
    await queryD1All<Record<string, unknown>>(env, sql, [
      ...visitSourceBindings(siteId, window),
      ...filter.bindings,
      ...requestedPathnames,
      titleLimit,
    ])
  ).map((row) => ({
    pathname: String(row.pathname ?? ""),
    title: String(row.title ?? ""),
    views: Number(row.views ?? 0),
  }));
}

async function queryPageCardTrendFromD1(
  env: Env,
  siteId: string,
  window: QueryWindow,
  interval: Interval,
  filters: DashboardFilters,
  pathnames: string[],
): Promise<PageCardTrendRow[]> {
  const requestedPathnames = Array.from(
    new Set(
      pathnames
        .map((pathname) => String(pathname ?? "").trim())
        .filter((pathname) => pathname.length > 0),
    ),
  );
  if (requestedPathnames.length === 0) return [];

  const filter = buildVisitFilterSql(filters);
  const buckets = buildTimeBuckets(window, interval);
  const bucket = timeBucketCase(buckets, "startedAt");
  const filteredClause = appendSqlConditions(filter.clause, [
    `TRIM(COALESCE(pathname, '')) IN (${requestedPathnames.map(() => "?").join(", ")})`,
  ]);
  const sql = `
WITH
${buildVisitSourceCte()},
filtered_visits AS (
  SELECT
    pathname,
    started_at AS startedAt,
    visitor_id AS visitorId
  FROM visit_source
  ${filteredClause}
)
SELECT
  pathname,
  ${bucket.sql} AS bucket,
  count(*) AS views,
  count(DISTINCT CASE WHEN visitorId != '' THEN visitorId ELSE NULL END) AS visitors
FROM filtered_visits
GROUP BY pathname, bucket
ORDER BY pathname ASC, bucket ASC
`;
  return (
    await queryD1All<Record<string, unknown>>(env, sql, [
      ...visitSourceBindings(siteId, window),
      ...filter.bindings,
      ...requestedPathnames,
      ...bucket.bindings,
    ])
  ).map((row) => ({
    pathname: String(row.pathname ?? ""),
    bucket: Number(row.bucket ?? 0),
    timestampMs: timeBucketTimestamp(buckets, Number(row.bucket ?? 0)),
    views: Number(row.views ?? 0),
    visitors: Number(row.visitors ?? 0),
  }));
}

async function queryReferrerAggregate(
  env: Env,
  siteId: string,
  window: QueryWindow,
  filters: DashboardFilters,
  limit: number,
  includeFullUrl: boolean,
): Promise<ReferrerRow[]> {
  return queryReferrersFromD1(
    env,
    siteId,
    window,
    filters,
    limit,
    includeFullUrl,
  );
}

async function queryVisitorAggregate(
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

async function queryGeoPointAggregate(
  env: Env,
  siteId: string,
  window: QueryWindow,
  filters: DashboardFilters,
  limit: number,
): Promise<GeoPointAggregate> {
  return queryGeoPointsFromD1(env, siteId, window, filters, limit);
}

async function queryDimensionAggregate(
  env: Env,
  siteId: string,
  window: QueryWindow,
  filters: DashboardFilters,
  limit: number,
  d1Expr: string,
): Promise<DimensionRow[]> {
  return queryVisitDimensionFromD1(env, siteId, window, filters, limit, d1Expr);
}

async function queryEventTypeAggregate(
  env: Env,
  siteId: string,
  window: QueryWindow,
  filters: DashboardFilters,
  limit: number,
): Promise<DimensionRow[]> {
  return queryCustomEventNamesFromD1(env, siteId, window, filters, limit);
}

async function buildOverviewClientDimensionTabs(
  env: Env,
  siteId: string,
  window: QueryWindow,
  filters: DashboardFilters,
  limit: number,
) {
  return queryOverviewClientDimensionsFromD1(
    env,
    siteId,
    window,
    filters,
    limit,
  );
}

async function buildOverviewGeoDimensionTabs(
  env: Env,
  siteId: string,
  window: QueryWindow,
  filters: DashboardFilters,
  limit: number,
) {
  return queryOverviewGeoDimensionsFromD1(env, siteId, window, filters, limit);
}
async function handleOverview(
  env: Env,
  siteId: string,
  url: URL,
): Promise<Response> {
  const window = parseWindow(url);
  if (!window) return badRequest("Invalid time window");
  const filters = parseFilters(url);
  const includeChange = parseBooleanFlag(url, "includeChange");
  const includeDetail = parseBooleanFlag(url, "includeDetail");
  const interval = parseInterval(url);

  const current = await queryOverviewAggregate(env, siteId, window, filters);
  const currentMetrics = mapOverviewAggregate(current.value, {
    approximateVisitors: Boolean(current.approximateVisitors),
  });
  const payload: Record<string, unknown> = {
    ok: true,
    data: currentMetrics,
  };

  if (includeChange) {
    const previousTo = Math.max(window.fromMs - 1, 0);
    const previousFrom = Math.max(
      previousTo - (window.toMs - window.fromMs),
      0,
    );
    const previousWindow: QueryWindow = {
      fromMs: previousFrom,
      toMs: previousTo,
      nowMs: window.nowMs,
      timeZone: window.timeZone,
    };
    const previous = await queryOverviewAggregate(
      env,
      siteId,
      previousWindow,
      filters,
    );
    const previousMetrics = mapOverviewAggregate(previous.value, {
      approximateVisitors: Boolean(previous.approximateVisitors),
    });
    payload.previousData = previousMetrics;
    payload.changeRates = {
      views: percentChange(currentMetrics.views, previousMetrics.views),
      sessions: percentChange(
        currentMetrics.sessions,
        previousMetrics.sessions,
      ),
      visitors: percentChange(
        currentMetrics.visitors,
        previousMetrics.visitors,
      ),
      bounces: percentChange(currentMetrics.bounces, previousMetrics.bounces),
      bounceRate: percentChange(
        currentMetrics.bounceRate,
        previousMetrics.bounceRate,
      ),
      avgDurationMs: percentChange(
        currentMetrics.avgDurationMs,
        previousMetrics.avgDurationMs,
      ),
    };
  }

  if (includeDetail) {
    const detail = await queryTrendAggregate(
      env,
      siteId,
      window,
      interval,
      filters,
    );
    payload.detail = {
      interval,
      data: mapTrendRows(
        detail.value,
        detail.source === "ae" ? "detail" : sourceLabel(window),
      ),
    };
  }

  return jsonResponse(payload);
}

async function handleTrend(
  env: Env,
  siteId: string,
  url: URL,
): Promise<Response> {
  const window = parseWindow(url);
  if (!window) return badRequest("Invalid time window");
  const filters = parseFilters(url);
  const interval = parseInterval(url);
  const trend = await queryTrendAggregate(
    env,
    siteId,
    window,
    interval,
    filters,
  );
  return jsonResponse({
    ok: true,
    interval,
    data: mapTrendRows(
      trend.value,
      trend.source === "ae" ? "detail" : sourceLabel(window),
    ),
  });
}

async function handlePerformance(
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

async function handleBrowserTrend(
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

async function handleBrowserEngineTrend(
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

async function handleBrowserVersionBreakdown(
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

async function handleBrowserCrossBreakdown(
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

async function queryBrowserRadarFromD1(
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

async function handleBrowserRadar(
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

async function queryReferrerRadarFromD1(
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

async function handleReferrerRadar(
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

async function handleClientDimensionTrend(
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

async function handleUtmDimensionTrend(
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

async function handleReferrerDimensionTrend(
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

async function handleClientCrossBreakdown(
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

async function handlePages(
  env: Env,
  siteId: string,
  url: URL,
  includeTabs: boolean,
): Promise<Response> {
  const window = parseWindow(url);
  if (!window) return badRequest("Invalid time window");
  const filters = parseFilters(url);
  const limit = parseLimit(url, 20, 200);
  const includeDetails = parseBooleanFlag(url, "details");
  const pages = await queryPagesAggregate(
    env,
    siteId,
    window,
    filters,
    limit,
    includeDetails,
  );
  const payload: Record<string, unknown> = {
    ok: true,
    data: mapPages(pages),
  };
  if (includeTabs) {
    const tabs = await queryPageTabsAggregate(
      env,
      siteId,
      window,
      filters,
      limit,
    );
    payload.tabs = {
      path: mapTabs(tabs.path),
      title: mapTabs(tabs.title),
      hostname: mapTabs(tabs.hostname),
      entry: mapTabs(tabs.entry),
      exit: mapTabs(tabs.exit),
    };
  }
  return jsonResponse(payload);
}

async function handlePagesDashboard(
  env: Env,
  siteId: string,
  url: URL,
): Promise<Response> {
  const window = parseWindow(url);
  if (!window) return badRequest("Invalid time window");

  const filters = parseFilters(url);
  const interval = parseInterval(url);
  const page = parseQueryLimit(url, "page", 1, 1, 10_000);
  const pageSize = parseQueryLimit(url, "pageSize", 12, 1, 24);
  const offset = (page - 1) * pageSize;
  const requestedRows = await queryPageCardMetricsFromD1(
    env,
    siteId,
    window,
    filters,
    {
      limit: pageSize + 1,
      offset,
    },
  );
  const hasMore = requestedRows.length > pageSize;
  const currentRows = hasMore
    ? requestedRows.slice(0, pageSize)
    : requestedRows;
  if (currentRows.length === 0) {
    return jsonResponse({
      ok: true,
      interval,
      data: [],
      meta: {
        page,
        pageSize,
        returned: 0,
        hasMore: false,
        nextPage: null,
      },
    });
  }

  const pathnames = currentRows.map((row) => row.pathname);
  const previousTo = Math.max(window.fromMs - 1, 0);
  const previousFrom = Math.max(previousTo - (window.toMs - window.fromMs), 0);
  const previousWindow: QueryWindow = {
    fromMs: previousFrom,
    toMs: previousTo,
    nowMs: window.nowMs,
    timeZone: window.timeZone,
  };

  const [previousRows, titleRows, trendRows] = await Promise.all([
    queryPageCardMetricsFromD1(env, siteId, previousWindow, filters, {
      pathnames,
    }),
    queryPageCardTitlesFromD1(env, siteId, window, filters, pathnames, 3),
    queryPageCardTrendFromD1(env, siteId, window, interval, filters, pathnames),
  ]);

  const previousByPath = new Map<string, PageCardAggregateRow>();
  for (const row of previousRows) {
    previousByPath.set(row.pathname, row);
  }

  const titlesByPath = new Map<string, string[]>();
  for (const row of titleRows) {
    const titles = titlesByPath.get(row.pathname) ?? [];
    if (titles.length >= 3) continue;
    const title = row.title.trim();
    if (!title || titles.includes(title)) continue;
    titles.push(title);
    titlesByPath.set(row.pathname, titles);
  }

  const trendByPath = new Map<
    string,
    Array<{
      timestampMs: number;
      views: number;
      visitors: number;
    }>
  >();
  for (const row of trendRows) {
    const trend = trendByPath.get(row.pathname) ?? [];
    trend.push({
      timestampMs: row.timestampMs,
      views: row.views,
      visitors: row.visitors,
    });
    trendByPath.set(row.pathname, trend);
  }

  return jsonResponse({
    ok: true,
    interval,
    data: currentRows.map((row) => {
      const previousRow =
        previousByPath.get(row.pathname) ?? emptyOverviewAggregateRow();
      const metrics = mapPageCardMetrics(row);
      const previousMetrics = mapPageCardMetrics(previousRow);
      return {
        pathname: normalizePathname(row.pathname),
        titles: titlesByPath.get(row.pathname) ?? [],
        trend: trendByPath.get(row.pathname) ?? [],
        metrics,
        changeRates: {
          views: percentChange(metrics.views, previousMetrics.views),
          visitors: percentChange(metrics.visitors, previousMetrics.visitors),
          sessions: percentChange(metrics.sessions, previousMetrics.sessions),
          bounceRate: percentChange(
            metrics.bounceRate,
            previousMetrics.bounceRate,
          ),
          pagesPerSession: percentChange(
            metrics.pagesPerSession,
            previousMetrics.pagesPerSession,
          ),
          avgDurationMs: percentChange(
            metrics.avgDurationMs,
            previousMetrics.avgDurationMs,
          ),
        },
      };
    }),
    meta: {
      page,
      pageSize,
      returned: currentRows.length,
      hasMore,
      nextPage: hasMore ? page + 1 : null,
    },
  });
}

async function handleReferrers(
  env: Env,
  siteId: string,
  url: URL,
): Promise<Response> {
  const window = parseWindow(url);
  if (!window) return badRequest("Invalid time window");
  const filters = parseFilters(url);
  const limit = parseLimit(url, 20, 200);
  const includeFullUrl = parseBooleanFlag(url, "fullUrl");
  const rows = await queryReferrerAggregate(
    env,
    siteId,
    window,
    filters,
    limit,
    includeFullUrl,
  );
  return jsonResponse({ ok: true, data: mapReferrers(rows) });
}

async function handleVisitors(
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

async function handleSessions(
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

async function handleVisitorDetail(
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

async function handleSessionDetail(
  env: Env,
  siteId: string,
  url: URL,
): Promise<Response> {
  const sessionId = (url.searchParams.get("sessionId") || "").trim();
  if (!sessionId) return badRequest("Missing sessionId");
  const detail = await querySessionDetailFromD1(env, siteId, sessionId);
  return jsonResponse({ ok: true, data: detail });
}

async function handleRetention(
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

async function handleFunnelList(
  env: Env,
  siteId: string,
  _url: URL,
): Promise<Response> {
  const rows = await queryD1All<Record<string, unknown>>(
    env,
    "SELECT id, site_id, type, name, config_json, created_at, updated_at FROM widgets WHERE site_id = ? AND type = 'funnel' ORDER BY created_at DESC",
    [siteId],
  );
  const funnels = rows.map((row) => ({
    id: String(row.id ?? ""),
    siteId: String(row.site_id ?? ""),
    name: String(row.name ?? ""),
    steps: JSON.parse(String(row.config_json ?? "[]")),
    createdAt: Number(row.created_at ?? 0),
    updatedAt: Number(row.updated_at ?? 0),
  }));
  return jsonResponse({ ok: true, funnels });
}

async function handleFunnelCreate(
  env: Env,
  siteId: string,
  request: Request,
): Promise<Response> {
  let body: { name?: string; steps?: Array<{ type: string; value: string }> };
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }
  const name = String(body.name ?? "").trim();
  if (!name) return badRequest("Name is required");
  const steps = Array.isArray(body.steps) ? body.steps : [];
  if (steps.length < 2) return badRequest("At least 2 steps are required");
  for (const step of steps) {
    if (!step.type || !step.value)
      return badRequest("Each step needs type and value");
    if (step.type !== "pageview" && step.type !== "event")
      return badRequest("Step type must be pageview or event");
  }

  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    "INSERT INTO widgets (id, site_id, type, name, config_json, created_at, updated_at) VALUES (?, ?, 'funnel', ?, ?, ?, ?)",
  )
    .bind(id, siteId, name, JSON.stringify(steps), now, now)
    .run();

  return jsonResponse(
    {
      ok: true,
      funnel: { id, siteId, name, steps, createdAt: now, updatedAt: now },
    },
    201,
  );
}

async function handleFunnelDelete(
  env: Env,
  siteId: string,
  url: URL,
): Promise<Response> {
  const funnelId = url.searchParams.get("id");
  if (!funnelId) return badRequest("Funnel id is required");
  await env.DB.prepare(
    "DELETE FROM widgets WHERE id = ? AND site_id = ? AND type = 'funnel'",
  )
    .bind(funnelId, siteId)
    .run();
  return jsonResponse({ ok: true });
}

async function handleFunnelAnalysis(
  env: Env,
  siteId: string,
  url: URL,
): Promise<Response> {
  const funnelId = url.searchParams.get("funnelId");
  if (!funnelId) return badRequest("funnelId is required");
  const window = parseWindow(url);
  if (!window) return badRequest("Invalid time window");
  const filters = parseFilters(url);

  const funnelRow = await queryD1All<Record<string, unknown>>(
    env,
    "SELECT config_json FROM widgets WHERE id = ? AND site_id = ? AND type = 'funnel'",
    [funnelId, siteId],
  );
  if (funnelRow.length === 0) return notFound();
  const steps: Array<{ type: string; value: string }> = JSON.parse(
    String(funnelRow[0].config_json ?? "[]"),
  );
  if (steps.length < 2) return badRequest("Funnel has fewer than 2 steps");

  const filter = buildVisitFilterSql(filters);

  const pageviewSteps = steps.filter((s) => s.type === "pageview");
  const eventSteps = steps.filter((s) => s.type === "event");

  const sessionData: Map<
    string,
    Array<{ type: string; value: string; ts: number }>
  > = new Map();

  if (pageviewSteps.length > 0) {
    const pvFilter = filter.clause
      ? filter.clause.replace(/^WHERE\s+/i, "AND ")
      : "";
    const pvSql = `
WITH ${buildVisitSourceCte()},
filtered AS (
  SELECT session_id, pathname, started_at
  FROM visit_source
  WHERE session_id != '' ${pvFilter}
)
SELECT session_id AS sessionId, pathname, started_at AS ts
FROM filtered
WHERE pathname IN (${pageviewSteps.map(() => "?").join(",")})
ORDER BY ts ASC
`;
    const pvBindings = [
      ...visitSourceBindings(siteId, window),
      ...filter.bindings,
      ...pageviewSteps.map((s) => s.value),
    ];
    const pvRows = await queryD1All<Record<string, unknown>>(
      env,
      pvSql,
      pvBindings,
    );
    for (const row of pvRows) {
      const sid = String(row.sessionId ?? "");
      if (!sid) continue;
      if (!sessionData.has(sid)) sessionData.set(sid, []);
      sessionData.get(sid)!.push({
        type: "pageview",
        value: String(row.pathname ?? ""),
        ts: Number(row.ts ?? 0),
      });
    }
  }

  if (eventSteps.length > 0) {
    const evSql = `
WITH ${buildCustomEventSourceCte()},
filtered AS (
  SELECT session_id, event_name, occurred_at
  FROM event_source
  WHERE session_id != ''
)
SELECT session_id AS sessionId, event_name AS eventName, occurred_at AS ts
FROM filtered
WHERE event_name IN (${eventSteps.map(() => "?").join(",")})
ORDER BY ts ASC
`;
    const evBindings = [
      ...eventSourceBindings(siteId, window),
      ...eventSteps.map((s) => s.value),
    ];
    const evRows = await queryD1All<Record<string, unknown>>(
      env,
      evSql,
      evBindings,
    );
    for (const row of evRows) {
      const sid = String(row.sessionId ?? "");
      if (!sid) continue;
      if (!sessionData.has(sid)) sessionData.set(sid, []);
      sessionData.get(sid)!.push({
        type: "event",
        value: String(row.eventName ?? ""),
        ts: Number(row.ts ?? 0),
      });
    }
  }

  const stepResults = steps.map((step, i) => ({
    index: i,
    label: step.value,
    type: step.type,
    sessions: 0,
    dropOffRate: 0,
    conversionRate: 0,
  }));

  for (const [, events] of sessionData) {
    events.sort((a, b) => a.ts - b.ts);
    let lastTs = -1;
    let matched = true;
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const matchIdx = events.findIndex(
        (e) => e.type === step.type && e.value === step.value && e.ts > lastTs,
      );
      if (matchIdx === -1) {
        matched = false;
        break;
      }
      lastTs = events[matchIdx].ts;
      stepResults[i].sessions++;
    }
    if (!matched) {
      // partial match already counted in the loop
    }
  }

  const totalSessions = stepResults[0].sessions || 1;
  for (let i = 0; i < stepResults.length; i++) {
    stepResults[i].conversionRate = stepResults[i].sessions / totalSessions;
    stepResults[i].dropOffRate =
      i === 0
        ? 0
        : 1 - stepResults[i].sessions / (stepResults[i - 1].sessions || 1);
  }

  return jsonResponse({
    ok: true,
    steps: stepResults,
    overallConversionRate:
      stepResults.length > 0
        ? stepResults[stepResults.length - 1].sessions / totalSessions
        : 0,
  });
}

async function handleDimension(
  env: Env,
  siteId: string,
  url: URL,
  d1Expr: string,
  options?: {
    ignoreGeo?: boolean;
  },
): Promise<Response> {
  const window = parseWindow(url);
  if (!window) return badRequest("Invalid time window");
  const rawFilters = parseFilters(url);
  const filters = options?.ignoreGeo
    ? withoutGeoFilter(rawFilters)
    : rawFilters;
  const limit = parseLimit(url, 20, 200);
  const rows = await queryDimensionAggregate(
    env,
    siteId,
    window,
    filters,
    limit,
    d1Expr,
  );
  return jsonResponse({ ok: true, data: mapTabs(rows) });
}

async function handleEventTypes(
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

type OverviewPageTabKey = "path" | "title" | "hostname" | "entry" | "exit";
type OverviewSourceTabKey = "domain" | "link";
type OverviewClientTabKey = Exclude<ClientDimensionKey, "operatingSystem">;
type OverviewGeoTabKey =
  | "country"
  | "region"
  | "city"
  | "continent"
  | "timezone"
  | "organization";

function parseClientDimensionKey(
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

function parseUtmDimensionKey(value: string | null): UtmDimensionKey | null {
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

async function handleOverviewPageTab(
  env: Env,
  siteId: string,
  url: URL,
  tab: OverviewPageTabKey,
): Promise<Response> {
  const window = parseWindow(url);
  if (!window) return badRequest("Invalid time window");
  const filters = parseFilters(url);
  const limit = parseLimit(url, 100, 200);
  const tabs = await queryPageTabsAggregate(
    env,
    siteId,
    window,
    filters,
    limit,
  );
  return jsonResponse({
    ok: true,
    data: mapTabs(tabs[tab]),
  });
}

async function handleOverviewSourceTab(
  env: Env,
  siteId: string,
  url: URL,
  tab: OverviewSourceTabKey,
): Promise<Response> {
  const window = parseWindow(url);
  if (!window) return badRequest("Invalid time window");
  const filters = parseFilters(url);
  const limit = parseLimit(url, 100, 200);
  const rows = await queryReferrerAggregate(
    env,
    siteId,
    window,
    filters,
    limit,
    tab === "link",
  );
  return jsonResponse({
    ok: true,
    data: rows.map((row) => ({
      label: row.referrer,
      views: row.views,
      sessions: row.sessions,
      visitors: row.visitors,
    })),
  });
}

async function handleOverviewClientTab(
  env: Env,
  siteId: string,
  url: URL,
  tab: OverviewClientTabKey,
): Promise<Response> {
  const window = parseWindow(url);
  if (!window) return badRequest("Invalid time window");
  const filters = parseFilters(url);
  const limit = parseLimit(url, 100, 200);
  const tabs = await buildOverviewClientDimensionTabs(
    env,
    siteId,
    window,
    filters,
    limit,
  );
  return jsonResponse({
    ok: true,
    data: mapTabs(tabs[tab]),
  });
}

async function handleOverviewGeoTab(
  env: Env,
  siteId: string,
  url: URL,
  tab: OverviewGeoTabKey,
): Promise<Response> {
  const window = parseWindow(url);
  if (!window) return badRequest("Invalid time window");
  const rawFilters = parseFilters(url);
  const filters = tab === "country" ? withoutGeoFilter(rawFilters) : rawFilters;
  const limit = parseLimit(url, 100, 200);
  const tabs = await buildOverviewGeoDimensionTabs(
    env,
    siteId,
    window,
    filters,
    limit,
  );
  return jsonResponse({
    ok: true,
    data: mapGeoTabs(tabs[tab]),
  });
}

async function handleFilterOptions(
  env: Env,
  siteId: string,
  url: URL,
): Promise<Response> {
  const filterKey = parseFilterOptionKey(url);
  if (!filterKey) return badRequest("Invalid filter key");
  const window = parseWindow(url);
  if (!window) return badRequest("Invalid time window");
  const filters = withoutFilterKey(parseFilters(url), filterKey);
  const limit = parseLimit(url, 200, 500);

  let data: DashboardFilterOption[] = [];

  if (filterKey === "country") {
    const rows = await queryDimensionAggregate(
      env,
      siteId,
      window,
      filters,
      limit,
      "country",
    );
    data = mapDimensionRowsToFilterOptions(rows);
  } else if (filterKey === "device") {
    const rows = await queryDimensionAggregate(
      env,
      siteId,
      window,
      filters,
      limit,
      "device_type",
    );
    data = mapDimensionRowsToFilterOptions(rows);
  } else if (filterKey === "browser") {
    const rows = await queryDimensionAggregate(
      env,
      siteId,
      window,
      filters,
      limit,
      "browser",
    );
    data = mapDimensionRowsToFilterOptions(rows);
  } else if (
    filterKey === "path" ||
    filterKey === "title" ||
    filterKey === "hostname" ||
    filterKey === "entry" ||
    filterKey === "exit"
  ) {
    const tabs = await queryPageTabsAggregate(
      env,
      siteId,
      window,
      filters,
      limit,
    );
    data = mapDimensionRowsToFilterOptions(tabs[filterKey]);
  } else if (filterKey === "sourceDomain" || filterKey === "sourceLink") {
    const rows = await queryReferrerAggregate(
      env,
      siteId,
      window,
      filters,
      limit,
      filterKey === "sourceLink",
    );
    data = mapReferrerRowsToFilterOptions(rows);
  } else if (
    filterKey === "clientBrowser" ||
    filterKey === "clientOsVersion" ||
    filterKey === "clientDeviceType" ||
    filterKey === "clientLanguage" ||
    filterKey === "clientScreenSize"
  ) {
    const tabs = await buildOverviewClientDimensionTabs(
      env,
      siteId,
      window,
      filters,
      limit,
    );
    const keyMap = {
      clientBrowser: "browser",
      clientOsVersion: "osVersion",
      clientDeviceType: "deviceType",
      clientLanguage: "language",
      clientScreenSize: "screenSize",
    } as const;
    data = mapDimensionRowsToFilterOptions(tabs[keyMap[filterKey]]);
  } else if (filterKey === "geo") {
    const tabs = await buildOverviewGeoDimensionTabs(
      env,
      siteId,
      window,
      filters,
      limit,
    );
    data = dedupeFilterOptions([
      ...mapGeoRowsToFilterOptions(tabs.country, "country"),
      ...mapGeoRowsToFilterOptions(tabs.region, "region"),
      ...mapGeoRowsToFilterOptions(tabs.city, "city"),
    ]);
  } else if (
    filterKey === "geoContinent" ||
    filterKey === "geoTimezone" ||
    filterKey === "geoOrganization"
  ) {
    const tabs = await buildOverviewGeoDimensionTabs(
      env,
      siteId,
      window,
      filters,
      limit,
    );
    const keyMap = {
      geoContinent: "continent",
      geoTimezone: "timezone",
      geoOrganization: "organization",
    } as const;
    data = mapDimensionRowsToFilterOptions(tabs[keyMap[filterKey]]);
  }

  return jsonResponse({ ok: true, data });
}

async function handleOverviewGeoPoints(
  env: Env,
  siteId: string,
  url: URL,
): Promise<Response> {
  const window = parseWindow(url);
  if (!window) return badRequest("Invalid time window");
  const filters = parseBooleanSearchParam(url, "applyGeoFilter")
    ? parseFilters(url)
    : withoutGeoFilter(parseFilters(url));
  const limit = parseLimit(url, 5000, 20000);
  const aggregate = await queryGeoPointAggregate(
    env,
    siteId,
    window,
    filters,
    limit,
  );
  return jsonResponse({
    ok: true,
    data: aggregate.points,
    countryCounts: aggregate.countryCounts,
    regionCounts: aggregate.regionCounts,
    cityCounts: aggregate.cityCounts,
  });
}

async function listTeamSites(env: Env, teamId: string): Promise<TeamSiteRow[]> {
  const result = await env.DB.prepare(
    `
      SELECT
        id,
        team_id AS teamId,
        name,
        domain,
        public_enabled AS publicEnabled,
        public_slug AS publicSlug,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM sites
      WHERE team_id = ?
      ORDER BY created_at DESC
    `,
  )
    .bind(teamId)
    .all<TeamSiteRow>();
  return result.results;
}

async function handleTeamDashboard(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  const window = parseWindow(url);
  if (!window) return badRequest("Invalid time window", PRIVATE_CACHE_HEADERS);
  const team = await resolvePrivateTeam(request, env, url);
  if (team instanceof Response) return team;

  const interval = parseInterval(url);
  const sites = await listTeamSites(env, team.id);
  if (sites.length === 0) {
    return jsonResponse(
      {
        ok: true,
        data: {
          sites: [],
          trend: [],
        },
      },
      200,
      PRIVATE_CACHE_HEADERS,
    );
  }

  const previousTo = Math.max(window.fromMs - 1, 0);
  const previousFrom = Math.max(previousTo - (window.toMs - window.fromMs), 0);
  const previousWindow: QueryWindow = {
    fromMs: previousFrom,
    toMs: previousTo,
    nowMs: window.nowMs,
    timeZone: window.timeZone,
  };
  const siteIds = sites.map((site) => site.id);
  const [currentOverview, previousOverview, trendRows] = await Promise.all([
    queryTeamOverviewFromD1(env, siteIds, window),
    queryTeamOverviewFromD1(env, siteIds, previousWindow),
    queryTeamTrendFromD1(env, siteIds, window, interval),
  ]);

  const sitePayload = sites.map((site, index) => {
    const overview = mapOverviewAggregate(
      currentOverview.get(site.id) ?? {
        views: 0,
        sessions: 0,
        visitors: 0,
        bounces: 0,
        totalDuration: 0,
        durationViews: 0,
      },
    );
    const previous = mapOverviewAggregate(
      previousOverview.get(site.id) ?? {
        views: 0,
        sessions: 0,
        visitors: 0,
        bounces: 0,
        totalDuration: 0,
        durationViews: 0,
      },
    );
    const currentPagesPerSession =
      overview.sessions > 0 ? overview.views / overview.sessions : 0;
    const previousPagesPerSession =
      previous.sessions > 0 ? previous.views / previous.sessions : 0;

    return {
      ...site,
      overview,
      changeRates: {
        views: percentChange(overview.views, previous.views),
        visitors: percentChange(overview.visitors, previous.visitors),
        sessions: percentChange(overview.sessions, previous.sessions),
        bounceRate: percentChange(overview.bounceRate, previous.bounceRate),
        avgDurationMs: percentChange(
          overview.avgDurationMs,
          previous.avgDurationMs,
        ),
        pagesPerSession: percentChange(
          currentPagesPerSession,
          previousPagesPerSession,
        ),
      },
    };
  });

  const trendByBucket = new Map<
    number,
    {
      bucket: number;
      timestampMs: number;
      sites: Array<{ siteId: string; views: number; visitors: number }>;
    }
  >();

  for (const row of trendRows) {
    const bucket = row.bucket;
    const existing = trendByBucket.get(bucket) ?? {
      bucket,
      timestampMs: row.timestampMs,
      sites: [],
    };
    existing.sites.push({
      siteId: row.siteId,
      views: row.views,
      visitors: row.visitors,
    });
    trendByBucket.set(bucket, existing);
  }

  return jsonResponse(
    {
      ok: true,
      data: {
        sites: sitePayload,
        trend: [...trendByBucket.values()].sort(
          (left, right) => left.bucket - right.bucket,
        ),
      },
    },
    200,
    PRIVATE_CACHE_HEADERS,
  );
}

async function routeQuery(
  env: Env,
  siteId: string,
  pathname: string,
  url: URL,
  options: { publicMode: boolean },
): Promise<Response> {
  if (pathname === "overview") return handleOverview(env, siteId, url);
  if (pathname === "trend") return handleTrend(env, siteId, url);
  if (options.publicMode) return notFound();
  if (pathname === "pages-dashboard") {
    return handlePagesDashboard(env, siteId, url);
  }
  if (pathname === "page-hash") {
    return handleDimension(env, siteId, url, "hash_fragment");
  }
  if (pathname === "page-query") {
    return handleDimension(env, siteId, url, "query_string");
  }
  if (pathname === "event-types") {
    return handleEventTypes(env, siteId, url);
  }
  if (pathname === "sessions") {
    return handleSessions(env, siteId, url);
  }
  if (pathname === "session-detail") {
    return handleSessionDetail(env, siteId, url);
  }
  if (pathname === "visitor-detail") {
    return handleVisitorDetail(env, siteId, url);
  }
  if (pathname === "visitors") {
    return handleVisitors(env, siteId, url);
  }
  if (pathname === "retention") {
    return handleRetention(env, siteId, url);
  }
  if (pathname === "performance") {
    return handlePerformance(env, siteId, url);
  }
  if (pathname === "browser-trend") return handleBrowserTrend(env, siteId, url);
  if (pathname === "browser-engine-trend") {
    return handleBrowserEngineTrend(env, siteId, url);
  }
  if (pathname === "browser-version-breakdown") {
    return handleBrowserVersionBreakdown(env, siteId, url);
  }
  if (pathname === "browser-cross-breakdown") {
    return handleBrowserCrossBreakdown(env, siteId, url);
  }
  if (pathname === "browser-radar") {
    return handleBrowserRadar(env, siteId, url);
  }
  if (pathname === "referrer-radar") {
    return handleReferrerRadar(env, siteId, url);
  }
  if (pathname === "referrer-dimension-trend") {
    return handleReferrerDimensionTrend(env, siteId, url);
  }
  if (pathname === "client-dimension-trend") {
    return handleClientDimensionTrend(env, siteId, url);
  }
  if (pathname === "utm-dimension-trend") {
    return handleUtmDimensionTrend(env, siteId, url);
  }
  if (pathname === "client-cross-breakdown") {
    return handleClientCrossBreakdown(env, siteId, url);
  }
  if (pathname === "utm-source") {
    return handleDimension(
      env,
      siteId,
      url,
      utmDimensionDefinition("source").labelExpr,
    );
  }
  if (pathname === "utm-medium") {
    return handleDimension(
      env,
      siteId,
      url,
      utmDimensionDefinition("medium").labelExpr,
    );
  }
  if (pathname === "utm-campaign") {
    return handleDimension(
      env,
      siteId,
      url,
      utmDimensionDefinition("campaign").labelExpr,
    );
  }
  if (pathname === "utm-term") {
    return handleDimension(
      env,
      siteId,
      url,
      utmDimensionDefinition("term").labelExpr,
    );
  }
  if (pathname === "utm-content") {
    return handleDimension(
      env,
      siteId,
      url,
      utmDimensionDefinition("content").labelExpr,
    );
  }
  if (pathname === "countries") {
    return handleDimension(env, siteId, url, "country", { ignoreGeo: true });
  }
  if (pathname === "filter-options")
    return handleFilterOptions(env, siteId, url);
  if (pathname === "overview-page-path") {
    return handleOverviewPageTab(env, siteId, url, "path");
  }
  if (pathname === "overview-page-title") {
    return handleOverviewPageTab(env, siteId, url, "title");
  }
  if (pathname === "overview-page-hostname") {
    return handleOverviewPageTab(env, siteId, url, "hostname");
  }
  if (pathname === "overview-page-entry") {
    return handleOverviewPageTab(env, siteId, url, "entry");
  }
  if (pathname === "overview-page-exit") {
    return handleOverviewPageTab(env, siteId, url, "exit");
  }
  if (pathname === "overview-source-domain") {
    return handleOverviewSourceTab(env, siteId, url, "domain");
  }
  if (pathname === "overview-source-link") {
    return handleOverviewSourceTab(env, siteId, url, "link");
  }
  if (pathname === "overview-client-browser") {
    return handleOverviewClientTab(env, siteId, url, "browser");
  }
  if (pathname === "overview-client-os-version") {
    return handleOverviewClientTab(env, siteId, url, "osVersion");
  }
  if (pathname === "overview-client-device-type") {
    return handleOverviewClientTab(env, siteId, url, "deviceType");
  }
  if (pathname === "overview-client-language") {
    return handleOverviewClientTab(env, siteId, url, "language");
  }
  if (pathname === "overview-client-screen-size") {
    return handleOverviewClientTab(env, siteId, url, "screenSize");
  }
  if (pathname === "overview-geo-country") {
    return handleOverviewGeoTab(env, siteId, url, "country");
  }
  if (pathname === "overview-geo-region") {
    return handleOverviewGeoTab(env, siteId, url, "region");
  }
  if (pathname === "overview-geo-city") {
    return handleOverviewGeoTab(env, siteId, url, "city");
  }
  if (pathname === "overview-geo-continent") {
    return handleOverviewGeoTab(env, siteId, url, "continent");
  }
  if (pathname === "overview-geo-timezone") {
    return handleOverviewGeoTab(env, siteId, url, "timezone");
  }
  if (pathname === "overview-geo-organization") {
    return handleOverviewGeoTab(env, siteId, url, "organization");
  }
  if (pathname === "overview-geo-points") {
    return handleOverviewGeoPoints(env, siteId, url);
  }
  return notFound();
}

export async function handlePrivateQuery(
  request: Request,
  env: Env,
  url: URL,
  ctx?: ExecutionContext,
): Promise<Response> {
  if (request.method !== "GET") return notAllowed();
  const pathname = url.pathname.replace(/^\/api\/private\//, "");
  if (pathname === "team-dashboard") {
    return handleTeamDashboard(request, env, url);
  }
  const site = await resolvePrivateSite(request, env, url);
  if (site instanceof Response) return site;
  // Auth has passed; wrap the read-only dispatch with the edge cache so two
  // dashboards (and two viewers of the same site) don't repeatedly re-issue
  // the same aggregation SQL against D1.
  return withDashboardCache(ctx, url, () =>
    routeQuery(env, site.id, pathname, url, { publicMode: false }),
  );
}

export async function handlePublicQuery(
  request: Request,
  env: Env,
  url: URL,
  ctx?: ExecutionContext,
): Promise<Response> {
  if (request.method !== "GET") return notAllowed();
  const site = await fetchPublicSite(env, url);
  if (site instanceof Response) return site;
  const segments = url.pathname.split("/").filter(Boolean);
  const pathname = segments.slice(3).join("/");
  return withDashboardCache(ctx, url, () =>
    routeQuery(env, site.id, pathname, url, { publicMode: true }),
  );
}
async function queryDimensionFromD1(
  env: Env,
  siteId: string,
  window: QueryWindow,
  filters: DashboardFilters,
  limit: number,
  selectExpr: string,
): Promise<DimensionRow[]> {
  const filter = buildVisitFilterSql(filters);
  const sql = `
WITH
${buildVisitSourceCte()},
filtered_visits AS (
  SELECT *
  FROM visit_source
  ${filter.clause}
),
dimension_rollup AS (
  SELECT
    COALESCE(${selectExpr}, '') AS value,
    count(*) AS views,
    count(DISTINCT CASE WHEN session_id != '' THEN session_id ELSE NULL END) AS sessions,
    count(DISTINCT CASE WHEN visitor_id != '' THEN visitor_id ELSE NULL END) AS visitors
  FROM filtered_visits
  GROUP BY value
)
SELECT value, views, sessions, visitors
FROM dimension_rollup
ORDER BY views DESC, sessions DESC, value ASC
LIMIT ?
`;
  return (
    await queryD1All<Record<string, unknown>>(env, sql, [
      ...visitSourceBindings(siteId, window),
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

async function querySessionPathDimensionFromD1(
  env: Env,
  siteId: string,
  window: QueryWindow,
  filters: DashboardFilters,
  limit: number,
  kind: "entry" | "exit",
): Promise<DimensionRow[]> {
  const filter = buildVisitFilterSql(filters);
  const order = kind === "entry" ? "ASC" : "DESC";
  const sql = `
WITH
${buildVisitSourceCte()},
filtered_visits AS (
  SELECT *
  FROM visit_source
  ${filter.clause}
),
session_edges AS (
  SELECT
    fv.session_id AS session_id,
    (
      SELECT COALESCE(fv2.visitor_id, '')
      FROM filtered_visits fv2
      WHERE fv2.session_id = fv.session_id
      LIMIT 1
    ) AS visitor_id,
    (
      SELECT COALESCE(fv2.pathname, '')
      FROM filtered_visits fv2
      WHERE fv2.session_id = fv.session_id
      ORDER BY fv2.started_at ${order}, fv2.visit_id ${order}
      LIMIT 1
    ) AS value
  FROM filtered_visits fv
  WHERE fv.session_id != ''
  GROUP BY fv.session_id
)
SELECT
  value,
  count(*) AS views,
  count(*) AS sessions,
  count(DISTINCT CASE WHEN visitor_id != '' THEN visitor_id ELSE NULL END) AS visitors
FROM session_edges
GROUP BY value
ORDER BY views DESC, value ASC
LIMIT ?
`;
  return (
    await queryD1All<Record<string, unknown>>(env, sql, [
      ...visitSourceBindings(siteId, window),
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

async function queryVisitDimensionFromD1(
  env: Env,
  siteId: string,
  window: QueryWindow,
  filters: DashboardFilters,
  limit: number,
  selectExpr: string,
): Promise<DimensionRow[]> {
  return queryDimensionFromD1(env, siteId, window, filters, limit, selectExpr);
}

async function querySessionBoundaryDimensionFromD1(
  env: Env,
  siteId: string,
  window: QueryWindow,
  filters: DashboardFilters,
  limit: number,
  kind: "entry" | "exit",
): Promise<DimensionRow[]> {
  return querySessionPathDimensionFromD1(
    env,
    siteId,
    window,
    filters,
    limit,
    kind,
  );
}

async function queryPageTabsFromD1(
  env: Env,
  siteId: string,
  window: QueryWindow,
  filters: DashboardFilters,
  limit: number,
): Promise<{
  path: DimensionRow[];
  title: DimensionRow[];
  hostname: DimensionRow[];
  entry: DimensionRow[];
  exit: DimensionRow[];
}> {
  const filter = buildVisitFilterSql(filters);
  const sql = `
WITH
${buildVisitSourceCte()},
filtered_visits AS (
  SELECT
    visitor_id AS visitorId,
    session_id AS sessionId,
    started_at AS startedAt,
    pathname,
    title,
    hostname
  FROM visit_source
  ${filter.clause}
)
SELECT visitorId, sessionId, startedAt, pathname, title, hostname
FROM filtered_visits
`;
  const rows = await queryD1All<Record<string, unknown>>(env, sql, [
    ...visitSourceBindings(siteId, window),
    ...filter.bindings,
  ]);

  const path = new Map<string, DimensionAccumulator>();
  const title = new Map<string, DimensionAccumulator>();
  const hostname = new Map<string, DimensionAccumulator>();
  const entryBySession = new Map<string, { at: number; value: string }>();
  const exitBySession = new Map<string, { at: number; value: string }>();
  const visitorBySession = new Map<string, string>();

  for (const row of rows) {
    const sessionId = String(row.sessionId ?? "");
    const visitorId = String(row.visitorId ?? "");
    const startedAt = Number(row.startedAt ?? 0);
    addDimensionValue(path, String(row.pathname ?? ""), sessionId, visitorId);
    addDimensionValue(title, String(row.title ?? ""), sessionId, visitorId);
    addDimensionValue(
      hostname,
      String(row.hostname ?? ""),
      sessionId,
      visitorId,
    );
    if (!sessionId) continue;
    if (visitorId) visitorBySession.set(sessionId, visitorId);
    const pathname = String(row.pathname ?? "").trim();
    if (!pathname) continue;
    const entry = entryBySession.get(sessionId);
    if (!entry || startedAt < entry.at) {
      entryBySession.set(sessionId, { at: startedAt, value: pathname });
    }
    const exit = exitBySession.get(sessionId);
    if (!exit || startedAt >= exit.at) {
      exitBySession.set(sessionId, { at: startedAt, value: pathname });
    }
  }

  const entry = new Map<string, DimensionAccumulator>();
  const exit = new Map<string, DimensionAccumulator>();
  for (const [sessionId, edge] of entryBySession.entries()) {
    addDimensionValue(
      entry,
      edge.value,
      sessionId,
      visitorBySession.get(sessionId),
    );
  }
  for (const [sessionId, edge] of exitBySession.entries()) {
    addDimensionValue(
      exit,
      edge.value,
      sessionId,
      visitorBySession.get(sessionId),
    );
  }

  return {
    path: finalizeDimensionBuckets(path, limit),
    title: finalizeDimensionBuckets(title, limit),
    hostname: finalizeDimensionBuckets(hostname, limit),
    entry: finalizeDimensionBuckets(entry, limit),
    exit: finalizeDimensionBuckets(exit, limit),
  };
}

async function queryReferrersFromD1(
  env: Env,
  siteId: string,
  window: QueryWindow,
  filters: DashboardFilters,
  limit: number,
  includeFullUrl: boolean,
): Promise<ReferrerRow[]> {
  const filter = buildVisitFilterSql(filters);
  const keyExpr = includeFullUrl ? "referrer_url" : "referrer_host";
  const sql = `
WITH
${buildVisitSourceCte()},
filtered_visits AS (
  SELECT *
  FROM visit_source
  ${filter.clause}
)
SELECT
  COALESCE(${keyExpr}, '') AS referrer,
  count(*) AS views,
  count(DISTINCT CASE WHEN session_id != '' THEN session_id ELSE NULL END) AS sessions,
  count(DISTINCT CASE WHEN visitor_id != '' THEN visitor_id ELSE NULL END) AS visitors
FROM filtered_visits
GROUP BY referrer
ORDER BY views DESC, sessions DESC, referrer ASC
LIMIT ?
`;
  return (
    await queryD1All<Record<string, unknown>>(env, sql, [
      ...visitSourceBindings(siteId, window),
      ...filter.bindings,
      limit,
    ])
  ).map((row) => ({
    referrer: String(row.referrer ?? ""),
    views: Number(row.views ?? 0),
    sessions: Number(row.sessions ?? 0),
    visitors: Number(row.visitors ?? 0),
  }));
}

async function queryVisitorsFromD1(
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

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function nullableCoordinate(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function sessionDurationMs(
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

function whereClauseWithTarget(
  filterClause: string,
  target?: { column: string; value: string },
): string {
  if (!target) return filterClause;
  const filterAndClause = filterClause
    ? filterClause.replace(/^WHERE\s+/i, "AND ")
    : "";
  return `WHERE ${target.column} = ? ${filterAndClause}`;
}

function escapeLikeSearch(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function buildJourneySearchSql(
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

function directionSql(direction: SortDirection): "ASC" | "DESC" {
  return direction === "asc" ? "ASC" : "DESC";
}

function visitorListOrderBy(sort: ListSort<VisitorListSortKey>): string {
  const column: Record<VisitorListSortKey, string> = {
    firstSeenAt: "firstSeenAt",
    lastSeenAt: "lastSeenAt",
    sessions: "sessions",
    views: "views",
  };
  return `${column[sort.key]} ${directionSql(sort.direction)}, lastSeenAt DESC, visitorId ASC`;
}

function sessionListOrderBy(sort: ListSort<SessionListSortKey>): string {
  const column: Record<SessionListSortKey, string> = {
    startedAt: "startedAt",
    durationMs: "totalDurationMs",
    views: "views",
  };
  return `${column[sort.key]} ${directionSql(sort.direction)}, startedAt DESC, sessionId ASC`;
}

function mapSessionRow(row: Record<string, unknown>): SessionRow {
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

function mapGeoPointRow(row: Record<string, unknown>): GeoPointRow {
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

async function querySessionsFromD1(
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

function mapJourneyEventRow(row: Record<string, unknown>): JourneyEventRow {
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

function sessionStartEvent(session: SessionRow): JourneyEventRow {
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

function sessionLeaveEvent(
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

async function queryJourneyEventsFromD1(
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

function summarizeVisitedPages(
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

function summarizeEventDistribution(
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

function emptyJourneyPerformanceSummary(): JourneyPerformanceSummaryRow {
  return Object.fromEntries(
    PERFORMANCE_METRIC_KEYS.map((metric) => [
      metric,
      { avg: null, p75: null, min: null, max: null, samples: 0 },
    ]),
  ) as JourneyPerformanceSummaryRow;
}

function summarizeJourneyPerformance(
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

function reportingDateKey(timestampMs: number, timeZone: string): string {
  const parts = zonedParts(timestampMs, timeZone);
  const month = String(parts.month).padStart(2, "0");
  const day = String(parts.day).padStart(2, "0");
  return `${parts.year}-${month}-${day}`;
}

function summarizeActivity(
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

function percentile(values: number[], percentileValue: number): number {
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

function averageGapMs(values: number[]): number {
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

type DetailTarget = { type: "visitor" | "session"; value: string };

function detailTargetColumn(target: DetailTarget): "visitor_id" | "session_id" {
  return target.type === "visitor" ? "visitor_id" : "session_id";
}

function mapVisitorRow(row: Record<string, unknown>): VisitorRow {
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

async function queryVisitorForDetailFromD1(
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

async function querySessionsForDetailFromD1(
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

async function queryJourneyEventsForDetailFromD1(
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

async function queryVisitorDetailFromD1(
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

async function querySessionDetailFromD1(
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

async function querySessionLocationPointsFromD1(
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

async function queryGeoPointsFromD1(
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

async function queryOverviewClientDimensionsFromD1(
  env: Env,
  siteId: string,
  window: QueryWindow,
  filters: DashboardFilters,
  limit: number,
): Promise<ClientDimensionTabs> {
  const filter = buildVisitFilterSql(filters);
  const sql = `
WITH
${buildVisitSourceCte()},
filtered_visits AS (
  SELECT
    session_id AS sessionId,
    browser,
    os,
    os_version AS osVersion,
    device_type AS deviceType,
    language,
    screen_width AS screenWidth,
    screen_height AS screenHeight
  FROM visit_source
  ${filter.clause}
)
SELECT sessionId, browser, os, osVersion, deviceType, language, screenWidth, screenHeight
FROM filtered_visits
`;
  const rows = await queryD1All<Record<string, unknown>>(env, sql, [
    ...visitSourceBindings(siteId, window),
    ...filter.bindings,
  ]);

  const browser = new Map<string, DimensionAccumulator>();
  const osVersion = new Map<string, DimensionAccumulator>();
  const deviceType = new Map<string, DimensionAccumulator>();
  const language = new Map<string, DimensionAccumulator>();
  const screenSize = new Map<string, DimensionAccumulator>();

  for (const row of rows) {
    const sessionId = String(row.sessionId ?? "");
    addDimensionValue(browser, String(row.browser ?? ""), sessionId);
    addDimensionValue(deviceType, String(row.deviceType ?? ""), sessionId);
    addDimensionValue(language, String(row.language ?? ""), sessionId);
    const os = String(row.os ?? "").trim();
    const version = String(row.osVersion ?? "").trim();
    addDimensionValue(
      osVersion,
      os && version ? `${os} ${version}` : os || version,
      sessionId,
    );
    const width = Number(row.screenWidth ?? 0);
    const height = Number(row.screenHeight ?? 0);
    if (
      Number.isFinite(width) &&
      width > 0 &&
      Number.isFinite(height) &&
      height > 0
    ) {
      addDimensionValue(
        screenSize,
        `${Math.trunc(width)}x${Math.trunc(height)}`,
        sessionId,
      );
    }
  }

  return {
    browser: finalizeDimensionBuckets(browser, limit),
    osVersion: finalizeDimensionBuckets(osVersion, limit),
    deviceType: finalizeDimensionBuckets(deviceType, limit),
    language: finalizeDimensionBuckets(language, limit),
    screenSize: finalizeDimensionBuckets(screenSize, limit),
  };
}

async function queryOverviewGeoDimensionsFromD1(
  env: Env,
  siteId: string,
  window: QueryWindow,
  filters: DashboardFilters,
  limit: number,
): Promise<GeoDimensionTabs> {
  const filter = buildVisitFilterSql(filters);
  const sql = `
WITH
${buildVisitSourceCte()},
filtered_visits AS (
  SELECT
    session_id AS sessionId,
    visitor_id AS visitorId,
    country,
    ${regionValueExpr()} AS region,
    ${cityValueExpr()} AS city,
    continent,
    timezone,
    as_organization AS asOrganization
  FROM visit_source
  ${filter.clause}
)
SELECT sessionId, visitorId, country, region, city, continent, timezone, asOrganization
FROM filtered_visits
`;
  const rows = await queryD1All<Record<string, unknown>>(env, sql, [
    ...visitSourceBindings(siteId, window),
    ...filter.bindings,
  ]);

  const country = new Map<string, GeoDimensionAccumulator>();
  const region = new Map<string, GeoDimensionAccumulator>();
  const city = new Map<string, GeoDimensionAccumulator>();
  const continent = new Map<string, GeoDimensionAccumulator>();
  const timezone = new Map<string, GeoDimensionAccumulator>();
  const organization = new Map<string, GeoDimensionAccumulator>();

  for (const row of rows) {
    const sessionId = String(row.sessionId ?? "");
    const visitorId = String(row.visitorId ?? "");
    addGeoDimensionValue(
      country,
      String(row.country ?? ""),
      sessionId,
      visitorId,
    );
    addGeoDimensionValue(
      region,
      String(row.region ?? ""),
      sessionId,
      visitorId,
    );
    addGeoDimensionValue(city, String(row.city ?? ""), sessionId, visitorId);
    addGeoDimensionValue(
      continent,
      String(row.continent ?? ""),
      sessionId,
      visitorId,
    );
    addGeoDimensionValue(
      timezone,
      String(row.timezone ?? ""),
      sessionId,
      visitorId,
    );
    addGeoDimensionValue(
      organization,
      String(row.asOrganization ?? ""),
      sessionId,
      visitorId,
    );
  }

  return {
    country: finalizeGeoDimensionBuckets(country, limit, (value) =>
      geoTabLabel(value, "country"),
    ),
    region: finalizeGeoDimensionBuckets(region, limit, (value) =>
      geoTabLabel(value, "region"),
    ),
    city: finalizeGeoDimensionBuckets(city, limit, (value) =>
      geoTabLabel(value, "city"),
    ),
    continent: finalizeGeoDimensionBuckets(continent, limit),
    timezone: finalizeGeoDimensionBuckets(timezone, limit),
    organization: finalizeGeoDimensionBuckets(organization, limit),
  };
}
