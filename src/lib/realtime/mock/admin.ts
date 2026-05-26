import {
  DEMO_SITE_PROFILES,
  DEMO_TEAMS,
} from "@/lib/realtime/demo-site-profiles";
import { fnv1a, mulberry32, sFloat, sInt } from "@/lib/realtime/demo-utils";
import { integrateViews } from "@/lib/realtime/mock/site-curves";
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
//  Admin data generators (fixed structure)
// ---------------------------------------------------------------------------

export function getDemoUser() {
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

export function getDemoTeams() {
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

export function getDemoSites(teamId: string) {
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

export function getDemoMembers(teamId: string) {
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

export function getDemoSiteConfig() {
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

export function getDemoScriptSnippet(siteId: string) {
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

export function generateDemoSystemPerformance(
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

export function generateDemoDoDiagnostic(): DoDiagnosticAggregate {
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
