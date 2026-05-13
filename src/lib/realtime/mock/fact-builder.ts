// ---------------------------------------------------------------------------
//  Demo mock — fact dataset builder + aggregators
//
//  buildDemoFactDataset is the central "fact table" of the demo mode: every
//  dashboard handler resolves its data by calling this once for the current
//  [from, to] window, then aggregating the resulting visits via the helpers
//  below (applyDemoFilters → aggregate* / collect*).
//
//  Cross-window stability:
//    - `windowBucket` rounds from/to to the nearest minute, so list + detail
//      endpoints see the same dataset even when called moments apart.
//    - Visitor IDs come from `sampleActiveVisitors`; visitor properties come
//      from `getVisitorFingerprint` — both are stable across days, windows,
//      and endpoints.
// ---------------------------------------------------------------------------

import {
  type DemoSiteProfile,
  findSiteProfile,
} from "@/lib/realtime/demo-site-profiles";
import {
  createDemoRng,
  expandPathLabels,
  normalizePath,
  sInt,
  sShuffle,
  titleFromPath,
  todayKey,
  windowBucket,
} from "@/lib/realtime/demo-utils";
import {
  buildCountryPool,
  buildReferrerPool,
  pickFromList,
  pickReferrerByCountry,
  weightedPickIndex,
} from "@/lib/realtime/mock/dimension-pickers";
import {
  DEMO_DIRECT_REFERRER_FILTER_VALUE,
  parseDemoGeoFilterValue,
} from "@/lib/realtime/mock/filters";
import {
  buildPathTransitionGraph,
  nextPath,
} from "@/lib/realtime/mock/path-markov";
import {
  computeMetrics,
  sampleTimestampByCurve,
  siteRatios,
} from "@/lib/realtime/mock/site-curves";
import type {
  DemoDimensionRow,
  DemoFactDataset,
  DemoFilteredFacts,
  DemoQueryFilters,
  DemoSessionFact,
  DemoVisitFact,
  DemoVisitorFact,
} from "@/lib/realtime/mock/types";
import { demoQueryStringForVisit } from "@/lib/realtime/mock/visit-helpers";
import {
  getVisitorFingerprint,
  sampleActiveVisitors,
} from "@/lib/realtime/mock/visitor-pool";

export const DEMO_FACT_DATASET_CACHE = new Map<string, DemoFactDataset>();

export function buildDemoPathTitleMap(
  profile: DemoSiteProfile,
  expandedPaths: string[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (let index = 0; index < profile.paths.length; index += 1) {
    const path = normalizePath(profile.paths[index] || "");
    if (!path) continue;
    const title = String(profile.titles[index] || "").trim();
    map.set(path, title || titleFromPath(path));
  }
  for (const path of expandedPaths) {
    if (!map.has(path)) {
      map.set(path, titleFromPath(path));
    }
  }
  return map;
}

export function emptyDemoFactDataset(
  from: number,
  to: number,
): DemoFactDataset {
  return {
    from,
    to,
    viewWeight: 1,
    visits: [],
    sessions: new Map<string, DemoSessionFact>(),
    visitors: new Map<string, DemoVisitorFact>(),
  };
}

export function buildDemoFactDataset(
  siteId: string,
  from: number,
  to: number,
): DemoFactDataset {
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) {
    return emptyDemoFactDataset(from, to);
  }

  const day = todayKey();
  const bucket = windowBucket(from, to);
  const cacheKey = `${day}:${siteId}:${bucket}`;
  const cached = DEMO_FACT_DATASET_CACHE.get(cacheKey);
  if (cached) return cached;

  const profile = findSiteProfile(siteId);
  const metrics = computeMetrics(siteId, from, to);
  if (metrics.views <= 0) {
    const empty = emptyDemoFactDataset(from, to);
    DEMO_FACT_DATASET_CACHE.set(cacheKey, empty);
    return empty;
  }

  const rng = createDemoRng(siteId, `facts:${bucket}`);
  const sampledViewsTarget = Math.max(
    320,
    Math.min(12_000, Math.round(Math.sqrt(metrics.views + 1) * 46)),
  );
  const sampledViews = Math.max(1, Math.min(metrics.views, sampledViewsTarget));
  const sampledSessionsRaw = Math.round(
    (metrics.sessions / Math.max(metrics.views, 1)) * sampledViews,
  );
  const sampledSessions = Math.max(
    1,
    Math.min(sampledViews, sampledSessionsRaw),
  );
  const sampledVisitorsRaw = Math.round(
    (metrics.visitors / Math.max(metrics.sessions, 1)) * sampledSessions,
  );
  const sampledVisitors = Math.max(
    1,
    Math.min(sampledSessions, sampledVisitorsRaw),
  );

  const viewWeight = metrics.views / sampledViews;
  const sessionWeight = metrics.sessions / sampledSessions;
  const visitorWeight = metrics.visitors / sampledVisitors;

  let sampledBounces = Math.max(
    0,
    Math.min(
      sampledSessions,
      Math.round(metrics.bounces / Math.max(sessionWeight, Number.EPSILON)),
    ),
  );
  const availableIncrements = sampledViews - sampledSessions;
  const requiredIncrementsForNonBounce = sampledSessions - sampledBounces;
  if (requiredIncrementsForNonBounce > availableIncrements) {
    sampledBounces = sampledSessions - availableIncrements;
  }

  const sessionViewCounts = new Array(sampledSessions).fill(1);
  const sessionIndexes = sShuffle(
    rng,
    Array.from({ length: sampledSessions }, (_, index) => index),
  );
  const nonBounceIndexes = sessionIndexes.slice(
    0,
    Math.max(0, sampledSessions - sampledBounces),
  );
  for (const sessionIndex of nonBounceIndexes) {
    sessionViewCounts[sessionIndex] += 1;
  }
  let remaining = sampledViews - sampledSessions - nonBounceIndexes.length;
  while (remaining > 0) {
    const pool =
      nonBounceIndexes.length > 0 ? nonBounceIndexes : sessionIndexes;
    const pickIndex =
      pool[Math.floor(Math.pow(rng(), 1.25) * pool.length)] ?? pool[0] ?? 0;
    sessionViewCounts[pickIndex] += 1;
    remaining -= 1;
  }

  // countryPool / referrerPool — referrer 仍按站点池采样,country 改由 visitor
  // fingerprint 决定。countryPool 暂时保留以避免改变 rng 流(后续可清理)。
  buildCountryPool(
    rng,
    profile.topCountries,
    Math.min(36, Math.max(18, profile.topCountries.length + 14)),
  );
  const referrerPool = buildReferrerPool(
    rng,
    profile.topReferrers,
    Math.min(36, Math.max(16, profile.topReferrers.length + 12)),
  );

  const expandedPaths = expandPathLabels(
    rng,
    profile.paths,
    Math.max(28, Math.min(180, profile.paths.length * 6)),
  );
  const pathWeights = expandedPaths.map((_, index) => 1 / (1 + index * 0.85));
  const pathTitleMap = buildDemoPathTitleMap(profile, expandedPaths);
  // C2 方案 — 一阶马尔可夫路径转移图,从 profile.paths 顺序推断,
  // 或由 profile.pathFlow 显式定义。会话内的连续 pageview 服从该图。
  const pathGraph = buildPathTransitionGraph(profile, expandedPaths);
  const eventPool = ["pageview", ...profile.eventNames];
  const fallbackAvgDuration = Math.max(
    4_000,
    Math.round(siteRatios(siteId).avgDurationMs),
  );

  const visitorIds = sampleActiveVisitors(siteId, from, to, sampledVisitors);
  const visitorOrder = sShuffle(rng, [...visitorIds]);
  const visitors = new Map<string, DemoVisitorFact>();
  for (const visitorId of visitorIds) {
    visitors.set(visitorId, { visitorId, weight: visitorWeight });
  }

  const sessions = new Map<string, DemoSessionFact>();
  const visits: DemoVisitFact[] = [];

  for (
    let sessionIndex = 0;
    sessionIndex < sampledSessions;
    sessionIndex += 1
  ) {
    const viewCount = Math.max(1, sessionViewCounts[sessionIndex] ?? 1);
    const sessionId = `${siteId}-s-${sessionIndex.toString(36).padStart(5, "0")}`;
    const visitorId =
      visitorOrder[sessionIndex % visitorOrder.length] ??
      visitorOrder[0] ??
      `${siteId}-v-0`;
    // B方案 — 跨日稳定的 visitor 指纹:同一 visitorId 永远是同一份 DNA。
    const fingerprint = getVisitorFingerprint(siteId, visitorId);
    const country = fingerprint.country;
    const geo = {
      regionCode: fingerprint.regionCode,
      regionName: fingerprint.regionName,
      region: fingerprint.region,
      cityName: fingerprint.cityName,
      city: fingerprint.city,
      continent: fingerprint.continent,
      timezone: fingerprint.timezone,
      organization: fingerprint.organization,
      latitude: fingerprint.latitude,
      longitude: fingerprint.longitude,
    };
    const deviceType = fingerprint.deviceType;
    const browser = fingerprint.browser;
    const browserVersion = fingerprint.browserVersion;
    const osVersion = fingerprint.osVersion;
    const language = fingerprint.language;
    const screenSize = fingerprint.screenSize;

    // C3 方案 — referrer 受访客国别弱影响(CN→baidu/qq, RU→yandex 等)。
    const selectedReferrer = pickReferrerByCountry(
      rng,
      referrerPool,
      country,
      "(direct)",
    );
    const isDirect = selectedReferrer === "(direct)";
    const referrerHost = isDirect ? "" : selectedReferrer.toLowerCase();
    const keyword = encodeURIComponent(
      titleFromPath(pickFromList(rng, expandedPaths, "/"))
        .toLowerCase()
        .replace(/\s+/g, "-"),
    );
    const referrerUrl = isDirect
      ? ""
      : `https://${referrerHost}/${pickFromList(rng, ["search", "r", "ref", "posts", "share"], "search")}/${keyword}`;

    // C1 方案 — 反 CDF 时间采样,会话起点按昼夜曲线分布。
    let cursor = sampleTimestampByCurve(siteId, from, to, rng);
    let previousPath = "";
    let entryPath = "/";
    let exitPath = "/";
    const avgSessionDuration =
      metrics.avgDurationMs > 0 ? metrics.avgDurationMs : fallbackAvgDuration;
    const sessionDuration = Math.max(
      1200,
      Math.round(avgSessionDuration * (0.56 + rng() * 1.24)),
    );

    for (let visitIndex = 0; visitIndex < viewCount; visitIndex += 1) {
      let pathname: string;
      if (visitIndex === 0) {
        // 入口仍按 pathWeights 加权挑选,保留多样化的 entry pages。
        const pathIndex = weightedPickIndex(rng, pathWeights);
        pathname = expandedPaths[pathIndex] ?? expandedPaths[0] ?? "/";
      } else {
        // 后续 pageview 按一阶马尔可夫从上一页转移。
        pathname = nextPath(pathGraph, previousPath, rng);
      }
      const title = pathTitleMap.get(pathname) ?? titleFromPath(pathname);
      const increment =
        visitIndex === 0 ? sInt(rng, 0, 12_000) : sInt(rng, 8_000, 160_000);
      cursor = Math.min(to - 1, Math.max(from, cursor + increment));
      previousPath = pathname;
      if (visitIndex === 0) entryPath = pathname;
      exitPath = pathname;

      const eventType =
        visitIndex === 0 || rng() < 0.7
          ? eventPool[0]
          : pickFromList(rng, eventPool.slice(1), eventPool[0]);
      const durationMs = Math.max(
        0,
        Math.round((sessionDuration / viewCount) * (0.74 + rng() * 0.62)),
      );

      visits.push({
        visitId: `${sessionId}-v-${visitIndex.toString(36).padStart(3, "0")}`,
        sessionId,
        visitorId,
        startedAt: cursor,
        pathname,
        title,
        hostname: profile.domain,
        referrerHost,
        referrerUrl,
        browser,
        browserVersion,
        osVersion,
        deviceType,
        language,
        screenSize,
        country,
        regionCode: geo.regionCode,
        regionName: geo.regionName,
        region: geo.region,
        cityName: geo.cityName,
        city: geo.city,
        continent: geo.continent,
        timezone: geo.timezone,
        organization: geo.organization,
        latitude: geo.latitude,
        longitude: geo.longitude,
        eventType,
        durationMs,
      });
    }

    sessions.set(sessionId, {
      sessionId,
      visitorId,
      entryPath,
      exitPath,
      weight: sessionWeight,
    });
  }

  visits.sort(
    (left, right) =>
      left.startedAt - right.startedAt ||
      left.visitId.localeCompare(right.visitId),
  );

  const weightedDuration = visits.reduce(
    (sum, visit) => sum + visit.durationMs * viewWeight,
    0,
  );
  if (metrics.totalDurationMs > 0 && weightedDuration > 0) {
    const scale = metrics.totalDurationMs / weightedDuration;
    for (const visit of visits) {
      visit.durationMs = Math.max(0, Math.round(visit.durationMs * scale));
    }
  }

  const dataset: DemoFactDataset = {
    from,
    to,
    viewWeight,
    visits,
    sessions,
    visitors,
  };
  if (DEMO_FACT_DATASET_CACHE.size > 140) DEMO_FACT_DATASET_CACHE.clear();
  DEMO_FACT_DATASET_CACHE.set(cacheKey, dataset);
  return dataset;
}

export function weightedSessionCount(
  dataset: DemoFactDataset,
  sessionIds: Iterable<string>,
): number {
  let total = 0;
  for (const sessionId of sessionIds) {
    total += dataset.sessions.get(sessionId)?.weight ?? 0;
  }
  return total;
}

export function weightedVisitorCount(
  dataset: DemoFactDataset,
  visitorIds: Iterable<string>,
): number {
  let total = 0;
  for (const visitorId of visitorIds) {
    total += dataset.visitors.get(visitorId)?.weight ?? 0;
  }
  return total;
}

export function applyDemoFilters(
  dataset: DemoFactDataset,
  filters: DemoQueryFilters,
): DemoFilteredFacts {
  const result: DemoFilteredFacts = {
    visits: [],
    sessions: new Set<string>(),
    visitors: new Set<string>(),
    visitsBySession: new Map<string, number>(),
  };
  const parsedGeo = parseDemoGeoFilterValue(filters.geo);
  const regionTokens = new Set(
    [parsedGeo?.regionCode, parsedGeo?.regionName]
      .map((value) =>
        String(value ?? "")
          .trim()
          .toUpperCase(),
      )
      .filter(Boolean),
  );
  const equalsTrimmed = (left: string, right: string) => left.trim() === right;
  const equalsCaseInsensitive = (left: string, right: string) =>
    left.trim().toLowerCase() === right.toLowerCase();

  for (const visit of dataset.visits) {
    if (
      filters.country &&
      !equalsCaseInsensitive(visit.country, filters.country)
    )
      continue;
    if (filters.device && !equalsTrimmed(visit.deviceType, filters.device))
      continue;
    if (filters.browser && !equalsTrimmed(visit.browser, filters.browser))
      continue;
    if (filters.path && !equalsTrimmed(visit.pathname, filters.path)) continue;
    if (
      filters.query &&
      !equalsTrimmed(demoQueryStringForVisit(visit), filters.query)
    )
      continue;
    if (filters.title && !equalsTrimmed(visit.title, filters.title)) continue;
    if (
      filters.hostname &&
      !equalsCaseInsensitive(visit.hostname, filters.hostname)
    )
      continue;

    if (filters.entry) {
      const session = dataset.sessions.get(visit.sessionId);
      if (!session || !equalsTrimmed(session.entryPath, filters.entry))
        continue;
    }
    if (filters.exit) {
      const session = dataset.sessions.get(visit.sessionId);
      if (!session || !equalsTrimmed(session.exitPath, filters.exit)) continue;
    }

    if (filters.sourceDomain) {
      if (filters.sourceDomain === DEMO_DIRECT_REFERRER_FILTER_VALUE) {
        if (visit.referrerHost.trim()) continue;
      } else if (
        !equalsCaseInsensitive(visit.referrerHost, filters.sourceDomain)
      ) {
        continue;
      }
    }
    if (filters.sourceLink) {
      if (filters.sourceLink === DEMO_DIRECT_REFERRER_FILTER_VALUE) {
        if (visit.referrerUrl.trim()) continue;
      } else {
        let sourceLinkMatch =
          equalsCaseInsensitive(visit.referrerUrl, filters.sourceLink) ||
          equalsCaseInsensitive(visit.referrerHost, filters.sourceLink);
        if (!sourceLinkMatch) {
          try {
            const hostname = new URL(filters.sourceLink).hostname;
            sourceLinkMatch = equalsCaseInsensitive(
              visit.referrerHost,
              hostname,
            );
          } catch {
            // ignore invalid URL parse and keep fallback matching result
          }
        }
        if (!sourceLinkMatch) continue;
      }
    }

    if (
      filters.clientBrowser &&
      !equalsTrimmed(visit.browser, filters.clientBrowser)
    )
      continue;
    if (
      filters.clientOsVersion &&
      !equalsTrimmed(visit.osVersion, filters.clientOsVersion)
    )
      continue;
    if (
      filters.clientDeviceType &&
      !equalsTrimmed(visit.deviceType, filters.clientDeviceType)
    )
      continue;
    if (
      filters.clientLanguage &&
      !equalsTrimmed(visit.language, filters.clientLanguage)
    )
      continue;
    if (
      filters.clientScreenSize &&
      !equalsTrimmed(visit.screenSize, filters.clientScreenSize)
    )
      continue;
    if (
      filters.geoContinent &&
      !equalsTrimmed(visit.continent, filters.geoContinent)
    )
      continue;
    if (
      filters.geoTimezone &&
      !equalsTrimmed(visit.timezone, filters.geoTimezone)
    )
      continue;
    if (
      filters.geoOrganization &&
      !equalsTrimmed(visit.organization, filters.geoOrganization)
    )
      continue;

    if (
      parsedGeo?.country &&
      !equalsCaseInsensitive(visit.country, parsedGeo.country)
    )
      continue;
    if (regionTokens.size > 0) {
      const visitRegionTokens = [visit.regionCode, visit.regionName]
        .map((value) => value.trim().toUpperCase())
        .filter(Boolean);
      if (!visitRegionTokens.some((token) => regionTokens.has(token))) continue;
    }
    if (
      parsedGeo?.city &&
      !equalsCaseInsensitive(visit.cityName, parsedGeo.city)
    )
      continue;

    result.visits.push(visit);
    result.sessions.add(visit.sessionId);
    result.visitors.add(visit.visitorId);
    result.visitsBySession.set(
      visit.sessionId,
      (result.visitsBySession.get(visit.sessionId) ?? 0) + 1,
    );
  }

  return result;
}

export function aggregateOverviewMetrics(
  dataset: DemoFactDataset,
  filtered: DemoFilteredFacts,
) {
  const views = Math.round(filtered.visits.length * dataset.viewWeight);
  const sessions = Math.round(weightedSessionCount(dataset, filtered.sessions));
  const visitors = Math.round(weightedVisitorCount(dataset, filtered.visitors));
  let bouncesWeighted = 0;
  for (const [sessionId, count] of filtered.visitsBySession.entries()) {
    if (count === 1) {
      bouncesWeighted += dataset.sessions.get(sessionId)?.weight ?? 0;
    }
  }
  const bounces = Math.min(sessions, Math.round(bouncesWeighted));
  const totalDurationMs = Math.round(
    filtered.visits.reduce(
      (sum, visit) => sum + visit.durationMs * dataset.viewWeight,
      0,
    ),
  );
  const avgDurationMs =
    sessions > 0 ? Math.round(totalDurationMs / sessions) : 0;
  const bounceRate =
    sessions > 0 ? Math.round((bounces / sessions) * 10000) / 10000 : 0;
  return {
    views,
    sessions,
    visitors,
    bounces,
    totalDurationMs,
    avgDurationMs,
    bounceRate,
    approximateVisitors: false,
  };
}

export function aggregateDimensionRowsFromVisits(
  dataset: DemoFactDataset,
  visits: DemoVisitFact[],
  limit: number,
  getLabel: (visit: DemoVisitFact) => string,
  sortMetric: "views" | "visitors" = "views",
): DemoDimensionRow[] {
  const buckets = new Map<
    string,
    { views: number; sessions: Set<string>; visitors: Set<string> }
  >();
  for (const visit of visits) {
    const label = String(getLabel(visit) || "").trim();
    if (!label) continue;
    const bucket = buckets.get(label) ?? {
      views: 0,
      sessions: new Set<string>(),
      visitors: new Set<string>(),
    };
    bucket.views += dataset.viewWeight;
    bucket.sessions.add(visit.sessionId);
    bucket.visitors.add(visit.visitorId);
    buckets.set(label, bucket);
  }
  return Array.from(buckets.entries())
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
        right[sortMetric] - left[sortMetric] ||
        right.views - left.views ||
        right.sessions - left.sessions ||
        left.label.localeCompare(right.label),
    )
    .slice(0, limit);
}

export function aggregateSessionEdgeRows(
  dataset: DemoFactDataset,
  filtered: DemoFilteredFacts,
  kind: "entry" | "exit",
  limit: number,
): DemoDimensionRow[] {
  const edges = new Map<string, { at: number; value: string }>();
  for (const visit of filtered.visits) {
    const existing = edges.get(visit.sessionId);
    if (!existing) {
      edges.set(visit.sessionId, {
        at: visit.startedAt,
        value: visit.pathname,
      });
      continue;
    }
    if (kind === "entry" && visit.startedAt < existing.at) {
      edges.set(visit.sessionId, {
        at: visit.startedAt,
        value: visit.pathname,
      });
    } else if (kind === "exit" && visit.startedAt >= existing.at) {
      edges.set(visit.sessionId, {
        at: visit.startedAt,
        value: visit.pathname,
      });
    }
  }
  const buckets = new Map<
    string,
    { views: number; sessions: Set<string>; visitors: Set<string> }
  >();
  for (const [sessionId, edge] of edges.entries()) {
    const value = edge.value.trim();
    if (!value) continue;
    const bucket = buckets.get(value) ?? {
      views: 0,
      sessions: new Set<string>(),
      visitors: new Set<string>(),
    };
    bucket.views += dataset.sessions.get(sessionId)?.weight ?? 0;
    bucket.sessions.add(sessionId);
    const visitorId = dataset.sessions.get(sessionId)?.visitorId;
    if (visitorId) bucket.visitors.add(visitorId);
    buckets.set(value, bucket);
  }
  return Array.from(buckets.entries())
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
        right.views - left.views ||
        right.sessions - left.sessions ||
        left.label.localeCompare(right.label),
    )
    .slice(0, limit);
}

export function collectPageDataAndTabs(
  dataset: DemoFactDataset,
  filtered: DemoFilteredFacts,
  limit: number,
): {
  data: Array<{ pathname: string; views: number; sessions: number }>;
  tabs: {
    path: Array<{
      label: string;
      views: number;
      sessions: number;
      visitors: number;
    }>;
    title: Array<{
      label: string;
      views: number;
      sessions: number;
      visitors: number;
    }>;
    hostname: Array<{
      label: string;
      views: number;
      sessions: number;
      visitors: number;
    }>;
    entry: Array<{
      label: string;
      views: number;
      sessions: number;
      visitors: number;
    }>;
    exit: Array<{
      label: string;
      views: number;
      sessions: number;
      visitors: number;
    }>;
  };
} {
  const pathRows = aggregateDimensionRowsFromVisits(
    dataset,
    filtered.visits,
    limit,
    (visit) => visit.pathname,
  );
  const titleRows = aggregateDimensionRowsFromVisits(
    dataset,
    filtered.visits,
    limit,
    (visit) => visit.title,
  );
  const hostRows = aggregateDimensionRowsFromVisits(
    dataset,
    filtered.visits,
    limit,
    (visit) => visit.hostname,
  );
  const entryRows = aggregateSessionEdgeRows(dataset, filtered, "entry", limit);
  const exitRows = aggregateSessionEdgeRows(dataset, filtered, "exit", limit);

  return {
    data: pathRows.map((row) => ({
      pathname: row.label,
      views: row.views,
      sessions: row.sessions,
    })),
    tabs: {
      path: pathRows.map((row) => ({
        label: row.label,
        views: row.views,
        sessions: row.sessions,
        visitors: row.visitors,
      })),
      title: titleRows.map((row) => ({
        label: row.label,
        views: row.views,
        sessions: row.sessions,
        visitors: row.visitors,
      })),
      hostname: hostRows.map((row) => ({
        label: row.label,
        views: row.views,
        sessions: row.sessions,
        visitors: row.visitors,
      })),
      entry: entryRows.map((row) => ({
        label: row.label,
        views: row.views,
        sessions: row.sessions,
        visitors: row.visitors,
      })),
      exit: exitRows.map((row) => ({
        label: row.label,
        views: row.views,
        sessions: row.sessions,
        visitors: row.visitors,
      })),
    },
  };
}

export function collectReferrerRows(
  dataset: DemoFactDataset,
  filtered: DemoFilteredFacts,
  limit: number,
  options?: {
    includeFullUrl?: boolean;
    directValue?: string;
  },
): Array<{
  referrer: string;
  views: number;
  sessions: number;
  visitors: number;
}> {
  const includeFullUrl = options?.includeFullUrl ?? false;
  const directValue = options?.directValue ?? "(direct)";
  const rows = aggregateDimensionRowsFromVisits(
    dataset,
    filtered.visits,
    limit,
    (visit) => {
      const referrer = includeFullUrl
        ? visit.referrerUrl.trim()
        : visit.referrerHost.trim();
      return referrer || directValue;
    },
  );
  return rows.map((row) => ({
    referrer: row.label,
    views: row.views,
    sessions: row.sessions,
    visitors: row.visitors,
  }));
}

export function collectClientTabs(
  dataset: DemoFactDataset,
  filtered: DemoFilteredFacts,
  limit: number,
): {
  browser: Array<{
    label: string;
    views: number;
    sessions: number;
    visitors: number;
  }>;
  osVersion: Array<{
    label: string;
    views: number;
    sessions: number;
    visitors: number;
  }>;
  deviceType: Array<{
    label: string;
    views: number;
    sessions: number;
    visitors: number;
  }>;
  language: Array<{
    label: string;
    views: number;
    sessions: number;
    visitors: number;
  }>;
  screenSize: Array<{
    label: string;
    views: number;
    sessions: number;
    visitors: number;
  }>;
} {
  const browser = aggregateDimensionRowsFromVisits(
    dataset,
    filtered.visits,
    limit,
    (visit) => visit.browser,
  );
  const osVersion = aggregateDimensionRowsFromVisits(
    dataset,
    filtered.visits,
    limit,
    (visit) => visit.osVersion,
  );
  const deviceType = aggregateDimensionRowsFromVisits(
    dataset,
    filtered.visits,
    limit,
    (visit) => visit.deviceType,
  );
  const language = aggregateDimensionRowsFromVisits(
    dataset,
    filtered.visits,
    limit,
    (visit) => visit.language,
  );
  const screenSize = aggregateDimensionRowsFromVisits(
    dataset,
    filtered.visits,
    limit,
    (visit) => visit.screenSize,
  );
  return {
    browser: browser.map((row) => ({
      label: row.label,
      views: row.views,
      sessions: row.sessions,
      visitors: row.visitors,
    })),
    osVersion: osVersion.map((row) => ({
      label: row.label,
      views: row.views,
      sessions: row.sessions,
      visitors: row.visitors,
    })),
    deviceType: deviceType.map((row) => ({
      label: row.label,
      views: row.views,
      sessions: row.sessions,
      visitors: row.visitors,
    })),
    language: language.map((row) => ({
      label: row.label,
      views: row.views,
      sessions: row.sessions,
      visitors: row.visitors,
    })),
    screenSize: screenSize.map((row) => ({
      label: row.label,
      views: row.views,
      sessions: row.sessions,
      visitors: row.visitors,
    })),
  };
}

export function collectGeoTabs(
  dataset: DemoFactDataset,
  filtered: DemoFilteredFacts,
  limit: number,
): {
  country: Array<{
    label: string;
    views: number;
    sessions: number;
    visitors: number;
  }>;
  region: Array<{
    label: string;
    views: number;
    sessions: number;
    visitors: number;
  }>;
  city: Array<{
    label: string;
    views: number;
    sessions: number;
    visitors: number;
  }>;
  continent: Array<{
    label: string;
    views: number;
    sessions: number;
    visitors: number;
  }>;
  timezone: Array<{
    label: string;
    views: number;
    sessions: number;
    visitors: number;
  }>;
  organization: Array<{
    label: string;
    views: number;
    sessions: number;
    visitors: number;
  }>;
} {
  const country = aggregateDimensionRowsFromVisits(
    dataset,
    filtered.visits,
    limit,
    (visit) => visit.country,
  );
  const region = aggregateDimensionRowsFromVisits(
    dataset,
    filtered.visits,
    limit,
    (visit) => visit.region,
  );
  const city = aggregateDimensionRowsFromVisits(
    dataset,
    filtered.visits,
    limit,
    (visit) => visit.city,
  );
  const continent = aggregateDimensionRowsFromVisits(
    dataset,
    filtered.visits,
    limit,
    (visit) => visit.continent,
  );
  const timezone = aggregateDimensionRowsFromVisits(
    dataset,
    filtered.visits,
    limit,
    (visit) => visit.timezone,
  );
  const organization = aggregateDimensionRowsFromVisits(
    dataset,
    filtered.visits,
    limit,
    (visit) => visit.organization,
  );
  return {
    country: country.map((row) => ({
      label: row.label,
      views: row.views,
      sessions: row.sessions,
      visitors: row.visitors,
    })),
    region: region.map((row) => ({
      label: row.label,
      views: row.views,
      sessions: row.sessions,
      visitors: row.visitors,
    })),
    city: city.map((row) => ({
      label: row.label,
      views: row.views,
      sessions: row.sessions,
      visitors: row.visitors,
    })),
    continent: continent.map((row) => ({
      label: row.label,
      views: row.views,
      sessions: row.sessions,
      visitors: row.visitors,
    })),
    timezone: timezone.map((row) => ({
      label: row.label,
      views: row.views,
      sessions: row.sessions,
      visitors: row.visitors,
    })),
    organization: organization.map((row) => ({
      label: row.label,
      views: row.views,
      sessions: row.sessions,
      visitors: row.visitors,
    })),
  };
}
