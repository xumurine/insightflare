import { parseGeoLocationValue } from "@/lib/dashboard/geo-location";
import {
  addZonedInterval,
  resolveReportingTimeZone,
  startOfZonedInterval,
} from "@/lib/dashboard/time-zone";
import { requireSession } from "@/lib/edge/session-auth";
import type { Env } from "@/lib/edge/types";
import { coerceNumber, ONE_DAY_MS, ONE_HOUR_MS } from "@/lib/edge/utils";

export const RETENTION_DAYS = 365;
export const PRIVATE_CACHE_HEADERS = {
  "cache-control": "private, no-store",
  vary: "authorization, cookie",
};
export const PUBLIC_CACHE_HEADERS = {
  "cache-control": "public, max-age=60, s-maxage=60",
  "access-control-allow-origin": "*",
};
export const PUBLIC_PRIVACY = {
  queryHashDetails: "hidden",
  visitorTrajectories: "hidden",
  detailedReferrerUrl: "hidden",
} as const;

export type Interval = "minute" | "hour" | "day" | "week" | "month";

export interface QueryWindow {
  fromMs: number;
  toMs: number;
  nowMs: number;
  timeZone: string;
}

export interface SiteRow {
  id: string;
  name: string;
  domain: string;
}

export interface TeamSiteRow {
  id: string;
  teamId: string;
  name: string;
  domain: string;
  publicEnabled: number;
  publicSlug: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface DashboardFilters {
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
  eventPayloadFilters?: EventPayloadFilterRule[];
}

export type EventPayloadFilterValue = string | number | boolean | null;

export interface EventPayloadFilterRule {
  path: string;
  operator: "eq" | "ne";
  value: EventPayloadFilterValue;
}

export type SortDirection = "asc" | "desc";
export type VisitorListSortKey =
  | "firstSeenAt"
  | "lastSeenAt"
  | "sessions"
  | "views";
export type SessionListSortKey = "startedAt" | "durationMs" | "views";
export type EventRecordSortKey = "occurredAt" | "eventName" | "pathname";

export interface ListSort<Key extends string> {
  key: Key;
  direction: SortDirection;
}

export const DEFAULT_VISITOR_LIST_SORT: ListSort<VisitorListSortKey> = {
  key: "lastSeenAt",
  direction: "desc",
};
export const DEFAULT_SESSION_LIST_SORT: ListSort<SessionListSortKey> = {
  key: "startedAt",
  direction: "desc",
};
export const DEFAULT_EVENT_RECORD_SORT: ListSort<EventRecordSortKey> = {
  key: "occurredAt",
  direction: "desc",
};

export interface OverviewAggregateRow {
  views: number;
  sessions: number;
  visitors: number;
  bounces: number;
  totalDuration: number;
  durationViews: number;
}

export interface TrendAggregateRow extends OverviewAggregateRow {
  bucket: number;
  timestampMs: number;
}

export interface BrowserTrendSeriesRow {
  key: string;
  label: string;
  views: number;
  visitors: number;
  sessions: number;
  isOther?: boolean;
}

export interface BrowserTrendBucketRow {
  bucket: number;
  label: string;
  views: number;
  visitors: number;
  sessions: number;
}

export interface BrowserTrendPointRow {
  bucket: number;
  timestampMs: number;
  totalVisitors: number;
  visitorsBySeries: Record<string, number>;
}

export type PerformanceMetricKey = "ttfb" | "fcp" | "lcp" | "cls" | "inp";

export interface VisitPerformanceMetricsRow {
  ttfb: number | null;
  fcp: number | null;
  lcp: number | null;
  cls: number | null;
  inp: number | null;
}

export interface JourneyPerformanceMetricSummaryRow {
  avg: number | null;
  p75: number | null;
  min: number | null;
  max: number | null;
  samples: number;
}

export type JourneyPerformanceSummaryRow = Record<
  PerformanceMetricKey,
  JourneyPerformanceMetricSummaryRow
>;

export interface PerformanceSummaryRow {
  avg: number | null;
  p50: number | null;
  p75: number | null;
  p95: number | null;
  samples: number;
}

export interface PerformanceTrendPointRow {
  bucket: number;
  timestampMs: number;
  avg: number | null;
  p50: number | null;
  p75: number | null;
  p95: number | null;
  samples: number;
}

export interface PerformanceRouteMetricRow {
  avg: number | null;
  p50: number | null;
  p75: number | null;
  p95: number | null;
  samples: number;
}

export interface PerformanceRouteRow {
  pathname: string;
  views: number;
  metrics: Record<PerformanceMetricKey, PerformanceRouteMetricRow>;
}

export interface PerformanceCountryRow {
  country: string;
  views: number;
  metrics: Record<PerformanceMetricKey, PerformanceRouteMetricRow>;
}

export interface BrowserVersionAggregateRow {
  browser: string;
  version: string;
  views: number;
  visitors: number;
  sessions: number;
}

export interface BrowserVersionSliceRow {
  key: string;
  label: string;
  views: number;
  visitors: number;
  sessions: number;
  isOther?: boolean;
  isUnknown?: boolean;
}

export interface BrowserVersionBreakdownRow {
  browser: string;
  views: number;
  visitors: number;
  sessions: number;
  versions: BrowserVersionSliceRow[];
}

export interface BrowserCrossBreakdownItemRow {
  key: string;
  label: string;
  views: number;
  visitors: number;
  sessions: number;
  isOther?: boolean;
  isUnknown?: boolean;
}

export interface BrowserCrossBreakdownDimensionRow extends BrowserCrossBreakdownItemRow {
  cells: BrowserCrossBreakdownItemRow[];
}

export interface BrowserCrossBreakdownDimensionDataRow {
  columns: BrowserCrossBreakdownItemRow[];
  rows: BrowserCrossBreakdownDimensionRow[];
  totalVisitors: number;
}

export interface BrowserCrossAggregateRow {
  browser: string;
  dimension: string;
  views: number;
  visitors: number;
  sessions: number;
}

export interface ClientCrossAggregateRow {
  primary: string;
  secondary: string;
  views: number;
  visitors: number;
  sessions: number;
}

export interface DimensionRow {
  value: string;
  views: number;
  sessions: number;
  visitors: number;
}

export interface GeoTabRow {
  value: string;
  label: string;
  views: number;
  sessions: number;
  visitors: number;
}

export interface EventAnalyticsContextCards {
  page: {
    path: DimensionRow[];
    query: DimensionRow[];
    title: DimensionRow[];
    hostname: DimensionRow[];
    entry: DimensionRow[];
    exit: DimensionRow[];
  };
  source: {
    domain: DimensionRow[];
    link: DimensionRow[];
  };
  client: ClientDimensionTabs;
  geo: GeoDimensionTabs;
}

export interface EventSummaryCards {
  event: {
    name: DimensionRow[];
  };
  page: {
    path: DimensionRow[];
    title: DimensionRow[];
    hostname: DimensionRow[];
  };
}

export interface PageRow {
  pathname: string;
  query: string;
  hash: string;
  views: number;
  sessions: number;
}

export interface PageCardAggregateRow extends OverviewAggregateRow {
  pathname: string;
}

export interface PageCardTitleRow {
  pathname: string;
  title: string;
  views: number;
}

export interface PageCardTrendRow {
  pathname: string;
  bucket: number;
  timestampMs: number;
  views: number;
  visitors: number;
}

export interface ReferrerRow {
  referrer: string;
  views: number;
  sessions: number;
  visitors: number;
}

export interface ReferrerRadarRow {
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

export interface VisitorRow {
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

export interface SessionRow {
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

export interface JourneyEventRow {
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

export interface JourneyPageCountRow {
  pathname: string;
  views: number;
}

export interface JourneyEventCountRow {
  eventType: string;
  count: number;
}

export interface EventSummaryRow {
  events: number;
  eventTypes: number;
  sessions: number;
  visitors: number;
}

export interface EventRecordRow {
  eventId: string;
  eventName: string;
  occurredAt: number;
  receivedAt: number;
  sequence: number;
  visitId: string;
  sessionId: string;
  visitorId: string;
  pathname: string;
  title: string;
  hostname: string;
  referrerHost: string;
  country: string;
  region: string;
  browser: string;
  browserVersion: string;
  os: string;
  osVersion: string;
  deviceType: string;
  nodeCount: number;
  valueCount: number;
}

export interface EventTrendSeriesRow {
  eventName: string;
  events: number;
  sessions: number;
  visitors: number;
}

export interface EventTrendPointRow {
  bucket: number;
  seriesKey: string;
  events: number;
}

export interface EventTypeTrendPointRow {
  bucket: number;
  events: number;
  visitors: number;
}

export interface EventFieldRow {
  path: string;
  valueType: number;
  events: number;
  occurrences: number;
  firstSeenAt: number;
  lastSeenAt: number;
  stringValue: string | null;
  numberValue: number | null;
  booleanValue: number | null;
}

export interface EventFieldValueRow {
  valueType: number;
  events: number;
  occurrences: number;
  firstSeenAt: number;
  lastSeenAt: number;
  stringValue: string | null;
  numberValue: number | null;
  booleanValue: number | null;
}

export interface VisitorActivityRow {
  date: string;
  count: number;
}

export interface GeoPointRow {
  latitude: number;
  longitude: number;
  timestampMs: number;
  country: string;
  region: string;
  regionCode: string;
  city: string;
}

export interface GeoCountryCountRow {
  country: string;
  views: number;
  sessions: number;
  visitors: number;
}

export interface GeoDimensionCountRow {
  value: string;
  label: string;
  views: number;
  sessions: number;
  visitors: number;
}

export interface GeoPointAggregate {
  points: GeoPointRow[];
  countryCounts: GeoCountryCountRow[];
  regionCounts: GeoDimensionCountRow[];
  cityCounts: GeoDimensionCountRow[];
}

export type ClientDimensionKey =
  | "browser"
  | "operatingSystem"
  | "osVersion"
  | "deviceType"
  | "language"
  | "screenSize";

export type UtmDimensionKey =
  | "source"
  | "medium"
  | "campaign"
  | "term"
  | "content";
export type OverviewGeoTabKey =
  | "country"
  | "region"
  | "city"
  | "continent"
  | "timezone"
  | "organization";

export interface ClientDimensionTabs {
  browser: DimensionRow[];
  osVersion: DimensionRow[];
  deviceType: DimensionRow[];
  language: DimensionRow[];
  screenSize: DimensionRow[];
}

export interface GeoDimensionTabs {
  country: GeoTabRow[];
  region: GeoTabRow[];
  city: GeoTabRow[];
  continent: GeoTabRow[];
  timezone: GeoTabRow[];
  organization: GeoTabRow[];
}

export interface PublicSiteEnvelope {
  slug: string;
  name: string;
  domain: string;
}

export interface PreferredSourceResult<T> {
  value: T;
  source: "ae" | "d1";
  approximateVisitors?: boolean;
}

export interface SiteQueryResponseOptions {
  publicSite?: PublicSiteEnvelope;
}

export type FilterOptionKey = Exclude<
  keyof DashboardFilters,
  "eventPayloadFilters"
>;

export interface DashboardFilterOption {
  value: string;
  label: string;
  group?: "country" | "region" | "city";
}

export const jsonResponse = (
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

export const badRequest = (
  message: string,
  extraHeaders?: Record<string, string>,
) => jsonResponse({ ok: false, error: message }, 400, extraHeaders);
export const unauthorized = (
  message = "Unauthorized",
  extraHeaders?: Record<string, string>,
) => jsonResponse({ ok: false, error: message }, 401, extraHeaders);
export const notFound = (
  message = "Not Found",
  extraHeaders?: Record<string, string>,
) => jsonResponse({ ok: false, error: message }, 404, extraHeaders);
export const notAllowed = (extraHeaders?: Record<string, string>) =>
  jsonResponse({ ok: false, error: "Method Not Allowed" }, 405, extraHeaders);

export function parseWindow(url: URL): QueryWindow | null {
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

export function parseLimit(url: URL, fallback = 20, max = 500): number {
  const value = Math.floor(
    coerceNumber(url.searchParams.get("limit"), fallback) ?? fallback,
  );
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(max, value);
}

export function parseInterval(url: URL): Interval {
  const raw = (url.searchParams.get("interval") || "day").toLowerCase();
  if (raw === "minute" || raw === "hour" || raw === "week" || raw === "month")
    return raw;
  return "day";
}

export function parseBooleanSearchParam(url: URL, key: string): boolean {
  const value = (url.searchParams.get(key) || "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

export function parseQueryLimit(
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

export function parseSortDirection(url: URL): SortDirection {
  return (url.searchParams.get("sortDir") || "").trim().toLowerCase() === "asc"
    ? "asc"
    : "desc";
}

export function parseVisitorListSort(url: URL): ListSort<VisitorListSortKey> {
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

export function parseSessionListSort(url: URL): ListSort<SessionListSortKey> {
  const key = (url.searchParams.get("sortBy") || "").trim();
  if (key === "startedAt" || key === "durationMs" || key === "views") {
    return { key, direction: parseSortDirection(url) };
  }
  return DEFAULT_SESSION_LIST_SORT;
}

export function parseEventRecordSort(url: URL): ListSort<EventRecordSortKey> {
  const key = (url.searchParams.get("sortBy") || "").trim();
  if (key === "occurredAt" || key === "eventName" || key === "pathname") {
    return { key, direction: parseSortDirection(url) };
  }
  return DEFAULT_EVENT_RECORD_SORT;
}

export function parseListSearch(url: URL): string | undefined {
  const raw = url.searchParams.get("search") ?? url.searchParams.get("q");
  if (typeof raw !== "string") return undefined;
  const normalized = raw.trim().slice(0, 160);
  return normalized.length > 0 ? normalized : undefined;
}

export function parseEventName(url: URL): string | undefined {
  const raw = url.searchParams.get("eventName");
  if (typeof raw !== "string") return undefined;
  const normalized = raw.trim().slice(0, 120);
  return normalized.length > 0 ? normalized : undefined;
}

export function parseEventFieldPath(url: URL): string | undefined {
  const raw = url.searchParams.get("fieldPath");
  if (typeof raw !== "string") return undefined;
  const normalized = raw.slice(0, 240);
  return normalized.length > 0 ? normalized : undefined;
}

export function parseEventFieldValueType(url: URL): string | undefined {
  const raw = url.searchParams.get("fieldValueType");
  if (typeof raw !== "string") return undefined;
  const normalized = raw.trim().toLowerCase();
  if (
    normalized === "string" ||
    normalized === "number" ||
    normalized === "boolean" ||
    normalized === "null" ||
    normalized === "object" ||
    normalized === "array"
  ) {
    return normalized;
  }
  return undefined;
}

export function parseEventId(url: URL): string | undefined {
  const raw = url.searchParams.get("eventId");
  if (typeof raw !== "string") return undefined;
  const normalized = raw.trim().slice(0, 128);
  return normalized.length > 0 ? normalized : undefined;
}

export function normalizeFilterValue(value: string | null): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().slice(0, 120);
  return normalized.length > 0 ? normalized : undefined;
}

export function normalizeEventPayloadFilterPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().slice(0, 240);
  if (!normalized || normalized === "/") return null;
  if (normalized.startsWith("/")) {
    const segments = normalized
      .split("/")
      .map((segment) => segment.trim())
      .filter(Boolean);
    return segments.length > 0 ? `/${segments.join("/")}` : null;
  }

  const dotPath = normalized
    .replace(/^\$\.?/, "")
    .replace(/\[(?:\d+|\*)\]/g, ".*")
    .split(".")
    .map((segment) => segment.trim())
    .filter(Boolean);
  return dotPath.length > 0 ? `/${dotPath.join("/")}` : null;
}

export function normalizeEventPayloadFilterValue(
  value: unknown,
): EventPayloadFilterValue | undefined {
  if (value === null) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.slice(0, 240);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return undefined;
}

export function parseEventPayloadFilters(
  value: string | null,
): EventPayloadFilterRule[] | undefined {
  if (typeof value !== "string" || value.trim().length === 0) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return undefined;
  }
  if (!Array.isArray(parsed)) return undefined;

  const rules: EventPayloadFilterRule[] = [];
  for (const item of parsed.slice(0, 12)) {
    if (!item || typeof item !== "object") continue;
    const candidate = item as {
      path?: unknown;
      operator?: unknown;
      value?: unknown;
    };
    const path = normalizeEventPayloadFilterPath(candidate.path);
    const operator =
      candidate.operator === "ne" || candidate.operator === "!=" ? "ne" : "eq";
    const filterValue = normalizeEventPayloadFilterValue(candidate.value);
    if (!path || filterValue === undefined) continue;
    rules.push({ path, operator, value: filterValue });
  }

  return rules.length > 0 ? rules : undefined;
}

export function parseFilters(url: URL): DashboardFilters {
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
    eventPayloadFilters: parseEventPayloadFilters(
      url.searchParams.get("eventPayloadFilters"),
    ),
  };
}

export function parseFilterOptionKey(url: URL): FilterOptionKey | null {
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

export function withoutFilterKey(
  filters: DashboardFilters,
  key: FilterOptionKey,
): DashboardFilters {
  const next = { ...filters };
  delete next[key];
  return next;
}

export function appendSqlConditions(
  baseClause: string,
  conditions: string[],
): string {
  const normalizedConditions = conditions
    .map((condition) => condition.trim())
    .filter((condition) => condition.length > 0);
  if (normalizedConditions.length === 0) return baseClause;
  if (baseClause.trim().length > 0) {
    return `${baseClause} AND ${normalizedConditions.join(" AND ")}`;
  }
  return `WHERE ${normalizedConditions.join(" AND ")}`;
}

export function sourceLabel(
  window: QueryWindow,
): "detail" | "archive" | "mixed" {
  const archiveCutoff = window.nowMs - RETENTION_DAYS * ONE_DAY_MS;
  if (window.toMs < archiveCutoff) return "archive";
  if (window.fromMs < archiveCutoff) return "mixed";
  return "detail";
}

export function avgDuration(totalDuration: number, sessions: number): number {
  if (sessions <= 0) return 0;
  return Math.round(totalDuration / sessions);
}

export function bounceRate(bounces: number, sessions: number): number {
  if (sessions <= 0) return 0;
  return Number((bounces / sessions).toFixed(6));
}

export function percentChange(
  current: number,
  previous: number,
): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0)
    return null;
  return ((current - previous) / previous) * 100;
}

export function intervalBucketMs(interval: Interval): number {
  if (interval === "minute") return 60_000;
  if (interval === "hour") return ONE_HOUR_MS;
  if (interval === "day") return ONE_DAY_MS;
  if (interval === "week") return 7 * ONE_DAY_MS;
  return 30 * ONE_DAY_MS;
}

export interface TimeBucket {
  index: number;
  timestampMs: number;
  fromMs: number;
  toMs: number;
}

export interface TimeBucketCase {
  sql: string;
  bindings: number[];
}

export function sqlIntegerLiteral(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error("Invalid time bucket boundary");
  }
  return String(Math.trunc(value));
}

export function buildTimeBuckets(
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

export function timeBucketCase(
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

export function timeBucketTimestamp(
  buckets: TimeBucket[],
  bucketIndex: number,
): number {
  return buckets[bucketIndex]?.timestampMs ?? 0;
}

export const SHARE_TREND_OTHER_KEY = "other";
export const SHARE_TREND_OTHER_LABEL = "Other";
export const SHARE_TREND_OTHER_TOKEN = "__share_trend_other__";
export const BROWSER_VERSION_UNKNOWN_TOKEN = "__browser_version_unknown__";
export const BROWSER_CROSS_UNKNOWN_TOKEN = "__browser_cross_unknown__";
export const BROWSER_CROSS_OTHER_BROWSER_TOKEN =
  "__browser_cross_other_browser__";
export const BROWSER_CROSS_OTHER_DIMENSION_TOKEN =
  "__browser_cross_other_dimension__";
export const CLIENT_CROSS_UNKNOWN_TOKEN = "__client_cross_unknown__";
export const CLIENT_CROSS_OTHER_PRIMARY_TOKEN =
  "__client_cross_other_primary__";
export const CLIENT_CROSS_OTHER_SECONDARY_TOKEN =
  "__client_cross_other_secondary__";

export const PERFORMANCE_METRIC_COLUMNS: Record<PerformanceMetricKey, string> =
  {
    ttfb: "perf_ttfb_ms",
    fcp: "perf_fcp_ms",
    lcp: "perf_lcp_ms",
    cls: "perf_cls",
    inp: "perf_inp_ms",
  };
export const PERFORMANCE_METRIC_KEYS = Object.keys(
  PERFORMANCE_METRIC_COLUMNS,
) as PerformanceMetricKey[];

export function shareTrendSeriesKey(
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

export function normalizePathname(pathname: string): string {
  const normalized = String(pathname || "").trim();
  return normalized.length > 0 ? normalized : "/";
}

export function formatPageLabel(
  pathname: string,
  query = "",
  hash = "",
  includeDetails = false,
): string {
  const base = normalizePathname(pathname);
  if (!includeDetails) return base;
  return `${base}${query || ""}${hash || ""}`;
}

export function osVersionExpr(alias = ""): string {
  const prefix = alias ? `${alias}.` : "";
  return `trim(CASE WHEN ${prefix}os != '' AND ${prefix}os_version != '' THEN ${prefix}os || ' ' || ${prefix}os_version WHEN ${prefix}os != '' THEN ${prefix}os WHEN ${prefix}os_version != '' THEN ${prefix}os_version ELSE '' END)`;
}

export function browserMajorVersionExpr(alias = ""): string {
  const prefix = alias ? `${alias}.` : "";
  return `trim(CASE WHEN ${prefix}browser_version = '' THEN '' WHEN instr(${prefix}browser_version, '.') > 0 THEN substr(${prefix}browser_version, 1, instr(${prefix}browser_version, '.') - 1) ELSE ${prefix}browser_version END)`;
}

export function screenSizeExpr(alias = ""): string {
  const prefix = alias ? `${alias}.` : "";
  return `CASE WHEN ${prefix}screen_width > 0 AND ${prefix}screen_height > 0 THEN CAST(${prefix}screen_width AS TEXT) || 'x' || CAST(${prefix}screen_height AS TEXT) ELSE '' END`;
}

export function clientDimensionDefinition(
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

export function utmDimensionDefinition(
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

export function referrerDomainDimensionDefinition(alias = ""): {
  labelExpr: string;
  fallbackKeyBase: string;
} {
  const prefix = alias ? `${alias}.` : "";

  return {
    labelExpr: `CASE WHEN TRIM(COALESCE(${prefix}referrer_host, '')) != '' THEN TRIM(COALESCE(${prefix}referrer_host, '')) ELSE '${DIRECT_REFERRER_FILTER_VALUE}' END`,
    fallbackKeyBase: "referrer-domain",
  };
}

export function siteQueryHeaders(
  options: SiteQueryResponseOptions,
): Record<string, string> {
  return options.publicSite ? PUBLIC_CACHE_HEADERS : PRIVATE_CACHE_HEADERS;
}

export function siteQueryResponse(
  siteId: string,
  payload: Record<string, unknown>,
  options: SiteQueryResponseOptions = {},
): Response {
  const body = options.publicSite
    ? { ...payload, site: options.publicSite, privacy: PUBLIC_PRIVACY }
    : { ...payload, siteId };
  return jsonResponse(body, 200, siteQueryHeaders(options));
}

export function parseBooleanFlag(url: URL, key: string): boolean {
  return parseBooleanSearchParam(url, key);
}

export function mapOverviewAggregate(
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

export function emptyOverviewAggregateRow(): OverviewAggregateRow {
  return {
    views: 0,
    sessions: 0,
    visitors: 0,
    bounces: 0,
    totalDuration: 0,
    durationViews: 0,
  };
}

export function mapPageCardMetrics(row: OverviewAggregateRow) {
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

export function mapTrendRows(
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

export function mapPages(rows: PageRow[]) {
  return rows.map((row) => ({
    pathname: row.pathname,
    query: row.query,
    hash: row.hash,
    views: row.views,
    sessions: row.sessions,
  }));
}

export function mapTabs(rows: DimensionRow[]) {
  return rows.map((row) => ({
    label: row.value,
    views: row.views,
    sessions: row.sessions,
    visitors: row.visitors,
  }));
}

export function mapGeoTabs(rows: GeoTabRow[]) {
  return rows.map((row) => ({
    value: row.value,
    label: row.label,
    views: row.views,
    sessions: row.sessions,
    visitors: row.visitors,
  }));
}

export function mapEventAnalyticsContextCards(
  cards: EventAnalyticsContextCards,
) {
  return {
    page: {
      path: mapTabs(cards.page.path),
      query: mapTabs(cards.page.query),
      title: mapTabs(cards.page.title),
      hostname: mapTabs(cards.page.hostname),
      entry: mapTabs(cards.page.entry),
      exit: mapTabs(cards.page.exit),
    },
    source: {
      domain: mapTabs(cards.source.domain),
      link: mapTabs(cards.source.link),
    },
    client: {
      browser: mapTabs(cards.client.browser),
      osVersion: mapTabs(cards.client.osVersion),
      deviceType: mapTabs(cards.client.deviceType),
      language: mapTabs(cards.client.language),
      screenSize: mapTabs(cards.client.screenSize),
    },
    geo: {
      country: mapGeoTabs(cards.geo.country),
      region: mapGeoTabs(cards.geo.region),
      city: mapGeoTabs(cards.geo.city),
      continent: mapGeoTabs(cards.geo.continent),
      timezone: mapGeoTabs(cards.geo.timezone),
      organization: mapGeoTabs(cards.geo.organization),
    },
  };
}

export function mapEventSummaryCards(cards: EventSummaryCards) {
  return {
    event: {
      name: mapTabs(cards.event.name),
    },
    page: {
      path: mapTabs(cards.page.path),
      title: mapTabs(cards.page.title),
      hostname: mapTabs(cards.page.hostname),
    },
  };
}

export function mapEventRecord(row: EventRecordRow) {
  return {
    eventId: row.eventId,
    eventName: row.eventName,
    occurredAt: row.occurredAt,
    receivedAt: row.receivedAt,
    sequence: row.sequence,
    visitId: row.visitId,
    sessionId: row.sessionId,
    visitorId: row.visitorId,
    pathname: row.pathname,
    title: row.title,
    hostname: row.hostname,
    referrerHost: row.referrerHost,
    country: row.country,
    region: row.region,
    browser: row.browser,
    browserVersion: row.browserVersion,
    os: row.os,
    osVersion: row.osVersion,
    deviceType: row.deviceType,
    nodeCount: row.nodeCount,
    valueCount: row.valueCount,
  };
}

export function customEventJsonTypeLabel(valueType: number): string {
  if (valueType === 1) return "string";
  if (valueType === 2) return "number";
  if (valueType === 3) return "boolean";
  if (valueType === 4) return "object";
  if (valueType === 5) return "array";
  return "null";
}

export function customEventJsonTypeCode(valueType: string): number | null {
  if (valueType === "null") return 0;
  if (valueType === "string") return 1;
  if (valueType === "number") return 2;
  if (valueType === "boolean") return 3;
  if (valueType === "object") return 4;
  if (valueType === "array") return 5;
  return null;
}

export function mapEventField(row: EventFieldRow) {
  let exampleValue: string | number | boolean | null = null;
  if (row.valueType === 1 && row.stringValue !== null) {
    exampleValue = row.stringValue;
  } else if (row.valueType === 2 && row.numberValue !== null) {
    exampleValue = row.numberValue;
  } else if (row.valueType === 3 && row.booleanValue !== null) {
    exampleValue = row.booleanValue === 1;
  }
  return {
    path: row.path,
    valueType: customEventJsonTypeLabel(row.valueType),
    events: row.events,
    occurrences: row.occurrences,
    firstSeenAt: row.firstSeenAt,
    lastSeenAt: row.lastSeenAt,
    exampleValue,
  };
}

export function mapEventFieldValue(row: EventFieldValueRow) {
  let value: string | number | boolean | null = null;
  if (row.valueType === 1) {
    value = row.stringValue ?? "";
  } else if (row.valueType === 2) {
    value = Number(row.numberValue ?? 0);
  } else if (row.valueType === 3) {
    value = row.booleanValue === 1;
  }
  return {
    value,
    events: Number(row.events ?? 0),
    occurrences: Number(row.occurrences ?? 0),
    firstSeenAt: Number(row.firstSeenAt ?? 0),
    lastSeenAt: Number(row.lastSeenAt ?? 0),
  };
}

export function mapReferrers(rows: ReferrerRow[]) {
  return rows.map((row) => ({
    referrer: row.referrer,
    views: row.views,
    sessions: row.sessions,
  }));
}

export function mapVisitors(rows: VisitorRow[]) {
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

export function dedupeFilterOptions(
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

export function mapDimensionRowsToFilterOptions(
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

export function mapReferrerRowsToFilterOptions(
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

export function mapGeoRowsToFilterOptions(
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

export interface DimensionAccumulator {
  views: number;
  sessions: Set<string>;
  visitors: Set<string>;
}

export interface GeoDimensionAccumulator extends DimensionAccumulator {
  visitors: Set<string>;
}

export function addDimensionValue(
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

export function finalizeDimensionBuckets(
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

export function addGeoDimensionValue(
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

export function finalizeGeoDimensionBuckets(
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

export function geoTabLabel(value: string, tab: OverviewGeoTabKey): string {
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

export async function resolvePrivateSite(
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

export async function resolvePrivateTeam(
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

export async function fetchPublicSite(
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

export function regionValueExpr(): string {
  return "CASE WHEN TRIM(country) = '' AND TRIM(region_code) = '' AND TRIM(region) = '' THEN '' ELSE TRIM(country) || '::' || CASE WHEN TRIM(region_code) != '' THEN TRIM(region_code) ELSE TRIM(region) END || '::' || TRIM(region) END";
}

export function cityValueExpr(): string {
  return "CASE WHEN TRIM(country) = '' AND TRIM(region_code) = '' AND TRIM(region) = '' AND TRIM(city) = '' THEN '' ELSE TRIM(country) || '::' || CASE WHEN TRIM(region_code) != '' THEN TRIM(region_code) ELSE TRIM(region) END || '::' || TRIM(region) || '::' || TRIM(city) END";
}

export const VISIT_SOURCE_COLUMNS = `
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

export function buildVisitSourceCte(): string {
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

export function buildCustomEventSourceCte(): string {
  return `
event_source AS (
  SELECT
    ce.event_id,
    ce.site_id,
    ce.visit_id,
    v.visitor_id,
    v.session_id,
    ce.occurred_at,
    cen.name AS event_name,
    '{}' AS event_data_json,
    v.pathname,
    v.query_string,
    v.hash_fragment,
    v.hostname,
    v.title,
    v.referrer_url,
    v.referrer_host,
    v.country,
    v.region,
    v.city,
    v.browser,
    v.os,
    v.os_version,
    v.device_type,
    v.language,
    v.timezone,
    v.screen_width,
    v.screen_height,
    ce.ae_synced_at
  FROM custom_events ce
  INNER JOIN custom_event_names cen
    ON cen.id = ce.event_name_id
  INNER JOIN visits v
    ON v.site_id = ce.site_id
   AND v.visit_id = ce.visit_id
  WHERE ce.site_id = ? AND ce.occurred_at BETWEEN ? AND ?
)`;
}

export function buildTargetVisitSourceCte(
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

export function buildDetailCustomEventSourceCte(): string {
  return `
event_source AS (
  SELECT
    ce.event_id, ce.site_id, ce.visit_id, fv.visitor_id, fv.session_id,
    ce.occurred_at, cen.name AS event_name, '{}' AS event_data_json,
    fv.pathname, fv.query_string,
    fv.hash_fragment,
    fv.hostname, fv.title,
    fv.referrer_url, fv.referrer_host, fv.country, fv.region, fv.city,
    fv.browser, fv.browser_version, fv.os, fv.os_version, fv.device_type,
    fv.language, fv.timezone, fv.screen_width, fv.screen_height,
    fv.perf_ttfb_ms, fv.perf_fcp_ms, fv.perf_lcp_ms, fv.perf_cls, fv.perf_inp_ms,
    ce.ae_synced_at
  FROM custom_events ce
  INNER JOIN custom_event_names cen
    ON cen.id = ce.event_name_id
  INNER JOIN filtered_visits fv
    ON fv.site_id = ce.site_id AND fv.visit_id = ce.visit_id
  WHERE ce.site_id = ?
)`;
}

export function buildEventAnalyticsSourceCte(): string {
  return `
event_source AS (
  SELECT
    ce.event_pk,
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
    v.query_string,
    v.hash_fragment,
    v.hostname,
    v.title,
    v.referrer_url,
    v.referrer_host,
    v.country,
    v.region,
    v.region_code,
    v.city,
    v.continent,
    v.browser,
    v.browser_version,
    v.os,
    v.os_version,
    v.device_type,
    v.language,
    v.timezone,
    v.screen_width,
    v.screen_height,
    v.as_organization
  FROM custom_events ce
  INNER JOIN custom_event_names cen
    ON cen.id = ce.event_name_id
  INNER JOIN visits v
    ON v.site_id = ce.site_id
   AND v.visit_id = ce.visit_id
  WHERE ce.site_id = ? AND ce.occurred_at BETWEEN ? AND ?
)`;
}

export function buildEventFilteredSourceCte(
  siteId: string,
  window: QueryWindow,
  filters: DashboardFilters,
  eventName?: string,
): {
  cte: string;
  bindings: Array<string | number>;
} {
  const filter = buildEventFilterSql(filters, "es", { eventName });
  return {
    cte: `
WITH
${buildVisitSourceCte()},
${buildEventAnalyticsSourceCte()},
filtered_events AS (
  SELECT *
  FROM event_source es
  ${filter.clause}
)`,
    bindings: [
      ...visitSourceBindings(siteId, window),
      ...eventSourceBindings(siteId, window),
      ...filter.bindings,
    ],
  };
}

export function visitSourceBindings(
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

export function eventSourceBindings(
  siteId: string,
  window: QueryWindow,
): Array<string | number> {
  return [siteId, window.fromMs, window.toMs];
}

export function targetVisitSourceBindings(
  siteId: string,
  targetValue: string,
): Array<string | number> {
  return [siteId, targetValue, siteId, targetValue];
}

export function detailCustomEventSourceBindings(
  siteId: string,
): Array<string | number> {
  return [siteId];
}

export function buildVisitSourceCteForSites(siteCount: number): string {
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

export function visitSourceBindingsForSites(
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

export const DIRECT_REFERRER_FILTER_VALUE = "__direct__";

export interface ParsedGeoFilter {
  country: string;
  regionCode?: string;
  regionName?: string;
  city?: string;
}

export function parseGeoFilterValue(
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

export function withoutGeoFilter(filters: DashboardFilters): DashboardFilters {
  return {
    ...filters,
    geo: undefined,
  };
}

export function buildVisitFilterSql(
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

export function eventPayloadFilterValueType(
  value: EventPayloadFilterValue,
): "string" | "number" | "boolean" | "null" {
  if (value === null) return "null";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  return "string";
}

export function buildEventPayloadFilterSql(
  filters: DashboardFilters,
  alias = "es",
): { clauses: string[]; bindings: Array<string | number> } {
  const rules = filters.eventPayloadFilters ?? [];
  if (rules.length === 0) return { clauses: [], bindings: [] };

  const prefix = alias ? `${alias}.` : "";
  const clauses: string[] = [];
  const bindings: Array<string | number> = [];

  rules.forEach((rule, index) => {
    const path = normalizeEventPayloadFilterPath(rule.path);
    const value = normalizeEventPayloadFilterValue(rule.value);
    if (!path || value === undefined) return;

    const valueType = eventPayloadFilterValueType(value);
    const valueTypeCode = customEventJsonTypeCode(valueType);
    if (valueTypeCode === null) return;

    const valueAlias = `epv${index}`;
    const pathAlias = `epp${index}`;
    const operator = rule.operator === "ne" ? "!=" : "=";
    const baseCondition = `
      ${valueAlias}.event_pk = ${prefix}event_pk
      AND ${valueAlias}.site_id = ${prefix}site_id
      AND ${pathAlias}.path = ?`;

    if (valueType === "null") {
      clauses.push(`EXISTS (
        SELECT 1
        FROM custom_event_json_values ${valueAlias}
        INNER JOIN custom_event_json_paths ${pathAlias}
          ON ${pathAlias}.id = ${valueAlias}.path_id
        WHERE ${baseCondition}
          AND ${valueAlias}.value_type ${operator} ?
      )`);
      bindings.push(path, valueTypeCode);
      return;
    }

    let valueCondition = "";
    if (valueType === "string") {
      valueCondition = `COALESCE(${valueAlias}.string_value, '') ${operator} ?`;
      bindings.push(path, valueTypeCode, String(value));
    } else if (valueType === "number") {
      valueCondition = `${valueAlias}.number_value ${operator} ?`;
      bindings.push(path, valueTypeCode, Number(value));
    } else {
      valueCondition = `${valueAlias}.boolean_value ${operator} ?`;
      bindings.push(path, valueTypeCode, value ? 1 : 0);
    }

    clauses.push(`EXISTS (
      SELECT 1
      FROM custom_event_json_values ${valueAlias}
      INNER JOIN custom_event_json_paths ${pathAlias}
        ON ${pathAlias}.id = ${valueAlias}.path_id
      WHERE ${baseCondition}
        AND ${valueAlias}.value_type = ?
        AND ${valueCondition}
    )`);
  });

  return { clauses, bindings };
}

export function buildEventFilterSql(
  filters: DashboardFilters,
  alias = "es",
  options?: { eventName?: string; search?: string },
): { clause: string; bindings: Array<string | number> } {
  const visitFilter = buildVisitFilterSql(filters, alias);
  const clauses: string[] = visitFilter.clause
    ? [visitFilter.clause.replace(/^WHERE\s+/i, "")]
    : [];
  const bindings: Array<string | number> = [...visitFilter.bindings];
  const prefix = alias ? `${alias}.` : "";
  const payloadFilter = buildEventPayloadFilterSql(filters, alias);

  clauses.push(...payloadFilter.clauses);
  bindings.push(...payloadFilter.bindings);

  if (options?.eventName) {
    clauses.push(`TRIM(COALESCE(${prefix}event_name, '')) = ?`);
    bindings.push(options.eventName);
  }

  if (options?.search) {
    const token = `%${options.search.toLowerCase()}%`;
    clauses.push(
      `(
        LOWER(TRIM(COALESCE(${prefix}event_name, ''))) LIKE ?
        OR LOWER(TRIM(COALESCE(${prefix}event_id, ''))) LIKE ?
        OR LOWER(TRIM(COALESCE(${prefix}visit_id, ''))) LIKE ?
        OR LOWER(TRIM(COALESCE(${prefix}session_id, ''))) LIKE ?
        OR LOWER(TRIM(COALESCE(${prefix}visitor_id, ''))) LIKE ?
        OR LOWER(TRIM(COALESCE(${prefix}pathname, ''))) LIKE ?
        OR LOWER(TRIM(COALESCE(${prefix}title, ''))) LIKE ?
        OR LOWER(TRIM(COALESCE(${prefix}hostname, ''))) LIKE ?
      )`,
    );
    bindings.push(token, token, token, token, token, token, token, token);
  }

  return clauses.length > 0
    ? { clause: `WHERE ${clauses.join(" AND ")}`, bindings }
    : { clause: "", bindings };
}

export function eventRecordOrderBy(sort: ListSort<EventRecordSortKey>): string {
  const direction = sort.direction === "asc" ? "ASC" : "DESC";
  if (sort.key === "eventName") {
    return `eventName ${direction}, occurredAt DESC, eventId DESC`;
  }
  if (sort.key === "pathname") {
    return `pathname ${direction}, occurredAt DESC, eventId DESC`;
  }
  return `occurredAt ${direction}, eventId ${direction}`;
}

export async function queryD1All<T extends object>(
  env: Env,
  sql: string,
  bindings: Array<string | number | null>,
): Promise<T[]> {
  const result = await env.DB.prepare(sql)
    .bind(...bindings)
    .all<T>();
  return result.results;
}

export function performanceMetricColumn(metric: PerformanceMetricKey): string {
  return PERFORMANCE_METRIC_COLUMNS[metric];
}

export function roundPerformanceValue(value: unknown): number | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.round(numeric * 1000) / 1000;
}

export function nullablePerformanceValue(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return Math.round(numeric * 1000) / 1000;
}

export function emptyVisitPerformanceMetrics(): VisitPerformanceMetricsRow {
  return {
    ttfb: null,
    fcp: null,
    lcp: null,
    cls: null,
    inp: null,
  };
}

export function mapVisitPerformanceMetrics(
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

export function emptyPerformanceRouteMetric(): PerformanceRouteMetricRow {
  return {
    avg: null,
    p50: null,
    p75: null,
    p95: null,
    samples: 0,
  };
}

export function emptyPerformanceRouteMetrics(): Record<
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
