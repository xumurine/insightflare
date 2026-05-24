import { browserEngineLabel } from "@/lib/browser-engine";
import {
  addZonedInterval,
  normalizeTimeZone,
  resolveReportingTimeZone,
  startOfZonedInterval,
  zonedParts,
} from "@/lib/dashboard/time-zone";
import {
  DEMO_SITE_PROFILES,
  DEMO_TEAMS,
  type DemoSiteProfile,
  findSiteProfile,
} from "@/lib/realtime/demo-site-profiles";
import {
  createDemoRng,
  expandPathLabels,
  fnv1a,
  mulberry32,
  normalizePath,
  sFloat,
  sInt,
  sPick,
  sShuffle,
  titleFromPath,
  todayKey,
  uniqueNonEmptyStrings,
  weightedDistribution,
  weightedDistributionFromWeights,
  weightedPickLabel,
  windowBucket,
} from "@/lib/realtime/demo-utils";
import {
  buildCountryPool,
  buildReferrerPool,
  DEMO_CITIES_BY_COUNTRY,
  DEMO_REGIONS_BY_COUNTRY,
  filterGeoLabelsByCountries,
  groupGeoLabelsByCountry,
  isMobileBrowserLabel,
  normalizeLongitude,
  parseDemoCityLabel,
  parseDemoRegionLabel,
  pickCountryGeoCluster,
  pickDemoBrowser,
  pickDemoBrowserVersion,
  pickDemoContinent,
  pickDemoDeviceType,
  pickDemoGeoContext,
  pickDemoLanguage,
  pickDemoOrganization,
  pickDemoOsVersion,
  pickDemoScreenSize,
  pickDemoTimezone,
  pickFromList,
  pickReferrerByCountry,
  randomGaussian,
  sampleGeoPointByCountry,
  weightedPickCountry,
  weightedPickIndex,
} from "@/lib/realtime/mock/dimension-pickers";
import {
  ALL_BROWSERS,
  ALL_CITIES,
  ALL_CONTINENTS,
  ALL_LANGUAGES,
  ALL_ORGS,
  ALL_OS,
  ALL_REGIONS,
  ALL_SCREEN_SIZES,
  ALL_TIMEZONES,
  BROWSER_MARKET_WEIGHTS,
  COUNTRY_COORDINATE_ANCHORS,
  COUNTRY_GEO_CLUSTERS,
  DEMO_COUNTRY_TO_CONTINENT,
  DEMO_COUNTRY_TO_LANGUAGES,
  DEMO_COUNTRY_TO_TIMEZONES,
  DEMO_DESKTOP_OS,
  DEMO_DESKTOP_SCREENS,
  DEMO_GEO_SEGMENT_SEPARATOR,
  DEMO_MOBILE_OS,
  DEMO_MOBILE_SCREENS,
  DEMO_TABLET_SCREENS,
  type GeoCluster,
  GLOBAL_COUNTRY_LONG_TAIL,
  GLOBAL_REFERRER_LONG_TAIL,
} from "@/lib/realtime/mock/dimension-pools";
import {
  aggregateDimensionRowsFromVisits,
  aggregateOverviewMetrics,
  aggregateSessionEdgeRows,
  applyDemoFilters,
  buildDemoFactDataset,
  buildDemoPathTitleMap,
  collectClientTabs,
  collectGeoTabs,
  collectPageDataAndTabs,
  collectReferrerRows,
  DEMO_FACT_DATASET_CACHE,
  emptyDemoFactDataset,
  weightedSessionCount,
  weightedVisitorCount,
} from "@/lib/realtime/mock/fact-builder";
import {
  DEMO_DIRECT_REFERRER_FILTER_VALUE,
  DEMO_INTERVALS,
  demoValuesIncludeSearch,
  normalizeDemoFilterValue,
  normalizeDemoSearch,
  parseDemoBoolean,
  parseDemoFilters,
  parseDemoGeoFilterValue,
  parseDemoInterval,
  parseDemoLimit,
  parseDemoNumber,
  withoutDemoGeoFilter,
} from "@/lib/realtime/mock/filters";
import {
  buildPathTransitionGraph,
  nextPath,
} from "@/lib/realtime/mock/path-markov";
import {
  computeMetrics,
  dailyMetricFactor,
  dailyViewCount,
  demoIntervalStepMs,
  integrateViews,
  sampleTimestampByCurve,
  siteDayIntegral,
  siteHourShapeIntegral,
  type SiteMetricRatios,
  siteRatios,
} from "@/lib/realtime/mock/site-curves";
import type {
  DemoDimensionRow,
  DemoEventPayloadFilterRule,
  DemoFactDataset,
  DemoFilteredFacts,
  DemoQueryFilters,
  DemoSessionFact,
  DemoVisitFact,
  DemoVisitorFact,
  ParsedDemoGeoFilter,
} from "@/lib/realtime/mock/types";
import {
  DEMO_EMPTY_HASH_VALUE,
  DEMO_EMPTY_QUERY_VALUE,
  demoHashFragmentForVisit,
  demoOperatingSystemLabel,
  demoQueryStringForVisit,
  demoStringHash,
} from "@/lib/realtime/mock/visit-helpers";
import {
  getVisitorFingerprint,
  sampleActiveVisitors,
} from "@/lib/realtime/mock/visitor-pool";
import type {
  RealtimeEvent,
  RealtimeVisit,
  RealtimeVisitorPoint,
} from "@/lib/realtime/types";
import type {
  DoDiagnosticAggregate,
  DoDiagnosticSiteEntry,
  SystemPerformanceData,
  SystemPerformanceSlowEvent,
  SystemPerformanceTopSite,
  SystemPerformanceTrendPoint,
  SystemPerformanceWindowMinutes,
} from "@/lib/system-performance";

// ---------------------------------------------------------------------------
//  Realtime mock socket (existing)
// ---------------------------------------------------------------------------

type RealtimeSocketMessage =
  | {
      type: "snapshot";
      data: {
        activeNow: number;
        events: RealtimeEvent[];
        points: RealtimeVisitorPoint[];
        visits: RealtimeVisit[];
      };
    }
  | {
      type: "event";
      data: RealtimeEvent;
    };

export type RealtimeSocketLike = Pick<
  WebSocket,
  "readyState" | "onopen" | "onmessage" | "onerror" | "onclose" | "close"
>;

interface MockRealtimeSocketOptions {
  siteId: string;
  activeWindowMs?: number;
}

const READY_STATE = {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3,
} as const;

const RECENT_RECORD_WINDOW_MS = 30 * 60 * 1000;

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const FUTURE_PRELOAD_MS = 30 * 60 * 1000;
const MIN_INTER_EVENT_MS = 220;

class MockRealtimeSocket implements RealtimeSocketLike {
  readyState: WebSocket["readyState"] = READY_STATE.CONNECTING;
  onopen: WebSocket["onopen"] = null;
  onmessage: WebSocket["onmessage"] = null;
  onerror: WebSocket["onerror"] = null;
  onclose: WebSocket["onclose"] = null;

  private readonly siteId: string;
  private readonly activeWindowMs: number;
  private windowStart: number;
  private windowEnd: number;
  // Stable visit fact slice; events are derived from this by replaying
  // `startedAt` as `eventAt`. Same site/time → same data, even across reconnects.
  private futureVisits: DemoVisitFact[] = [];
  private visitorsByVisitorId = new Map<string, RealtimeVisit>();
  private recentEvents: RealtimeEvent[] = [];
  private sequence = 0;
  private lastEmitAt = 0;
  private handshakeTimer: ReturnType<typeof setTimeout> | null = null;
  private nextEmitTimer: ReturnType<typeof setTimeout> | null = null;
  private dropTimer: ReturnType<typeof setTimeout> | null = null;

  constructor({
    siteId,
    activeWindowMs = 5 * 60 * 1000,
  }: MockRealtimeSocketOptions) {
    this.siteId = siteId;
    this.activeWindowMs = activeWindowMs;
    const now = Date.now();
    this.windowStart = now - RECENT_RECORD_WINDOW_MS;
    this.windowEnd = now + FUTURE_PRELOAD_MS;
    this.loadWindowSlice(now);
    this.beginHandshake();
  }

  close(code?: number, reason?: string): void {
    if (this.readyState === READY_STATE.CLOSED) return;
    this.readyState = READY_STATE.CLOSING;
    this.clearTimers();
    this.readyState = READY_STATE.CLOSED;
    this.emitClose(
      code ?? 1000,
      reason ?? "mock closed",
      (code ?? 1000) === 1000,
    );
  }

  private beginHandshake(): void {
    const handshakeDelayMs = randomInt(120, 780);
    const shouldFailHandshake = Math.random() < 0.2;
    this.handshakeTimer = setTimeout(() => {
      this.handshakeTimer = null;
      if (this.readyState !== READY_STATE.CONNECTING) return;
      if (shouldFailHandshake) {
        this.emitError();
        return;
      }

      this.readyState = READY_STATE.OPEN;
      this.emitOpen();
      this.emitSnapshot();
      this.scheduleNextEmit();
      this.scheduleDisconnect();
    }, handshakeDelayMs);
  }

  /**
   * Pull the seeded fact-table slice for [windowStart, windowEnd) and
   * partition it into the already-replayed past (used to seed the initial
   * snapshot) and the future emit queue.
   */
  private loadWindowSlice(now: number): void {
    const dataset = buildDemoFactDataset(
      this.siteId,
      this.windowStart,
      this.windowEnd,
    );
    const past: DemoVisitFact[] = [];
    const future: DemoVisitFact[] = [];
    for (const visit of dataset.visits) {
      if (visit.startedAt <= now) past.push(visit);
      else future.push(visit);
    }
    past.sort((a, b) => a.startedAt - b.startedAt);
    future.sort((a, b) => a.startedAt - b.startedAt);
    this.futureVisits = future;
    this.visitorsByVisitorId.clear();
    this.recentEvents = [];

    const recordCutoff = now - RECENT_RECORD_WINDOW_MS;
    const activeCutoff = now - this.activeWindowMs;
    for (const visit of past) {
      if (visit.startedAt < recordCutoff) continue;
      const event = this.demoVisitToEvent(visit);
      this.recentEvents.push(event);
      if (visit.startedAt >= activeCutoff) {
        this.visitorsByVisitorId.set(
          visit.visitorId,
          this.demoVisitToVisit(visit),
        );
      }
    }
  }

  private scheduleNextEmit(): void {
    if (this.readyState !== READY_STATE.OPEN) return;
    if (this.nextEmitTimer) return;

    const now = Date.now();
    if (this.futureVisits.length === 0) {
      // Future queue empty — slide the window forward and try again.
      this.windowStart = now - RECENT_RECORD_WINDOW_MS;
      this.windowEnd = now + FUTURE_PRELOAD_MS;
      this.loadWindowSlice(now);
      if (this.futureVisits.length === 0) return;
    }

    const next = this.futureVisits[0];
    if (!next) return;
    const desiredDelay = Math.max(0, next.startedAt - now);
    // Throttle bursts so the browser console / chart isn't flooded.
    const delay = Math.max(
      desiredDelay,
      MIN_INTER_EVENT_MS - (now - this.lastEmitAt),
    );
    this.nextEmitTimer = setTimeout(
      () => {
        this.nextEmitTimer = null;
        this.emitNextVisit();
      },
      Math.max(0, delay),
    );
  }

  private emitNextVisit(): void {
    if (this.readyState !== READY_STATE.OPEN) return;
    const visit = this.futureVisits.shift();
    if (!visit) {
      this.scheduleNextEmit();
      return;
    }
    const now = Date.now();
    // Stamp the event with "now" rather than the seeded startedAt so the
    // chart timestamps match wall time; the seeded order still drives
    // *which* visit comes next.
    const event = this.demoVisitToEvent(visit, now);
    this.recentEvents.push(event);
    this.visitorsByVisitorId.set(
      visit.visitorId,
      this.demoVisitToVisit(visit, now),
    );
    this.lastEmitAt = now;
    this.prune(now);
    this.emitMessage({ type: "event", data: event });

    if (this.recentEvents.length > 0 && this.recentEvents.length % 12 === 0) {
      this.emitSnapshot();
    }
    this.scheduleNextEmit();
  }

  private scheduleDisconnect(): void {
    const disconnectAfterMs = randomInt(18_000, 32_000);
    this.dropTimer = setTimeout(() => {
      this.dropTimer = null;
      if (this.readyState !== READY_STATE.OPEN) return;
      this.emitError();
    }, disconnectAfterMs);
  }

  private emitOpen(): void {
    this.onopen?.call(this as unknown as WebSocket, new Event("open"));
  }

  private emitMessage(payload: RealtimeSocketMessage): void {
    this.onmessage?.call(
      this as unknown as WebSocket,
      new MessageEvent("message", {
        data: JSON.stringify(payload),
      }),
    );
  }

  private emitError(): void {
    this.onerror?.call(this as unknown as WebSocket, new Event("error"));
  }

  private emitClose(code: number, reason: string, wasClean: boolean): void {
    this.onclose?.call(
      this as unknown as WebSocket,
      new CloseEvent("close", {
        code,
        reason,
        wasClean,
      }),
    );
  }

  private emitSnapshot(): void {
    if (this.readyState !== READY_STATE.OPEN) return;
    const now = Date.now();
    this.prune(now);
    const activeNow = this.visitorsByVisitorId.size;
    const events = [...this.recentEvents].sort(
      (left, right) => right.eventAt - left.eventAt,
    );
    this.emitMessage({
      type: "snapshot",
      data: {
        activeNow,
        events,
        points: this.buildSnapshotPoints(),
        visits: this.buildSnapshotVisits(),
      },
    });
  }

  private prune(now: number): void {
    const activeCutoff = now - this.activeWindowMs;
    const recordCutoff = now - RECENT_RECORD_WINDOW_MS;

    this.recentEvents = this.recentEvents.filter(
      (item) => item.eventAt >= recordCutoff,
    );
    for (const [visitorId, visit] of this.visitorsByVisitorId.entries()) {
      if (visit.lastActivityAt < activeCutoff) {
        this.visitorsByVisitorId.delete(visitorId);
      }
    }
  }

  private nextEventId(): string {
    const suffix = (this.sequence++).toString(36);
    return `${this.siteId}-event-${suffix}`;
  }

  private demoVisitToEvent(
    visit: DemoVisitFact,
    overrideEventAt?: number,
  ): RealtimeEvent {
    const profile = findSiteProfile(this.siteId);
    return {
      id: this.nextEventId(),
      eventType: visit.eventType,
      eventAt: overrideEventAt ?? visit.startedAt,
      visitId: visit.visitId,
      sessionId: visit.sessionId,
      pathname: visit.pathname,
      hash: "",
      title: visit.title,
      hostname: visit.hostname || profile.domain,
      referrerUrl: visit.referrerUrl,
      referrerHost: visit.referrerHost,
      visitorId: visit.visitorId,
      country: visit.country,
      region: visit.region,
      regionCode: visit.regionCode,
      city: visit.city,
      continent: visit.continent,
      timezone: visit.timezone,
      organization: visit.organization,
      browser: visit.browser,
      osVersion: visit.osVersion,
      deviceType: visit.deviceType,
      language: visit.language,
      screenSize: visit.screenSize,
      latitude: Number.isFinite(visit.latitude) ? visit.latitude : null,
      longitude: Number.isFinite(visit.longitude) ? visit.longitude : null,
    };
  }

  private demoVisitToVisit(
    visit: DemoVisitFact,
    overrideActivityAt?: number,
  ): RealtimeVisit {
    const profile = findSiteProfile(this.siteId);
    const previous = this.visitorsByVisitorId.get(visit.visitorId);
    const activityAt = overrideActivityAt ?? visit.startedAt;
    return {
      visitId: visit.visitId,
      visitorId: visit.visitorId,
      sessionId: visit.sessionId,
      startedAt: previous?.startedAt ?? activityAt,
      lastActivityAt: activityAt,
      pathname: visit.pathname,
      hash: "",
      title: visit.title,
      hostname: visit.hostname || profile.domain,
      referrerUrl: visit.referrerUrl,
      referrerHost: visit.referrerHost,
      country: visit.country,
      region: visit.region,
      regionCode: visit.regionCode,
      city: visit.city,
      continent: visit.continent,
      timezone: visit.timezone,
      organization: visit.organization,
      browser: visit.browser,
      osVersion: visit.osVersion,
      deviceType: visit.deviceType,
      language: visit.language,
      screenSize: visit.screenSize,
      latitude: Number.isFinite(visit.latitude) ? visit.latitude : null,
      longitude: Number.isFinite(visit.longitude) ? visit.longitude : null,
    };
  }

  private buildSnapshotPoints(): RealtimeVisitorPoint[] {
    const points: RealtimeVisitorPoint[] = [];
    for (const visit of Array.from(this.visitorsByVisitorId.values()).sort(
      (a, b) => b.lastActivityAt - a.lastActivityAt,
    )) {
      if (
        visit.latitude == null ||
        visit.longitude == null ||
        !Number.isFinite(visit.latitude) ||
        !Number.isFinite(visit.longitude)
      ) {
        continue;
      }
      points.push({
        visitorId: visit.visitorId,
        eventAt: visit.lastActivityAt,
        latitude: Number(visit.latitude),
        longitude: Number(visit.longitude),
        country: visit.country,
      });
    }
    return points;
  }

  private buildSnapshotVisits(): RealtimeVisit[] {
    return Array.from(this.visitorsByVisitorId.values()).sort(
      (left, right) => right.lastActivityAt - left.lastActivityAt,
    );
  }

  private clearTimers(): void {
    if (this.handshakeTimer) {
      clearTimeout(this.handshakeTimer);
      this.handshakeTimer = null;
    }
    if (this.nextEmitTimer) {
      clearTimeout(this.nextEmitTimer);
      this.nextEmitTimer = null;
    }
    if (this.dropTimer) {
      clearTimeout(this.dropTimer);
      this.dropTimer = null;
    }
  }
}

export function createMockRealtimeSocket(
  options: MockRealtimeSocketOptions,
): RealtimeSocketLike {
  return new MockRealtimeSocket(options);
}

// ---------------------------------------------------------------------------
//  Demo mode — seeded PRNG & data generators
// ---------------------------------------------------------------------------

function demoVisitMatchesJourneySearch(
  dataset: DemoFactDataset,
  visit: DemoVisitFact,
  search: string,
): boolean {
  if (!search) return true;
  const session = dataset.sessions.get(visit.sessionId);
  return demoValuesIncludeSearch(search, [
    visit.visitorId,
    visit.sessionId,
    visit.pathname,
    demoQueryStringForVisit(visit),
    demoHashFragmentForVisit(visit),
    visit.hostname,
    visit.title,
    visit.referrerHost || "direct",
    visit.referrerUrl || "direct",
    visit.country,
    visit.regionName,
    visit.regionCode,
    visit.region,
    visit.cityName,
    visit.city,
    visit.browser,
    visit.browserVersion,
    `${visit.browser} ${visit.browserVersion}`,
    demoOperatingSystemLabel(visit.osVersion),
    visit.osVersion,
    visit.deviceType,
    session?.entryPath,
    session?.exitPath,
  ]);
}

interface DemoTimeBucket {
  index: number;
  timestampMs: number;
  fromMs: number;
  toMs: number;
}

function parseDemoTimeZone(params: Record<string, string | number>): string {
  return resolveReportingTimeZone(
    String(params.timeZone || params.tz || "").trim(),
  );
}

function buildDemoTimeBuckets(
  from: number,
  to: number,
  interval: "minute" | "hour" | "day" | "week" | "month",
  timeZone: string,
): DemoTimeBucket[] {
  const buckets: DemoTimeBucket[] = [];
  let current = startOfZonedInterval(from, interval, timeZone);
  const hardLimit = 2000;

  for (let index = 0; index < hardLimit && current <= to; index += 1) {
    let next = addZonedInterval(current, interval, timeZone);
    if (!Number.isFinite(next) || next <= current) {
      next = current + demoIntervalStepMs(interval);
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
    const fallbackStart = Math.max(0, Math.floor(from));
    buckets.push({
      index: 0,
      timestampMs: fallbackStart,
      fromMs: fallbackStart,
      toMs: Math.max(fallbackStart + 1, Math.floor(to) + 1),
    });
  }

  return buckets;
}

function findDemoTimeBucketIndex(
  buckets: DemoTimeBucket[],
  timestampMs: number,
): number | null {
  const bucket = buckets.find(
    (item) => timestampMs >= item.fromMs && timestampMs < item.toMs,
  );
  return bucket?.index ?? null;
}

function buildDemoTrendBuckets(
  siteId: string,
  from: number,
  to: number,
  interval: "minute" | "hour" | "day" | "week" | "month",
  filters: DemoQueryFilters,
  timeZone: string,
) {
  const buckets = buildDemoTimeBuckets(from, to, interval, timeZone);
  const dataset = buildDemoFactDataset(siteId, from, to);
  const filtered = applyDemoFilters(dataset, filters);
  const bucketStats = new Map<
    number,
    {
      views: number;
      totalDurationMs: number;
      visitors: Set<string>;
      sessions: number;
      bounces: number;
    }
  >();
  const sessionFirstTs = new Map<string, number>();

  const ensureBucket = (bucket: number) => {
    const existing = bucketStats.get(bucket);
    if (existing) return existing;
    const created = {
      views: 0,
      totalDurationMs: 0,
      visitors: new Set<string>(),
      sessions: 0,
      bounces: 0,
    };
    bucketStats.set(bucket, created);
    return created;
  };

  for (const visit of filtered.visits) {
    const bucket = findDemoTimeBucketIndex(buckets, visit.startedAt);
    if (bucket === null) continue;
    const agg = ensureBucket(bucket);
    agg.views += dataset.viewWeight;
    agg.totalDurationMs += visit.durationMs * dataset.viewWeight;
    agg.visitors.add(visit.visitorId);
    const firstTs = sessionFirstTs.get(visit.sessionId);
    if (firstTs === undefined || visit.startedAt < firstTs) {
      sessionFirstTs.set(visit.sessionId, visit.startedAt);
    }
  }

  for (const [sessionId, sessionStartedAt] of sessionFirstTs.entries()) {
    const bucket = findDemoTimeBucketIndex(buckets, sessionStartedAt);
    if (bucket === null) continue;
    const agg = ensureBucket(bucket);
    const sessionWeight = dataset.sessions.get(sessionId)?.weight ?? 0;
    agg.sessions += sessionWeight;
    if ((filtered.visitsBySession.get(sessionId) ?? 0) === 1) {
      agg.bounces += sessionWeight;
    }
  }

  const rows: Array<{
    bucket: number;
    timestampMs: number;
    views: number;
    visitors: number;
    sessions: number;
    bounces: number;
    totalDurationMs: number;
    avgDurationMs: number;
    source: string;
  }> = [];
  for (const timeBucket of buckets) {
    const bucket = timeBucket.index;
    const agg = bucketStats.get(bucket);
    const views = Math.max(0, Math.round(agg?.views ?? 0));
    const visitors = Math.max(
      0,
      Math.round(agg ? weightedVisitorCount(dataset, agg.visitors) : 0),
    );
    const sessions = Math.max(0, Math.round(agg?.sessions ?? 0));
    const bounces = Math.min(
      sessions,
      Math.max(0, Math.round(agg?.bounces ?? 0)),
    );
    const totalDurationMs = Math.max(0, Math.round(agg?.totalDurationMs ?? 0));
    rows.push({
      bucket,
      timestampMs: timeBucket.timestampMs,
      views,
      visitors,
      sessions,
      bounces,
      totalDurationMs,
      avgDurationMs: sessions > 0 ? Math.round(totalDurationMs / sessions) : 0,
      source: "detail",
    });
  }
  return rows;
}

const DEMO_SHARE_TREND_OTHER_KEY = "other";
const DEMO_SHARE_TREND_OTHER_LABEL = "Other";
const DEMO_BROWSER_VERSION_UNKNOWN_TOKEN = "__browser_version_unknown__";
const DEMO_BROWSER_CROSS_UNKNOWN_TOKEN = "__browser_cross_unknown__";
const DEMO_BROWSER_CROSS_OTHER_BROWSER_TOKEN =
  "__browser_cross_other_browser__";
const DEMO_BROWSER_CROSS_OTHER_DIMENSION_TOKEN =
  "__browser_cross_other_dimension__";
const DEMO_CLIENT_CROSS_UNKNOWN_TOKEN = "__client_cross_unknown__";
const DEMO_CLIENT_CROSS_OTHER_PRIMARY_TOKEN = "__client_cross_other_primary__";
const DEMO_CLIENT_CROSS_OTHER_SECONDARY_TOKEN =
  "__client_cross_other_secondary__";

type DemoClientDimensionKey =
  | "browser"
  | "operatingSystem"
  | "osVersion"
  | "deviceType"
  | "language"
  | "screenSize";

type DemoEventRecordSortKey = "occurredAt" | "eventName" | "pathname";

interface DemoCustomEventFact {
  eventId: string;
  eventName: string;
  occurredAt: number;
  receivedAt: number;
  sequence: number;
  visit: DemoVisitFact;
}

function createDemoShareTrendSeriesKey(
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

function parseDemoClientDimensionKey(
  value: string | number | undefined,
): DemoClientDimensionKey | null {
  const normalized = String(value ?? "").trim();
  if (
    normalized === "browser" ||
    normalized === "operatingSystem" ||
    normalized === "osVersion" ||
    normalized === "deviceType" ||
    normalized === "language" ||
    normalized === "screenSize"
  ) {
    return normalized as DemoClientDimensionKey;
  }
  return null;
}

function demoClientDimensionMeta(dimension: DemoClientDimensionKey): {
  fallbackKeyBase: string;
  getLabel: (visit: DemoVisitFact) => string;
} {
  if (dimension === "browser") {
    return {
      fallbackKeyBase: "browser",
      getLabel: (visit) => visit.browser,
    };
  }
  if (dimension === "operatingSystem") {
    return {
      fallbackKeyBase: "os",
      getLabel: (visit) => demoOperatingSystemLabel(visit.osVersion),
    };
  }
  if (dimension === "osVersion") {
    return {
      fallbackKeyBase: "os-version",
      getLabel: (visit) => visit.osVersion,
    };
  }
  if (dimension === "deviceType") {
    return {
      fallbackKeyBase: "device",
      getLabel: (visit) => visit.deviceType,
    };
  }
  if (dimension === "language") {
    return {
      fallbackKeyBase: "language",
      getLabel: (visit) => visit.language,
    };
  }
  return {
    fallbackKeyBase: "screen",
    getLabel: (visit) => visit.screenSize,
  };
}

function generateDemoShareTrend(
  siteId: string,
  params: Record<string, string | number>,
  options: {
    fallbackKeyBase: string;
    getLabel: (visit: DemoVisitFact) => string;
  },
): Record<string, unknown> {
  const from = parseDemoNumber(params.from, 0);
  const to = parseDemoNumber(params.to, Date.now());
  const interval = parseDemoInterval(params.interval);
  const limit = parseDemoLimit(params.limit, 5, 1, 12);
  const filters = parseDemoFilters(params);
  const timeZone = parseDemoTimeZone(params);
  const buckets = buildDemoTimeBuckets(from, to, interval, timeZone);
  const dataset = buildDemoFactDataset(siteId, from, to);
  const filtered = applyDemoFilters(dataset, filters);
  const labelForVisit = (visit: DemoVisitFact) =>
    String(options.getLabel(visit) ?? "").trim();
  const visitorLabels = new Map<string, string>();
  const bucketVisitorLabels = new Map<number, Map<string, string>>();

  for (const visit of filtered.visits) {
    const label = labelForVisit(visit);
    visitorLabels.set(visit.visitorId, label);

    const bucket = findDemoTimeBucketIndex(buckets, visit.startedAt);
    if (bucket === null) continue;
    const labelsForBucket =
      bucketVisitorLabels.get(bucket) ?? new Map<string, string>();
    labelsForBucket.set(visit.visitorId, label);
    bucketVisitorLabels.set(bucket, labelsForBucket);
  }

  const overallBuckets = new Map<
    string,
    { views: number; visitors: Set<string>; sessions: Set<string> }
  >();
  for (const visit of filtered.visits) {
    const label = visitorLabels.get(visit.visitorId) ?? "";
    if (!label) continue;

    const bucket = overallBuckets.get(label) ?? {
      views: 0,
      visitors: new Set<string>(),
      sessions: new Set<string>(),
    };
    bucket.views += dataset.viewWeight;
    bucket.visitors.add(visit.visitorId);
    bucket.sessions.add(visit.sessionId);
    overallBuckets.set(label, bucket);
  }

  const topRows = Array.from(overallBuckets.entries())
    .map(([label, bucket]) => ({
      label,
      views: Math.max(0, Math.round(bucket.views)),
      visitors: Math.max(
        0,
        Math.round(weightedVisitorCount(dataset, bucket.visitors)),
      ),
      sessions: Math.max(
        0,
        Math.round(weightedSessionCount(dataset, bucket.sessions)),
      ),
    }))
    .sort(
      (left, right) =>
        right.visitors - left.visitors ||
        right.views - left.views ||
        right.sessions - left.sessions ||
        left.label.localeCompare(right.label),
    )
    .slice(0, limit);
  const topLabels = topRows.map((row) => row.label);
  const topLabelSet = new Set(topLabels);
  const usedKeys = new Set<string>([DEMO_SHARE_TREND_OTHER_KEY]);
  const keyByLabel = new Map<string, string>();
  const series: Array<{
    key: string;
    label: string;
    views: number;
    visitors: number;
    sessions: number;
    isOther?: boolean;
  }> = topRows.map((row) => {
    const key = createDemoShareTrendSeriesKey(
      row.label,
      usedKeys,
      options.fallbackKeyBase,
    );
    keyByLabel.set(row.label, key);
    return {
      key,
      label: row.label,
      views: row.views,
      visitors: row.visitors,
      sessions: row.sessions,
    };
  });

  const otherSessions = new Set<string>();
  const otherVisitors = new Set<string>();
  let otherViews = 0;
  for (const visit of filtered.visits) {
    const label = visitorLabels.get(visit.visitorId) ?? "";
    if (label && topLabelSet.has(label)) continue;
    otherViews += dataset.viewWeight;
    otherSessions.add(visit.sessionId);
    otherVisitors.add(visit.visitorId);
  }

  let hasBucketOther = false;
  for (const labelsForBucket of bucketVisitorLabels.values()) {
    for (const label of labelsForBucket.values()) {
      if (!label || !topLabelSet.has(label)) {
        hasBucketOther = true;
        break;
      }
    }
    if (hasBucketOther) break;
  }

  if (otherVisitors.size > 0 || hasBucketOther) {
    keyByLabel.set(DEMO_SHARE_TREND_OTHER_LABEL, DEMO_SHARE_TREND_OTHER_KEY);
    series.push({
      key: DEMO_SHARE_TREND_OTHER_KEY,
      label: DEMO_SHARE_TREND_OTHER_LABEL,
      views: Math.max(0, Math.round(otherViews)),
      visitors: Math.max(
        0,
        Math.round(weightedVisitorCount(dataset, otherVisitors)),
      ),
      sessions: Math.max(
        0,
        Math.round(weightedSessionCount(dataset, otherSessions)),
      ),
      isOther: true,
    });
  }

  if (series.length === 0) {
    return {
      ok: true,
      interval,
      series: [],
      data: [],
    };
  }

  const createEmptyPoint = (bucket: DemoTimeBucket) => ({
    bucket: bucket.index,
    timestampMs: bucket.timestampMs,
    totalVisitors: 0,
    visitorsBySeries: Object.fromEntries(series.map((item) => [item.key, 0])),
  });

  const bucketMap = new Map<
    number,
    {
      bucket: number;
      timestampMs: number;
      totalVisitors: number;
      visitorsBySeries: Record<string, number>;
      sessionSets: Map<string, Set<string>>;
      visitorSets: Map<string, Set<string>>;
    }
  >();

  for (const visit of filtered.visits) {
    const bucket = findDemoTimeBucketIndex(buckets, visit.startedAt);
    if (bucket === null) continue;
    const bucketLabel =
      bucketVisitorLabels.get(bucket)?.get(visit.visitorId) ?? "";
    const label =
      bucketLabel && topLabelSet.has(bucketLabel)
        ? bucketLabel
        : DEMO_SHARE_TREND_OTHER_LABEL;
    const key = keyByLabel.get(label);
    if (!key) continue;

    const point = bucketMap.get(bucket) ?? {
      ...createEmptyPoint(
        buckets[bucket] ?? {
          index: bucket,
          timestampMs: visit.startedAt,
          fromMs: visit.startedAt,
          toMs: visit.startedAt + 1,
        },
      ),
      sessionSets: new Map<string, Set<string>>(),
      visitorSets: new Map<string, Set<string>>(),
    };

    const sessionSet = point.sessionSets.get(key) ?? new Set<string>();
    sessionSet.add(visit.sessionId);
    point.sessionSets.set(key, sessionSet);

    const visitorSet = point.visitorSets.get(key) ?? new Set<string>();
    visitorSet.add(visit.visitorId);
    point.visitorSets.set(key, visitorSet);
    bucketMap.set(bucket, point);
  }

  for (const point of bucketMap.values()) {
    let totalVisitors = 0;
    for (const seriesItem of series) {
      const visitorSet =
        point.visitorSets.get(seriesItem.key) ?? new Set<string>();
      const visitors = Math.max(
        0,
        Math.round(weightedVisitorCount(dataset, visitorSet)),
      );
      const sessionSet =
        point.sessionSets.get(seriesItem.key) ?? new Set<string>();
      const sessions = Math.max(
        0,
        Math.round(weightedSessionCount(dataset, sessionSet)),
      );
      point.visitorsBySeries[seriesItem.key] = visitors;
      totalVisitors += visitors;
    }
    point.totalVisitors = totalVisitors;
  }

  const data = [];
  for (const bucket of buckets) {
    const existing = bucketMap.get(bucket.index);
    if (existing) {
      data.push({
        bucket: existing.bucket,
        timestampMs: existing.timestampMs,
        totalVisitors: existing.totalVisitors,
        visitorsBySeries: existing.visitorsBySeries,
      });
    } else {
      data.push(createEmptyPoint(bucket));
    }
  }

  return {
    ok: true,
    interval,
    series,
    data,
  };
}

function generateDemoBrowserTrend(
  siteId: string,
  params: Record<string, string | number>,
): Record<string, unknown> {
  return generateDemoShareTrend(siteId, params, {
    fallbackKeyBase: "browser",
    getLabel: (visit) => visit.browser,
  });
}

function generateDemoBrowserEngineTrend(
  siteId: string,
  params: Record<string, string | number>,
): Record<string, unknown> {
  return generateDemoShareTrend(siteId, params, {
    fallbackKeyBase: "engine",
    getLabel: (visit) => browserEngineLabel(visit.browser, visit.osVersion),
  });
}

function generateDemoClientDimensionTrend(
  siteId: string,
  params: Record<string, string | number>,
): Record<string, unknown> {
  const dimension = parseDemoClientDimensionKey(params.dimension);
  if (!dimension) {
    return {
      ok: true,
      interval: parseDemoInterval(params.interval),
      series: [],
      data: [],
    };
  }

  const meta = demoClientDimensionMeta(dimension);
  return generateDemoShareTrend(siteId, params, {
    fallbackKeyBase: meta.fallbackKeyBase,
    getLabel: meta.getLabel,
  });
}

function generateDemoReferrerTrend(
  siteId: string,
  params: Record<string, string | number>,
): Record<string, unknown> {
  const interval = parseDemoInterval(params.interval);
  return generateDemoShareTrend(siteId, params, {
    fallbackKeyBase: "referrer-domain",
    getLabel: (visit) =>
      visit.referrerHost.trim() || DEMO_DIRECT_REFERRER_FILTER_VALUE,
  });
}

function demoCustomEventOccurredAt(visit: DemoVisitFact): number {
  return Math.min(
    visit.startedAt + 1000,
    visit.startedAt + Math.max(1000, visit.durationMs),
  );
}

function createDemoCustomEventFacts(
  visits: DemoVisitFact[],
): DemoCustomEventFact[] {
  const eventCounters = new Map<string, number>();
  return visits
    .filter((visit) => visit.eventType !== "pageview")
    .map((visit) => {
      const sequence = (eventCounters.get(visit.visitId) ?? 0) + 1;
      eventCounters.set(visit.visitId, sequence);
      return {
        eventId: `${visit.visitId}:${visit.eventType}`,
        eventName: visit.eventType,
        occurredAt: demoCustomEventOccurredAt(visit),
        receivedAt: demoCustomEventOccurredAt(visit) + 120,
        sequence,
        visit,
      };
    })
    .sort(
      (left, right) =>
        right.occurredAt - left.occurredAt ||
        right.eventId.localeCompare(left.eventId),
    );
}

function demoEventRecordPayload(event: DemoCustomEventFact) {
  const visit = event.visit;
  const screen = parseDemoScreenSize(visit.screenSize);
  const eventScore = fnv1a(event.eventId);
  const rng = mulberry32(eventScore);
  const base = {
    plan: sPick(rng, ["free", "pro", "team", "enterprise"]),
    surface: sPick(rng, ["hero", "nav", "pricing_table", "inline_card"]),
    value: sInt(rng, 1, 12),
    page: {
      path: visit.pathname,
      title: visit.title,
    },
    device: {
      type: visit.deviceType,
      screen: {
        width: screen.screenWidth,
        height: screen.screenHeight,
      },
    },
    flags: {
      signedIn: eventScore % 3 === 0,
      experiment: sPick(rng, ["control", "variant_a", "variant_b"]),
    },
    items: [
      { id: `sku_${eventScore % 97}`, quantity: 1 },
      null,
      eventScore % 2 === 0,
    ],
  };

  if (event.eventName.includes("purchase")) {
    return {
      ...base,
      order: {
        currency: "USD",
        amount: Math.round((20 + rng() * 260) * 100) / 100,
        couponApplied: eventScore % 4 === 0,
      },
    };
  }

  if (event.eventName.includes("cart")) {
    return {
      ...base,
      product: {
        id: `product_${eventScore % 31}`,
        category: sPick(rng, ["audio", "wearables", "workspace"]),
        price: Math.round((12 + rng() * 180) * 100) / 100,
      },
    };
  }

  return base;
}

function demoJsonTypeLabel(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  const valueType = typeof value;
  if (valueType === "string") return "string";
  if (valueType === "number") return "number";
  if (valueType === "boolean") return "boolean";
  return "object";
}

function collectDemoEventFields(
  eventFacts: DemoCustomEventFact[],
  limit: number,
) {
  const rows = new Map<
    string,
    {
      path: string;
      valueType: string;
      events: Set<string>;
      occurrences: number;
      firstSeenAt: number;
      lastSeenAt: number;
      exampleValue?: string | number | boolean | null;
    }
  >();

  const addValue = (
    event: DemoCustomEventFact,
    path: string,
    value: unknown,
  ) => {
    const valueType = demoJsonTypeLabel(value);
    const rowKey = `${path}:${valueType}`;
    const current = rows.get(rowKey) ?? {
      path,
      valueType,
      events: new Set<string>(),
      occurrences: 0,
      firstSeenAt: event.occurredAt,
      lastSeenAt: event.occurredAt,
    };
    current.events.add(event.eventId);
    current.occurrences += 1;
    current.firstSeenAt = Math.min(current.firstSeenAt, event.occurredAt);
    current.lastSeenAt = Math.max(current.lastSeenAt, event.occurredAt);
    if (
      current.exampleValue === undefined &&
      (value === null ||
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean")
    ) {
      current.exampleValue = value;
    }
    rows.set(rowKey, current);
  };

  const walk = (
    event: DemoCustomEventFact,
    value: unknown,
    pathSegments: string[],
  ) => {
    const path = `/${pathSegments.join("/")}`;
    addValue(event, path === "/" ? "" : path, value);
    if (Array.isArray(value)) {
      value.forEach((item) => walk(event, item, [...pathSegments, "*"]));
      return;
    }
    if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        walk(event, child, [...pathSegments, key]);
      }
    }
  };

  for (const event of eventFacts) {
    walk(event, demoEventRecordPayload(event), []);
  }

  return [...rows.values()]
    .map((row) => ({
      path: row.path,
      valueType: row.valueType,
      events: row.events.size,
      occurrences: row.occurrences,
      firstSeenAt: row.firstSeenAt,
      lastSeenAt: row.lastSeenAt,
      exampleValue: row.exampleValue ?? null,
    }))
    .sort(
      (left, right) =>
        right.events - left.events ||
        right.occurrences - left.occurrences ||
        left.path.localeCompare(right.path) ||
        left.valueType.localeCompare(right.valueType),
    )
    .slice(0, limit);
}

function collectDemoEventFieldValues(
  eventFacts: DemoCustomEventFact[],
  fieldPath: string,
  fieldValueType: string,
  limit: number,
) {
  const rows = new Map<
    string,
    {
      value: string | number | boolean | null;
      events: Set<string>;
      occurrences: number;
      firstSeenAt: number;
      lastSeenAt: number;
    }
  >();

  const addValue = (
    event: DemoCustomEventFact,
    value: string | number | boolean | null,
  ) => {
    const key = JSON.stringify(value);
    const current = rows.get(key) ?? {
      value,
      events: new Set<string>(),
      occurrences: 0,
      firstSeenAt: event.occurredAt,
      lastSeenAt: event.occurredAt,
    };
    current.events.add(event.eventId);
    current.occurrences += 1;
    current.firstSeenAt = Math.min(current.firstSeenAt, event.occurredAt);
    current.lastSeenAt = Math.max(current.lastSeenAt, event.occurredAt);
    rows.set(key, current);
  };

  const walk = (
    event: DemoCustomEventFact,
    value: unknown,
    pathSegments: string[],
  ) => {
    const currentPath = `/${pathSegments.join("/")}`;
    const normalizedPath = currentPath === "/" ? "" : currentPath;
    if (normalizedPath === fieldPath) {
      const valueType = demoJsonTypeLabel(value);
      if (valueType === fieldValueType) {
        if (
          value === null ||
          typeof value === "string" ||
          typeof value === "number" ||
          typeof value === "boolean"
        ) {
          addValue(event, value);
        }
      }
    }

    if (Array.isArray(value)) {
      value.forEach((item) => walk(event, item, [...pathSegments, "*"]));
      return;
    }
    if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        walk(event, child, [...pathSegments, key]);
      }
    }
  };

  for (const event of eventFacts) {
    walk(event, demoEventRecordPayload(event), []);
  }

  return [...rows.values()]
    .map((row) => ({
      value: row.value,
      events: row.events.size,
      occurrences: row.occurrences,
      firstSeenAt: row.firstSeenAt,
      lastSeenAt: row.lastSeenAt,
    }))
    .sort(
      (left, right) =>
        right.occurrences - left.occurrences ||
        right.events - left.events ||
        String(left.value ?? "").localeCompare(String(right.value ?? "")),
    )
    .slice(0, limit);
}

function demoPayloadValue(
  value: unknown,
): DemoEventPayloadFilterRule["value"] | undefined {
  if (value === null) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") return value;
  return undefined;
}

function demoPayloadFilterValueType(
  value: DemoEventPayloadFilterRule["value"],
): "string" | "number" | "boolean" | "null" {
  if (value === null) return "null";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  return "string";
}

function collectDemoPayloadValuesAtPath(
  value: unknown,
  targetPath: string,
): DemoEventPayloadFilterRule["value"][] {
  const values: DemoEventPayloadFilterRule["value"][] = [];
  const walk = (current: unknown, pathSegments: string[]) => {
    const path = `/${pathSegments.join("/")}`;
    const normalizedPath = path === "/" ? "" : path;
    if (normalizedPath === targetPath) {
      const payloadValue = demoPayloadValue(current);
      if (
        payloadValue === null ||
        typeof payloadValue === "string" ||
        typeof payloadValue === "number" ||
        typeof payloadValue === "boolean"
      ) {
        values.push(payloadValue);
      }
    }

    if (Array.isArray(current)) {
      current.forEach((item) => walk(item, [...pathSegments, "*"]));
      return;
    }
    if (current && typeof current === "object") {
      for (const [key, child] of Object.entries(current)) {
        walk(child, [...pathSegments, key]);
      }
    }
  };

  walk(value, []);
  return values;
}

function demoPayloadValuesEqual(
  left: DemoEventPayloadFilterRule["value"],
  right: DemoEventPayloadFilterRule["value"],
): boolean {
  if (typeof left === "number" || typeof right === "number") {
    return Number(left) === Number(right);
  }
  return left === right;
}

function matchesDemoPayloadFilter(
  event: DemoCustomEventFact,
  rule: DemoEventPayloadFilterRule,
): boolean {
  const expectedType = demoPayloadFilterValueType(rule.value);
  return collectDemoPayloadValuesAtPath(
    demoEventRecordPayload(event),
    rule.path,
  ).some((value) => {
    if (demoPayloadFilterValueType(value) !== expectedType) return false;
    const matches = demoPayloadValuesEqual(value, rule.value);
    return rule.operator === "ne" ? !matches : matches;
  });
}

function filterDemoCustomEventsByPayload(
  events: DemoCustomEventFact[],
  filters: DemoQueryFilters,
): DemoCustomEventFact[] {
  const rules = filters.eventPayloadFilters ?? [];
  if (rules.length === 0) return events;
  return events.filter((event) =>
    rules.every((rule) => matchesDemoPayloadFilter(event, rule)),
  );
}

function demoEventRecordFromFact(event: DemoCustomEventFact) {
  const visit = event.visit;
  return {
    eventId: event.eventId,
    eventName: event.eventName,
    occurredAt: event.occurredAt,
    receivedAt: event.receivedAt,
    sequence: event.sequence,
    visitId: visit.visitId,
    sessionId: visit.sessionId,
    visitorId: visit.visitorId,
    pathname: visit.pathname,
    title: visit.title,
    hostname: visit.hostname,
    referrerHost: visit.referrerHost,
    country: visit.country,
    region: visit.regionName || visit.region,
    browser: visit.browser,
    browserVersion: visit.browserVersion,
    os: demoOperatingSystemLabel(visit.osVersion),
    osVersion: visit.osVersion,
    deviceType: visit.deviceType,
    nodeCount: 18,
    valueCount: 13,
  };
}

function demoEventDimensionRows(
  dataset: DemoFactDataset,
  events: DemoCustomEventFact[],
  limit: number,
  getLabel: (event: DemoCustomEventFact) => string,
) {
  const buckets = new Map<
    string,
    { events: number; sessions: Set<string>; visitors: Set<string> }
  >();
  for (const event of events) {
    const label = String(getLabel(event) ?? "").trim();
    if (!label) continue;
    const bucket = buckets.get(label) ?? {
      events: 0,
      sessions: new Set<string>(),
      visitors: new Set<string>(),
    };
    bucket.events += 1;
    bucket.sessions.add(event.visit.sessionId);
    bucket.visitors.add(event.visit.visitorId);
    buckets.set(label, bucket);
  }
  return [...buckets.entries()]
    .map(([label, bucket]) => ({
      label,
      views: bucket.events,
      sessions: Math.max(
        0,
        Math.round(weightedSessionCount(dataset, bucket.sessions)),
      ),
      visitors: Math.max(
        0,
        Math.round(weightedVisitorCount(dataset, bucket.visitors)),
      ),
    }))
    .sort(
      (left, right) =>
        right.views - left.views ||
        right.sessions - left.sessions ||
        left.label.localeCompare(right.label),
    )
    .slice(0, limit);
}

function demoEventGeoRows(
  dataset: DemoFactDataset,
  events: DemoCustomEventFact[],
  limit: number,
  getValue: (event: DemoCustomEventFact) => string,
  getLabel: (event: DemoCustomEventFact) => string = getValue,
) {
  const buckets = new Map<
    string,
    {
      label: string;
      events: number;
      sessions: Set<string>;
      visitors: Set<string>;
    }
  >();
  for (const event of events) {
    const value = String(getValue(event) ?? "").trim();
    if (!value) continue;
    const bucket = buckets.get(value) ?? {
      label: String(getLabel(event) ?? value).trim() || value,
      events: 0,
      sessions: new Set<string>(),
      visitors: new Set<string>(),
    };
    bucket.events += 1;
    bucket.sessions.add(event.visit.sessionId);
    bucket.visitors.add(event.visit.visitorId);
    buckets.set(value, bucket);
  }
  return [...buckets.entries()]
    .map(([value, bucket]) => ({
      value,
      label: bucket.label,
      views: bucket.events,
      sessions: Math.max(
        0,
        Math.round(weightedSessionCount(dataset, bucket.sessions)),
      ),
      visitors: Math.max(
        0,
        Math.round(weightedVisitorCount(dataset, bucket.visitors)),
      ),
    }))
    .sort(
      (left, right) =>
        right.views - left.views ||
        right.sessions - left.sessions ||
        left.label.localeCompare(right.label),
    )
    .slice(0, limit);
}

function demoEventContextCards(
  dataset: DemoFactDataset,
  events: DemoCustomEventFact[],
  limit: number,
) {
  return {
    page: {
      path: demoEventDimensionRows(
        dataset,
        events,
        limit,
        (event) => event.visit.pathname,
      ),
      query: demoEventDimensionRows(dataset, events, limit, (event) =>
        demoQueryStringForVisit(event.visit),
      ),
      title: demoEventDimensionRows(
        dataset,
        events,
        limit,
        (event) => event.visit.title,
      ),
      hostname: demoEventDimensionRows(
        dataset,
        events,
        limit,
        (event) => event.visit.hostname,
      ),
      entry: demoEventDimensionRows(dataset, events, limit, (event) => {
        const session = dataset.sessions.get(event.visit.sessionId);
        return session?.entryPath ?? event.visit.pathname;
      }),
      exit: demoEventDimensionRows(dataset, events, limit, (event) => {
        const session = dataset.sessions.get(event.visit.sessionId);
        return session?.exitPath ?? event.visit.pathname;
      }),
    },
    source: {
      domain: demoEventDimensionRows(
        dataset,
        events,
        limit,
        (event) => event.visit.referrerHost,
      ),
      link: demoEventDimensionRows(
        dataset,
        events,
        limit,
        (event) => event.visit.referrerUrl,
      ),
    },
    client: {
      browser: demoEventDimensionRows(
        dataset,
        events,
        limit,
        (event) => event.visit.browser,
      ),
      osVersion: demoEventDimensionRows(
        dataset,
        events,
        limit,
        (event) => event.visit.osVersion,
      ),
      deviceType: demoEventDimensionRows(
        dataset,
        events,
        limit,
        (event) => event.visit.deviceType,
      ),
      language: demoEventDimensionRows(
        dataset,
        events,
        limit,
        (event) => event.visit.language,
      ),
      screenSize: demoEventDimensionRows(
        dataset,
        events,
        limit,
        (event) => event.visit.screenSize,
      ),
    },
    geo: {
      country: demoEventGeoRows(
        dataset,
        events,
        limit,
        (event) => event.visit.country,
      ),
      region: demoEventGeoRows(
        dataset,
        events,
        limit,
        (event) =>
          event.visit.country ||
          event.visit.regionCode ||
          event.visit.regionName
            ? `${event.visit.country}${DEMO_GEO_SEGMENT_SEPARATOR}${event.visit.regionCode || event.visit.regionName}${DEMO_GEO_SEGMENT_SEPARATOR}${event.visit.regionName || event.visit.regionCode}`
            : "",
        (event) => event.visit.regionName || event.visit.region,
      ),
      city: demoEventGeoRows(
        dataset,
        events,
        limit,
        (event) =>
          event.visit.country ||
          event.visit.regionCode ||
          event.visit.regionName ||
          event.visit.cityName
            ? `${event.visit.country}${DEMO_GEO_SEGMENT_SEPARATOR}${event.visit.regionCode || event.visit.regionName}${DEMO_GEO_SEGMENT_SEPARATOR}${event.visit.regionName || event.visit.regionCode}${DEMO_GEO_SEGMENT_SEPARATOR}${event.visit.cityName || event.visit.city}`
            : "",
        (event) => event.visit.cityName || event.visit.city,
      ),
      continent: demoEventGeoRows(
        dataset,
        events,
        limit,
        (event) => event.visit.continent,
      ),
      timezone: demoEventGeoRows(
        dataset,
        events,
        limit,
        (event) => event.visit.timezone,
      ),
      organization: demoEventGeoRows(
        dataset,
        events,
        limit,
        (event) => event.visit.organization,
      ),
    },
  };
}

function demoEventSummaryCards(
  dataset: DemoFactDataset,
  events: DemoCustomEventFact[],
  limit: number,
) {
  return {
    event: {
      name: demoEventDimensionRows(
        dataset,
        events,
        limit,
        (event) => event.eventName,
      ),
    },
    page: {
      path: demoEventDimensionRows(
        dataset,
        events,
        limit,
        (event) => event.visit.pathname,
      ),
      title: demoEventDimensionRows(
        dataset,
        events,
        limit,
        (event) => event.visit.title,
      ),
      hostname: demoEventDimensionRows(
        dataset,
        events,
        limit,
        (event) => event.visit.hostname,
      ),
    },
  };
}

function generateDemoEventsSummary(
  siteId: string,
  params: Record<string, string | number>,
): Record<string, unknown> {
  const from = parseDemoNumber(params.from, 0);
  const to = parseDemoNumber(params.to, Date.now());
  const filters = parseDemoFilters(params);
  const dataset = buildDemoFactDataset(siteId, from, to);
  const filtered = applyDemoFilters(dataset, filters);
  const events = filterDemoCustomEventsByPayload(
    createDemoCustomEventFacts(filtered.visits),
    filters,
  );
  const sessions = new Set(events.map((event) => event.visit.sessionId));
  const visitors = new Set(events.map((event) => event.visit.visitorId));
  const eventNames = new Set(events.map((event) => event.eventName));
  const sessionCount = Math.max(
    0,
    Math.round(weightedSessionCount(dataset, sessions)),
  );

  return {
    ok: true,
    summary: {
      events: events.length,
      eventTypes: eventNames.size,
      sessions: sessionCount,
      visitors: Math.max(
        0,
        Math.round(weightedVisitorCount(dataset, visitors)),
      ),
      avgEventsPerSession: sessionCount > 0 ? events.length / sessionCount : 0,
    },
    cards: demoEventSummaryCards(dataset, events, 100),
  };
}

function generateDemoEventsTrend(
  siteId: string,
  params: Record<string, string | number>,
): Record<string, unknown> {
  const from = parseDemoNumber(params.from, 0);
  const to = parseDemoNumber(params.to, Date.now());
  const interval = parseDemoInterval(params.interval);
  const limit = parseDemoLimit(params.limit, 8, 1, 12);
  const filters = parseDemoFilters(params);
  const eventName = normalizeDemoFilterValue(params.eventName);
  const timeZone = parseDemoTimeZone(params);
  const dataset = buildDemoFactDataset(siteId, from, to);
  const filtered = applyDemoFilters(dataset, filters);
  const allEvents = filterDemoCustomEventsByPayload(
    createDemoCustomEventFacts(filtered.visits),
    filters,
  ).filter((event) => !eventName || event.eventName === eventName);
  const buckets = buildDemoTimeBuckets(from, to, interval, timeZone);
  const seriesRows = demoEventDimensionRows(
    dataset,
    allEvents,
    limit,
    (event) => event.eventName,
  );
  const topNames = new Set(seriesRows.map((row) => row.label));
  const usedKeys = new Set<string>([DEMO_SHARE_TREND_OTHER_KEY]);
  const keyByName = new Map<string, string>();
  const series: Array<{
    key: string;
    eventName: string;
    label: string;
    events: number;
    sessions: number;
    visitors: number;
    isOther?: boolean;
  }> = seriesRows.map((row) => {
    const key = createDemoShareTrendSeriesKey(row.label, usedKeys, "event");
    keyByName.set(row.label, key);
    return {
      key,
      eventName: row.label,
      label: row.label,
      events: row.views,
      sessions: row.sessions,
      visitors: row.visitors,
    };
  });

  const hasOther = allEvents.some((event) => !topNames.has(event.eventName));
  if (hasOther) {
    const otherEvents = allEvents.filter(
      (event) => !topNames.has(event.eventName),
    );
    const otherSessions = new Set(
      otherEvents.map((event) => event.visit.sessionId),
    );
    const otherVisitors = new Set(
      otherEvents.map((event) => event.visit.visitorId),
    );
    series.push({
      key: DEMO_SHARE_TREND_OTHER_KEY,
      eventName: DEMO_SHARE_TREND_OTHER_LABEL,
      label: DEMO_SHARE_TREND_OTHER_LABEL,
      events: otherEvents.length,
      sessions: Math.max(
        0,
        Math.round(weightedSessionCount(dataset, otherSessions)),
      ),
      visitors: Math.max(
        0,
        Math.round(weightedVisitorCount(dataset, otherVisitors)),
      ),
      isOther: true,
    });
  }

  const data = buckets.map((bucket) => ({
    bucket: bucket.index,
    timestampMs: bucket.timestampMs,
    totalEvents: 0,
    eventsBySeries: Object.fromEntries(series.map((item) => [item.key, 0])),
  }));

  for (const event of allEvents) {
    const bucket = findDemoTimeBucketIndex(buckets, event.occurredAt);
    if (bucket === null) continue;
    const key =
      keyByName.get(event.eventName) ??
      (hasOther ? DEMO_SHARE_TREND_OTHER_KEY : null);
    if (!key) continue;
    const point = data[bucket];
    if (!point) continue;
    point.eventsBySeries[key] = Number(point.eventsBySeries[key] ?? 0) + 1;
    point.totalEvents += 1;
  }

  return {
    ok: true,
    interval,
    series,
    data,
  };
}

function parseDemoEventRecordSort(params: Record<string, string | number>): {
  key: DemoEventRecordSortKey;
  direction: DemoSortDirection;
} {
  const key = String(params.sortBy ?? "").trim();
  const direction =
    String(params.sortDir ?? "")
      .trim()
      .toLowerCase() === "asc"
      ? "asc"
      : "desc";
  if (key === "eventName" || key === "pathname") return { key, direction };
  return { key: "occurredAt", direction };
}

function sortDemoEventRecords(
  rows: DemoCustomEventFact[],
  sort: { key: DemoEventRecordSortKey; direction: DemoSortDirection },
) {
  const factor = sort.direction === "asc" ? 1 : -1;
  return [...rows].sort((left, right) => {
    if (sort.key === "eventName") {
      const byName = left.eventName.localeCompare(right.eventName);
      if (byName !== 0) return byName * factor;
    } else if (sort.key === "pathname") {
      const byPath = left.visit.pathname.localeCompare(right.visit.pathname);
      if (byPath !== 0) return byPath * factor;
    } else if (left.occurredAt !== right.occurredAt) {
      return (left.occurredAt - right.occurredAt) * factor;
    }
    return right.occurredAt - left.occurredAt;
  });
}

function generateDemoEventsRecords(
  siteId: string,
  params: Record<string, string | number>,
): Record<string, unknown> {
  const from = parseDemoNumber(params.from, 0);
  const to = parseDemoNumber(params.to, Date.now());
  const page = parseDemoLimit(params.page, 1, 1, 10_000);
  const pageSize = parseDemoLimit(params.pageSize, 80, 1, 120);
  const filters = parseDemoFilters(params);
  const eventName = normalizeDemoFilterValue(params.eventName);
  const search = normalizeDemoSearch(params);
  const dataset = buildDemoFactDataset(siteId, from, to);
  const filtered = applyDemoFilters(dataset, filters);
  const events = filterDemoCustomEventsByPayload(
    createDemoCustomEventFacts(filtered.visits),
    filters,
  ).filter((event) => {
    if (eventName && event.eventName !== eventName) return false;
    return demoValuesIncludeSearch(search, [
      event.eventName,
      event.eventId,
      event.visit.visitId,
      event.visit.sessionId,
      event.visit.visitorId,
      event.visit.pathname,
      event.visit.title,
      event.visit.hostname,
    ]);
  });
  const sorted = sortDemoEventRecords(events, parseDemoEventRecordSort(params));
  const offset = (page - 1) * pageSize;
  const requestedRows = sorted.slice(offset, offset + pageSize + 1);
  const hasMore = requestedRows.length > pageSize;
  const currentRows = requestedRows.slice(0, pageSize);

  return {
    ok: true,
    data: currentRows.map(demoEventRecordFromFact),
    meta: {
      page,
      pageSize,
      returned: currentRows.length,
      hasMore,
      nextPage: hasMore ? page + 1 : null,
    },
  };
}

function generateDemoEventTypeDetail(
  siteId: string,
  params: Record<string, string | number>,
): Record<string, unknown> {
  const eventName = normalizeDemoFilterValue(params.eventName) ?? "";
  const from = parseDemoNumber(params.from, 0);
  const to = parseDemoNumber(params.to, Date.now());
  const filters = parseDemoFilters(params);
  const dataset = buildDemoFactDataset(siteId, from, to);
  const filtered = applyDemoFilters(dataset, filters);
  const allEvents = filterDemoCustomEventsByPayload(
    createDemoCustomEventFacts(filtered.visits),
    filters,
  );
  const events = allEvents.filter((event) => event.eventName === eventName);
  const sessions = new Set(events.map((event) => event.visit.sessionId));
  const visitors = new Set(events.map((event) => event.visit.visitorId));
  const interval = parseDemoInterval(params.interval);
  const timeZone = parseDemoTimeZone(params);
  const buckets = buildDemoTimeBuckets(from, to, interval, timeZone);
  const trendBuckets = buckets.map((bucket) => ({
    bucket: bucket.index,
    timestampMs: bucket.timestampMs,
    events: 0,
    visitors: new Set<string>(),
  }));
  for (const event of events) {
    const bucketIndex = findDemoTimeBucketIndex(buckets, event.occurredAt);
    if (bucketIndex === null) continue;
    const bucket = trendBuckets[bucketIndex];
    if (!bucket) continue;
    bucket.events += dataset.viewWeight;
    bucket.visitors.add(event.visit.visitorId);
  }
  const sessionCount = Math.max(
    0,
    Math.round(weightedSessionCount(dataset, sessions)),
  );

  return {
    ok: true,
    eventName,
    summary: {
      events: events.length,
      eventTypes: eventName ? 1 : 0,
      sessions: sessionCount,
      visitors: Math.max(
        0,
        Math.round(weightedVisitorCount(dataset, visitors)),
      ),
      avgEventsPerSession: sessionCount > 0 ? events.length / sessionCount : 0,
      shareOfAllEvents:
        allEvents.length > 0 ? events.length / allEvents.length : 0,
    },
    trend: {
      data: trendBuckets.map((bucket) => ({
        bucket: bucket.bucket,
        timestampMs: bucket.timestampMs,
        events: Math.max(0, Math.round(bucket.events)),
        visitors: Math.max(
          0,
          Math.round(weightedVisitorCount(dataset, bucket.visitors)),
        ),
      })),
    },
    breakdowns: {
      pages: demoEventDimensionRows(
        dataset,
        events,
        8,
        (event) => event.visit.pathname,
      ),
      countries: demoEventDimensionRows(
        dataset,
        events,
        8,
        (event) => event.visit.country,
      ),
      devices: demoEventDimensionRows(
        dataset,
        events,
        8,
        (event) => event.visit.deviceType,
      ),
      browsers: demoEventDimensionRows(
        dataset,
        events,
        8,
        (event) => event.visit.browser,
      ),
    },
    cards: demoEventContextCards(dataset, events, 100),
    fields: collectDemoEventFields(events, 100),
  };
}

function generateDemoEventTypeFieldValues(
  siteId: string,
  params: Record<string, string | number>,
): Record<string, unknown> {
  const eventName = normalizeDemoFilterValue(params.eventName) ?? "";
  const fieldPath = String(params.fieldPath ?? "");
  const fieldValueType = normalizeDemoFilterValue(params.fieldValueType) ?? "";
  const from = parseDemoNumber(params.from, 0);
  const to = parseDemoNumber(params.to, Date.now());
  const filters = parseDemoFilters(params);
  const limit = parseDemoLimit(params.limit, 25, 1, 100);
  if (!eventName || !fieldPath || !fieldValueType) {
    return {
      ok: true,
      fieldPath,
      fieldValueType,
      data: [],
    };
  }
  const dataset = buildDemoFactDataset(siteId, from, to);
  const filtered = applyDemoFilters(dataset, filters);
  const events = filterDemoCustomEventsByPayload(
    createDemoCustomEventFacts(filtered.visits),
    filters,
  ).filter((event) => event.eventName === eventName);

  return {
    ok: true,
    fieldPath,
    fieldValueType,
    data: collectDemoEventFieldValues(events, fieldPath, fieldValueType, limit),
  };
}

function generateDemoEventRecordDetail(
  siteId: string,
  params: Record<string, string | number>,
): Record<string, unknown> {
  const from = parseDemoNumber(params.from, Date.now() - 30 * 24 * 3600 * 1000);
  const to = parseDemoNumber(params.to, Date.now());
  const eventId = normalizeDemoFilterValue(params.eventId) ?? "";
  const dataset = buildDemoFactDataset(siteId, from, to);
  const event =
    createDemoCustomEventFacts(dataset.visits).find(
      (item) => item.eventId === eventId,
    ) ?? createDemoCustomEventFacts(dataset.visits)[0];
  if (!event) return { ok: true, data: null };
  const record = demoEventRecordFromFact(event);
  return {
    ok: true,
    data: {
      event: record,
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
      eventData: demoEventRecordPayload(event),
    },
  };
}

function generateDemoBrowserVersionBreakdown(
  siteId: string,
  params: Record<string, string | number>,
): Record<string, unknown> {
  const from = parseDemoNumber(params.from, 0);
  const to = parseDemoNumber(params.to, Date.now());
  const rawBrowserLimit = parseDemoNumber(params.browserLimit, 0);
  const browserLimit =
    Number.isFinite(rawBrowserLimit) && rawBrowserLimit > 0
      ? Math.max(1, Math.floor(rawBrowserLimit))
      : Number.MAX_SAFE_INTEGER;
  const versionLimit = parseDemoLimit(params.versionLimit, 5, 1, 8);
  const filters = parseDemoFilters(params);
  const dataset = buildDemoFactDataset(siteId, from, to);
  const filtered = applyDemoFilters(dataset, filters);
  const browsers = aggregateDimensionRowsFromVisits(
    dataset,
    filtered.visits,
    browserLimit,
    (visit) => visit.browser,
    "visitors",
  ).map((browserRow) => {
    const versionRows = aggregateDimensionRowsFromVisits(
      dataset,
      filtered.visits.filter((visit) => visit.browser === browserRow.label),
      999,
      (visit) => visit.browserVersion || DEMO_BROWSER_VERSION_UNKNOWN_TOKEN,
      "visitors",
    );
    const versions = [];
    let otherViews = 0;
    let otherVisitors = 0;
    let otherSessions = 0;

    for (let index = 0; index < versionRows.length; index += 1) {
      const row = versionRows[index];
      if (index < versionLimit) {
        versions.push({
          key:
            row.label === DEMO_BROWSER_VERSION_UNKNOWN_TOKEN
              ? "unknown"
              : createDemoShareTrendSeriesKey(
                  row.label,
                  new Set(["other", "unknown"]),
                  "version",
                ),
          label:
            row.label === DEMO_BROWSER_VERSION_UNKNOWN_TOKEN
              ? "Unknown"
              : row.label,
          views: row.views,
          visitors: row.visitors,
          sessions: row.sessions,
          isUnknown:
            row.label === DEMO_BROWSER_VERSION_UNKNOWN_TOKEN || undefined,
        });
      } else {
        otherViews += row.views;
        otherVisitors += row.visitors;
        otherSessions += row.sessions;
      }
    }

    if (otherVisitors > 0) {
      versions.push({
        key: "other",
        label: DEMO_SHARE_TREND_OTHER_LABEL,
        views: otherViews,
        visitors: otherVisitors,
        sessions: otherSessions,
        isOther: true,
      });
    }

    return {
      browser: browserRow.label,
      views: browserRow.views,
      visitors: browserRow.visitors,
      sessions: browserRow.sessions,
      versions,
    };
  });

  return {
    ok: true,
    data: browsers,
  };
}

function generateDemoBrowserCrossDimension(
  dataset: DemoFactDataset,
  filtered: DemoFilteredFacts,
  browserLimit: number,
  dimensionLimit: number,
  fallbackKeyBase: string,
  getDimension: (visit: DemoVisitFact) => string,
): {
  columns: Array<{
    key: string;
    label: string;
    views: number;
    visitors: number;
    sessions: number;
    isOther?: boolean;
    isUnknown?: boolean;
  }>;
  rows: Array<{
    key: string;
    label: string;
    views: number;
    visitors: number;
    sessions: number;
    isOther?: boolean;
    cells: Array<{
      key: string;
      label: string;
      views: number;
      visitors: number;
      sessions: number;
      isOther?: boolean;
      isUnknown?: boolean;
    }>;
  }>;
  totalVisitors: number;
} {
  const topBrowsers = aggregateDimensionRowsFromVisits(
    dataset,
    filtered.visits,
    browserLimit,
    (visit) => visit.browser,
    "visitors",
  ).filter((row) => row.label.trim().length > 0 && row.visitors > 0);

  if (topBrowsers.length === 0) {
    return {
      columns: [],
      rows: [],
      totalVisitors: 0,
    };
  }

  const topDimensions = aggregateDimensionRowsFromVisits(
    dataset,
    filtered.visits.filter(
      (visit) => String(visit.browser || "").trim().length > 0,
    ),
    dimensionLimit,
    (visit) => {
      const label = String(getDimension(visit) || "").trim();
      return label || DEMO_BROWSER_CROSS_UNKNOWN_TOKEN;
    },
    "visitors",
  ).filter((row) => row.visitors > 0);

  if (topDimensions.length === 0) {
    return {
      columns: [],
      rows: [],
      totalVisitors: 0,
    };
  }

  const browserSet = new Set(topBrowsers.map((row) => row.label));
  const dimensionSet = new Set(topDimensions.map((row) => row.label));
  const rowBuckets = new Map<
    string,
    {
      views: number;
      visitors: Set<string>;
      sessions: Set<string>;
      cells: Map<
        string,
        { views: number; visitors: Set<string>; sessions: Set<string> }
      >;
    }
  >();
  const columnBuckets = new Map<
    string,
    { views: number; visitors: Set<string>; sessions: Set<string> }
  >();

  for (const visit of filtered.visits) {
    const browser = String(visit.browser || "").trim();
    if (!browser) continue;

    const rawDimension = String(getDimension(visit) || "").trim();
    const dimension = rawDimension || DEMO_BROWSER_CROSS_UNKNOWN_TOKEN;
    const browserBucket = browserSet.has(browser)
      ? browser
      : DEMO_BROWSER_CROSS_OTHER_BROWSER_TOKEN;
    const dimensionBucket = dimensionSet.has(dimension)
      ? dimension
      : DEMO_BROWSER_CROSS_OTHER_DIMENSION_TOKEN;

    const rowBucket = rowBuckets.get(browserBucket) ?? {
      views: 0,
      visitors: new Set<string>(),
      sessions: new Set<string>(),
      cells: new Map<
        string,
        { views: number; visitors: Set<string>; sessions: Set<string> }
      >(),
    };
    rowBucket.views += dataset.viewWeight;
    rowBucket.visitors.add(visit.visitorId);
    rowBucket.sessions.add(visit.sessionId);
    const cellBucket = rowBucket.cells.get(dimensionBucket) ?? {
      views: 0,
      visitors: new Set<string>(),
      sessions: new Set<string>(),
    };
    cellBucket.views += dataset.viewWeight;
    cellBucket.visitors.add(visit.visitorId);
    cellBucket.sessions.add(visit.sessionId);
    rowBucket.cells.set(dimensionBucket, cellBucket);
    rowBuckets.set(browserBucket, rowBucket);

    const columnBucket = columnBuckets.get(dimensionBucket) ?? {
      views: 0,
      visitors: new Set<string>(),
      sessions: new Set<string>(),
    };
    columnBucket.views += dataset.viewWeight;
    columnBucket.visitors.add(visit.visitorId);
    columnBucket.sessions.add(visit.sessionId);
    columnBuckets.set(dimensionBucket, columnBucket);
  }

  const columnKeySet = new Set<string>(["other", "unknown"]);
  const columnDescriptors: Array<{
    bucket: string;
    item: {
      key: string;
      label: string;
      views: number;
      visitors: number;
      sessions: number;
      isOther?: boolean;
      isUnknown?: boolean;
    };
  }> = topDimensions.map((row) => {
    if (row.label === DEMO_BROWSER_CROSS_UNKNOWN_TOKEN) {
      return {
        bucket: row.label,
        item: {
          key: "unknown",
          label: "Unknown",
          views: row.views,
          visitors: row.visitors,
          sessions: row.sessions,
          isUnknown: true,
        },
      };
    }

    return {
      bucket: row.label,
      item: {
        key: createDemoShareTrendSeriesKey(
          row.label,
          columnKeySet,
          fallbackKeyBase,
        ),
        label: row.label,
        views: row.views,
        visitors: row.visitors,
        sessions: row.sessions,
      },
    };
  });

  if (columnBuckets.has(DEMO_BROWSER_CROSS_OTHER_DIMENSION_TOKEN)) {
    const otherColumn = columnBuckets.get(
      DEMO_BROWSER_CROSS_OTHER_DIMENSION_TOKEN,
    ) ?? {
      views: 0,
      visitors: new Set<string>(),
      sessions: new Set<string>(),
    };
    columnDescriptors.push({
      bucket: DEMO_BROWSER_CROSS_OTHER_DIMENSION_TOKEN,
      item: {
        key: "other",
        label: DEMO_SHARE_TREND_OTHER_LABEL,
        views: Math.max(0, Math.round(otherColumn.views)),
        visitors: Math.max(
          0,
          Math.round(weightedVisitorCount(dataset, otherColumn.visitors)),
        ),
        sessions: Math.max(
          0,
          Math.round(weightedSessionCount(dataset, otherColumn.sessions)),
        ),
        isOther: true,
      },
    });
  }

  const rowKeySet = new Set<string>(["other"]);
  const rowDescriptors: Array<{
    bucket: string;
    item: {
      key: string;
      label: string;
      views: number;
      visitors: number;
      sessions: number;
      isOther?: boolean;
    };
  }> = topBrowsers.map((row) => ({
    bucket: row.label,
    item: {
      key: createDemoShareTrendSeriesKey(row.label, rowKeySet, "browser"),
      label: row.label,
      views: row.views,
      visitors: row.visitors,
      sessions: row.sessions,
    },
  }));

  if (rowBuckets.has(DEMO_BROWSER_CROSS_OTHER_BROWSER_TOKEN)) {
    const otherRow = rowBuckets.get(DEMO_BROWSER_CROSS_OTHER_BROWSER_TOKEN) ?? {
      views: 0,
      visitors: new Set<string>(),
      sessions: new Set<string>(),
      cells: new Map<
        string,
        { views: number; visitors: Set<string>; sessions: Set<string> }
      >(),
    };
    rowDescriptors.push({
      bucket: DEMO_BROWSER_CROSS_OTHER_BROWSER_TOKEN,
      item: {
        key: "other",
        label: DEMO_SHARE_TREND_OTHER_LABEL,
        views: Math.max(0, Math.round(otherRow.views)),
        visitors: Math.max(
          0,
          Math.round(weightedVisitorCount(dataset, otherRow.visitors)),
        ),
        sessions: Math.max(
          0,
          Math.round(weightedSessionCount(dataset, otherRow.sessions)),
        ),
        isOther: true,
      },
    });
  }

  const columns = columnDescriptors.map((column) => column.item);
  const rows = rowDescriptors
    .map((row) => {
      const rowBucket = rowBuckets.get(row.bucket);
      const cells = columnDescriptors.map((column) => {
        const cell = rowBucket?.cells.get(column.bucket);
        return {
          key: column.item.key,
          label: column.item.label,
          views: Math.max(0, Math.round(cell?.views ?? 0)),
          visitors: Math.max(
            0,
            Math.round(
              weightedVisitorCount(
                dataset,
                cell?.visitors ?? new Set<string>(),
              ),
            ),
          ),
          sessions: Math.max(
            0,
            Math.round(
              weightedSessionCount(
                dataset,
                cell?.sessions ?? new Set<string>(),
              ),
            ),
          ),
          ...(column.item.isOther ? { isOther: true } : {}),
          ...(column.item.isUnknown ? { isUnknown: true } : {}),
        };
      });

      return {
        ...row.item,
        views: Math.max(0, Math.round(rowBucket?.views ?? row.item.views)),
        visitors: rowBucket
          ? Math.max(
              0,
              Math.round(weightedVisitorCount(dataset, rowBucket.visitors)),
            )
          : row.item.visitors,
        sessions: rowBucket
          ? Math.max(
              0,
              Math.round(weightedSessionCount(dataset, rowBucket.sessions)),
            )
          : row.item.sessions,
        cells,
      };
    })
    .filter((row) => row.visitors > 0);

  return {
    columns,
    rows,
    totalVisitors: rows.reduce((sum, row) => sum + row.visitors, 0),
  };
}

function generateDemoBrowserCrossBreakdown(
  siteId: string,
  params: Record<string, string | number>,
): Record<string, unknown> {
  const from = parseDemoNumber(params.from, 0);
  const to = parseDemoNumber(params.to, Date.now());
  const browserLimit = parseDemoLimit(params.browserLimit, 8, 1, 12);
  const osLimit = parseDemoLimit(params.osLimit, 6, 1, 8);
  const deviceTypeLimit = parseDemoLimit(params.deviceTypeLimit, 5, 1, 8);
  const filters = parseDemoFilters(params);
  const dataset = buildDemoFactDataset(siteId, from, to);
  const filtered = applyDemoFilters(dataset, filters);

  return {
    ok: true,
    operatingSystem: generateDemoBrowserCrossDimension(
      dataset,
      filtered,
      browserLimit,
      osLimit,
      "os",
      (visit) => visit.osVersion.split(" ")[0] || visit.osVersion,
    ),
    deviceType: generateDemoBrowserCrossDimension(
      dataset,
      filtered,
      browserLimit,
      deviceTypeLimit,
      "device",
      (visit) => visit.deviceType,
    ),
  };
}

function generateDemoBrowserRadar(
  siteId: string,
  params: Record<string, string | number>,
): Record<string, unknown> {
  const from = parseDemoNumber(params.from, 0);
  const to = parseDemoNumber(params.to, Date.now());
  const filters = parseDemoFilters(params);
  const dataset = buildDemoFactDataset(siteId, from, to);
  const filtered = applyDemoFilters(dataset, filters);

  const topBrowsers = aggregateDimensionRowsFromVisits(
    dataset,
    filtered.visits,
    999,
    (visit) => visit.browser,
    "visitors",
  ).filter((row) => row.label.trim().length > 0 && row.visitors > 0);

  if (topBrowsers.length === 0) {
    return { ok: true, data: [] };
  }

  const totalVisitors = topBrowsers.reduce((sum, b) => sum + b.visitors, 0);
  const globalFrequency =
    filtered.visitors.size > 0
      ? filtered.sessions.size / filtered.visitors.size
      : 1;

  const data = topBrowsers.map((browserRow) => {
    const browserVisits = filtered.visits.filter(
      (v) => v.browser === browserRow.label,
    );

    // session-level aggregation
    const sessionMap = new Map<
      string,
      { visitCount: number; totalDuration: number }
    >();
    for (const v of browserVisits) {
      const entry = sessionMap.get(v.sessionId) ?? {
        visitCount: 0,
        totalDuration: 0,
      };
      entry.visitCount += 1;
      entry.totalDuration += Math.max(0, v.durationMs);
      sessionMap.set(v.sessionId, entry);
    }
    const sessions = sessionMap.size;
    const bounces = Array.from(sessionMap.values()).filter(
      (s) => s.visitCount === 1,
    ).length;
    const totalDuration = Array.from(sessionMap.values()).reduce(
      (sum, s) => sum + s.totalDuration,
      0,
    );
    const totalPages = Array.from(sessionMap.values()).reduce(
      (sum, s) => sum + s.visitCount,
      0,
    );

    // visitor-level aggregation
    const visitorSessionMap = new Map<string, Set<string>>();
    for (const v of browserVisits) {
      const set = visitorSessionMap.get(v.visitorId) ?? new Set<string>();
      set.add(v.sessionId);
      visitorSessionMap.set(v.visitorId, set);
    }
    const visitors = visitorSessionMap.size;
    const returningVisitors = Array.from(visitorSessionMap.values()).filter(
      (s) => s.size > 1,
    ).length;

    const avgDuration = sessions > 0 ? totalDuration / sessions : 0;
    const engagement =
      sessions > 0 ? Number(((sessions - bounces) / sessions).toFixed(6)) : 0;
    const depth = sessions > 0 ? totalPages / sessions : 0;
    const loyalty =
      visitors > 0 ? Number((returningVisitors / visitors).toFixed(6)) : 0;
    // Use site-wide frequency ratio as base with per-browser deterministic
    // variation: demo assigns random browsers per session so per-browser
    // raw frequency is always ~1.  Real data does not have this problem.
    let nameHash = 0;
    for (let i = 0; i < browserRow.label.length; i++) {
      nameHash =
        ((nameHash << 5) - nameHash + browserRow.label.charCodeAt(i)) | 0;
    }
    const variation = 0.75 + (Math.abs(nameHash) % 100) / 200; // 0.75 – 1.25
    const frequency = globalFrequency * variation;
    const traffic =
      totalVisitors > 0
        ? Number((browserRow.visitors / totalVisitors).toFixed(6))
        : 0;

    return {
      browser: browserRow.label,
      visitors: browserRow.visitors,
      sessions: browserRow.sessions,
      metrics: {
        duration: avgDuration,
        engagement,
        depth,
        loyalty,
        frequency,
        traffic,
      },
    };
  });

  return { ok: true, data };
}

function generateDemoReferrerRadar(
  siteId: string,
  params: Record<string, string | number>,
): Record<string, unknown> {
  const from = parseDemoNumber(params.from, 0);
  const to = parseDemoNumber(params.to, Date.now());
  const filters = parseDemoFilters(params);
  const limit = parseDemoLimit(params.limit, 24, 1, 48);
  const dataset = buildDemoFactDataset(siteId, from, to);
  const filtered = applyDemoFilters(dataset, filters);

  const topReferrers = collectReferrerRows(dataset, filtered, 999, {
    includeFullUrl: false,
    directValue: "",
  }).filter((row) => row.visitors > 0);

  if (topReferrers.length === 0) {
    return { ok: true, data: [] };
  }

  const selectedReferrers = topReferrers.slice(0, limit);
  const totalVisitors = topReferrers.reduce(
    (sum, row) => sum + row.visitors,
    0,
  );
  const globalFrequency =
    filtered.visitors.size > 0
      ? filtered.sessions.size / filtered.visitors.size
      : 1;

  const data = selectedReferrers.map((referrerRow) => {
    const referrerVisits = filtered.visits.filter((visit) => {
      const label = visit.referrerHost.trim();
      return label === referrerRow.referrer;
    });

    const sessionMap = new Map<
      string,
      { visitCount: number; totalDuration: number }
    >();
    for (const visit of referrerVisits) {
      const entry = sessionMap.get(visit.sessionId) ?? {
        visitCount: 0,
        totalDuration: 0,
      };
      entry.visitCount += 1;
      entry.totalDuration += Math.max(0, visit.durationMs);
      sessionMap.set(visit.sessionId, entry);
    }
    const sessions = sessionMap.size;
    const bounces = Array.from(sessionMap.values()).filter(
      (session) => session.visitCount === 1,
    ).length;
    const totalDuration = Array.from(sessionMap.values()).reduce(
      (sum, session) => sum + session.totalDuration,
      0,
    );
    const totalPages = Array.from(sessionMap.values()).reduce(
      (sum, session) => sum + session.visitCount,
      0,
    );

    const visitorSessionMap = new Map<string, Set<string>>();
    for (const visit of referrerVisits) {
      const set = visitorSessionMap.get(visit.visitorId) ?? new Set<string>();
      set.add(visit.sessionId);
      visitorSessionMap.set(visit.visitorId, set);
    }
    const visitors = visitorSessionMap.size;
    const returningVisitors = Array.from(visitorSessionMap.values()).filter(
      (set) => set.size > 1,
    ).length;

    const avgDuration = sessions > 0 ? totalDuration / sessions : 0;
    const engagement =
      sessions > 0 ? Number(((sessions - bounces) / sessions).toFixed(6)) : 0;
    const depth = sessions > 0 ? totalPages / sessions : 0;
    const loyalty =
      visitors > 0 ? Number((returningVisitors / visitors).toFixed(6)) : 0;
    let nameHash = 0;
    for (let i = 0; i < referrerRow.referrer.length; i++) {
      nameHash =
        ((nameHash << 5) - nameHash + referrerRow.referrer.charCodeAt(i)) | 0;
    }
    const variation = 0.75 + (Math.abs(nameHash) % 100) / 200;
    const frequency = globalFrequency * variation;
    const traffic =
      totalVisitors > 0
        ? Number((referrerRow.visitors / totalVisitors).toFixed(6))
        : 0;

    return {
      referrer: referrerRow.referrer,
      visitors: referrerRow.visitors,
      sessions: referrerRow.sessions,
      metrics: {
        duration: avgDuration,
        engagement,
        depth,
        loyalty,
        frequency,
        traffic,
      },
    };
  });

  return { ok: true, data };
}

function generateDemoClientCrossDimensionData(
  dataset: DemoFactDataset,
  filtered: DemoFilteredFacts,
  primaryLimit: number,
  secondaryLimit: number,
  primaryDimension: DemoClientDimensionKey,
  secondaryDimension: DemoClientDimensionKey,
): {
  columns: Array<{
    key: string;
    label: string;
    views: number;
    visitors: number;
    sessions: number;
    isOther?: boolean;
    isUnknown?: boolean;
  }>;
  rows: Array<{
    key: string;
    label: string;
    views: number;
    visitors: number;
    sessions: number;
    isOther?: boolean;
    cells: Array<{
      key: string;
      label: string;
      views: number;
      visitors: number;
      sessions: number;
      isOther?: boolean;
      isUnknown?: boolean;
    }>;
  }>;
  totalVisitors: number;
} {
  const primaryMeta = demoClientDimensionMeta(primaryDimension);
  const secondaryMeta = demoClientDimensionMeta(secondaryDimension);
  const topPrimary = aggregateDimensionRowsFromVisits(
    dataset,
    filtered.visits,
    primaryLimit,
    (visit) => primaryMeta.getLabel(visit),
    "visitors",
  ).filter((row) => row.label.trim().length > 0 && row.visitors > 0);

  if (topPrimary.length === 0) {
    return {
      columns: [],
      rows: [],
      totalVisitors: 0,
    };
  }

  const topSecondary = aggregateDimensionRowsFromVisits(
    dataset,
    filtered.visits.filter(
      (visit) => String(primaryMeta.getLabel(visit) || "").trim().length > 0,
    ),
    secondaryLimit,
    (visit) => {
      const label = String(secondaryMeta.getLabel(visit) || "").trim();
      return label || DEMO_CLIENT_CROSS_UNKNOWN_TOKEN;
    },
    "visitors",
  ).filter((row) => row.visitors > 0);

  if (topSecondary.length === 0) {
    return {
      columns: [],
      rows: [],
      totalVisitors: 0,
    };
  }

  const primarySet = new Set(topPrimary.map((row) => row.label));
  const secondarySet = new Set(topSecondary.map((row) => row.label));
  const rowBuckets = new Map<
    string,
    {
      views: number;
      visitors: Set<string>;
      sessions: Set<string>;
      cells: Map<
        string,
        { views: number; visitors: Set<string>; sessions: Set<string> }
      >;
    }
  >();
  const columnBuckets = new Map<
    string,
    { views: number; visitors: Set<string>; sessions: Set<string> }
  >();

  for (const visit of filtered.visits) {
    const rawPrimary = String(primaryMeta.getLabel(visit) || "").trim();
    if (!rawPrimary) continue;

    const rawSecondary = String(secondaryMeta.getLabel(visit) || "").trim();
    const secondary = rawSecondary || DEMO_CLIENT_CROSS_UNKNOWN_TOKEN;
    const primaryBucket = primarySet.has(rawPrimary)
      ? rawPrimary
      : DEMO_CLIENT_CROSS_OTHER_PRIMARY_TOKEN;
    const secondaryBucket = secondarySet.has(secondary)
      ? secondary
      : DEMO_CLIENT_CROSS_OTHER_SECONDARY_TOKEN;

    const rowBucket = rowBuckets.get(primaryBucket) ?? {
      views: 0,
      visitors: new Set<string>(),
      sessions: new Set<string>(),
      cells: new Map<
        string,
        { views: number; visitors: Set<string>; sessions: Set<string> }
      >(),
    };
    rowBucket.views += dataset.viewWeight;
    rowBucket.visitors.add(visit.visitorId);
    rowBucket.sessions.add(visit.sessionId);
    const cellBucket = rowBucket.cells.get(secondaryBucket) ?? {
      views: 0,
      visitors: new Set<string>(),
      sessions: new Set<string>(),
    };
    cellBucket.views += dataset.viewWeight;
    cellBucket.visitors.add(visit.visitorId);
    cellBucket.sessions.add(visit.sessionId);
    rowBucket.cells.set(secondaryBucket, cellBucket);
    rowBuckets.set(primaryBucket, rowBucket);

    const columnBucket = columnBuckets.get(secondaryBucket) ?? {
      views: 0,
      visitors: new Set<string>(),
      sessions: new Set<string>(),
    };
    columnBucket.views += dataset.viewWeight;
    columnBucket.visitors.add(visit.visitorId);
    columnBucket.sessions.add(visit.sessionId);
    columnBuckets.set(secondaryBucket, columnBucket);
  }

  const columnKeySet = new Set<string>(["other", "unknown"]);
  const columnDescriptors: Array<{
    bucket: string;
    item: {
      key: string;
      label: string;
      views: number;
      visitors: number;
      sessions: number;
      isOther?: boolean;
      isUnknown?: boolean;
    };
  }> = topSecondary.map((row) => {
    if (row.label === DEMO_CLIENT_CROSS_UNKNOWN_TOKEN) {
      return {
        bucket: row.label,
        item: {
          key: "unknown",
          label: "Unknown",
          views: row.views,
          visitors: row.visitors,
          sessions: row.sessions,
          isUnknown: true,
        },
      };
    }

    return {
      bucket: row.label,
      item: {
        key: createDemoShareTrendSeriesKey(
          row.label,
          columnKeySet,
          secondaryMeta.fallbackKeyBase,
        ),
        label: row.label,
        views: row.views,
        visitors: row.visitors,
        sessions: row.sessions,
      },
    };
  });

  if (columnBuckets.has(DEMO_CLIENT_CROSS_OTHER_SECONDARY_TOKEN)) {
    const otherColumn = columnBuckets.get(
      DEMO_CLIENT_CROSS_OTHER_SECONDARY_TOKEN,
    ) ?? {
      views: 0,
      visitors: new Set<string>(),
      sessions: new Set<string>(),
    };
    columnDescriptors.push({
      bucket: DEMO_CLIENT_CROSS_OTHER_SECONDARY_TOKEN,
      item: {
        key: "other",
        label: DEMO_SHARE_TREND_OTHER_LABEL,
        views: Math.max(0, Math.round(otherColumn.views)),
        visitors: Math.max(
          0,
          Math.round(weightedVisitorCount(dataset, otherColumn.visitors)),
        ),
        sessions: Math.max(
          0,
          Math.round(weightedSessionCount(dataset, otherColumn.sessions)),
        ),
        isOther: true,
      },
    });
  }

  const rowKeySet = new Set<string>(["other"]);
  const rowDescriptors: Array<{
    bucket: string;
    item: {
      key: string;
      label: string;
      views: number;
      visitors: number;
      sessions: number;
      isOther?: boolean;
    };
  }> = topPrimary.map((row) => ({
    bucket: row.label,
    item: {
      key: createDemoShareTrendSeriesKey(
        row.label,
        rowKeySet,
        primaryMeta.fallbackKeyBase,
      ),
      label: row.label,
      views: row.views,
      visitors: row.visitors,
      sessions: row.sessions,
    },
  }));

  if (rowBuckets.has(DEMO_CLIENT_CROSS_OTHER_PRIMARY_TOKEN)) {
    const otherRow = rowBuckets.get(DEMO_CLIENT_CROSS_OTHER_PRIMARY_TOKEN) ?? {
      views: 0,
      visitors: new Set<string>(),
      sessions: new Set<string>(),
      cells: new Map<
        string,
        { views: number; visitors: Set<string>; sessions: Set<string> }
      >(),
    };
    rowDescriptors.push({
      bucket: DEMO_CLIENT_CROSS_OTHER_PRIMARY_TOKEN,
      item: {
        key: "other",
        label: DEMO_SHARE_TREND_OTHER_LABEL,
        views: Math.max(0, Math.round(otherRow.views)),
        visitors: Math.max(
          0,
          Math.round(weightedVisitorCount(dataset, otherRow.visitors)),
        ),
        sessions: Math.max(
          0,
          Math.round(weightedSessionCount(dataset, otherRow.sessions)),
        ),
        isOther: true,
      },
    });
  }

  const columns = columnDescriptors.map((column) => column.item);
  const rows = rowDescriptors
    .map((row) => {
      const rowBucket = rowBuckets.get(row.bucket);
      const cells = columnDescriptors.map((column) => {
        const cell = rowBucket?.cells.get(column.bucket);
        return {
          key: column.item.key,
          label: column.item.label,
          views: Math.max(0, Math.round(cell?.views ?? 0)),
          visitors: Math.max(
            0,
            Math.round(
              weightedVisitorCount(
                dataset,
                cell?.visitors ?? new Set<string>(),
              ),
            ),
          ),
          sessions: Math.max(
            0,
            Math.round(
              weightedSessionCount(
                dataset,
                cell?.sessions ?? new Set<string>(),
              ),
            ),
          ),
          ...(column.item.isOther ? { isOther: true } : {}),
          ...(column.item.isUnknown ? { isUnknown: true } : {}),
        };
      });

      return {
        ...row.item,
        views: Math.max(0, Math.round(rowBucket?.views ?? row.item.views)),
        visitors: rowBucket
          ? Math.max(
              0,
              Math.round(weightedVisitorCount(dataset, rowBucket.visitors)),
            )
          : row.item.visitors,
        sessions: rowBucket
          ? Math.max(
              0,
              Math.round(weightedSessionCount(dataset, rowBucket.sessions)),
            )
          : row.item.sessions,
        cells,
      };
    })
    .filter((row) => row.visitors > 0);

  return {
    columns,
    rows,
    totalVisitors: rows.reduce((sum, row) => sum + row.visitors, 0),
  };
}

function generateDemoClientCrossBreakdown(
  siteId: string,
  params: Record<string, string | number>,
): Record<string, unknown> {
  const primaryDimension = parseDemoClientDimensionKey(params.primaryDimension);
  const secondaryDimension = parseDemoClientDimensionKey(
    params.secondaryDimension,
  );
  if (
    !primaryDimension ||
    !secondaryDimension ||
    primaryDimension === secondaryDimension
  ) {
    return {
      columns: [],
      rows: [],
      totalVisitors: 0,
    };
  }

  const from = parseDemoNumber(params.from, 0);
  const to = parseDemoNumber(params.to, Date.now());
  const primaryLimit = parseDemoLimit(params.primaryLimit, 5, 1, 12);
  const secondaryLimit = parseDemoLimit(params.secondaryLimit, 6, 1, 8);
  const filters = parseDemoFilters(params);
  const dataset = buildDemoFactDataset(siteId, from, to);
  const filtered = applyDemoFilters(dataset, filters);

  return generateDemoClientCrossDimensionData(
    dataset,
    filtered,
    primaryLimit,
    secondaryLimit,
    primaryDimension,
    secondaryDimension,
  );
}

// ---------------------------------------------------------------------------
//  Data generators (integration-based)
// ---------------------------------------------------------------------------

function generateDemoOverview(
  siteId: string,
  params: Record<string, string | number>,
): Record<string, unknown> {
  const from = parseDemoNumber(params.from, 0);
  const to = parseDemoNumber(params.to, Date.now());
  const filters = parseDemoFilters(params);
  const dataset = buildDemoFactDataset(siteId, from, to);
  const filtered = applyDemoFilters(dataset, filters);
  const data = aggregateOverviewMetrics(dataset, filtered);
  const result: Record<string, unknown> = { ok: true, data };

  if (parseDemoBoolean(params.includeChange)) {
    const span = to - from;
    const previousFrom = Math.max(0, from - span);
    const previousDataset = buildDemoFactDataset(siteId, previousFrom, from);
    const previousFiltered = applyDemoFilters(previousDataset, filters);
    const previousData = aggregateOverviewMetrics(
      previousDataset,
      previousFiltered,
    );
    result.previousData = previousData;
    const cr = (cur: number, prev: number) =>
      prev === 0 ? null : Math.round(((cur - prev) / prev) * 10000) / 10000;
    result.changeRates = {
      views: cr(data.views, previousData.views),
      sessions: cr(data.sessions, previousData.sessions),
      visitors: cr(data.visitors, previousData.visitors),
      bounces: cr(data.bounces, previousData.bounces),
      bounceRate: cr(data.bounceRate, previousData.bounceRate),
      avgDurationMs: cr(data.avgDurationMs, previousData.avgDurationMs),
    };
  }

  if (parseDemoBoolean(params.includeDetail)) {
    const interval = parseDemoInterval(params.interval);
    const timeZone = parseDemoTimeZone(params);
    result.detail = {
      interval,
      data: buildDemoTrendBuckets(
        siteId,
        from,
        to,
        interval,
        filters,
        timeZone,
      ),
    };
  }

  return result;
}

function generateDemoTrend(
  siteId: string,
  params: Record<string, string | number>,
): Record<string, unknown> {
  const from = parseDemoNumber(params.from, 0);
  const to = parseDemoNumber(params.to, Date.now());
  const interval = parseDemoInterval(params.interval);
  const filters = parseDemoFilters(params);
  const timeZone = parseDemoTimeZone(params);
  return {
    ok: true,
    interval,
    data: buildDemoTrendBuckets(siteId, from, to, interval, filters, timeZone),
  };
}

type DemoRetentionGranularity = "minute" | "hour" | "day" | "week" | "month";

function parseDemoRetentionGranularity(
  value: string | number | undefined,
): DemoRetentionGranularity {
  const normalized = String(value ?? "week")
    .trim()
    .toLowerCase();
  if (
    normalized === "minute" ||
    normalized === "hour" ||
    normalized === "day" ||
    normalized === "week" ||
    normalized === "month"
  ) {
    return normalized;
  }
  return "week";
}

function generateDemoRetention(
  siteId: string,
  params: Record<string, string | number>,
): Record<string, unknown> {
  const from = parseDemoNumber(params.from, Date.now() - 30 * 24 * 3600 * 1000);
  const to = parseDemoNumber(params.to, Date.now());
  const granularity = parseDemoRetentionGranularity(params.granularity);
  const timeZone = parseDemoTimeZone(params);
  const buckets = buildDemoTimeBuckets(from, to, granularity, timeZone);
  const filters = parseDemoFilters(params);
  const dataset = buildDemoFactDataset(siteId, from, to);
  const filtered = applyDemoFilters(dataset, filters);

  const cohortByVisitor = new Map<string, number>();
  for (const visit of filtered.visits) {
    const visitorId = visit.visitorId.trim();
    if (!visitorId) continue;
    const bucket = findDemoTimeBucketIndex(buckets, visit.startedAt);
    if (bucket === null) continue;
    const current = cohortByVisitor.get(visitorId);
    if (current === undefined || bucket < current) {
      cohortByVisitor.set(visitorId, bucket);
    }
  }

  const periodsByCohort = new Map<number, Map<number, Set<string>>>();
  for (const visit of filtered.visits) {
    const visitorId = visit.visitorId.trim();
    if (!visitorId) continue;
    const cohortBucket = cohortByVisitor.get(visitorId);
    if (cohortBucket === undefined) continue;
    const visitBucket = findDemoTimeBucketIndex(buckets, visit.startedAt);
    if (visitBucket === null) continue;
    const index = Math.max(0, visitBucket - cohortBucket);
    const cohortPeriods =
      periodsByCohort.get(cohortBucket) ?? new Map<number, Set<string>>();
    const visitorSet = cohortPeriods.get(index) ?? new Set<string>();
    visitorSet.add(visitorId);
    cohortPeriods.set(index, visitorSet);
    periodsByCohort.set(cohortBucket, cohortPeriods);
  }

  const cohorts = Array.from(periodsByCohort.entries())
    .sort(([leftBucket], [rightBucket]) => leftBucket - rightBucket)
    .map(([bucket, periods]) => {
      const size = Math.max(
        0,
        Math.round(weightedVisitorCount(dataset, periods.get(0) ?? [])),
      );
      return {
        bucket: buckets[bucket]?.timestampMs ?? 0,
        size,
        periods: Array.from(periods.entries())
          .sort(([leftIndex], [rightIndex]) => leftIndex - rightIndex)
          .map(([index, visitorIds]) => {
            const visitors = Math.max(
              0,
              Math.round(weightedVisitorCount(dataset, visitorIds)),
            );
            return {
              index,
              visitors,
              rate: size > 0 ? visitors / size : 0,
            };
          }),
      };
    })
    .filter((cohort) => cohort.size > 0);

  return {
    ok: true,
    granularity,
    cohorts,
  };
}

type DemoPerformanceMetricKey = "ttfb" | "fcp" | "lcp" | "cls" | "inp";
const DEMO_PERFORMANCE_METRICS: DemoPerformanceMetricKey[] = [
  "ttfb",
  "fcp",
  "lcp",
  "cls",
  "inp",
];

function roundDemoPerformanceValue(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function demoPerformanceMetricValue(
  siteId: string,
  visit: DemoVisitFact,
  metric: DemoPerformanceMetricKey,
): number {
  const rng = mulberry32(fnv1a(`${siteId}:${visit.visitId}:${metric}`));
  const mobileFactor =
    visit.deviceType === "Mobile"
      ? 1.18
      : visit.deviceType === "Tablet"
        ? 1.09
        : 1;
  const articleFactor =
    visit.pathname.includes("/blog") ||
    visit.pathname.includes("/news") ||
    visit.pathname.includes("/posts")
      ? 1.08
      : 1;
  const browserFactor = visit.browser.includes("Safari")
    ? 1.04
    : visit.browser.includes("Firefox")
      ? 1.02
      : 1;

  if (metric === "cls") {
    const value =
      (0.025 + rng() * 0.12) * Math.min(1.35, mobileFactor * articleFactor);
    return roundDemoPerformanceValue(Math.min(0.35, value));
  }

  const base = {
    ttfb: 155,
    fcp: 920,
    lcp: 1560,
    inp: 145,
  } satisfies Record<Exclude<DemoPerformanceMetricKey, "cls">, number>;
  const durationFactor = 1 + Math.min(visit.durationMs, 180_000) / 600_000;
  const variability = 0.78 + rng() * 0.68;
  return roundDemoPerformanceValue(
    base[metric] *
      mobileFactor *
      articleFactor *
      browserFactor *
      durationFactor *
      variability,
  );
}

type DemoPerformanceHealthBand = "great" | "needs" | "poor";

const DEMO_PERFORMANCE_BAND_VALUES: Record<
  DemoPerformanceMetricKey,
  Record<DemoPerformanceHealthBand, number>
> = {
  ttfb: { great: 380, needs: 1050, poor: 2250 },
  fcp: { great: 920, needs: 2200, poor: 3650 },
  lcp: { great: 1650, needs: 3000, poor: 5200 },
  cls: { great: 0.045, needs: 0.14, poor: 0.34 },
  inp: { great: 95, needs: 280, poor: 650 },
};

function demoPerformanceBandForIndex(index: number): DemoPerformanceHealthBand {
  const bucket = Math.abs(index) % 3;
  if (bucket === 0) return "great";
  if (bucket === 1) return "needs";
  return "poor";
}

function demoPerformanceBandValue(
  siteId: string,
  visit: DemoVisitFact,
  metric: DemoPerformanceMetricKey,
  index: number,
): number {
  const band = demoPerformanceBandForIndex(index);
  const target = DEMO_PERFORMANCE_BAND_VALUES[metric][band];
  const rng = mulberry32(
    fnv1a(`${siteId}:${visit.visitId}:${metric}:${band}:${index}`),
  );
  const jitter = 0.86 + rng() * 0.28;
  return roundDemoPerformanceValue(target * jitter);
}

function demoPercentile(values: number[], ratio: number): number | null {
  if (values.length === 0) return null;
  const rank = Math.max(0, Math.ceil(values.length * ratio) - 1);
  return roundDemoPerformanceValue(
    values[Math.min(rank, values.length - 1)] ?? 0,
  );
}

function summarizeDemoJourneyPerformance(
  siteId: string,
  visits: DemoVisitFact[],
): Record<
  DemoPerformanceMetricKey,
  {
    avg: number | null;
    p75: number | null;
    min: number | null;
    max: number | null;
    samples: number;
  }
> {
  return Object.fromEntries(
    DEMO_PERFORMANCE_METRICS.map((metric) => {
      const values = visits
        .map((visit) => demoPerformanceMetricValue(siteId, visit, metric))
        .filter((value) => Number.isFinite(value) && value >= 0)
        .sort((left, right) => left - right);
      const avg =
        values.length > 0
          ? roundDemoPerformanceValue(
              values.reduce((sum, value) => sum + value, 0) / values.length,
            )
          : null;
      return [
        metric,
        {
          avg,
          p75: demoPercentile(values, 0.75),
          min:
            values.length > 0
              ? roundDemoPerformanceValue(values[0] ?? 0)
              : null,
          max:
            values.length > 0
              ? roundDemoPerformanceValue(values[values.length - 1] ?? 0)
              : null,
          samples: values.length,
        },
      ];
    }),
  ) as Record<
    DemoPerformanceMetricKey,
    {
      avg: number | null;
      p75: number | null;
      min: number | null;
      max: number | null;
      samples: number;
    }
  >;
}

function generateDemoPerformance(
  siteId: string,
  params: Record<string, string | number>,
): Record<string, unknown> {
  const from = parseDemoNumber(params.from, 0);
  const to = parseDemoNumber(params.to, Date.now());
  const interval = parseDemoInterval(params.interval);
  const filters = parseDemoFilters(params);
  const dataset = buildDemoFactDataset(siteId, from, to);
  const filtered = applyDemoFilters(dataset, filters);
  const timeZone = parseDemoTimeZone(params);
  const buckets = buildDemoTimeBuckets(from, to, interval, timeZone);
  const metrics = ["ttfb", "fcp", "lcp", "cls", "inp"] as const;
  const summaryValues = {
    ttfb: [] as number[],
    fcp: [] as number[],
    lcp: [] as number[],
    cls: [] as number[],
    inp: [] as number[],
  };
  const bucketValues = {
    ttfb: new Map<number, number[]>(),
    fcp: new Map<number, number[]>(),
    lcp: new Map<number, number[]>(),
    cls: new Map<number, number[]>(),
    inp: new Map<number, number[]>(),
  };

  for (const visit of filtered.visits) {
    const bucket = findDemoTimeBucketIndex(buckets, visit.startedAt);
    if (bucket === null) continue;
    for (const metric of metrics) {
      const value = demoPerformanceMetricValue(siteId, visit, metric);
      summaryValues[metric].push(value);
      const bucketSeries = bucketValues[metric].get(bucket) ?? [];
      bucketSeries.push(value);
      bucketValues[metric].set(bucket, bucketSeries);
    }
  }

  const summaries = Object.fromEntries(
    metrics.map((metric) => {
      const values = [...summaryValues[metric]].sort(
        (left, right) => left - right,
      );
      const avg =
        values.length > 0
          ? roundDemoPerformanceValue(
              values.reduce((sum, value) => sum + value, 0) / values.length,
            )
          : null;
      const samples = Math.max(
        0,
        Math.round(values.length * dataset.viewWeight),
      );
      return [
        metric,
        {
          avg,
          p50: demoPercentile(values, 0.5),
          p75: demoPercentile(values, 0.75),
          p95: demoPercentile(values, 0.95),
          samples,
        },
      ];
    }),
  );

  const trends = Object.fromEntries(
    metrics.map((metric) => {
      const rows: Array<{
        bucket: number;
        timestampMs: number;
        avg: number | null;
        p50: number | null;
        p75: number | null;
        p95: number | null;
        samples: number;
      }> = [];

      for (const timeBucket of buckets) {
        const bucket = timeBucket.index;
        const values = [...(bucketValues[metric].get(bucket) ?? [])].sort(
          (left, right) => left - right,
        );
        const avg =
          values.length > 0
            ? roundDemoPerformanceValue(
                values.reduce((sum, value) => sum + value, 0) / values.length,
              )
            : null;
        rows.push({
          bucket,
          timestampMs: timeBucket.timestampMs,
          avg,
          p50: demoPercentile(values, 0.5),
          p75: demoPercentile(values, 0.75),
          p95: demoPercentile(values, 0.95),
          samples: Math.max(0, Math.round(values.length * dataset.viewWeight)),
        });
      }

      return [metric, rows];
    }),
  );

  const routeLimit = parseDemoLimit(params.limit, 18, 1, 50);
  const routeRows = aggregateDimensionRowsFromVisits(
    dataset,
    filtered.visits,
    Math.max(routeLimit, 1),
    (visit) => visit.pathname,
  );
  const routes = routeRows.map((row, routeIndex) => {
    const visitsForPath = filtered.visits.filter(
      (visit) => visit.pathname === row.label,
    );
    const routeMetrics = Object.fromEntries(
      metrics.map((metric) => {
        const values = visitsForPath
          .map((visit) =>
            demoPerformanceBandValue(siteId, visit, metric, routeIndex),
          )
          .sort((left, right) => left - right);
        const avg =
          values.length > 0
            ? roundDemoPerformanceValue(
                values.reduce((sum, value) => sum + value, 0) / values.length,
              )
            : null;
        return [
          metric,
          {
            avg,
            p50: demoPercentile(values, 0.5),
            p75: demoPercentile(values, 0.75),
            p95: demoPercentile(values, 0.95),
            samples: Math.max(
              0,
              Math.round(values.length * dataset.viewWeight),
            ),
          },
        ];
      }),
    );

    return {
      pathname: row.label,
      views: row.views,
      metrics: routeMetrics,
    };
  });

  const countryRows = aggregateDimensionRowsFromVisits(
    dataset,
    filtered.visits,
    48,
    (visit) => visit.country,
  );
  const countries = countryRows.map((row, countryIndex) => {
    const visitsForCountry = filtered.visits.filter(
      (visit) => visit.country === row.label,
    );
    const countryMetrics = Object.fromEntries(
      metrics.map((metric) => {
        const values = visitsForCountry
          .map((visit) =>
            demoPerformanceBandValue(siteId, visit, metric, countryIndex),
          )
          .sort((left, right) => left - right);
        const avg =
          values.length > 0
            ? roundDemoPerformanceValue(
                values.reduce((sum, value) => sum + value, 0) / values.length,
              )
            : null;
        return [
          metric,
          {
            avg,
            p50: demoPercentile(values, 0.5),
            p75: demoPercentile(values, 0.75),
            p95: demoPercentile(values, 0.95),
            samples: Math.max(
              0,
              Math.round(values.length * dataset.viewWeight),
            ),
          },
        ];
      }),
    );

    return {
      country: row.label,
      views: row.views,
      metrics: countryMetrics,
    };
  });

  return {
    ok: true,
    interval,
    summaries,
    trends,
    routes,
    countries,
  };
}

function generateDemoPages(
  siteId: string,
  params: Record<string, string | number>,
): Record<string, unknown> {
  const limit = parseDemoLimit(params.limit, 100, 1, 500);
  const from = parseDemoNumber(params.from, 0);
  const to = parseDemoNumber(params.to, Date.now());
  const filters = parseDemoFilters(params);
  const dataset = buildDemoFactDataset(siteId, from, to);
  const filtered = applyDemoFilters(dataset, filters);
  const pages = collectPageDataAndTabs(dataset, filtered, limit);

  return {
    ok: true,
    data: pages.data,
    tabs: pages.tabs,
  };
}

function generateDemoPagesDashboard(
  siteId: string,
  params: Record<string, string | number>,
): Record<string, unknown> {
  const page = parseDemoLimit(params.page, 1, 1, 10_000);
  const pageSize = parseDemoLimit(params.pageSize, 12, 1, 24);
  const from = parseDemoNumber(params.from, 0);
  const to = parseDemoNumber(params.to, Date.now());
  const interval = parseDemoInterval(params.interval);
  const filters = parseDemoFilters(params);
  const timeZone = parseDemoTimeZone(params);
  const dataset = buildDemoFactDataset(siteId, from, to);
  const filtered = applyDemoFilters(dataset, filters);
  const allPathRows = aggregateDimensionRowsFromVisits(
    dataset,
    filtered.visits,
    Math.max(filtered.visits.length, page * pageSize + 1),
    (visit) => visit.pathname,
  );
  const offset = (page - 1) * pageSize;
  const requestedRows = allPathRows.slice(offset, offset + pageSize + 1);
  const hasMore = requestedRows.length > pageSize;
  const currentRows = requestedRows.slice(0, pageSize);
  const span = Math.max(0, to - from);
  const previousFrom = Math.max(0, from - span);
  const previousTo = Math.max(previousFrom, from);
  const previousDataset = buildDemoFactDataset(
    siteId,
    previousFrom,
    previousTo,
  );

  const percentDelta = (current: number, previous: number) =>
    previous <= 0 ? null : ((current - previous) / previous) * 100;

  return {
    ok: true,
    interval,
    data: currentRows.map((row) => {
      const pathname = row.label;
      const currentMetrics = aggregateOverviewMetrics(
        dataset,
        applyDemoFilters(dataset, { ...filters, path: pathname }),
      );
      const previousMetrics = aggregateOverviewMetrics(
        previousDataset,
        applyDemoFilters(previousDataset, { ...filters, path: pathname }),
      );
      const currentPagesPerSession =
        currentMetrics.sessions > 0
          ? currentMetrics.views / currentMetrics.sessions
          : 0;
      const previousPagesPerSession =
        previousMetrics.sessions > 0
          ? previousMetrics.views / previousMetrics.sessions
          : 0;
      const titles = aggregateDimensionRowsFromVisits(
        dataset,
        filtered.visits.filter((visit) => visit.pathname === pathname),
        3,
        (visit) => visit.title,
      ).map((titleRow) => titleRow.label);
      const trend = buildDemoTrendBuckets(
        siteId,
        from,
        to,
        interval,
        {
          ...filters,
          path: pathname,
        },
        timeZone,
      ).map((point) => ({
        timestampMs: point.timestampMs,
        views: point.views,
        visitors: point.visitors,
      }));

      return {
        pathname,
        titles,
        trend,
        metrics: {
          views: currentMetrics.views,
          visitors: currentMetrics.visitors,
          sessions: currentMetrics.sessions,
          bounceRate: currentMetrics.bounceRate,
          pagesPerSession: currentPagesPerSession,
          avgDurationMs: currentMetrics.avgDurationMs,
        },
        changeRates: {
          views: percentDelta(currentMetrics.views, previousMetrics.views),
          visitors: percentDelta(
            currentMetrics.visitors,
            previousMetrics.visitors,
          ),
          sessions: percentDelta(
            currentMetrics.sessions,
            previousMetrics.sessions,
          ),
          bounceRate: percentDelta(
            currentMetrics.bounceRate,
            previousMetrics.bounceRate,
          ),
          pagesPerSession: percentDelta(
            currentPagesPerSession,
            previousPagesPerSession,
          ),
          avgDurationMs: percentDelta(
            currentMetrics.avgDurationMs,
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
  };
}

function generateDemoReferrers(
  siteId: string,
  params: Record<string, string | number>,
): Record<string, unknown> {
  const limit = parseDemoLimit(params.limit, 100, 1, 500);
  const from = parseDemoNumber(params.from, 0);
  const to = parseDemoNumber(params.to, Date.now());
  const filters = parseDemoFilters(params);
  const dataset = buildDemoFactDataset(siteId, from, to);
  const filtered = applyDemoFilters(dataset, filters);

  return {
    ok: true,
    data: collectReferrerRows(dataset, filtered, limit),
  };
}

function parseDemoScreenSize(value: string): {
  screenWidth: number | null;
  screenHeight: number | null;
} {
  const match = String(value || "").match(/^(\d+)\s*x\s*(\d+)$/i);
  if (!match) return { screenWidth: null, screenHeight: null };
  return {
    screenWidth: Number(match[1]) || null,
    screenHeight: Number(match[2]) || null,
  };
}

function hasValidDemoCoordinate(visit: DemoVisitFact): boolean {
  return (
    Number.isFinite(visit.latitude) &&
    Number.isFinite(visit.longitude) &&
    visit.latitude >= -90 &&
    visit.latitude <= 90 &&
    visit.longitude >= -180 &&
    visit.longitude <= 180
  );
}

function createDemoJourneyLocationPoints(
  visits: DemoVisitFact[],
): Array<Record<string, unknown>> {
  return [...visits]
    .sort(
      (left, right) =>
        left.startedAt - right.startedAt ||
        left.visitId.localeCompare(right.visitId),
    )
    .filter(hasValidDemoCoordinate)
    .map((visit) => ({
      latitude: visit.latitude,
      longitude: visit.longitude,
      timestampMs: visit.startedAt,
      country: visit.country,
      region: visit.regionName || visit.region,
      regionCode: visit.regionCode,
      city: visit.cityName || visit.city,
    }));
}

function createDemoJourneySession(
  sessionId: string,
  visits: DemoVisitFact[],
): Record<string, unknown> | null {
  if (visits.length === 0) return null;
  const ordered = [...visits].sort(
    (left, right) =>
      left.startedAt - right.startedAt ||
      left.visitId.localeCompare(right.visitId),
  );
  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  if (!first || !last) return null;
  const endedAt = Math.max(
    ...ordered.map((visit) => visit.startedAt + Math.max(0, visit.durationMs)),
    last.startedAt,
  );
  const durationMs = ordered.reduce(
    (sum, visit) => sum + Math.max(0, visit.durationMs),
    0,
  );
  const screen = parseDemoScreenSize(first.screenSize);
  const firstGeo = ordered.find(hasValidDemoCoordinate);
  return {
    sessionId,
    visitorId: first.visitorId,
    startedAt: first.startedAt,
    endedAt,
    durationMs,
    active: endedAt > Date.now() - 5 * 60 * 1000,
    views: ordered.length,
    events: ordered.filter((visit) => visit.eventType !== "pageview").length,
    bounce: ordered.length <= 1,
    entryPath: first.pathname,
    exitPath: last.pathname,
    referrerHost: first.referrerHost,
    referrerUrl: first.referrerUrl,
    country: first.country,
    region: first.regionName || first.region,
    regionCode: first.regionCode,
    city: first.cityName || first.city,
    latitude: firstGeo?.latitude ?? null,
    longitude: firstGeo?.longitude ?? null,
    browser: first.browser,
    browserVersion: first.browserVersion,
    os: demoOperatingSystemLabel(first.osVersion),
    osVersion: first.osVersion,
    deviceType: first.deviceType,
    screenWidth: screen.screenWidth,
    screenHeight: screen.screenHeight,
  };
}

function demoVisitsBySession(
  visits: DemoVisitFact[],
): Map<string, DemoVisitFact[]> {
  const bySession = new Map<string, DemoVisitFact[]>();
  for (const visit of visits) {
    const bucket = bySession.get(visit.sessionId) ?? [];
    bucket.push(visit);
    bySession.set(visit.sessionId, bucket);
  }
  return bySession;
}

function createDemoJourneyEvents(
  visits: DemoVisitFact[],
  options?: { includeSessionStart?: boolean; includeSessionEnd?: boolean },
): Array<Record<string, unknown>> {
  const events: Array<Record<string, unknown>> = [];
  const bySession = demoVisitsBySession(visits);

  if (options?.includeSessionStart || options?.includeSessionEnd) {
    for (const [sessionId, sessionVisits] of bySession.entries()) {
      const session = createDemoJourneySession(sessionId, sessionVisits);
      if (!session) continue;
      if (options?.includeSessionStart) {
        events.push({
          id: `session-start:${sessionId}`,
          kind: "session_start",
          eventType: "session start",
          occurredAt: session.startedAt,
          visitId: "",
          sessionId,
          visitorId: session.visitorId,
          pathname: session.entryPath,
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
        });
      }

      if (options?.includeSessionEnd && !session.active) {
        const sessionStartedAt = Number(session.startedAt ?? 0);
        const sessionEndedAt = Number(session.endedAt ?? sessionStartedAt);
        const lastVisit = [...sessionVisits].sort(
          (left, right) =>
            right.startedAt - left.startedAt ||
            right.visitId.localeCompare(left.visitId),
        )[0];
        if (lastVisit && Number.isFinite(sessionEndedAt)) {
          const screen = parseDemoScreenSize(lastVisit.screenSize);
          events.push({
            id: `session-leave:${sessionId}`,
            kind: "leave",
            eventType: "leave",
            occurredAt: Math.max(sessionEndedAt, sessionStartedAt),
            visitId: lastVisit.visitId,
            sessionId,
            visitorId: lastVisit.visitorId,
            pathname: session.exitPath || lastVisit.pathname,
            title: lastVisit.title,
            hostname: lastVisit.hostname,
            referrerHost: lastVisit.referrerHost,
            referrerUrl: lastVisit.referrerUrl,
            country: lastVisit.country,
            region: lastVisit.regionName || lastVisit.region,
            city: lastVisit.cityName || lastVisit.city,
            browser: lastVisit.browser,
            browserVersion: lastVisit.browserVersion,
            os: demoOperatingSystemLabel(lastVisit.osVersion),
            osVersion: lastVisit.osVersion,
            deviceType: lastVisit.deviceType,
            screenWidth: screen.screenWidth,
            screenHeight: screen.screenHeight,
            durationMs: 0,
          });
        }
      }
    }
  }

  for (const visit of visits) {
    const screen = parseDemoScreenSize(visit.screenSize);
    const base = {
      visitId: visit.visitId,
      sessionId: visit.sessionId,
      visitorId: visit.visitorId,
      pathname: visit.pathname,
      title: visit.title,
      hostname: visit.hostname,
      referrerHost: visit.referrerHost,
      referrerUrl: visit.referrerUrl,
      country: visit.country,
      region: visit.regionName || visit.region,
      city: visit.cityName || visit.city,
      browser: visit.browser,
      browserVersion: visit.browserVersion,
      os: demoOperatingSystemLabel(visit.osVersion),
      osVersion: visit.osVersion,
      deviceType: visit.deviceType,
      screenWidth: screen.screenWidth,
      screenHeight: screen.screenHeight,
      durationMs: 0,
    };
    events.push({
      ...base,
      id: visit.visitId,
      kind: "pageview",
      eventType: "pageview",
      occurredAt: visit.startedAt,
      durationMs: Math.max(0, visit.durationMs),
    });
    if (visit.eventType !== "pageview") {
      events.push({
        ...base,
        id: `${visit.visitId}:${visit.eventType}`,
        kind: "custom",
        eventType: visit.eventType,
        occurredAt: Math.min(
          visit.startedAt + 1000,
          visit.startedAt + Math.max(1000, visit.durationMs),
        ),
      });
    }
  }

  return events.sort(
    (left, right) =>
      Number(right.occurredAt ?? 0) - Number(left.occurredAt ?? 0) ||
      String(right.id ?? "").localeCompare(String(left.id ?? "")),
  );
}

function summarizeDemoVisitedPages(events: Array<Record<string, unknown>>) {
  const pages = new Map<string, number>();
  for (const event of events) {
    if (event.kind !== "pageview") continue;
    const pathname = String(event.pathname || "/").trim() || "/";
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

function summarizeDemoEventDistribution(
  events: Array<Record<string, unknown>>,
) {
  const counts = new Map<string, number>();
  for (const event of events) {
    const eventType = String(event.eventType || event.kind || "event");
    counts.set(eventType, (counts.get(eventType) ?? 0) + 1);
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

function demoReportingDateKey(timestampMs: number, timeZone: string): string {
  const parts = zonedParts(timestampMs, timeZone);
  const month = String(parts.month).padStart(2, "0");
  const day = String(parts.day).padStart(2, "0");
  return `${parts.year}-${month}-${day}`;
}

function summarizeDemoActivity(
  events: Array<Record<string, unknown>>,
  timeZone: string,
) {
  const counts = new Map<string, number>();
  for (const event of events) {
    const occurredAt = Number(event.occurredAt ?? 0);
    if (!Number.isFinite(occurredAt) || occurredAt <= 0) continue;
    const date = demoReportingDateKey(occurredAt, timeZone);
    counts.set(date, (counts.get(date) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((left, right) => left.date.localeCompare(right.date));
}

function demoJourneyPercentile(
  values: number[],
  percentileValue: number,
): number {
  const sorted = values
    .filter((value) => Number.isFinite(value) && value >= 0)
    .sort((left, right) => left - right);
  if (sorted.length === 0) return 0;
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((percentileValue / 100) * sorted.length) - 1),
  );
  return sorted[index] ?? 0;
}

function demoAverageGapMs(values: number[]): number {
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

type DemoSortDirection = "asc" | "desc";
type DemoVisitorSortKey = "firstSeenAt" | "lastSeenAt" | "sessions" | "views";
type DemoSessionSortKey = "startedAt" | "durationMs" | "views";

function parseDemoSortDirection(
  value: string | number | undefined,
): DemoSortDirection {
  return String(value ?? "")
    .trim()
    .toLowerCase() === "asc"
    ? "asc"
    : "desc";
}

function parseDemoVisitorSort(params: Record<string, string | number>): {
  key: DemoVisitorSortKey;
  direction: DemoSortDirection;
} {
  const key = String(params.sortBy ?? "").trim();
  if (
    key === "firstSeenAt" ||
    key === "lastSeenAt" ||
    key === "sessions" ||
    key === "views"
  ) {
    return { key, direction: parseDemoSortDirection(params.sortDir) };
  }
  return { key: "lastSeenAt", direction: "desc" };
}

function parseDemoSessionSort(params: Record<string, string | number>): {
  key: DemoSessionSortKey;
  direction: DemoSortDirection;
} {
  const key = String(params.sortBy ?? "").trim();
  if (key === "startedAt" || key === "durationMs" || key === "views") {
    return { key, direction: parseDemoSortDirection(params.sortDir) };
  }
  return { key: "startedAt", direction: "desc" };
}

function compareDemoNumericField(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
  key: string,
  direction: DemoSortDirection,
): number {
  const diff = Number(left[key] ?? 0) - Number(right[key] ?? 0);
  return direction === "asc" ? diff : -diff;
}

function generateDemoVisitors(
  siteId: string,
  params: Record<string, string | number>,
): Record<string, unknown> {
  const paged = params.page !== undefined || params.pageSize !== undefined;
  const page = paged ? parseDemoLimit(params.page, 1, 1, 10_000) : 1;
  const pageSize = paged
    ? parseDemoLimit(params.pageSize, 80, 1, 120)
    : parseDemoLimit(params.limit, 100, 1, 500);
  const offset = paged ? (page - 1) * pageSize : 0;
  const from = parseDemoNumber(params.from, Date.now() - 7 * 24 * 3600 * 1000);
  const to = parseDemoNumber(params.to, Date.now());
  const filters = parseDemoFilters(params);
  const sort = parseDemoVisitorSort(params);
  const search = normalizeDemoSearch(params);
  const dataset = buildDemoFactDataset(siteId, from, to);
  const filtered = applyDemoFilters(dataset, filters);
  const matchedVisitorIds = search
    ? new Set(
        filtered.visits
          .filter((visit) =>
            demoVisitMatchesJourneySearch(dataset, visit, search),
          )
          .map((visit) => visit.visitorId),
      )
    : null;

  const buckets = new Map<
    string,
    {
      firstSeenAt: number;
      lastSeenAt: number;
      views: number;
      sessions: Set<string>;
      events: number;
      firstVisit: DemoVisitFact;
      latestVisit: DemoVisitFact;
    }
  >();
  for (const visit of filtered.visits) {
    if (matchedVisitorIds && !matchedVisitorIds.has(visit.visitorId)) continue;
    const bucket = buckets.get(visit.visitorId) ?? {
      firstSeenAt: visit.startedAt,
      lastSeenAt: visit.startedAt,
      views: 0,
      sessions: new Set<string>(),
      events: 0,
      firstVisit: visit,
      latestVisit: visit,
    };
    if (visit.startedAt <= bucket.firstSeenAt) {
      bucket.firstSeenAt = visit.startedAt;
      bucket.firstVisit = visit;
    }
    if (visit.startedAt >= bucket.lastSeenAt) {
      bucket.lastSeenAt = visit.startedAt;
      bucket.latestVisit = visit;
    }
    bucket.views += dataset.viewWeight;
    bucket.sessions.add(visit.sessionId);
    if (visit.eventType !== "pageview") bucket.events += 1;
    buckets.set(visit.visitorId, bucket);
  }

  const requestedRows = Array.from(buckets.entries())
    .map(([visitorId, bucket]) => ({
      visitorId,
      sessionId: bucket.latestVisit.sessionId,
      firstSeenAt: bucket.firstSeenAt,
      lastSeenAt: bucket.lastSeenAt,
      views: Math.max(0, Math.round(bucket.views)),
      sessions: Math.max(
        0,
        Math.round(weightedSessionCount(dataset, bucket.sessions)),
      ),
      events: bucket.events,
      country: bucket.latestVisit.country,
      region: bucket.latestVisit.regionName || bucket.latestVisit.region,
      regionCode: bucket.latestVisit.regionCode,
      city: bucket.latestVisit.cityName || bucket.latestVisit.city,
      referrerHost: bucket.firstVisit.referrerHost,
      referrerUrl: bucket.firstVisit.referrerUrl,
      browser: bucket.latestVisit.browser,
      browserVersion: bucket.latestVisit.browserVersion,
      os: demoOperatingSystemLabel(bucket.latestVisit.osVersion),
      osVersion: bucket.latestVisit.osVersion,
      deviceType: bucket.latestVisit.deviceType,
      screenWidth: parseDemoScreenSize(bucket.latestVisit.screenSize)
        .screenWidth,
      screenHeight: parseDemoScreenSize(bucket.latestVisit.screenSize)
        .screenHeight,
    }))
    .sort(
      (left, right) =>
        compareDemoNumericField(left, right, sort.key, sort.direction) ||
        right.lastSeenAt - left.lastSeenAt ||
        right.views - left.views ||
        left.visitorId.localeCompare(right.visitorId),
    )
    .slice(offset, offset + pageSize + (paged ? 1 : 0));
  const hasMore = paged && requestedRows.length > pageSize;
  const rows = hasMore ? requestedRows.slice(0, pageSize) : requestedRows;

  return {
    ok: true,
    data: rows,
    meta: {
      page,
      pageSize,
      returned: rows.length,
      hasMore,
      nextPage: hasMore ? page + 1 : null,
    },
  };
}

function generateDemoSessions(
  siteId: string,
  params: Record<string, string | number>,
): Record<string, unknown> {
  const paged = params.page !== undefined || params.pageSize !== undefined;
  const page = paged ? parseDemoLimit(params.page, 1, 1, 10_000) : 1;
  const pageSize = paged
    ? parseDemoLimit(params.pageSize, 80, 1, 120)
    : parseDemoLimit(params.limit, 100, 1, 500);
  const offset = paged ? (page - 1) * pageSize : 0;
  const from = parseDemoNumber(params.from, Date.now() - 7 * 24 * 3600 * 1000);
  const to = parseDemoNumber(params.to, Date.now());
  const filters = parseDemoFilters(params);
  const sort = parseDemoSessionSort(params);
  const search = normalizeDemoSearch(params);
  const dataset = buildDemoFactDataset(siteId, from, to);
  const filtered = applyDemoFilters(dataset, filters);
  const matchedSessionIds = search
    ? new Set(
        filtered.visits
          .filter((visit) =>
            demoVisitMatchesJourneySearch(dataset, visit, search),
          )
          .map((visit) => visit.sessionId),
      )
    : null;
  const requestedRows = Array.from(
    demoVisitsBySession(filtered.visits).entries(),
  )
    .filter(([sessionId]) =>
      matchedSessionIds ? matchedSessionIds.has(sessionId) : true,
    )
    .map(([sessionId, visits]) => createDemoJourneySession(sessionId, visits))
    .filter((row): row is Record<string, unknown> => Boolean(row))
    .sort(
      (left, right) =>
        compareDemoNumericField(left, right, sort.key, sort.direction) ||
        Number(right.startedAt ?? 0) - Number(left.startedAt ?? 0) ||
        String(left.sessionId ?? "").localeCompare(
          String(right.sessionId ?? ""),
        ),
    )
    .slice(offset, offset + pageSize + (paged ? 1 : 0));
  const hasMore = paged && requestedRows.length > pageSize;
  const rows = hasMore ? requestedRows.slice(0, pageSize) : requestedRows;

  return {
    ok: true,
    data: rows,
    meta: {
      page,
      pageSize,
      returned: rows.length,
      hasMore,
      nextPage: hasMore ? page + 1 : null,
    },
  };
}

function generateDemoVisitorDetail(
  siteId: string,
  params: Record<string, string | number>,
): Record<string, unknown> {
  const visitorId = String(params.visitorId || "").trim();
  if (!visitorId) return { ok: true, data: null };
  const from = parseDemoNumber(params.from, Date.now() - 7 * 24 * 3600 * 1000);
  const to = parseDemoNumber(params.to, Date.now());
  const filters = parseDemoFilters(params);
  const timeZone = parseDemoTimeZone(params);
  const dataset = buildDemoFactDataset(siteId, from, to);
  const filtered = applyDemoFilters(dataset, filters);
  const visits = filtered.visits.filter(
    (visit) => visit.visitorId === visitorId,
  );
  if (visits.length === 0) return { ok: true, data: null };

  const sessions = Array.from(demoVisitsBySession(visits).entries())
    .map(([sessionId, sessionVisits]) =>
      createDemoJourneySession(sessionId, sessionVisits),
    )
    .filter((row): row is Record<string, unknown> => Boolean(row))
    .sort(
      (left, right) =>
        Number(right.startedAt ?? 0) - Number(left.startedAt ?? 0),
    );
  const events = createDemoJourneyEvents(visits, { includeSessionStart: true });
  const customEventCount = events.filter(
    (event) => event.kind === "custom",
  ).length;
  const latest =
    [...visits].sort((left, right) => right.startedAt - left.startedAt)[0] ??
    visits[0];
  const earliest =
    [...visits].sort((left, right) => left.startedAt - right.startedAt)[0] ??
    visits[0];
  const firstSeenAt = Math.min(...visits.map((visit) => visit.startedAt));
  const lastSeenAt = Math.max(...visits.map((visit) => visit.startedAt));
  const screen = parseDemoScreenSize(latest.screenSize);
  const durationValues = sessions.map((session) =>
    Number(session.durationMs ?? 0),
  );
  const totalDuration = durationValues.reduce((sum, value) => sum + value, 0);
  const daysActive = new Set(
    events
      .map((event) => Number(event.occurredAt ?? 0))
      .filter((value) => value > 0)
      .map((value) => demoReportingDateKey(value, timeZone)),
  ).size;
  const visitor = {
    visitorId,
    firstSeenAt,
    lastSeenAt,
    views: visits.length,
    sessions: sessions.length,
    events: customEventCount,
    country: latest.country,
    region: latest.regionName || latest.region,
    city: latest.cityName || latest.city,
    referrerHost: earliest.referrerHost,
    referrerUrl: earliest.referrerUrl,
    browser: latest.browser,
    browserVersion: latest.browserVersion,
    os: demoOperatingSystemLabel(latest.osVersion),
    osVersion: latest.osVersion,
    deviceType: latest.deviceType,
    screenWidth: screen.screenWidth,
    screenHeight: screen.screenHeight,
  };

  return {
    ok: true,
    data: {
      visitor,
      metrics: {
        totalEvents: customEventCount,
        sessions: sessions.length,
        views: visits.length,
        avgEventsPerSession:
          sessions.length > 0 ? customEventCount / sessions.length : 0,
        bounceRate:
          sessions.length > 0
            ? sessions.filter((session) => Boolean(session.bounce)).length /
              sessions.length
            : 0,
        avgDurationMs:
          sessions.length > 0 ? Math.round(totalDuration / sessions.length) : 0,
        p90DurationMs: demoJourneyPercentile(durationValues, 90),
        firstSeenAt,
        lastSeenAt,
        daysActive,
        conversionEvents: customEventCount,
        avgTimeBetweenSessionsMs: demoAverageGapMs(
          sessions.map((session) => Number(session.startedAt ?? 0)),
        ),
      },
      sessions,
      events,
      visitedPages: summarizeDemoVisitedPages(events),
      eventDistribution: summarizeDemoEventDistribution(events),
      activity: summarizeDemoActivity(events, timeZone),
      performance: summarizeDemoJourneyPerformance(siteId, visits),
    },
  };
}

function generateDemoSessionDetail(
  siteId: string,
  params: Record<string, string | number>,
): Record<string, unknown> {
  const sessionId = String(params.sessionId || "").trim();
  if (!sessionId) return { ok: true, data: null };
  const from = parseDemoNumber(params.from, Date.now() - 7 * 24 * 3600 * 1000);
  const to = parseDemoNumber(params.to, Date.now());
  const filters = parseDemoFilters(params);
  const dataset = buildDemoFactDataset(siteId, from, to);
  const filtered = applyDemoFilters(dataset, filters);
  const visits = filtered.visits.filter(
    (visit) => visit.sessionId === sessionId,
  );
  const session = createDemoJourneySession(sessionId, visits);
  if (!session) return { ok: true, data: null };
  const events = createDemoJourneyEvents(visits, {
    includeSessionStart: true,
    includeSessionEnd: true,
  });
  const locationPoints = createDemoJourneyLocationPoints(visits);

  return {
    ok: true,
    data: {
      session,
      locationPoints,
      events,
      visitedPages: summarizeDemoVisitedPages(events),
      eventDistribution: summarizeDemoEventDistribution(events),
      performance: summarizeDemoJourneyPerformance(siteId, visits),
    },
  };
}

function generateDemoDimension(
  siteId: string,
  dimensionType: string,
  params: Record<string, string | number>,
): Record<string, unknown> {
  const limit = parseDemoLimit(params.limit, 20, 1, 500);
  const from = parseDemoNumber(params.from, 0);
  const to = parseDemoNumber(params.to, Date.now());
  let filters = parseDemoFilters(params);
  if (dimensionType === "countries") {
    filters = withoutDemoGeoFilter(filters);
  }
  const dataset = buildDemoFactDataset(siteId, from, to);
  const filtered = applyDemoFilters(dataset, filters);

  let rows: DemoDimensionRow[] = [];
  if (dimensionType === "countries") {
    rows = aggregateDimensionRowsFromVisits(
      dataset,
      filtered.visits,
      limit,
      (visit) => visit.country,
    );
  } else if (dimensionType === "devices") {
    rows = aggregateDimensionRowsFromVisits(
      dataset,
      filtered.visits,
      limit,
      (visit) => visit.deviceType,
    );
  } else if (dimensionType === "page-hash") {
    rows = aggregateDimensionRowsFromVisits(
      dataset,
      filtered.visits,
      limit,
      (visit) => demoHashFragmentForVisit(visit) || DEMO_EMPTY_HASH_VALUE,
    );
  } else if (dimensionType === "page-query") {
    rows = aggregateDimensionRowsFromVisits(
      dataset,
      filtered.visits,
      limit,
      (visit) => demoQueryStringForVisit(visit) || DEMO_EMPTY_QUERY_VALUE,
    );
  } else if (dimensionType === "event-types") {
    rows = aggregateDimensionRowsFromVisits(
      dataset,
      filtered.visits,
      limit,
      (visit) => (visit.eventType === "pageview" ? "" : visit.eventType),
    );
  }

  return {
    ok: true,
    data: rows
      .map((row) => ({
        value:
          row.label === DEMO_EMPTY_HASH_VALUE ||
          row.label === DEMO_EMPTY_QUERY_VALUE
            ? ""
            : row.label,
        views: row.views,
        sessions: row.sessions,
        visitors: row.visitors,
      }))
      .sort((a, b) => b.views - a.views),
  };
}

function toDemoUtmSlug(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeDemoUtmSourceLabel(value: string): string {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .trim();
  if (!normalized || normalized === "(direct)") return "";

  const segments = normalized.split(".").filter(Boolean);
  if (segments.length >= 2) {
    return segments[segments.length - 2] || normalized;
  }

  return segments[0] || normalized;
}

function buildDemoUtmSourceEntries(
  profile: DemoSiteProfile,
): Array<{ label: string; weight: number }> {
  const baseEntries = profile.topReferrers
    .map((item) => ({
      label: normalizeDemoUtmSourceLabel(item.name),
      weight: Math.max(0, Number(item.weight) || 0),
    }))
    .filter((item) => item.label.length > 0 && item.weight > 0);

  return [
    ...baseEntries,
    { label: "newsletter", weight: 0.12 },
    { label: "partner", weight: 0.08 },
    { label: "community", weight: 0.05 },
    { label: "podcast", weight: 0.03 },
  ];
}

function buildDemoUtmLabelPool(
  profile: DemoSiteProfile,
  tab: "medium" | "campaign" | "term" | "content",
): string[] {
  const siteSlug =
    toDemoUtmSlug(profile.name) || toDemoUtmSlug(profile.domain) || "brand";
  const titleSlugs = uniqueNonEmptyStrings(
    profile.titles
      .map((title) => toDemoUtmSlug(title))
      .filter((value) => value.length > 0),
  );
  const titleTerms = uniqueNonEmptyStrings(
    titleSlugs
      .flatMap((slug) => slug.split("-"))
      .filter((token) => token.length >= 4),
  );
  const pathSlugs = uniqueNonEmptyStrings(
    profile.paths
      .map((path) => toDemoUtmSlug(path))
      .filter((value) => value.length > 0),
  );

  if (tab === "medium") {
    return [
      "email",
      "cpc",
      "paid-social",
      "organic-social",
      "referral",
      "affiliate",
      "display",
      "sponsored",
      "community",
      "influencer",
    ];
  }

  if (tab === "campaign") {
    return uniqueNonEmptyStrings([
      `${siteSlug}-launch`,
      `${siteSlug}-always-on`,
      `${siteSlug}-remarketing`,
      `${siteSlug}-newsletter`,
      `${siteSlug}-brand-search`,
      `${siteSlug}-retention`,
      ...titleSlugs.slice(0, 4).map((slug) => `${siteSlug}-${slug}`),
      "spring-promo",
      "partner-drop",
      "product-update",
    ]);
  }

  if (tab === "term") {
    return uniqueNonEmptyStrings([
      ...titleTerms.slice(0, 8),
      "brand",
      "pricing",
      "comparison",
      "automation",
      "guide",
      "template",
      "free-trial",
      "discount",
    ]);
  }

  return uniqueNonEmptyStrings([
    ...pathSlugs.slice(0, 6).map((slug) => `${slug}-hero`),
    ...pathSlugs.slice(0, 6).map((slug) => `${slug}-cta`),
    "hero-a",
    "hero-b",
    "pricing-card",
    "testimonial-video",
    "email-1",
    "email-2",
    "carousel-quote",
    "sidebar-banner",
  ]);
}

type DemoUtmDimensionKey =
  | "source"
  | "medium"
  | "campaign"
  | "term"
  | "content";

function parseDemoUtmDimensionKey(
  value: string | number | undefined,
): DemoUtmDimensionKey | null {
  const normalized = String(value ?? "").trim();
  if (
    normalized === "source" ||
    normalized === "medium" ||
    normalized === "campaign" ||
    normalized === "term" ||
    normalized === "content"
  ) {
    return normalized as DemoUtmDimensionKey;
  }
  return null;
}

function buildDemoUtmRows(
  siteId: string,
  tab: DemoUtmDimensionKey,
  params: Record<string, string | number>,
  limit: number,
): DemoDimensionRow[] {
  const cappedLimit = Math.max(1, Math.floor(limit));
  const from = parseDemoNumber(params.from, 0);
  const to = parseDemoNumber(params.to, Date.now());
  const filters = parseDemoFilters(params);
  const dataset = buildDemoFactDataset(siteId, from, to);
  const filtered = applyDemoFilters(dataset, filters);
  const profile = findSiteProfile(siteId);
  const rng = createDemoRng(
    siteId,
    `utm:${tab}:${from}:${to}:${JSON.stringify(filters)}:${cappedLimit}`,
  );

  const totalViews = Math.max(
    0,
    Math.round(filtered.visits.length * dataset.viewWeight),
  );
  if (totalViews <= 0) {
    return [];
  }

  const taggedViews = Math.max(
    0,
    Math.round(totalViews * (0.22 + rng() * 0.34)),
  );
  if (taggedViews <= 0) {
    return [];
  }

  const rows =
    tab === "source"
      ? weightedDistributionFromWeights(
          rng,
          buildDemoUtmSourceEntries(profile),
          taggedViews,
          cappedLimit,
          [0.58, 0.88],
        )
      : weightedDistribution(
          rng,
          buildDemoUtmLabelPool(profile, tab),
          taggedViews,
          cappedLimit,
        );

  return rows
    .map((row) => ({
      label: row.label,
      views: row.views,
      sessions: row.sessions,
      visitors: Math.max(
        1,
        Math.min(
          row.sessions,
          Math.round(row.sessions * (0.68 + rng() * 0.24)),
        ),
      ),
    }))
    .sort(
      (left, right) =>
        right.views - left.views ||
        right.sessions - left.sessions ||
        right.visitors - left.visitors ||
        left.label.localeCompare(right.label),
    );
}

function generateDemoUtmDimension(
  siteId: string,
  tab: DemoUtmDimensionKey,
  params: Record<string, string | number>,
): Record<string, unknown> {
  const limit = parseDemoLimit(params.limit, 100, 1, 500);
  return {
    ok: true,
    data: buildDemoUtmRows(siteId, tab, params, limit)
      .map((row) => ({
        value: row.label,
        views: row.views,
        sessions: row.sessions,
      }))
      .sort(
        (left, right) =>
          right.views - left.views || right.sessions - left.sessions,
      ),
  };
}

function generateDemoUtmTrend(
  siteId: string,
  params: Record<string, string | number>,
): Record<string, unknown> {
  const dimension = parseDemoUtmDimensionKey(params.dimension);
  const interval = parseDemoInterval(params.interval);
  if (!dimension) {
    return {
      ok: true,
      interval,
      series: [],
      data: [],
    };
  }

  const from = parseDemoNumber(params.from, 0);
  const to = parseDemoNumber(params.to, Date.now());
  const limit = parseDemoLimit(params.limit, 5, 1, 12);
  const filters = parseDemoFilters(params);
  const rows = buildDemoUtmRows(
    siteId,
    dimension,
    params,
    Math.min(limit + 6, 24),
  );
  const topRows = rows.slice(0, limit);
  const otherRows = rows.slice(limit);

  if (topRows.length === 0) {
    return {
      ok: true,
      interval,
      series: [],
      data: [],
    };
  }

  const usedKeys = new Set<string>([DEMO_SHARE_TREND_OTHER_KEY]);
  const series: Array<{
    key: string;
    label: string;
    views: number;
    visitors: number;
    sessions: number;
    isOther?: boolean;
  }> = topRows.map((row) => ({
    key: createDemoShareTrendSeriesKey(row.label, usedKeys, `utm-${dimension}`),
    label: row.label,
    views: row.views,
    visitors: row.visitors,
    sessions: row.sessions,
  }));

  if (otherRows.length > 0) {
    series.push({
      key: DEMO_SHARE_TREND_OTHER_KEY,
      label: DEMO_SHARE_TREND_OTHER_LABEL,
      views: otherRows.reduce((sum, row) => sum + row.views, 0),
      visitors: otherRows.reduce((sum, row) => sum + row.visitors, 0),
      sessions: otherRows.reduce((sum, row) => sum + row.sessions, 0),
      isOther: true,
    });
  }

  const distributeTotal = (total: number, weights: number[]): number[] => {
    if (total <= 0 || weights.length === 0) {
      return weights.map(() => 0);
    }

    const safeWeights = weights.map((weight) => Math.max(0, weight));
    const weightSum = safeWeights.reduce((sum, weight) => sum + weight, 0);
    if (weightSum <= 0) {
      const evenShare = Math.floor(total / weights.length);
      const remainder = total - evenShare * weights.length;
      return weights.map((_, index) => evenShare + (index < remainder ? 1 : 0));
    }

    const raw = safeWeights.map((weight) => (weight / weightSum) * total);
    const base = raw.map((value) => Math.floor(value));
    let remainder = total - base.reduce((sum, value) => sum + value, 0);
    const order = raw
      .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
      .sort(
        (left, right) =>
          right.fraction - left.fraction || left.index - right.index,
      );

    let cursor = 0;
    while (remainder > 0 && order.length > 0) {
      base[order[cursor % order.length].index] += 1;
      remainder -= 1;
      cursor += 1;
    }

    return base;
  };

  const bucketRows = buildDemoTrendBuckets(
    siteId,
    from,
    to,
    interval,
    filters,
    parseDemoTimeZone(params),
  );
  const dimensionOffset = Math.max(1, dimension.length);
  const data = bucketRows.map((bucketRow) => {
    const weights = series.map((item, index) => {
      const base = Math.max(1, item.visitors || item.sessions || item.views);
      const sine = Math.sin(
        (bucketRow.bucket + 1) * (index + 1) * 0.71 + dimensionOffset,
      );
      const cosine = Math.cos((bucketRow.bucket + 2) * 0.37 + index * 0.63);
      const variance = item.isOther
        ? 0.92 + sine * 0.04 + cosine * 0.03
        : 1 + sine * 0.12 + cosine * 0.08;
      return Math.max(0.05, base * variance);
    });

    const visitorAllocations = distributeTotal(bucketRow.visitors, weights);
    const visitorsBySeries = Object.fromEntries(
      series.map((item, index) => [item.key, visitorAllocations[index] ?? 0]),
    );

    return {
      bucket: bucketRow.bucket,
      timestampMs: bucketRow.timestampMs,
      totalVisitors: bucketRow.visitors,
      visitorsBySeries,
    };
  });

  return {
    ok: true,
    interval,
    series,
    data,
  };
}

function generateDemoClientDimensionTabs(
  siteId: string,
  params: Record<string, string | number>,
): Record<string, unknown> {
  const limit = parseDemoLimit(params.limit, 100, 1, 500);
  const from = parseDemoNumber(params.from, 0);
  const to = parseDemoNumber(params.to, Date.now());
  const filters = parseDemoFilters(params);
  const dataset = buildDemoFactDataset(siteId, from, to);
  const filtered = applyDemoFilters(dataset, filters);
  const tabs = collectClientTabs(dataset, filtered, limit);

  return {
    ok: true,
    tabs,
  };
}

function generateDemoGeoDimensionTabs(
  siteId: string,
  params: Record<string, string | number>,
  options?: {
    ignoreGeo?: boolean;
  },
): Record<string, unknown> {
  const limit = parseDemoLimit(params.limit, 100, 1, 500);
  const from = parseDemoNumber(params.from, 0);
  const to = parseDemoNumber(params.to, Date.now());
  const rawFilters = parseDemoFilters(params);
  const filters = options?.ignoreGeo
    ? withoutDemoGeoFilter(rawFilters)
    : rawFilters;
  const dataset = buildDemoFactDataset(siteId, from, to);
  const filtered = applyDemoFilters(dataset, filters);
  const tabs = collectGeoTabs(dataset, filtered, limit);

  return {
    ok: true,
    tabs,
  };
}

function generateDemoGeoPoints(
  siteId: string,
  params: Record<string, string | number>,
): Record<string, unknown> {
  const limit = parseDemoLimit(params.limit, 5000, 50, 20_000);
  const from = parseDemoNumber(
    params.from,
    Math.max(0, Date.now() - 24 * 3600 * 1000),
  );
  const to = parseDemoNumber(params.to, Date.now());
  const rawFilters = parseDemoFilters(params);
  const filters = parseDemoBoolean(params.applyGeoFilter)
    ? rawFilters
    : withoutDemoGeoFilter(rawFilters);
  const parsedGeo = parseDemoGeoFilterValue(filters.geo);
  const dataset = buildDemoFactDataset(siteId, from, to);
  const filtered = applyDemoFilters(dataset, filters);
  const orderedVisits = [...filtered.visits].sort(
    (left, right) => right.startedAt - left.startedAt,
  );

  const countryBuckets = new Map<
    string,
    { views: number; sessions: Set<string>; visitors: Set<string> }
  >();
  for (const visit of filtered.visits) {
    const bucket = countryBuckets.get(visit.country) ?? {
      views: 0,
      sessions: new Set<string>(),
      visitors: new Set<string>(),
    };
    bucket.views += dataset.viewWeight;
    bucket.sessions.add(visit.sessionId);
    bucket.visitors.add(visit.visitorId);
    countryBuckets.set(visit.country, bucket);
  }

  const countryCounts = Array.from(countryBuckets.entries())
    .map(([country, bucket]) => ({
      country,
      views: Math.max(0, Math.round(bucket.views)),
      sessions: Math.max(
        0,
        Math.round(weightedSessionCount(dataset, bucket.sessions)),
      ),
      visitors: Math.max(
        0,
        Math.round(weightedVisitorCount(dataset, bucket.visitors)),
      ),
    }))
    .sort(
      (left, right) =>
        right.views - left.views || left.country.localeCompare(right.country),
    );

  const regionBuckets = new Map<
    string,
    {
      label: string;
      views: number;
      sessions: Set<string>;
      visitors: Set<string>;
    }
  >();
  const cityBuckets = new Map<
    string,
    {
      label: string;
      views: number;
      sessions: Set<string>;
      visitors: Set<string>;
    }
  >();

  for (const visit of filtered.visits) {
    if (visit.region) {
      const regionBucket = regionBuckets.get(visit.region) ?? {
        label: parseDemoRegionLabel(visit.region)?.regionName || visit.region,
        views: 0,
        sessions: new Set<string>(),
        visitors: new Set<string>(),
      };
      regionBucket.views += dataset.viewWeight;
      regionBucket.sessions.add(visit.sessionId);
      regionBucket.visitors.add(visit.visitorId);
      regionBuckets.set(visit.region, regionBucket);
    }

    if (visit.city) {
      const cityBucket = cityBuckets.get(visit.city) ?? {
        label: parseDemoCityLabel(visit.city)?.cityName || visit.city,
        views: 0,
        sessions: new Set<string>(),
        visitors: new Set<string>(),
      };
      cityBucket.views += dataset.viewWeight;
      cityBucket.sessions.add(visit.sessionId);
      cityBucket.visitors.add(visit.visitorId);
      cityBuckets.set(visit.city, cityBucket);
    }
  }

  const regionCounts =
    parsedGeo?.country && !parsedGeo.regionCode && !parsedGeo.regionName
      ? Array.from(regionBuckets.entries())
          .map(([value, bucket]) => ({
            value,
            label: bucket.label,
            views: Math.max(0, Math.round(bucket.views)),
            sessions: Math.max(
              0,
              Math.round(weightedSessionCount(dataset, bucket.sessions)),
            ),
            visitors: Math.max(
              0,
              Math.round(weightedVisitorCount(dataset, bucket.visitors)),
            ),
          }))
          .sort(
            (left, right) =>
              right.views - left.views || left.label.localeCompare(right.label),
          )
      : [];

  const cityCounts =
    parsedGeo?.country && (parsedGeo.regionCode || parsedGeo.regionName)
      ? Array.from(cityBuckets.entries())
          .map(([value, bucket]) => ({
            value,
            label: bucket.label,
            views: Math.max(0, Math.round(bucket.views)),
            sessions: Math.max(
              0,
              Math.round(weightedSessionCount(dataset, bucket.sessions)),
            ),
            visitors: Math.max(
              0,
              Math.round(weightedVisitorCount(dataset, bucket.visitors)),
            ),
          }))
          .sort(
            (left, right) =>
              right.views - left.views || left.label.localeCompare(right.label),
          )
      : [];

  return {
    ok: true,
    data: orderedVisits.slice(0, limit).map((visit) => ({
      latitude: visit.latitude,
      longitude: visit.longitude,
      timestampMs: visit.startedAt,
      country: visit.country,
      region: visit.region,
      regionCode: visit.regionCode,
      city: visit.city,
    })),
    countryCounts,
    regionCounts,
    cityCounts,
  };
}

function generateDemoOverviewPageTab(
  siteId: string,
  params: Record<string, string | number>,
  tab: "path" | "title" | "hostname" | "entry" | "exit",
): Record<string, unknown> {
  const payload = generateDemoPages(siteId, params) as {
    ok: boolean;
    tabs?: Record<string, unknown>;
  };
  const data = Array.isArray(payload.tabs?.[tab]) ? payload.tabs?.[tab] : [];
  return {
    ok: payload.ok,
    data,
  };
}

function generateDemoOverviewSourceTab(
  siteId: string,
  params: Record<string, string | number>,
  tab: "domain" | "link",
): Record<string, unknown> {
  const limit = parseDemoLimit(params.limit, 100, 1, 500);
  const from = parseDemoNumber(params.from, 0);
  const to = parseDemoNumber(params.to, Date.now());
  const filters = parseDemoFilters(params);
  const dataset = buildDemoFactDataset(siteId, from, to);
  const filtered = applyDemoFilters(dataset, filters);
  const rows = collectReferrerRows(dataset, filtered, limit, {
    includeFullUrl: tab === "link",
    directValue: "",
  });
  return {
    ok: true,
    data: rows.map((item) => ({
      label: String(item.referrer ?? ""),
      views: Number(item.views ?? 0),
      sessions: Number(item.sessions ?? 0),
      visitors: Number(item.visitors ?? 0),
    })),
  };
}

function generateDemoOverviewClientTab(
  siteId: string,
  params: Record<string, string | number>,
  tab: "browser" | "osVersion" | "deviceType" | "language" | "screenSize",
): Record<string, unknown> {
  const payload = generateDemoClientDimensionTabs(siteId, params) as {
    ok: boolean;
    tabs?: Record<string, unknown>;
  };
  const data = Array.isArray(payload.tabs?.[tab]) ? payload.tabs?.[tab] : [];
  return {
    ok: payload.ok,
    data,
  };
}

function generateDemoOverviewGeoTab(
  siteId: string,
  params: Record<string, string | number>,
  tab:
    | "country"
    | "region"
    | "city"
    | "continent"
    | "timezone"
    | "organization",
): Record<string, unknown> {
  const payload = generateDemoGeoDimensionTabs(siteId, params, {
    ignoreGeo: tab === "country",
  }) as {
    ok: boolean;
    tabs?: Record<string, unknown>;
  };
  const data = Array.isArray(payload.tabs?.[tab]) ? payload.tabs?.[tab] : [];
  return {
    ok: payload.ok,
    data,
  };
}

function dedupeDemoFilterOptions(
  options: Array<{
    value: string;
    label: string;
    group?: "country" | "region" | "city";
  }>,
): Array<{
  value: string;
  label: string;
  group?: "country" | "region" | "city";
}> {
  const seen = new Set<string>();
  const deduped: Array<{
    value: string;
    label: string;
    group?: "country" | "region" | "city";
  }> = [];

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

function withoutDemoFilterKey(
  filters: DemoQueryFilters,
  key: keyof DemoQueryFilters,
): DemoQueryFilters {
  const next = { ...filters };
  delete next[key];
  return next;
}

function parseDemoFilterKey(
  params: Record<string, string | number>,
): keyof DemoQueryFilters | null {
  const raw = normalizeDemoFilterValue(params.filterKey);
  if (!raw) return null;
  const keys: Array<keyof DemoQueryFilters> = [
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
  return keys.includes(raw as keyof DemoQueryFilters)
    ? (raw as keyof DemoQueryFilters)
    : null;
}

function generateDemoFilterOptions(
  siteId: string,
  params: Record<string, string | number>,
): Record<string, unknown> {
  const filterKey = parseDemoFilterKey(params);
  if (!filterKey) {
    return { ok: false, data: [] };
  }
  const limit = parseDemoLimit(params.limit, 200, 1, 500);
  const from = parseDemoNumber(params.from, 0);
  const to = parseDemoNumber(params.to, Date.now());
  const filters = withoutDemoFilterKey(parseDemoFilters(params), filterKey);
  const dataset = buildDemoFactDataset(siteId, from, to);
  const filtered = applyDemoFilters(dataset, filters);

  if (filterKey === "country") {
    const rows = aggregateDimensionRowsFromVisits(
      dataset,
      filtered.visits,
      limit,
      (visit) => visit.country,
    );
    return {
      ok: true,
      data: dedupeDemoFilterOptions(
        rows.map((row) => ({
          value: row.label,
          label: row.label,
        })),
      ),
    };
  }
  if (filterKey === "device") {
    const rows = aggregateDimensionRowsFromVisits(
      dataset,
      filtered.visits,
      limit,
      (visit) => visit.deviceType,
    );
    return {
      ok: true,
      data: dedupeDemoFilterOptions(
        rows.map((row) => ({
          value: row.label,
          label: row.label,
        })),
      ),
    };
  }
  if (filterKey === "browser") {
    const rows = aggregateDimensionRowsFromVisits(
      dataset,
      filtered.visits,
      limit,
      (visit) => visit.browser,
    );
    return {
      ok: true,
      data: dedupeDemoFilterOptions(
        rows.map((row) => ({
          value: row.label,
          label: row.label,
        })),
      ),
    };
  }
  if (
    filterKey === "path" ||
    filterKey === "title" ||
    filterKey === "hostname" ||
    filterKey === "entry" ||
    filterKey === "exit"
  ) {
    const pages = collectPageDataAndTabs(dataset, filtered, limit);
    return {
      ok: true,
      data: dedupeDemoFilterOptions(
        (pages.tabs[filterKey] ?? []).map((row) => ({
          value: String(row.label ?? "").trim(),
          label: String(row.label ?? "").trim(),
        })),
      ),
    };
  }
  if (filterKey === "sourceDomain" || filterKey === "sourceLink") {
    const rows = collectReferrerRows(dataset, filtered, limit, {
      includeFullUrl: filterKey === "sourceLink",
      directValue: "",
    });
    return {
      ok: true,
      data: dedupeDemoFilterOptions(
        rows.map((row) => {
          const value = String(row.referrer ?? "").trim();
          return value
            ? { value, label: value }
            : {
                value: DEMO_DIRECT_REFERRER_FILTER_VALUE,
                label: DEMO_DIRECT_REFERRER_FILTER_VALUE,
              };
        }),
      ),
    };
  }

  const clientTabs = collectClientTabs(dataset, filtered, limit);
  if (
    filterKey === "clientBrowser" ||
    filterKey === "clientOsVersion" ||
    filterKey === "clientDeviceType" ||
    filterKey === "clientLanguage" ||
    filterKey === "clientScreenSize"
  ) {
    const keyMap = {
      clientBrowser: "browser",
      clientOsVersion: "osVersion",
      clientDeviceType: "deviceType",
      clientLanguage: "language",
      clientScreenSize: "screenSize",
    } as const;
    const rows = clientTabs[keyMap[filterKey]] ?? [];
    return {
      ok: true,
      data: dedupeDemoFilterOptions(
        rows.map((row) => ({
          value: String(row.label ?? "").trim(),
          label: String(row.label ?? "").trim(),
        })),
      ),
    };
  }

  const geoTabs = collectGeoTabs(dataset, filtered, limit);
  if (filterKey === "geo") {
    return {
      ok: true,
      data: dedupeDemoFilterOptions([
        ...(geoTabs.country ?? []).map((row) => ({
          value: String(row.label ?? "").trim(),
          label: String(row.label ?? "").trim(),
          group: "country" as const,
        })),
        ...(geoTabs.region ?? []).map((row) => {
          const value = String(row.label ?? "").trim();
          const segments = value.split("::").map((segment) => segment.trim());
          return {
            value,
            label: segments[2] || segments[1] || segments[0] || value,
            group: "region" as const,
          };
        }),
        ...(geoTabs.city ?? []).map((row) => {
          const value = String(row.label ?? "").trim();
          const segments = value.split("::").map((segment) => segment.trim());
          return {
            value,
            label:
              segments[3] || segments[2] || segments[1] || segments[0] || value,
            group: "city" as const,
          };
        }),
      ]),
    };
  }

  if (
    filterKey === "geoContinent" ||
    filterKey === "geoTimezone" ||
    filterKey === "geoOrganization"
  ) {
    const keyMap = {
      geoContinent: "continent",
      geoTimezone: "timezone",
      geoOrganization: "organization",
    } as const;
    const rows = geoTabs[keyMap[filterKey]] ?? [];
    return {
      ok: true,
      data: dedupeDemoFilterOptions(
        rows.map((row) => ({
          value: String(row.label ?? "").trim(),
          label: String(row.label ?? "").trim(),
        })),
      ),
    };
  }

  return { ok: true, data: [] };
}

function generateDemoTeamDashboard(
  teamId: string,
  params: Record<string, string | number>,
): Record<string, unknown> {
  const teamSites = DEMO_SITE_PROFILES.filter((s) => s.teamId === teamId);
  const from = Number(params.from || 0);
  const to = Number(params.to || Date.now());
  const interval = String(params.interval || "day");
  const timeZone = parseDemoTimeZone(params);
  const now = Date.now();
  const span = to - from;

  const sites = teamSites.map((site) => {
    const metrics = computeMetrics(site.id, from, to);
    const prevMetrics = computeMetrics(site.id, Math.max(0, from - span), from);
    const cr = (cur: number, prev: number) =>
      prev === 0 ? null : Math.round(((cur - prev) / prev) * 10000) / 10000;
    return {
      id: site.id,
      teamId: site.teamId,
      name: site.name,
      domain: site.domain,
      iconPath: site.iconPath,
      publicEnabled: 0,
      publicSlug: null,
      createdAt: now - 180 * 24 * 3600 * 1000,
      updatedAt:
        now - sInt(mulberry32(fnv1a(site.id)), 1, 14) * 24 * 3600 * 1000,
      overview: metrics,
      changeRates: {
        views: cr(metrics.views, prevMetrics.views),
        sessions: cr(metrics.sessions, prevMetrics.sessions),
        visitors: cr(metrics.visitors, prevMetrics.visitors),
        bounceRate: cr(metrics.bounceRate, prevMetrics.bounceRate),
        avgDurationMs: cr(metrics.avgDurationMs, prevMetrics.avgDurationMs),
        pagesPerSession: null,
      },
    };
  });

  const buckets = buildDemoTimeBuckets(
    from,
    to,
    parseDemoInterval(interval),
    timeZone,
  );
  const trend: Array<{
    bucket: number;
    timestampMs: number;
    sites: Array<{ siteId: string; views: number; visitors: number }>;
  }> = [];
  for (const bucket of buckets) {
    const ts = Math.max(from, bucket.fromMs);
    const end = Math.min(bucket.toMs, to);
    const sitesForBucket = teamSites.map((site) => {
      const views = integrateViews(site.id, ts, end);
      const r = siteRatios(site.id);
      const visitors = Math.max(
        views > 0 ? 1 : 0,
        Math.round(views * r.sessionsPerView * r.visitorsPerSession),
      );
      return { siteId: site.id, views, visitors };
    });
    trend.push({
      bucket: bucket.index,
      timestampMs: bucket.timestampMs,
      sites: sitesForBucket,
    });
  }

  return { ok: true, data: { sites, trend } };
}

// ---------------------------------------------------------------------------
//  Admin data generators (fixed structure)
// ---------------------------------------------------------------------------

function getDemoUser() {
  return {
    id: "demo-user-001",
    username: "demo",
    email: "demo@insightflare.app",
    name: "Demo User",
    systemRole: "admin" as const,
    timeZone: "",
    createdAt: Date.now() - 180 * 24 * 3600 * 1000,
    updatedAt: Date.now() - 2 * 24 * 3600 * 1000,
    teamCount: 1,
    ownedTeamCount: 1,
  };
}

function getDemoTeams() {
  const now = Date.now();
  return DEMO_TEAMS.map((t) => {
    const teamSites = DEMO_SITE_PROFILES.filter((s) => s.teamId === t.id);
    return {
      id: t.id,
      name: t.name,
      slug: t.slug,
      ownerUserId: t.ownerUserId,
      createdAt: now - 180 * 24 * 3600 * 1000,
      updatedAt: now - sInt(mulberry32(fnv1a(t.id)), 1, 30) * 24 * 3600 * 1000,
      siteCount: teamSites.length,
      memberCount: 1,
      membershipRole: "owner",
    };
  });
}

function getDemoSites(teamId: string) {
  const now = Date.now();
  return DEMO_SITE_PROFILES.filter((s) => s.teamId === teamId).map((s) => ({
    id: s.id,
    teamId: s.teamId,
    name: s.name,
    domain: s.domain,
    iconPath: s.iconPath,
    publicEnabled: 0,
    publicSlug: null,
    createdAt: now - 180 * 24 * 3600 * 1000,
    updatedAt: now - sInt(mulberry32(fnv1a(s.id)), 1, 14) * 24 * 3600 * 1000,
  }));
}

function getDemoMembers(teamId: string) {
  const user = getDemoUser();
  return [
    {
      teamId,
      userId: user.id,
      role: "owner",
      joinedAt: user.createdAt,
      username: user.username,
      email: user.email,
      name: user.name,
    },
  ];
}

function getDemoSiteConfig() {
  return {
    trackingStrength: "smart" as const,
    trackQueryParams: true,
    trackHash: true,
    domainWhitelist: [] as string[],
    pathBlacklist: [] as string[],
    ignoreDoNotTrack: true,
    performanceSampleRate: 100,
  };
}

function getDemoScriptSnippet(siteId: string) {
  const edgeBase =
    process.env.NEXT_PUBLIC_INSIGHTFLARE_EDGE_URL ||
    (typeof window !== "undefined"
      ? window.location.origin
      : "https://localhost:3000");
  const src = `${edgeBase.replace(/\/$/, "")}/script.js?siteId=${encodeURIComponent(siteId)}`;
  return {
    siteId,
    src,
    snippet: `<script defer src="${src}"></script>`,
  };
}

const DEMO_SYSTEM_WINDOW_OPTIONS = [15, 60, 360, 1440] as const;
const DEMO_SYSTEM_DELAYED_EVENT_MS = 5 * 60 * 1000;
const DEMO_SYSTEM_FUTURE_SKEW_MS = 30 * 1000;
const DEMO_SYSTEM_TRUSTED_LATENCY_MAX_MS = 24 * 60 * 60 * 1000;
const DEMO_SYSTEM_STALE_OPEN_VISIT_MS = 30 * 60 * 1000;
const DEMO_SYSTEM_TIMED_OUT_OPEN_VISIT_MS = 12 * 60 * 60 * 1000;

interface DemoSystemEvent {
  kind: "visit" | "custom_event";
  siteId: string;
  siteName: string;
  siteDomain: string;
  eventAt: number;
  serverAt: number;
  latencyMs: number;
}

function parseDemoSystemPerformanceWindow(
  params: Record<string, string | number>,
): SystemPerformanceWindowMinutes {
  const value = Number(params.minutes || 60);
  return DEMO_SYSTEM_WINDOW_OPTIONS.includes(
    value as SystemPerformanceWindowMinutes,
  )
    ? (value as SystemPerformanceWindowMinutes)
    : 60;
}

function demoSystemBucketSizeMs(
  minutes: SystemPerformanceWindowMinutes,
): number {
  if (minutes <= 15) return 60 * 1000;
  if (minutes <= 60) return 5 * 60 * 1000;
  if (minutes <= 360) return 30 * 60 * 1000;
  return 60 * 60 * 1000;
}

function demoSystemLatencyMs(rng: () => number): number {
  const roll = rng();
  if (roll < 0.012) {
    return sInt(rng, DEMO_SYSTEM_DELAYED_EVENT_MS, 18 * 60 * 1000);
  }
  if (roll < 0.02) {
    return -sInt(rng, DEMO_SYSTEM_FUTURE_SKEW_MS, 4 * 60 * 1000);
  }
  const fastPath = sInt(rng, 90, 850);
  const queueDelay = rng() < 0.16 ? sInt(rng, 850, 6500) : 0;
  const beaconDelay = rng() < 0.05 ? sInt(rng, 6500, 90 * 1000) : 0;
  return fastPath + queueDelay + beaconDelay;
}

function percentileNumber(values: number[], percentile: number): number | null {
  if (values.length === 0) return null;
  const ordered = [...values].sort((left, right) => left - right);
  const index = Math.min(
    ordered.length - 1,
    Math.max(0, Math.ceil(ordered.length * percentile) - 1),
  );
  return ordered[index];
}

function generateDemoSystemPerformance(
  params: Record<string, string | number>,
): SystemPerformanceData {
  const minutes = parseDemoSystemPerformanceWindow(params);
  const generatedAt = Date.now();
  const from = generatedAt - minutes * 60 * 1000;
  const bucketSizeMs = demoSystemBucketSizeMs(minutes);
  const firstBucket = Math.floor(from / bucketSizeMs) * bucketSizeMs;
  const events: DemoSystemEvent[] = [];

  for (
    let bucketStart = firstBucket;
    bucketStart <= generatedAt;
    bucketStart += bucketSizeMs
  ) {
    const bucketEnd = Math.min(bucketStart + bucketSizeMs, generatedAt);
    if (bucketEnd <= from) continue;
    for (const site of DEMO_SITE_PROFILES) {
      const bucketSeed = `${site.id}:system:${bucketStart}:${minutes}`;
      const rng = mulberry32(fnv1a(bucketSeed));
      const rawViews = integrateViews(site.id, bucketStart, bucketEnd);
      const visits = Math.max(0, Math.round(rawViews * 0.32));
      const customEvents = Math.max(
        0,
        Math.round(visits * sFloat(rng, 0.06, 0.18)),
      );

      for (let index = 0; index < visits + customEvents; index += 1) {
        const isCustom = index >= visits;
        const eventRng = mulberry32(fnv1a(`${bucketSeed}:${index}`));
        const serverAt = Math.min(
          generatedAt,
          bucketStart +
            Math.floor(eventRng() * Math.max(1, bucketEnd - bucketStart)),
        );
        const latencyMs = demoSystemLatencyMs(eventRng);
        events.push({
          kind: isCustom ? "custom_event" : "visit",
          siteId: site.id,
          siteName: site.name,
          siteDomain: site.domain,
          eventAt: serverAt - latencyMs,
          serverAt,
          latencyMs,
        });
      }
    }
  }

  const trustedLatencies = events
    .map((event) => event.latencyMs)
    .filter(
      (value) => value >= 0 && value <= DEMO_SYSTEM_TRUSTED_LATENCY_MAX_MS,
    );
  const totalEvents = events.length;
  const visits = events.filter((event) => event.kind === "visit").length;
  const customEvents = totalEvents - visits;
  const delayedEvents = events.filter(
    (event) => event.latencyMs > DEMO_SYSTEM_DELAYED_EVENT_MS,
  ).length;
  const futureSkewedEvents = events.filter(
    (event) => event.latencyMs < -DEMO_SYSTEM_FUTURE_SKEW_MS,
  ).length;
  const latestCreatedAt =
    events.length > 0
      ? Math.max(...events.map((event) => event.serverAt))
      : null;

  const trendMap = new Map<number, SystemPerformanceTrendPoint>();
  const siteMap = new Map<string, SystemPerformanceTopSite>();
  const siteLatencyMap = new Map<string, number[]>();

  for (const event of events) {
    const bucket = Math.floor(event.serverAt / bucketSizeMs) * bucketSizeMs;
    const trend = trendMap.get(bucket) ?? {
      bucket: Math.floor(bucket / 1000),
      timestampMs: bucket,
      visits: 0,
      customEvents: 0,
      totalEvents: 0,
      avgLatencyMs: null,
      p50LatencyMs: null,
      p75LatencyMs: null,
      p95LatencyMs: null,
      delayedEvents: 0,
      futureSkewedEvents: 0,
    };
    if (event.kind === "visit") trend.visits += 1;
    else trend.customEvents += 1;
    trend.totalEvents += 1;
    if (event.latencyMs > DEMO_SYSTEM_DELAYED_EVENT_MS) {
      trend.delayedEvents += 1;
    }
    if (event.latencyMs < -DEMO_SYSTEM_FUTURE_SKEW_MS) {
      trend.futureSkewedEvents += 1;
    }
    trendMap.set(bucket, trend);

    const site = siteMap.get(event.siteId) ?? {
      siteId: event.siteId,
      siteName: event.siteName,
      siteDomain: event.siteDomain,
      totalEvents: 0,
      visits: 0,
      customEvents: 0,
      avgLatencyMs: null,
      delayedEvents: 0,
      futureSkewedEvents: 0,
    };
    site.totalEvents += 1;
    if (event.kind === "visit") site.visits += 1;
    else site.customEvents += 1;
    if (event.latencyMs > DEMO_SYSTEM_DELAYED_EVENT_MS) {
      site.delayedEvents += 1;
    }
    if (event.latencyMs < -DEMO_SYSTEM_FUTURE_SKEW_MS) {
      site.futureSkewedEvents += 1;
    }
    siteMap.set(event.siteId, site);
    if (
      event.latencyMs >= 0 &&
      event.latencyMs <= DEMO_SYSTEM_TRUSTED_LATENCY_MAX_MS
    ) {
      const latencies = siteLatencyMap.get(event.siteId) ?? [];
      latencies.push(event.latencyMs);
      siteLatencyMap.set(event.siteId, latencies);
    }
  }

  for (const [siteId, site] of siteMap.entries()) {
    const latencies = siteLatencyMap.get(siteId) ?? [];
    site.avgLatencyMs =
      latencies.length > 0
        ? latencies.reduce((sum, value) => sum + value, 0) / latencies.length
        : null;
  }

  const trendLatencyMap = new Map<number, number[]>();
  for (const event of events) {
    if (
      event.latencyMs < 0 ||
      event.latencyMs > DEMO_SYSTEM_TRUSTED_LATENCY_MAX_MS
    ) {
      continue;
    }
    const bucket = Math.floor(event.serverAt / bucketSizeMs) * bucketSizeMs;
    const latencies = trendLatencyMap.get(bucket) ?? [];
    latencies.push(event.latencyMs);
    trendLatencyMap.set(bucket, latencies);
  }
  for (const [bucket, trend] of trendMap.entries()) {
    const latencies = trendLatencyMap.get(bucket) ?? [];
    trend.avgLatencyMs =
      latencies.length > 0
        ? latencies.reduce((sum, value) => sum + value, 0) / latencies.length
        : null;
    trend.p50LatencyMs = percentileNumber(latencies, 0.5);
    trend.p75LatencyMs = percentileNumber(latencies, 0.75);
    trend.p95LatencyMs = percentileNumber(latencies, 0.95);
  }

  const openTotal = Math.max(
    1,
    Math.round(
      integrateViews(
        "demo-site-001",
        generatedAt - 5 * 60 * 1000,
        generatedAt,
      ) * 0.18,
    ),
  );
  const stale = Math.max(0, Math.round(openTotal * 0.08));
  const timedOut = Math.max(0, Math.round(openTotal * 0.015));
  const dataFreshnessMs =
    latestCreatedAt === null
      ? null
      : Math.max(0, generatedAt - latestCreatedAt);

  return {
    ok: true,
    generatedAt,
    window: {
      from,
      to: generatedAt,
      minutes,
      bucketSizeMs,
    },
    thresholds: {
      delayedMs: DEMO_SYSTEM_DELAYED_EVENT_MS,
      futureSkewMs: DEMO_SYSTEM_FUTURE_SKEW_MS,
      trustedLatencyMaxMs: DEMO_SYSTEM_TRUSTED_LATENCY_MAX_MS,
      staleOpenVisitMs: DEMO_SYSTEM_STALE_OPEN_VISIT_MS,
      timedOutOpenVisitMs: DEMO_SYSTEM_TIMED_OUT_OPEN_VISIT_MS,
    },
    summary: {
      totalEvents,
      visits,
      customEvents,
      activeSites: new Set(events.map((event) => event.siteId)).size,
      eventsPerMinute: totalEvents / minutes,
      latestCreatedAt,
      dataFreshnessMs,
      avgLatencyMs:
        trustedLatencies.length > 0
          ? trustedLatencies.reduce((sum, value) => sum + value, 0) /
            trustedLatencies.length
          : null,
      p50LatencyMs: percentileNumber(trustedLatencies, 0.5),
      p75LatencyMs: percentileNumber(trustedLatencies, 0.75),
      p95LatencyMs: percentileNumber(trustedLatencies, 0.95),
      trustedLatencySamples: trustedLatencies.length,
      delayedEvents,
      futureSkewedEvents,
      anomalyRate:
        totalEvents > 0
          ? (delayedEvents + futureSkewedEvents) / totalEvents
          : 0,
    },
    openVisits: {
      total: openTotal,
      stale,
      timedOut,
      oldestStartedAt:
        openTotal > 0
          ? generatedAt -
            sInt(mulberry32(fnv1a("system:oldest-open")), 8, 150) * 60 * 1000
          : null,
      newestActivityAt:
        openTotal > 0
          ? generatedAt -
            sInt(mulberry32(fnv1a("system:newest-activity")), 5, 90) * 1000
          : null,
    },
    trend: Array.from(trendMap.values()).sort(
      (left, right) => left.timestampMs - right.timestampMs,
    ),
    topSites: Array.from(siteMap.values())
      .sort(
        (left, right) =>
          right.totalEvents - left.totalEvents ||
          right.delayedEvents - left.delayedEvents,
      )
      .slice(0, 8),
    slowEvents: events
      .filter((event) => event.latencyMs > 0)
      .sort((left, right) => right.latencyMs - left.latencyMs)
      .slice(0, 10)
      .map(
        (event): SystemPerformanceSlowEvent => ({
          kind: event.kind,
          siteId: event.siteId,
          siteName: event.siteName,
          siteDomain: event.siteDomain,
          eventAt: event.eventAt,
          serverAt: event.serverAt,
          latencyMs: event.latencyMs,
        }),
      ),
  };
}

const DEMO_DO_HARD_AGED_MS = 36 * 60 * 60 * 1000;
const DEMO_DO_STUCK_FLUSH_ATTEMPTS = 5;

function generateDemoDoDiagnostic(): DoDiagnosticAggregate {
  const generatedAt = Date.now();
  const sites: DoDiagnosticSiteEntry[] = DEMO_SITE_PROFILES.slice(0, 12).map(
    (site, index) => {
      const rng = mulberry32(fnv1a(`do-diag:${site.id}:${index}`));
      const openTotal = Math.floor(rng() * 30);
      const stale = Math.min(openTotal, Math.floor(rng() * 12));
      const timedOut = Math.min(stale, Math.floor(rng() * 4));
      const hardAged = index === 0 ? Math.floor(rng() * 3) : 0;
      const futureSkewed = index === 1 ? Math.floor(rng() * 2) : 0;
      const dirty = Math.floor(rng() * 8);
      const stuck = index < 2 ? Math.floor(rng() * 2) : 0;
      const customEventsTotal = Math.floor(rng() * 40);
      const customEventsDirty = Math.floor(rng() * 6);
      return {
        siteId: site.id,
        siteName: site.name,
        siteDomain: site.domain,
        ok: true,
        durationMs: Math.round(40 + rng() * 80),
        diagnostic: {
          ok: true,
          snapshotAt: generatedAt,
          thresholds: {
            staleMs: DEMO_SYSTEM_STALE_OPEN_VISIT_MS,
            timeoutMs: DEMO_SYSTEM_TIMED_OUT_OPEN_VISIT_MS,
            hardAgedMs: DEMO_DO_HARD_AGED_MS,
            stuckFlushAttempts: DEMO_DO_STUCK_FLUSH_ATTEMPTS,
          },
          visits: {
            total: openTotal + Math.floor(rng() * 60),
            byStatus: { open: openTotal },
            open: {
              total: openTotal,
              stale,
              timedOut,
              hardAged,
              futureSkewed,
              oldestStartedAt:
                openTotal > 0
                  ? generatedAt - Math.floor(rng() * 12 * 60 * 60 * 1000)
                  : null,
              newestActivityAt:
                openTotal > 0
                  ? generatedAt - Math.floor(rng() * 60 * 1000)
                  : null,
              futureMaxActivityAt:
                futureSkewed > 0
                  ? generatedAt + Math.floor(rng() * 24 * 60 * 60 * 1000)
                  : null,
            },
            dirty: {
              total: dirty,
              stuck,
              maxFlushAttempts:
                stuck > 0 ? Math.floor(5 + rng() * 20) : Math.floor(rng() * 3),
            },
          },
          customEvents: {
            total: customEventsTotal,
            dirty: customEventsDirty,
            stuck: 0,
            maxFlushAttempts: Math.floor(rng() * 3),
            oldestOccurredAt:
              customEventsDirty > 0
                ? generatedAt - Math.floor(rng() * 30 * 60 * 1000)
                : null,
          },
          alarm: {
            scheduledAt:
              openTotal > 0
                ? generatedAt + Math.floor(rng() * 60 * 1000)
                : null,
          },
        },
      };
    },
  );

  const totals = sites.reduce(
    (acc, entry) => {
      const d = entry.diagnostic;
      if (!d) return acc;
      acc.bufferedVisits += d.visits.total;
      acc.openVisits += d.visits.open.total;
      acc.openStale += d.visits.open.stale;
      acc.openTimedOut += d.visits.open.timedOut;
      acc.openHardAged += d.visits.open.hardAged;
      acc.openFutureSkewed += d.visits.open.futureSkewed;
      acc.dirtyVisits += d.visits.dirty.total;
      acc.stuckDirtyVisits += d.visits.dirty.stuck;
      acc.bufferedCustomEvents += d.customEvents.total;
      acc.dirtyCustomEvents += d.customEvents.dirty;
      acc.stuckDirtyCustomEvents += d.customEvents.stuck;
      if (d.alarm.scheduledAt !== null) acc.activeAlarms += 1;
      acc.maxVisitFlushAttempts = Math.max(
        acc.maxVisitFlushAttempts,
        d.visits.dirty.maxFlushAttempts,
      );
      acc.maxCustomEventFlushAttempts = Math.max(
        acc.maxCustomEventFlushAttempts,
        d.customEvents.maxFlushAttempts,
      );
      return acc;
    },
    {
      bufferedVisits: 0,
      openVisits: 0,
      openStale: 0,
      openTimedOut: 0,
      openHardAged: 0,
      openFutureSkewed: 0,
      dirtyVisits: 0,
      stuckDirtyVisits: 0,
      bufferedCustomEvents: 0,
      dirtyCustomEvents: 0,
      stuckDirtyCustomEvents: 0,
      activeAlarms: 0,
      maxVisitFlushAttempts: 0,
      maxCustomEventFlushAttempts: 0,
    },
  );

  const oldestOpenStartedAt = sites.reduce<number | null>((acc, entry) => {
    const value = entry.diagnostic?.visits.open.oldestStartedAt ?? null;
    if (value === null) return acc;
    if (acc === null) return value;
    return value < acc ? value : acc;
  }, null);
  const futureMaxActivityAt = sites.reduce<number | null>((acc, entry) => {
    const value = entry.diagnostic?.visits.open.futureMaxActivityAt ?? null;
    if (value === null) return acc;
    if (acc === null) return value;
    return value > acc ? value : acc;
  }, null);

  return {
    ok: true,
    generatedAt,
    totalSites: sites.length,
    reachableSites: sites.length,
    unreachableSites: 0,
    thresholds: {
      staleMs: DEMO_SYSTEM_STALE_OPEN_VISIT_MS,
      timeoutMs: DEMO_SYSTEM_TIMED_OUT_OPEN_VISIT_MS,
      hardAgedMs: DEMO_DO_HARD_AGED_MS,
      stuckFlushAttempts: DEMO_DO_STUCK_FLUSH_ATTEMPTS,
    },
    totals,
    oldestOpenStartedAt,
    futureMaxActivityAt,
    sites,
  };
}

// ---------------------------------------------------------------------------
//  Route dispatcher — the single entry point for demo mode
// ---------------------------------------------------------------------------

export function handleDemoRequest(options: {
  path: string;
  method?: string;
  params?: Record<string, string | number>;
  body?: unknown;
}): unknown {
  const { path, method = "GET", params = {} } = options;
  const siteId = String(params.siteId || "demo-site-001");
  const teamId = String(params.teamId || "");

  // Write operations → read-only stub
  if (
    method === "POST" ||
    method === "PATCH" ||
    method === "PUT" ||
    method === "DELETE"
  ) {
    // Special cases that need real-looking responses
    if (path.includes("/auth/login")) {
      const user = getDemoUser();
      return { ok: true, data: { user, teams: getDemoTeams() } };
    }
    if (path.includes("/auth/me")) {
      const user = getDemoUser();
      return { ok: true, data: { user, teams: getDemoTeams() } };
    }
    if (path.includes("/profile")) {
      const body =
        options.body && typeof options.body === "object" ? options.body : {};
      const profileBody = body as {
        email?: unknown;
        name?: unknown;
        timeZone?: unknown;
        username?: unknown;
      };
      const hasTimeZone = Object.prototype.hasOwnProperty.call(
        body,
        "timeZone",
      );
      const user = getDemoUser();
      return {
        ok: true,
        data: {
          ...user,
          username: String(profileBody.username ?? user.username),
          email: String(profileBody.email ?? user.email),
          name: String(profileBody.name ?? user.name),
          timeZone: hasTimeZone
            ? normalizeTimeZone(String(profileBody.timeZone ?? ""))
            : user.timeZone,
        },
      };
    }
    if (path.includes("/site-config")) {
      const config =
        options.body &&
        typeof options.body === "object" &&
        "config" in options.body &&
        options.body.config &&
        typeof options.body.config === "object"
          ? (options.body.config as Record<string, unknown>)
          : {};
      return {
        ok: true,
        data: {
          ...getDemoSiteConfig(),
          ...config,
        },
      };
    }
    // Generic write → return empty success
    return { ok: true, data: {} };
  }

  // GET routes
  if (path.includes("/admin/auth/me")) {
    return { ok: true, data: { user: getDemoUser(), teams: getDemoTeams() } };
  }
  if (path.includes("/admin/users")) {
    return { ok: true, data: [getDemoUser()] };
  }
  if (path.includes("/admin/teams")) {
    return { ok: true, data: getDemoTeams() };
  }
  if (path.includes("/admin/sites")) {
    const tid = teamId || getDemoTeams()[0].id;
    return { ok: true, data: getDemoSites(tid) };
  }
  if (path.includes("/admin/members")) {
    const tid = teamId || getDemoTeams()[0].id;
    return { ok: true, data: getDemoMembers(tid) };
  }
  if (path.includes("/admin/site-config")) {
    return { ok: true, data: getDemoSiteConfig() };
  }
  if (path.includes("/admin/script-snippet")) {
    return { ok: true, data: getDemoScriptSnippet(siteId) };
  }
  if (path.includes("/admin/system-performance")) {
    return generateDemoSystemPerformance(params);
  }
  if (path.includes("/admin/do-diagnostic")) {
    return generateDemoDoDiagnostic();
  }

  // Analytics query routes
  if (path.includes("/filter-options")) {
    return generateDemoFilterOptions(siteId, params);
  }
  if (path.includes("/overview-page-path")) {
    return generateDemoOverviewPageTab(siteId, params, "path");
  }
  if (path.includes("/overview-page-title")) {
    return generateDemoOverviewPageTab(siteId, params, "title");
  }
  if (path.includes("/overview-page-hostname")) {
    return generateDemoOverviewPageTab(siteId, params, "hostname");
  }
  if (path.includes("/overview-page-entry")) {
    return generateDemoOverviewPageTab(siteId, params, "entry");
  }
  if (path.includes("/overview-page-exit")) {
    return generateDemoOverviewPageTab(siteId, params, "exit");
  }
  if (path.includes("/overview-source-domain")) {
    return generateDemoOverviewSourceTab(siteId, params, "domain");
  }
  if (path.includes("/overview-source-link")) {
    return generateDemoOverviewSourceTab(siteId, params, "link");
  }
  if (path.includes("/overview-client-browser")) {
    return generateDemoOverviewClientTab(siteId, params, "browser");
  }
  if (path.includes("/overview-client-os-version")) {
    return generateDemoOverviewClientTab(siteId, params, "osVersion");
  }
  if (path.includes("/overview-client-device-type")) {
    return generateDemoOverviewClientTab(siteId, params, "deviceType");
  }
  if (path.includes("/overview-client-language")) {
    return generateDemoOverviewClientTab(siteId, params, "language");
  }
  if (path.includes("/overview-client-screen-size")) {
    return generateDemoOverviewClientTab(siteId, params, "screenSize");
  }
  if (path.includes("/overview-geo-country")) {
    return generateDemoOverviewGeoTab(siteId, params, "country");
  }
  if (path.includes("/overview-geo-region")) {
    return generateDemoOverviewGeoTab(siteId, params, "region");
  }
  if (path.includes("/overview-geo-city")) {
    return generateDemoOverviewGeoTab(siteId, params, "city");
  }
  if (path.includes("/overview-geo-continent")) {
    return generateDemoOverviewGeoTab(siteId, params, "continent");
  }
  if (path.includes("/overview-geo-timezone")) {
    return generateDemoOverviewGeoTab(siteId, params, "timezone");
  }
  if (path.includes("/overview-geo-organization")) {
    return generateDemoOverviewGeoTab(siteId, params, "organization");
  }
  if (path.includes("/overview-geo-points")) {
    return generateDemoGeoPoints(siteId, params);
  }
  if (path.includes("/event-record-detail")) {
    return generateDemoEventRecordDetail(siteId, params);
  }
  if (path.includes("/event-type-field-values")) {
    return generateDemoEventTypeFieldValues(siteId, params);
  }
  if (path.includes("/event-type-detail")) {
    return generateDemoEventTypeDetail(siteId, params);
  }
  if (path.includes("/events-summary")) {
    return generateDemoEventsSummary(siteId, params);
  }
  if (path.includes("/events-trend")) {
    return generateDemoEventsTrend(siteId, params);
  }
  if (path.includes("/events-records")) {
    return generateDemoEventsRecords(siteId, params);
  }
  if (path.includes("/team-dashboard")) {
    const tid = teamId || getDemoTeams()[0].id;
    return generateDemoTeamDashboard(tid, params);
  }
  if (path.includes("/pages-dashboard")) {
    return generateDemoPagesDashboard(siteId, params);
  }
  if (path.includes("/retention")) {
    return generateDemoRetention(siteId, params);
  }
  if (path.includes("/performance")) {
    return generateDemoPerformance(siteId, params);
  }
  if (path.includes("/overview")) {
    return generateDemoOverview(siteId, params);
  }
  if (path.includes("/browser-cross-breakdown")) {
    return generateDemoBrowserCrossBreakdown(siteId, params);
  }
  if (path.includes("/browser-version-breakdown")) {
    return generateDemoBrowserVersionBreakdown(siteId, params);
  }
  if (path.includes("/browser-radar")) {
    return generateDemoBrowserRadar(siteId, params);
  }
  if (path.includes("/referrer-radar")) {
    return generateDemoReferrerRadar(siteId, params);
  }
  if (path.includes("/referrer-dimension-trend")) {
    return generateDemoReferrerTrend(siteId, params);
  }
  if (path.includes("/browser-trend")) {
    return generateDemoBrowserTrend(siteId, params);
  }
  if (path.includes("/browser-engine-trend")) {
    return generateDemoBrowserEngineTrend(siteId, params);
  }
  if (path.includes("/client-dimension-trend")) {
    return generateDemoClientDimensionTrend(siteId, params);
  }
  if (path.includes("/utm-dimension-trend")) {
    return generateDemoUtmTrend(siteId, params);
  }
  if (path.includes("/client-cross-breakdown")) {
    return generateDemoClientCrossBreakdown(siteId, params);
  }
  if (path.includes("/trend")) {
    return generateDemoTrend(siteId, params);
  }
  if (path.includes("/session-detail")) {
    return generateDemoSessionDetail(siteId, params);
  }
  if (path.includes("/visitor-detail")) {
    return generateDemoVisitorDetail(siteId, params);
  }
  if (path.includes("/sessions")) {
    return generateDemoSessions(siteId, params);
  }
  if (path.includes("/pages")) {
    return generateDemoPages(siteId, params);
  }
  if (path.includes("/referrers")) {
    return generateDemoReferrers(siteId, params);
  }
  if (path.includes("/utm-source")) {
    return generateDemoUtmDimension(siteId, "source", params);
  }
  if (path.includes("/utm-medium")) {
    return generateDemoUtmDimension(siteId, "medium", params);
  }
  if (path.includes("/utm-campaign")) {
    return generateDemoUtmDimension(siteId, "campaign", params);
  }
  if (path.includes("/utm-term")) {
    return generateDemoUtmDimension(siteId, "term", params);
  }
  if (path.includes("/utm-content")) {
    return generateDemoUtmDimension(siteId, "content", params);
  }
  if (path.includes("/visitors")) {
    return generateDemoVisitors(siteId, params);
  }
  if (path.includes("/countries")) {
    return generateDemoDimension(siteId, "countries", params);
  }
  if (path.includes("/devices")) {
    return generateDemoDimension(siteId, "devices", params);
  }
  if (path.includes("/page-hash")) {
    return generateDemoDimension(siteId, "page-hash", params);
  }
  if (path.includes("/page-query")) {
    return generateDemoDimension(siteId, "page-query", params);
  }
  if (path.includes("/event-types")) {
    return generateDemoDimension(siteId, "event-types", params);
  }

  // Public routes — delegate to same generators
  const publicMatch = path.match(/\/api\/public\/[^/]+\/(.*)/);
  if (publicMatch) {
    const subPath = publicMatch[1];
    if (subPath === "overview") return generateDemoOverview(siteId, params);
    if (subPath === "trend") return generateDemoTrend(siteId, params);
    if (subPath === "pages") return generateDemoPages(siteId, params);
    if (subPath === "referrers") return generateDemoReferrers(siteId, params);
  }

  // Fallback
  return { ok: true, data: {} };
}
