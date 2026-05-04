import type { SiteScriptSettings } from "@/lib/site-settings";

import { getSessionToken } from "./auth";
import { DEFAULT_EDGE_BASE_URL } from "./constants";

type HttpMethod = "GET" | "POST" | "PATCH";

interface FetchEdgeOptions {
  method?: HttpMethod;
  path: string;
  params?: Record<string, string | number>;
  body?: unknown;
  isPublic?: boolean;
}

export interface QueryFilters {
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

async function edgeBaseUrl(): Promise<string> {
  const configured = (process.env.INSIGHTFLARE_EDGE_URL || "").trim();
  if (configured.length > 0) {
    return configured;
  }

  try {
    const { headers } = await import("next/headers");
    const h = await headers();
    const host = h.get("x-forwarded-host") || h.get("host");
    if (host) {
      const proto =
        h.get("x-forwarded-proto") ||
        (host.startsWith("localhost") || host.startsWith("127.0.0.1")
          ? "http"
          : "https");
      return `${proto}://${host}`;
    }
  } catch {
    // Ignore when headers() is unavailable outside request scope.
  }

  return DEFAULT_EDGE_BASE_URL;
}

function withQuery(url: URL, params?: Record<string, string | number>): URL {
  if (!params) return url;
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }
  return url;
}

function withFilters(
  params: Record<string, string | number>,
  filters?: QueryFilters,
): Record<string, string | number> {
  const next = { ...params };
  if (!filters) return next;
  if (filters.country) next.country = filters.country;
  if (filters.device) next.device = filters.device;
  if (filters.browser) next.browser = filters.browser;
  if (filters.path) next.path = filters.path;
  if (filters.query) next.query = filters.query;
  if (filters.title) next.title = filters.title;
  if (filters.hostname) next.hostname = filters.hostname;
  if (filters.entry) next.entry = filters.entry;
  if (filters.exit) next.exit = filters.exit;
  if (filters.sourceDomain) next.sourceDomain = filters.sourceDomain;
  if (filters.sourceLink) next.sourceLink = filters.sourceLink;
  if (filters.clientBrowser) next.clientBrowser = filters.clientBrowser;
  if (filters.clientOsVersion) next.clientOsVersion = filters.clientOsVersion;
  if (filters.clientDeviceType)
    next.clientDeviceType = filters.clientDeviceType;
  if (filters.clientLanguage) next.clientLanguage = filters.clientLanguage;
  if (filters.clientScreenSize)
    next.clientScreenSize = filters.clientScreenSize;
  if (filters.geo) next.geo = filters.geo;
  if (filters.geoContinent) next.geoContinent = filters.geoContinent;
  if (filters.geoTimezone) next.geoTimezone = filters.geoTimezone;
  if (filters.geoOrganization) next.geoOrganization = filters.geoOrganization;
  return next;
}

async function fetchEdgeJson<T>(options: FetchEdgeOptions): Promise<T> {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "1") {
    const { handleDemoRequest } = await import("@/lib/realtime/mock");
    return handleDemoRequest({
      path: options.path,
      method: options.method,
      params: options.params as Record<string, string | number> | undefined,
      body: options.body,
    }) as T;
  }
  const method = options.method || "GET";
  const baseUrl = await edgeBaseUrl();
  const url = withQuery(new URL(options.path, baseUrl), options.params);

  const headers = new Headers();
  if (!options.isPublic) {
    try {
      const sessionToken = await getSessionToken();
      if (sessionToken) {
        headers.set("authorization", `Bearer ${sessionToken}`);
      }
    } catch {
      // Ignore when session is unavailable outside request scope.
    }
  }
  if (method !== "GET") {
    headers.set("content-type", "application/json");
  }

  const res = await fetch(url.toString(), {
    method,
    headers,
    body: method === "GET" ? undefined : JSON.stringify(options.body ?? {}),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Edge API failed (${res.status} ${method} ${url.pathname}): ${text}`,
    );
  }

  return (await res.json()) as T;
}

export interface OverviewMetrics {
  views: number;
  sessions: number;
  visitors: number;
  bounces: number;
  totalDurationMs: number;
  avgDurationMs: number;
  bounceRate: number;
  approximateVisitors?: boolean;
}

export interface OverviewChangeRates {
  views: number | null;
  sessions: number | null;
  visitors: number | null;
  bounces: number | null;
  bounceRate: number | null;
  avgDurationMs: number | null;
}

export interface OverviewDetailPoint {
  bucket: number;
  timestampMs: number;
  views: number;
  visitors: number;
  sessions: number;
  bounces: number;
  totalDurationMs: number;
  avgDurationMs: number;
  source: "detail" | "archive" | "mixed";
}

export interface OverviewDetailData {
  interval: "minute" | "hour" | "day" | "week" | "month";
  data: OverviewDetailPoint[];
}

export interface OverviewData {
  ok: boolean;
  data: OverviewMetrics;
  previousData?: OverviewMetrics;
  changeRates?: OverviewChangeRates;
  detail?: OverviewDetailData;
}

export interface TrendPoint {
  bucket: number;
  timestampMs: number;
  views: number;
  visitors: number;
  sessions: number;
  bounces: number;
  totalDurationMs: number;
  avgDurationMs: number;
  source: "detail" | "archive" | "mixed";
}

export interface TrendData {
  ok: boolean;
  interval: "minute" | "hour" | "day" | "week" | "month";
  data: TrendPoint[];
}

export type ClientDimensionKey =
  | "browser"
  | "operatingSystem"
  | "osVersion"
  | "deviceType"
  | "language"
  | "screenSize";

export interface BrowserTrendSeries {
  key: string;
  label: string;
  views: number;
  visitors: number;
  sessions: number;
  isOther?: boolean;
}

export interface BrowserTrendPoint {
  bucket: number;
  timestampMs: number;
  totalVisitors: number;
  visitorsBySeries: Record<string, number>;
}

export interface BrowserTrendData {
  ok: boolean;
  interval: "minute" | "hour" | "day" | "week" | "month";
  series: BrowserTrendSeries[];
  data: BrowserTrendPoint[];
}

export type PerformanceMetricKey = "ttfb" | "fcp" | "lcp" | "cls" | "inp";

export interface VisitPerformanceMetrics {
  ttfb: number | null;
  fcp: number | null;
  lcp: number | null;
  cls: number | null;
  inp: number | null;
}

export interface JourneyPerformanceMetricSummary {
  avg: number | null;
  p75: number | null;
  min: number | null;
  max: number | null;
  samples: number;
}

export type JourneyPerformanceSummary = Record<
  PerformanceMetricKey,
  JourneyPerformanceMetricSummary
>;

export interface PerformanceSummary {
  avg: number | null;
  p50: number | null;
  p75: number | null;
  p95: number | null;
  samples: number;
}

export interface PerformanceTrendPoint {
  bucket: number;
  timestampMs: number;
  avg: number | null;
  p50: number | null;
  p75: number | null;
  p95: number | null;
  samples: number;
}

export interface PerformanceRouteMetricSummary {
  avg: number | null;
  p50: number | null;
  p75: number | null;
  p95: number | null;
  samples: number;
}

export interface PerformanceRouteSummary {
  pathname: string;
  views: number;
  metrics: Record<PerformanceMetricKey, PerformanceRouteMetricSummary>;
}

export interface PerformanceCountrySummary {
  country: string;
  views: number;
  metrics: Record<PerformanceMetricKey, PerformanceRouteMetricSummary>;
}

export interface PerformanceData {
  ok: boolean;
  interval: "minute" | "hour" | "day" | "week" | "month";
  summaries: Record<PerformanceMetricKey, PerformanceSummary>;
  trends: Record<PerformanceMetricKey, PerformanceTrendPoint[]>;
  routes: PerformanceRouteSummary[];
  countries: PerformanceCountrySummary[];
}

export interface BrowserVersionSlice {
  key: string;
  label: string;
  views: number;
  visitors: number;
  sessions: number;
  isOther?: boolean;
  isUnknown?: boolean;
}

export interface BrowserVersionBreakdownBrowser {
  browser: string;
  views: number;
  visitors: number;
  sessions: number;
  versions: BrowserVersionSlice[];
}

export interface BrowserVersionBreakdownData {
  ok: boolean;
  data: BrowserVersionBreakdownBrowser[];
}

export interface BrowserCrossBreakdownItem {
  key: string;
  label: string;
  views: number;
  visitors: number;
  sessions: number;
  isOther?: boolean;
  isUnknown?: boolean;
}

export interface BrowserCrossBreakdownRow extends BrowserCrossBreakdownItem {
  cells: BrowserCrossBreakdownItem[];
}

export interface BrowserCrossBreakdownDimensionData {
  columns: BrowserCrossBreakdownItem[];
  rows: BrowserCrossBreakdownRow[];
  totalVisitors: number;
}

export interface BrowserCrossBreakdownData {
  ok: boolean;
  operatingSystem: BrowserCrossBreakdownDimensionData;
  deviceType: BrowserCrossBreakdownDimensionData;
}

export interface BrowserRadarMetrics {
  /** Average session duration in ms */
  duration: number;
  /** Non-bounce rate (0..1) */
  engagement: number;
  /** Average pages per session */
  depth: number;
  /** Return visitor rate (0..1) */
  loyalty: number;
  /** Average sessions per visitor */
  frequency: number;
  /** Visitor share of total (0..1) */
  traffic: number;
}

export interface BrowserRadarItem {
  browser: string;
  visitors: number;
  sessions: number;
  metrics: BrowserRadarMetrics;
}

export interface BrowserRadarData {
  ok: boolean;
  data: BrowserRadarItem[];
}

export interface ReferrerRadarMetrics {
  /** Average session duration in ms */
  duration: number;
  /** Non-bounce rate (0..1) */
  engagement: number;
  /** Average pages per session */
  depth: number;
  /** Return visitor rate (0..1) */
  loyalty: number;
  /** Average sessions per visitor */
  frequency: number;
  /** Visitor share of total (0..1) */
  traffic: number;
}

export interface ReferrerRadarItem {
  referrer: string;
  visitors: number;
  sessions: number;
  metrics: ReferrerRadarMetrics;
}

export interface ReferrerRadarData {
  ok: boolean;
  data: ReferrerRadarItem[];
}

export interface PagesData {
  ok: boolean;
  data: Array<{
    pathname: string;
    query?: string;
    hash?: string;
    views: number;
    sessions: number;
  }>;
  tabs?: {
    path: Array<{
      label: string;
      views: number;
      sessions: number;
    }>;
    title: Array<{
      label: string;
      views: number;
      sessions: number;
    }>;
    hostname: Array<{
      label: string;
      views: number;
      sessions: number;
    }>;
    entry: Array<{
      label: string;
      views: number;
      sessions: number;
    }>;
    exit: Array<{
      label: string;
      views: number;
      sessions: number;
    }>;
  };
}

export interface PagesDashboardMetrics {
  views: number;
  visitors: number;
  sessions: number;
  bounceRate: number;
  pagesPerSession: number;
  avgDurationMs: number;
}

export interface PagesDashboardChangeRates {
  views: number | null;
  visitors: number | null;
  sessions: number | null;
  bounceRate: number | null;
  pagesPerSession: number | null;
  avgDurationMs: number | null;
}

export interface PagesDashboardItem {
  pathname: string;
  titles: string[];
  trend: Array<{
    timestampMs: number;
    views: number;
    visitors: number;
  }>;
  metrics: PagesDashboardMetrics;
  changeRates: PagesDashboardChangeRates;
}

export interface PagesDashboardData {
  ok: boolean;
  interval: "minute" | "hour" | "day" | "week" | "month";
  data: PagesDashboardItem[];
  meta: {
    page: number;
    pageSize: number;
    returned: number;
    hasMore: boolean;
    nextPage: number | null;
  };
}

export interface ReferrersData {
  ok: boolean;
  data: Array<{
    referrer: string;
    views: number;
    sessions: number;
  }>;
}

export interface VisitorsMeta {
  page: number;
  pageSize: number;
  returned: number;
  hasMore: boolean;
  nextPage: number | null;
}

export interface VisitorsData {
  ok: boolean;
  data: Array<{
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
  }>;
  meta: VisitorsMeta;
}

export interface JourneySession {
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
}

export interface JourneyLocationPoint {
  latitude: number;
  longitude: number;
  timestampMs: number;
  country: string;
  region?: string;
  regionCode?: string;
  city?: string;
}

export interface JourneyEvent {
  id: string;
  kind: "session_start" | "pageview" | "leave" | "custom";
  eventType: string;
  occurredAt: number;
  visitId: string;
  sessionId: string;
  visitorId: string;
  pathname: string;
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
  performance: VisitPerformanceMetrics;
}

export interface JourneyPageCount {
  pathname: string;
  views: number;
}

export interface JourneyEventCount {
  eventType: string;
  count: number;
}

export interface VisitorActivityDay {
  date: string;
  count: number;
}

export interface VisitorDetailData {
  ok: boolean;
  data: {
    visitor: VisitorsData["data"][number];
    metrics: {
      totalEvents: number;
      sessions: number;
      views: number;
      avgEventsPerSession: number;
      bounceRate: number;
      avgDurationMs: number;
      p90DurationMs: number;
      firstSeenAt: number;
      lastSeenAt: number;
      daysActive: number;
      conversionEvents: number;
      avgTimeBetweenSessionsMs: number;
    };
    sessions: JourneySession[];
    events: JourneyEvent[];
    visitedPages: JourneyPageCount[];
    eventDistribution: JourneyEventCount[];
    activity: VisitorActivityDay[];
    performance: JourneyPerformanceSummary;
  } | null;
}

export interface SessionsMeta {
  page: number;
  pageSize: number;
  returned: number;
  hasMore: boolean;
  nextPage: number | null;
}

export interface SessionsData {
  ok: boolean;
  data: JourneySession[];
  meta: SessionsMeta;
}

export interface SessionDetailData {
  ok: boolean;
  data: {
    session: JourneySession;
    locationPoints: JourneyLocationPoint[];
    events: JourneyEvent[];
    visitedPages: JourneyPageCount[];
    eventDistribution: JourneyEventCount[];
    performance: JourneyPerformanceSummary;
  } | null;
}

export interface DimensionData {
  ok: boolean;
  data: Array<{
    value: string;
    views: number;
    sessions: number;
  }>;
}

export interface RetentionData {
  ok: boolean;
  granularity: string;
  cohorts: Array<{
    bucket: number;
    size: number;
    periods: Array<{
      index: number;
      visitors: number;
      rate: number;
    }>;
  }>;
}

export interface FunnelStep {
  type: "pageview" | "event";
  value: string;
}

export interface FunnelDefinition {
  id: string;
  siteId: string;
  name: string;
  steps: FunnelStep[];
  createdAt: number;
  updatedAt: number;
}

export interface FunnelListData {
  ok: boolean;
  funnels: FunnelDefinition[];
}

export interface FunnelAnalysisData {
  ok: boolean;
  steps: Array<{
    index: number;
    label: string;
    type: string;
    sessions: number;
    conversionRate: number;
    dropOffRate: number;
  }>;
  overallConversionRate: number;
}

export interface OverviewClientDimensionTabsData {
  ok: boolean;
  tabs: {
    browser: Array<{ label: string; views: number; sessions: number }>;
    osVersion: Array<{ label: string; views: number; sessions: number }>;
    deviceType: Array<{ label: string; views: number; sessions: number }>;
    language: Array<{ label: string; views: number; sessions: number }>;
    screenSize: Array<{ label: string; views: number; sessions: number }>;
  };
}

export interface OverviewGeoDimensionTabsData {
  ok: boolean;
  tabs: {
    country: Array<{ label: string; views: number; sessions: number }>;
    region: Array<{ label: string; views: number; sessions: number }>;
    city: Array<{ label: string; views: number; sessions: number }>;
    continent: Array<{ label: string; views: number; sessions: number }>;
    timezone: Array<{ label: string; views: number; sessions: number }>;
    organization: Array<{ label: string; views: number; sessions: number }>;
  };
}

export interface OverviewGeoPointsData {
  ok: boolean;
  data: Array<{
    latitude: number;
    longitude: number;
    timestampMs: number;
    country: string;
    region?: string;
    regionCode?: string;
    city?: string;
  }>;
  countryCounts: Array<{
    country: string;
    views: number;
    sessions: number;
    visitors: number;
  }>;
  regionCounts: Array<{
    value: string;
    label: string;
    views: number;
    sessions: number;
    visitors: number;
  }>;
  cityCounts: Array<{
    value: string;
    label: string;
    views: number;
    sessions: number;
    visitors: number;
  }>;
}

export interface OverviewTabData {
  ok: boolean;
  data: Array<{
    label: string;
    views: number;
    sessions: number;
    visitors: number;
  }>;
}

export interface OverviewGeoTabData {
  ok: boolean;
  data: Array<{
    value: string;
    label: string;
    views: number;
    sessions: number;
    visitors: number;
  }>;
}

export interface DashboardFilterOption {
  value: string;
  label: string;
  group?: "country" | "region" | "city";
}

export interface DashboardFilterOptionsData {
  ok: boolean;
  data: DashboardFilterOption[];
}

export interface TeamData {
  id: string;
  name: string;
  slug: string;
  ownerUserId: string;
  createdAt: number;
  updatedAt?: number;
  siteCount: number;
  memberCount: number;
  membershipRole?: string;
}

export interface SiteData {
  id: string;
  teamId: string;
  name: string;
  domain: string;
  publicEnabled: number | boolean;
  publicSlug: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface MemberData {
  teamId: string;
  userId: string;
  role: string;
  joinedAt: number;
  username: string;
  email: string;
  name: string | null;
}

export interface AccountUserData {
  id: string;
  username: string;
  email: string;
  name: string;
  systemRole: "admin" | "user";
  timeZone?: string;
  createdAt: number;
  updatedAt: number;
  teamCount?: number;
  ownedTeamCount?: number;
}

export interface SiteConfigData {
  ok: boolean;
  data: SiteScriptSettings;
}

export interface ScriptSnippetData {
  ok: boolean;
  data: {
    siteId: string;
    src: string;
    snippet: string;
  };
}

export async function fetchPublicOverview(
  slug: string,
  params: {
    from: number;
    to: number;
  },
): Promise<OverviewData> {
  return fetchEdgeJson<OverviewData>({
    path: `/api/public/${encodeURIComponent(slug)}/overview`,
    params,
    isPublic: true,
  });
}

export async function fetchPublicTrend(
  slug: string,
  params: {
    from: number;
    to: number;
  },
): Promise<TrendData> {
  return fetchEdgeJson<TrendData>({
    path: `/api/public/${encodeURIComponent(slug)}/trend`,
    params: {
      ...params,
      interval: "day",
    },
    isPublic: true,
  });
}

export async function fetchPublicPages(
  slug: string,
  params: {
    from: number;
    to: number;
  },
): Promise<PagesData> {
  return fetchEdgeJson<PagesData>({
    path: `/api/public/${encodeURIComponent(slug)}/pages`,
    params: {
      ...params,
      limit: 8,
    },
    isPublic: true,
  });
}

export async function fetchPublicReferrers(
  slug: string,
  params: {
    from: number;
    to: number;
  },
): Promise<ReferrersData> {
  return fetchEdgeJson<ReferrersData>({
    path: `/api/public/${encodeURIComponent(slug)}/referrers`,
    params: {
      ...params,
      limit: 8,
    },
    isPublic: true,
  });
}

export async function fetchAdminTeams(userId?: string): Promise<TeamData[]> {
  const res = await fetchEdgeJson<{ ok: boolean; data: TeamData[] }>({
    path: "/api/private/admin/teams",
    params: userId ? { userId } : undefined,
  });
  return res.data;
}

export async function createAdminTeam(input: {
  name: string;
  slug?: string;
}): Promise<TeamData> {
  const res = await fetchEdgeJson<{ ok: boolean; data: TeamData }>({
    method: "POST",
    path: "/api/private/admin/teams",
    body: input,
  });
  return res.data;
}

export async function updateAdminTeam(input: {
  teamId: string;
  name?: string;
  slug?: string;
}): Promise<TeamData> {
  const res = await fetchEdgeJson<{ ok: boolean; data: TeamData }>({
    method: "PATCH",
    path: "/api/private/admin/teams",
    body: input,
  });
  return res.data;
}

export async function removeAdminTeam(input: {
  teamId: string;
}): Promise<{ teamId: string; removed: boolean }> {
  const res = await fetchEdgeJson<{
    ok: boolean;
    data: { teamId: string; removed: boolean };
  }>({
    method: "PATCH",
    path: "/api/private/admin/teams",
    body: {
      ...input,
      intent: "remove",
    },
  });
  return res.data;
}

export async function fetchAdminSites(teamId: string): Promise<SiteData[]> {
  const res = await fetchEdgeJson<{ ok: boolean; data: SiteData[] }>({
    path: "/api/private/admin/sites",
    params: { teamId },
  });
  return res.data;
}

export async function createAdminSite(input: {
  teamId: string;
  name: string;
  domain: string;
  publicEnabled?: boolean;
  publicSlug?: string;
}): Promise<SiteData> {
  const res = await fetchEdgeJson<{ ok: boolean; data: SiteData }>({
    method: "POST",
    path: "/api/private/admin/sites",
    body: input,
  });
  return res.data;
}

export async function updateAdminSite(input: {
  siteId: string;
  teamId?: string;
  name?: string;
  domain?: string;
  publicEnabled?: boolean;
  publicSlug?: string;
}): Promise<SiteData> {
  const res = await fetchEdgeJson<{ ok: boolean; data: SiteData }>({
    method: "PATCH",
    path: "/api/private/admin/sites",
    body: input,
  });
  return res.data;
}

export async function removeAdminSite(input: {
  siteId: string;
}): Promise<{ siteId: string; teamId: string; removed: boolean }> {
  const res = await fetchEdgeJson<{
    ok: boolean;
    data: { siteId: string; teamId: string; removed: boolean };
  }>({
    method: "PATCH",
    path: "/api/private/admin/sites",
    body: {
      ...input,
      intent: "remove",
    },
  });
  return res.data;
}

export async function fetchAdminMembers(teamId: string): Promise<MemberData[]> {
  const res = await fetchEdgeJson<{ ok: boolean; data: MemberData[] }>({
    path: "/api/private/admin/members",
    params: { teamId },
  });
  return res.data;
}

export async function addAdminMember(input: {
  teamId: string;
  identifier: string;
  userId?: string;
}): Promise<MemberData> {
  const res = await fetchEdgeJson<{ ok: boolean; data: MemberData }>({
    method: "POST",
    path: "/api/private/admin/members",
    body: input,
  });
  return res.data;
}

export async function removeAdminMember(input: {
  teamId: string;
  userId: string;
}): Promise<{ teamId: string; userId: string; removed: boolean }> {
  const res = await fetchEdgeJson<{
    ok: boolean;
    data: { teamId: string; userId: string; removed: boolean };
  }>({
    method: "PATCH",
    path: "/api/private/admin/members",
    body: input,
  });
  return res.data;
}

export async function fetchAdminSiteConfig(
  siteId: string,
): Promise<SiteScriptSettings> {
  const res = await fetchEdgeJson<SiteConfigData>({
    path: "/api/private/admin/site-config",
    params: { siteId },
  });
  return res.data;
}

export async function upsertAdminSiteConfig(input: {
  siteId: string;
  config: SiteScriptSettings | Record<string, unknown>;
}): Promise<SiteScriptSettings> {
  const res = await fetchEdgeJson<SiteConfigData>({
    method: "POST",
    path: "/api/private/admin/site-config",
    body: input,
  });
  return res.data;
}

export async function fetchAdminScriptSnippet(
  siteId: string,
): Promise<ScriptSnippetData["data"]> {
  const res = await fetchEdgeJson<ScriptSnippetData>({
    path: "/api/private/admin/script-snippet",
    params: { siteId },
  });
  return res.data;
}

export async function loginAdminAccount(input: {
  username: string;
  password: string;
}): Promise<{
  user: AccountUserData;
  teams: TeamData[];
}> {
  const res = await fetchEdgeJson<{
    ok: boolean;
    data: {
      user: AccountUserData;
      teams: TeamData[];
    };
  }>({
    method: "POST",
    path: "/api/private/admin/auth/login",
    body: input,
  });
  return res.data;
}

export async function fetchAdminMe(): Promise<{
  user: AccountUserData;
  teams: TeamData[];
}> {
  const res = await fetchEdgeJson<{
    ok: boolean;
    data: {
      user: AccountUserData;
      teams: TeamData[];
    };
  }>({
    path: "/api/private/admin/auth/me",
  });
  return res.data;
}

export async function fetchAdminUsers(): Promise<AccountUserData[]> {
  const res = await fetchEdgeJson<{ ok: boolean; data: AccountUserData[] }>({
    path: "/api/private/admin/users",
  });
  return res.data;
}

export async function createAdminUser(input: {
  username: string;
  email: string;
  name?: string;
  password: string;
  systemRole?: "admin" | "user";
}): Promise<AccountUserData> {
  const res = await fetchEdgeJson<{ ok: boolean; data: AccountUserData }>({
    method: "POST",
    path: "/api/private/admin/users",
    body: input,
  });
  return res.data;
}

export async function updateAdminUser(input: {
  userId: string;
  username?: string;
  email?: string;
  name?: string;
  password?: string;
  systemRole?: "admin" | "user";
}): Promise<AccountUserData> {
  const res = await fetchEdgeJson<{ ok: boolean; data: AccountUserData }>({
    method: "PATCH",
    path: "/api/private/admin/users",
    body: input,
  });
  return res.data;
}

export async function removeAdminUser(input: {
  userId: string;
}): Promise<{ userId: string; removed: boolean }> {
  const res = await fetchEdgeJson<{
    ok: boolean;
    data: { userId: string; removed: boolean };
  }>({
    method: "PATCH",
    path: "/api/private/admin/users",
    body: {
      ...input,
      intent: "remove",
    },
  });
  return res.data;
}

export async function updateMyProfile(input: {
  username?: string;
  email?: string;
  name?: string;
  password?: string;
  timeZone?: string;
}): Promise<AccountUserData> {
  const res = await fetchEdgeJson<{ ok: boolean; data: AccountUserData }>({
    method: "POST",
    path: "/api/private/admin/profile",
    body: input,
  });
  return res.data;
}
