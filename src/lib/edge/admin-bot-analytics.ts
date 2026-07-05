import {
  type BotAnalyticsConfig,
  defaultBotAnalyticsConfig,
  makeSecretHint,
  normalizeBotAnalyticsConfig,
  redactBotAnalyticsConfig,
  SYSTEM_BOT_ANALYTICS_CONFIG_KEY,
  validateBotAnalyticsConfig,
  validateBotAnalyticsUpdateInput,
} from "@/lib/bot-analytics-config";

import { requireActor } from "./admin-auth";
import { bad, forb, jsonResponseFor, na, parseJson } from "./admin-response";
import { analyticsEngineAvailability } from "./analytics-engine";
import {
  decryptBotAnalyticsSecret,
  encryptBotAnalyticsSecret,
} from "./secret-encryption";
import { deleteConfig, readConfig, upsertConfig } from "./system-config";
import type { Env } from "./types";
import { clampString, ONE_HOUR_MS } from "./utils";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
const WINDOW_OPTIONS_MINUTES = new Set([60, 1440, 10080, 43200]);
const MAX_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;
const CF_ANALYTICS_ENGINE_SQL_ENDPOINT =
  "https://api.cloudflare.com/client/v4/accounts";

type AdminActor = Awaited<ReturnType<typeof requireActor>>;

interface BotAnalyticsEvent {
  timestamp: string;
  receivedAt: number;
  siteId: string;
  siteName: string;
  siteDomain: string;
  kind: string;
  confidence: string;
  reasons: string[];
  ip: string;
  userAgent: string;
  origin: string;
  hostname: string;
  pathname: string;
  country: string;
  region: string;
  city: string;
  continent: string;
  colo: string;
  asn: number;
  asOrganization: string;
  verifiedBotCategory: string;
  rayId: string;
  traceId: string;
  metadataJson: string;
  latitude: number | null;
  longitude: number | null;
  botScore: number | null;
  userAgentLength: number;
}

interface NormalAnalyticsEvent {
  timestamp: string;
  receivedAt: number;
  eventAt: number;
  edgeLatencyMs: number;
  siteId: string;
  siteName: string;
  siteDomain: string;
  kind: string;
  origin: string;
  hostname: string;
  pathname: string;
  country: string;
  region: string;
  city: string;
  continent: string;
  colo: string;
  asn: number;
  asOrganization: string;
  rayId: string;
  traceId: string;
  requestMethod: string;
  metadataJson: string;
  latitude: number | null;
  longitude: number | null;
  userAgentLength: number;
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function toNullableCoordinate(value: unknown): number | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  if (numeric === 0) return null;
  return numeric;
}

function parseWindowMinutes(url: URL): number {
  const value = Number(url.searchParams.get("minutes") || "43200");
  return WINDOW_OPTIONS_MINUTES.has(value) ? value : 43200;
}

function parseTimeWindow(url: URL, now = Date.now()) {
  const rawFrom = Number(url.searchParams.get("from"));
  const rawTo = Number(url.searchParams.get("to"));
  const hasExplicitWindow = Number.isFinite(rawFrom) && Number.isFinite(rawTo);
  const fallbackMinutes = parseWindowMinutes(url);
  const fallbackFrom = now - fallbackMinutes * 60 * 1000;
  const requestedTo = hasExplicitWindow ? rawTo : now;
  const requestedFrom = hasExplicitWindow ? rawFrom : fallbackFrom;
  const to = Math.min(now, Math.max(1, Math.floor(requestedTo)));
  const from = Math.max(0, Math.floor(requestedFrom));
  const boundedFrom = Math.max(0, Math.min(from, to - 1));
  const safeFrom = Math.max(boundedFrom, to - MAX_WINDOW_MS);
  const interval = parseInterval(url, to - safeFrom);
  return {
    from: safeFrom,
    to,
    minutes: Math.max(1, Math.ceil((to - safeFrom) / 60000)),
    interval,
    bucketMs: intervalToBucketMs(interval),
  };
}

function parseInterval(
  url: URL,
  spanMs: number,
): "minute" | "hour" | "day" | "week" {
  const raw = url.searchParams.get("interval");
  if (raw === "minute" && spanMs <= 24 * 60 * 60 * 1000) return "minute";
  if (raw === "hour") return "hour";
  if (raw === "day") return "day";
  if (raw === "week") return "week";
  if (spanMs <= 6 * 60 * 60 * 1000) return "minute";
  if (spanMs <= 14 * 24 * 60 * 60 * 1000) return "hour";
  return "day";
}

function intervalToBucketMs(interval: "minute" | "hour" | "day" | "week") {
  if (interval === "minute") return 60 * 1000;
  if (interval === "hour") return ONE_HOUR_MS;
  if (interval === "week") return 7 * 24 * ONE_HOUR_MS;
  return 24 * ONE_HOUR_MS;
}

function parseLimit(url: URL): number {
  const value = Number(url.searchParams.get("limit") || DEFAULT_LIMIT);
  if (!Number.isFinite(value)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.trunc(value)));
}

function analyticsDatasetIdentifier(value: string): string {
  const name = value.trim();
  if (!/^[A-Za-z0-9_][A-Za-z0-9_-]{0,127}$/.test(name)) {
    throw new Error("Invalid Analytics Engine dataset name");
  }
  return name;
}

function analyticsSqlString(value: string): string {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
}

function buildBotAnalyticsSql(input: {
  dataset: string;
  from: number;
  to: number;
  limit: number;
  includeDoubles?: boolean;
}) {
  const dataset = analyticsDatasetIdentifier(input.dataset);
  const fromSeconds = Math.floor(input.from / 1000);
  const toSeconds = Math.ceil(input.to / 1000);
  const doubleSelect = input.includeDoubles
    ? `,
      double1 AS receivedAt,
      double2 AS asn,
      double3 AS latitude,
      double4 AS longitude,
      double5 AS botScore,
      double6 AS userAgentLength`
    : "";
  return `
    SELECT
      timestamp,
      blob1 AS siteId,
      blob2 AS kind,
      blob3 AS confidence,
      blob4 AS reasons,
      blob5 AS ip,
      blob6 AS userAgent,
      blob7 AS origin,
      blob8 AS hostname,
      blob9 AS pathname,
      blob10 AS country,
      blob11 AS region,
      blob12 AS city,
      blob13 AS continent,
      blob14 AS colo,
      blob15 AS asnText,
      blob16 AS asOrganization,
      blob17 AS verifiedBotCategory,
      blob18 AS rayId,
      blob19 AS traceId,
      blob20 AS metadataJson${doubleSelect}
    FROM ${dataset}
    WHERE timestamp >= toDateTime(${fromSeconds})
      AND timestamp <= toDateTime(${toSeconds})
    ORDER BY timestamp DESC
    LIMIT ${input.limit}
    FORMAT JSONEachRow
  `;
}

function buildNormalAnalyticsSql(input: {
  dataset: string;
  from: number;
  to: number;
  limit: number;
  includeDoubles?: boolean;
}) {
  const dataset = analyticsDatasetIdentifier(input.dataset);
  const fromSeconds = Math.floor(input.from / 1000);
  const toSeconds = Math.ceil(input.to / 1000);
  const doubleSelect = input.includeDoubles
    ? `,
      double1 AS receivedAt,
      double2 AS eventAt,
      double3 AS edgeLatencyMs,
      double4 AS asn,
      double5 AS latitude,
      double6 AS longitude,
      double7 AS userAgentLength`
    : "";
  return `
    SELECT
      timestamp,
      blob1 AS siteId,
      blob2 AS kind,
      blob3 AS origin,
      blob4 AS hostname,
      blob5 AS pathname,
      blob6 AS country,
      blob7 AS region,
      blob8 AS city,
      blob9 AS continent,
      blob10 AS colo,
      blob11 AS asnText,
      blob12 AS asOrganization,
      blob13 AS rayId,
      blob14 AS traceId,
      blob15 AS requestMethod,
      blob16 AS metadataJson${doubleSelect}
    FROM ${dataset}
    WHERE timestamp >= toDateTime(${fromSeconds})
      AND timestamp <= toDateTime(${toSeconds})
    ORDER BY timestamp DESC
    LIMIT ${input.limit}
    FORMAT JSONEachRow
  `;
}

function buildCountByBucketSql(input: {
  dataset: string;
  from: number;
  to: number;
  bucketMs: number;
  source: "normal" | "abnormal";
  includeLatency?: boolean;
}) {
  const dataset = analyticsDatasetIdentifier(input.dataset);
  const fromSeconds = Math.floor(input.from / 1000);
  const toSeconds = Math.ceil(input.to / 1000);
  const bucketSeconds = Math.max(60, Math.floor(input.bucketMs / 1000));
  const latencySelect =
    input.includeLatency && input.source === "normal"
      ? `,
      avgIf(double3, double3 >= 0) AS avgLatencyMs,
      quantile(0.50)(double3) AS p50LatencyMs,
      quantile(0.75)(double3) AS p75LatencyMs,
      quantile(0.95)(double3) AS p95LatencyMs,
      quantile(0.99)(double3) AS p99LatencyMs`
      : "";
  return `
    SELECT
      intDiv(toUnixTimestamp(timestamp), ${bucketSeconds}) * ${bucketSeconds} * 1000 AS timestampMs,
      count() AS count,
      countIf(blob2 = 'pageview') AS pageviews,
      countIf(blob2 = 'custom_event') AS customEvents${latencySelect}
    FROM ${dataset}
    WHERE timestamp >= toDateTime(${fromSeconds})
      AND timestamp <= toDateTime(${toSeconds})
    GROUP BY timestampMs
    ORDER BY timestampMs ASC
    FORMAT JSONEachRow
  `;
}

function buildMapPointsSql(input: {
  dataset: string;
  from: number;
  to: number;
  source: "normal" | "abnormal";
  limit: number;
}) {
  const dataset = analyticsDatasetIdentifier(input.dataset);
  const fromSeconds = Math.floor(input.from / 1000);
  const toSeconds = Math.ceil(input.to / 1000);
  const latColumn = input.source === "normal" ? "double5" : "double3";
  const lonColumn = input.source === "normal" ? "double6" : "double4";
  const countryBlob = input.source === "normal" ? "blob6" : "blob10";
  return `
    SELECT
      round(${latColumn}, 3) AS latitude,
      round(${lonColumn}, 3) AS longitude,
      ${countryBlob} AS country,
      count() AS pointCount
    FROM ${dataset}
    WHERE timestamp >= toDateTime(${fromSeconds})
      AND timestamp <= toDateTime(${toSeconds})
      AND ${latColumn} != 0
      AND ${lonColumn} != 0
    GROUP BY latitude, longitude, country
    ORDER BY pointCount DESC
    LIMIT ${input.limit}
    FORMAT JSONEachRow
  `;
}

function buildBotAnalyticsDetailSql(input: {
  dataset: string;
  since: number;
  traceId?: string;
  rayId?: string;
  includeDoubles?: boolean;
}) {
  const dataset = analyticsDatasetIdentifier(input.dataset);
  const sinceSeconds = Math.floor(input.since / 1000);
  const doubleSelect = input.includeDoubles
    ? `,
      double1 AS receivedAt,
      double2 AS asn,
      double3 AS latitude,
      double4 AS longitude,
      double5 AS botScore,
      double6 AS userAgentLength`
    : "";
  const identityFilters = [
    input.traceId ? `blob19 = ${analyticsSqlString(input.traceId)}` : "",
    input.rayId ? `blob18 = ${analyticsSqlString(input.rayId)}` : "",
  ].filter(Boolean);
  return `
    SELECT
      timestamp,
      blob1 AS siteId,
      blob2 AS kind,
      blob3 AS confidence,
      blob4 AS reasons,
      blob5 AS ip,
      blob6 AS userAgent,
      blob7 AS origin,
      blob8 AS hostname,
      blob9 AS pathname,
      blob10 AS country,
      blob11 AS region,
      blob12 AS city,
      blob13 AS continent,
      blob14 AS colo,
      blob15 AS asnText,
      blob16 AS asOrganization,
      blob17 AS verifiedBotCategory,
      blob18 AS rayId,
      blob19 AS traceId,
      blob20 AS metadataJson${doubleSelect}
    FROM ${dataset}
    WHERE timestamp >= toDateTime(${sinceSeconds})
      AND (${identityFilters.join(" OR ") || "0"})
    ORDER BY timestamp DESC
    LIMIT 1
    FORMAT JSONEachRow
  `;
}

async function readBotAnalyticsConfig(env: Env): Promise<BotAnalyticsConfig> {
  const raw = await readConfig(env, SYSTEM_BOT_ANALYTICS_CONFIG_KEY);
  return raw ? normalizeBotAnalyticsConfig(raw) : defaultBotAnalyticsConfig();
}

function applyUpdateInput(
  current: BotAnalyticsConfig,
  input: {
    accountId?: string;
    dataset?: string;
    normalDataset?: string;
    apiToken?: string;
    clearApiToken?: boolean;
  },
): BotAnalyticsConfig {
  const next = normalizeBotAnalyticsConfig(
    current as unknown as Record<string, unknown>,
  );
  if (input.accountId !== undefined) next.accountId = input.accountId;
  if (input.dataset !== undefined) next.dataset = input.dataset;
  if (input.normalDataset !== undefined) {
    next.normalDataset = input.normalDataset;
  }
  if (input.clearApiToken) {
    next.apiTokenEncrypted = "";
    next.apiTokenHint = "";
    next.configured = false;
  }
  return next;
}

function disabledResponseData(env: Env, config: BotAnalyticsConfig) {
  const availability = analyticsEngineAvailability(env);
  return {
    ok: true,
    data: redactBotAnalyticsConfig(config, availability),
  };
}

function emptyBotAnalyticsResponse(
  env: Env,
  config: BotAnalyticsConfig,
  error: string,
) {
  const now = Date.now();
  return {
    ok: true,
    configured: false,
    generatedAt: now,
    config: redactBotAnalyticsConfig(config, analyticsEngineAvailability(env)),
    error,
    events: [],
    normalEvents: [],
    summary: {
      total: 0,
      baselineRequests: 0,
      botRequestRatio: 0,
      highConfidence: 0,
      mediumConfidence: 0,
      affectedSites: 0,
      uniqueAsns: 0,
      uniqueCountries: 0,
    },
    mapPoints: [],
    trend: [],
    reasons: [],
    countries: [],
    asns: [],
    overview: {
      totalRequests: 0,
      normalRequests: 0,
      abnormalRequests: 0,
      abnormalRequestRatio: 0,
      normalRequestRatio: 0,
      pageviews: 0,
      customEvents: 0,
      avgLatencyMs: null,
      p50LatencyMs: null,
      p75LatencyMs: null,
      p95LatencyMs: null,
      p99LatencyMs: null,
    },
    abnormal: {
      summary: {
        total: 0,
        ratio: 0,
        highConfidence: 0,
        mediumConfidence: 0,
        affectedSites: 0,
        uniqueAsns: 0,
        uniqueCountries: 0,
      },
      mapPoints: [],
      events: [],
    },
    normal: {
      summary: {
        total: 0,
        ratio: 0,
        pageviews: 0,
        customEvents: 0,
        affectedSites: 0,
        uniqueAsns: 0,
        uniqueCountries: 0,
        avgLatencyMs: null,
        p50LatencyMs: null,
        p75LatencyMs: null,
        p95LatencyMs: null,
        p99LatencyMs: null,
      },
      mapPoints: [],
      events: [],
    },
  };
}

function requireAdmin(actor: AdminActor, request: Request): Response | null {
  if (actor instanceof Response) return actor;
  if (!actor.isAdmin) {
    return forb(
      "Only system admin can manage bot analytics settings",
      undefined,
      request,
    );
  }
  return null;
}

function parseJsonEachRow(text: string): Record<string, unknown>[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

function parseAnalyticsTimestampMs(value: unknown): number {
  const text = String(value || "").trim();
  if (!text) return 0;
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(text)
    ? `${text.replace(" ", "T")}Z`
    : text;
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeBotRow(
  row: Record<string, unknown>,
  sites: Map<string, { name: string; domain: string }>,
): BotAnalyticsEvent {
  const siteId = clampString(String(row.siteId || ""), 128);
  const site = sites.get(siteId);
  const reasons = String(row.reasons || "")
    .split(",")
    .map((reason) => reason.trim())
    .filter(Boolean);
  const botScore = toFiniteNumber(row.botScore, 0);
  const receivedAt =
    toFiniteNumber(row.receivedAt) || parseAnalyticsTimestampMs(row.timestamp);
  return {
    timestamp: clampString(String(row.timestamp || ""), 64),
    receivedAt,
    siteId,
    siteName: clampString(site?.name || siteId || "Unknown site", 160),
    siteDomain: clampString(site?.domain || "", 255),
    kind: clampString(String(row.kind || ""), 40),
    confidence: clampString(String(row.confidence || ""), 20),
    reasons,
    ip: clampString(String(row.ip || ""), 80),
    userAgent: clampString(String(row.userAgent || ""), 1024),
    origin: clampString(String(row.origin || ""), 255),
    hostname: clampString(String(row.hostname || ""), 255),
    pathname: clampString(String(row.pathname || ""), 2048),
    country: clampString(String(row.country || ""), 10),
    region: clampString(String(row.region || ""), 128),
    city: clampString(String(row.city || ""), 128),
    continent: clampString(String(row.continent || ""), 32),
    colo: clampString(String(row.colo || ""), 16),
    asn: Math.trunc(toFiniteNumber(row.asn || row.asnText)),
    asOrganization: clampString(String(row.asOrganization || ""), 255),
    verifiedBotCategory: clampString(String(row.verifiedBotCategory || ""), 80),
    rayId: clampString(String(row.rayId || ""), 120),
    traceId: clampString(String(row.traceId || ""), 128),
    metadataJson: clampString(String(row.metadataJson || ""), 8000),
    latitude: toNullableCoordinate(row.latitude),
    longitude: toNullableCoordinate(row.longitude),
    botScore: botScore > 0 ? botScore : null,
    userAgentLength: Math.trunc(toFiniteNumber(row.userAgentLength)),
  };
}

function normalizeNormalRow(
  row: Record<string, unknown>,
  sites: Map<string, { name: string; domain: string }>,
): NormalAnalyticsEvent {
  const siteId = clampString(String(row.siteId || ""), 128);
  const site = sites.get(siteId);
  const receivedAt =
    toFiniteNumber(row.receivedAt) || parseAnalyticsTimestampMs(row.timestamp);
  const eventAt = toFiniteNumber(row.eventAt) || receivedAt;
  return {
    timestamp: clampString(String(row.timestamp || ""), 64),
    receivedAt,
    eventAt,
    edgeLatencyMs: Math.max(0, toFiniteNumber(row.edgeLatencyMs)),
    siteId,
    siteName: clampString(site?.name || siteId || "Unknown site", 160),
    siteDomain: clampString(site?.domain || "", 255),
    kind: clampString(String(row.kind || ""), 40),
    origin: clampString(String(row.origin || ""), 255),
    hostname: clampString(String(row.hostname || ""), 255),
    pathname: clampString(String(row.pathname || ""), 2048),
    country: clampString(String(row.country || ""), 10),
    region: clampString(String(row.region || ""), 128),
    city: clampString(String(row.city || ""), 128),
    continent: clampString(String(row.continent || ""), 32),
    colo: clampString(String(row.colo || ""), 16),
    asn: Math.trunc(toFiniteNumber(row.asn || row.asnText)),
    asOrganization: clampString(String(row.asOrganization || ""), 255),
    rayId: clampString(String(row.rayId || ""), 120),
    traceId: clampString(String(row.traceId || ""), 128),
    requestMethod: clampString(String(row.requestMethod || ""), 16),
    metadataJson: clampString(String(row.metadataJson || ""), 8000),
    latitude: toNullableCoordinate(row.latitude),
    longitude: toNullableCoordinate(row.longitude),
    userAgentLength: Math.trunc(toFiniteNumber(row.userAgentLength)),
  };
}

function serializeBotListEvent(event: BotAnalyticsEvent) {
  const { metadataJson: _metadataJson, ...listEvent } = event;
  return listEvent;
}

function serializeNormalListEvent(event: NormalAnalyticsEvent) {
  const { metadataJson: _metadataJson, ...listEvent } = event;
  return listEvent;
}

function shouldRetryBotAnalyticsWithoutDoubles(result: {
  status: number;
  body: string;
}): boolean {
  if (result.status !== 422) return false;
  const body = result.body.toLowerCase();
  return (
    body.includes("unable to find type of column") && /double\d+/.test(body)
  );
}

function bucketSizeMs(minutes: number): number {
  if (minutes <= 1440) return ONE_HOUR_MS;
  if (minutes <= 10080) return 6 * ONE_HOUR_MS;
  return 24 * ONE_HOUR_MS;
}

function buildTrendBuckets(from: number, to: number, bucketMs: number) {
  const buckets: number[] = [];
  for (let bucket = from; bucket <= to; bucket += bucketMs) {
    buckets.push(Math.floor(bucket / bucketMs) * bucketMs);
  }
  return Array.from(new Set(buckets)).sort((left, right) => left - right);
}

function aggregateEvents(
  events: BotAnalyticsEvent[],
  minutes: number,
  now = Date.now(),
) {
  const since = now - minutes * 60 * 1000;
  const bucketMs = bucketSizeMs(minutes);
  const reasonCounts = new Map<string, number>();
  const countryCounts = new Map<string, number>();
  const asnCounts = new Map<
    string,
    { asn: number; asOrganization: string; count: number }
  >();
  const trend = new Map<number, number>();
  const mapPoints = new Map<
    string,
    {
      latitude: number;
      longitude: number;
      country: string;
      pointCount: number;
    }
  >();

  for (const bucket of buildTrendBuckets(since, now, bucketMs)) {
    trend.set(bucket, 0);
  }

  for (const event of events) {
    for (const reason of event.reasons) {
      reasonCounts.set(reason, (reasonCounts.get(reason) || 0) + 1);
    }
    if (event.country) {
      countryCounts.set(
        event.country,
        (countryCounts.get(event.country) || 0) + 1,
      );
    }
    if (event.asn) {
      const key = String(event.asn);
      const current = asnCounts.get(key);
      if (current) current.count += 1;
      else {
        asnCounts.set(key, {
          asn: event.asn,
          asOrganization: event.asOrganization,
          count: 1,
        });
      }
    }
    if (event.receivedAt > 0) {
      const bucket = Math.floor(event.receivedAt / bucketMs) * bucketMs;
      trend.set(bucket, (trend.get(bucket) || 0) + 1);
    }
    if (event.latitude !== null && event.longitude !== null) {
      const key = `${event.country}:${event.latitude.toFixed(3)}:${event.longitude.toFixed(3)}`;
      const current = mapPoints.get(key);
      if (current) current.pointCount += 1;
      else {
        mapPoints.set(key, {
          latitude: event.latitude,
          longitude: event.longitude,
          country: event.country,
          pointCount: 1,
        });
      }
    }
  }

  const sortCounts = <T extends { count: number }>(items: T[]) =>
    items.sort((left, right) => right.count - left.count).slice(0, 10);

  return {
    mapPoints: [...mapPoints.values()],
    trend: [...trend.entries()]
      .sort((left, right) => left[0] - right[0])
      .map(([timestampMs, count]) => ({ timestampMs, count })),
    reasons: sortCounts(
      [...reasonCounts.entries()].map(([reason, count]) => ({
        reason,
        count,
      })),
    ),
    countries: sortCounts(
      [...countryCounts.entries()].map(([country, count]) => ({
        country,
        count,
      })),
    ),
    asns: sortCounts([...asnCounts.values()]),
  };
}

async function siteLookup(
  env: Env,
  events: Array<BotAnalyticsEvent | NormalAnalyticsEvent>,
) {
  const ids = [...new Set(events.map((event) => event.siteId).filter(Boolean))];
  if (ids.length === 0)
    return new Map<string, { name: string; domain: string }>();
  const placeholders = ids.map(() => "?").join(",");
  const rows = await env.DB.prepare(
    `SELECT id, name, domain FROM sites WHERE id IN (${placeholders})`,
  )
    .bind(...ids)
    .all<{ id: string; name: string; domain: string }>();
  return new Map(
    rows.results.map((row) => [
      String(row.id || ""),
      {
        name: String(row.name || ""),
        domain: String(row.domain || ""),
      },
    ]),
  );
}

async function queryAnalyticsRows(input: {
  accountId: string;
  token: string;
  sql: string;
}) {
  const result = await queryCloudflareAnalyticsEngine(input);
  if (!result.ok) return result;
  try {
    return {
      ok: true as const,
      rows: parseJsonEachRow(result.body),
    };
  } catch {
    return {
      ok: false as const,
      status: 502,
      body: "Cloudflare Analytics Engine returned invalid JSONEachRow data",
    };
  }
}

function normalizeMapRows(rows: Record<string, unknown>[]) {
  return rows
    .map((row) => ({
      latitude: toNullableCoordinate(row.latitude),
      longitude: toNullableCoordinate(row.longitude),
      country: clampString(String(row.country || ""), 10),
      pointCount: Math.max(0, Math.trunc(toFiniteNumber(row.pointCount))),
    }))
    .filter(
      (
        row,
      ): row is {
        latitude: number;
        longitude: number;
        country: string;
        pointCount: number;
      } => row.latitude !== null && row.longitude !== null,
    );
}

function aggregateNormalEvents(events: NormalAnalyticsEvent[]) {
  const uniqueAsns = new Set(events.map((event) => event.asn).filter(Boolean));
  const uniqueCountries = new Set(
    events.map((event) => event.country).filter(Boolean),
  );
  const affectedSites = new Set(
    events.map((event) => event.siteId).filter(Boolean),
  );
  const latencyValues = events
    .map((event) => event.edgeLatencyMs)
    .filter((value) => Number.isFinite(value) && value >= 0)
    .sort((left, right) => left - right);
  const avgLatencyMs =
    latencyValues.length > 0
      ? latencyValues.reduce((sum, value) => sum + value, 0) /
        latencyValues.length
      : null;
  const p50LatencyMs = percentile(latencyValues, 0.5);
  const p75LatencyMs = percentile(latencyValues, 0.75);
  const p95LatencyMs = percentile(latencyValues, 0.95);
  const p99LatencyMs = percentile(latencyValues, 0.99);
  return {
    total: events.length,
    pageviews: events.filter((event) => event.kind === "pageview").length,
    customEvents: events.filter((event) => event.kind === "custom_event")
      .length,
    affectedSites: affectedSites.size,
    uniqueAsns: uniqueAsns.size,
    uniqueCountries: uniqueCountries.size,
    avgLatencyMs,
    p50LatencyMs,
    p75LatencyMs,
    p95LatencyMs,
    p99LatencyMs,
  };
}

function percentile(
  sortedValues: number[],
  percentileValue: number,
): number | null {
  if (sortedValues.length === 0) return null;
  return sortedValues[
    Math.min(
      sortedValues.length - 1,
      Math.ceil(sortedValues.length * percentileValue) - 1,
    )
  ];
}

function mergeTrendRows(input: {
  from: number;
  to: number;
  bucketMs: number;
  abnormalRows: Record<string, unknown>[];
  normalRows: Record<string, unknown>[];
}) {
  const trend = new Map<
    number,
    {
      timestampMs: number;
      count: number;
      baselineCount: number;
      normalCount: number;
      abnormalCount: number;
      totalCount: number;
      botRatio: number;
      abnormalRatio: number;
      normalRatio: number;
      pageviews: number;
      customEvents: number;
      avgLatencyMs: number | null;
      p50LatencyMs: number | null;
      p75LatencyMs: number | null;
      p95LatencyMs: number | null;
      p99LatencyMs: number | null;
    }
  >();
  for (const timestampMs of buildTrendBuckets(
    input.from,
    input.to,
    input.bucketMs,
  )) {
    trend.set(timestampMs, {
      timestampMs,
      count: 0,
      baselineCount: 0,
      normalCount: 0,
      abnormalCount: 0,
      totalCount: 0,
      botRatio: 0,
      abnormalRatio: 0,
      normalRatio: 0,
      pageviews: 0,
      customEvents: 0,
      avgLatencyMs: null,
      p50LatencyMs: null,
      p75LatencyMs: null,
      p95LatencyMs: null,
      p99LatencyMs: null,
    });
  }
  for (const row of input.abnormalRows) {
    const timestampMs = Math.floor(toFiniteNumber(row.timestampMs));
    const current = trend.get(timestampMs);
    if (!current) continue;
    current.abnormalCount = Math.max(0, Math.trunc(toFiniteNumber(row.count)));
    current.count = current.abnormalCount;
    current.pageviews += Math.max(0, Math.trunc(toFiniteNumber(row.pageviews)));
    current.customEvents += Math.max(
      0,
      Math.trunc(toFiniteNumber(row.customEvents)),
    );
  }
  for (const row of input.normalRows) {
    const timestampMs = Math.floor(toFiniteNumber(row.timestampMs));
    const current = trend.get(timestampMs);
    if (!current) continue;
    current.normalCount = Math.max(0, Math.trunc(toFiniteNumber(row.count)));
    current.baselineCount = current.normalCount;
    current.pageviews += Math.max(0, Math.trunc(toFiniteNumber(row.pageviews)));
    current.customEvents += Math.max(
      0,
      Math.trunc(toFiniteNumber(row.customEvents)),
    );
    const avgLatencyMs = toFiniteNumber(row.avgLatencyMs, Number.NaN);
    const p50LatencyMs = toFiniteNumber(row.p50LatencyMs, Number.NaN);
    const p75LatencyMs = toFiniteNumber(row.p75LatencyMs, Number.NaN);
    const p95LatencyMs = toFiniteNumber(row.p95LatencyMs, Number.NaN);
    const p99LatencyMs = toFiniteNumber(row.p99LatencyMs, Number.NaN);
    current.avgLatencyMs = Number.isFinite(avgLatencyMs) ? avgLatencyMs : null;
    current.p50LatencyMs = Number.isFinite(p50LatencyMs)
      ? p50LatencyMs
      : current.avgLatencyMs;
    current.p75LatencyMs = Number.isFinite(p75LatencyMs)
      ? p75LatencyMs
      : Number.isFinite(p95LatencyMs)
        ? p95LatencyMs
        : null;
    current.p95LatencyMs = Number.isFinite(p95LatencyMs) ? p95LatencyMs : null;
    current.p99LatencyMs = Number.isFinite(p99LatencyMs)
      ? p99LatencyMs
      : current.p95LatencyMs;
  }
  return [...trend.values()].map((point) => {
    const totalCount = point.normalCount + point.abnormalCount;
    return {
      ...point,
      totalCount,
      botRatio: totalCount > 0 ? point.abnormalCount / totalCount : 0,
      abnormalRatio: totalCount > 0 ? point.abnormalCount / totalCount : 0,
      normalRatio: totalCount > 0 ? point.normalCount / totalCount : 0,
    };
  });
}

async function queryCloudflareAnalyticsEngine(input: {
  accountId: string;
  token: string;
  sql: string;
  fetchImpl?: typeof fetch;
}) {
  const fetchImpl = input.fetchImpl || fetch;
  const response = await fetchImpl(
    `${CF_ANALYTICS_ENGINE_SQL_ENDPOINT}/${encodeURIComponent(
      input.accountId,
    )}/analytics_engine/sql`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${input.token}`,
        "content-type": "text/plain",
      },
      body: input.sql,
    },
  );
  const text = await response.text();
  if (!response.ok) {
    return {
      ok: false as const,
      status: response.status,
      body: text.slice(0, 500),
    };
  }
  return { ok: true as const, body: text };
}

function cloudflareAnalyticsErrorMessage(input: {
  status: number;
  body: string;
}): string {
  const fallback = `Cloudflare Analytics Engine query failed (${input.status})`;
  const body = input.body.trim();
  if (!body) return fallback;

  try {
    const parsed = JSON.parse(body) as {
      errors?: Array<{ message?: unknown; code?: unknown }>;
      error?: unknown;
      message?: unknown;
    };
    const details =
      parsed.errors
        ?.map((error) => [error.code, error.message].filter(Boolean).join(": "))
        .filter(Boolean)
        .join("; ") ||
      (typeof parsed.message === "string" ? parsed.message : "") ||
      (typeof parsed.error === "string" ? parsed.error : "");
    if (details) return `${fallback}: ${clampString(details, 500)}`;
  } catch {}

  return `${fallback}: ${clampString(body, 500)}`;
}

export async function handleBotAnalyticsConfigAdmin(
  req: Request,
  env: Env,
): Promise<Response> {
  const actor = await requireActor(env, req);
  const authError = requireAdmin(actor, req);
  if (authError) return authError;

  if (req.method === "GET") {
    const config = await readBotAnalyticsConfig(env);
    return jsonResponseFor(req, disabledResponseData(env, config));
  }

  if (analyticsEngineAvailability(env).analyticsEngineDisabled) {
    return bad(
      "Analytics Engine is disabled for this deployment. Enable Analytics Engine in Cloudflare and redeploy before editing bot analytics settings.",
      "analytics_engine_disabled",
      req,
    );
  }

  if (req.method === "DELETE") {
    await deleteConfig(env, SYSTEM_BOT_ANALYTICS_CONFIG_KEY);
    return jsonResponseFor(
      req,
      disabledResponseData(env, defaultBotAnalyticsConfig()),
    );
  }

  if (req.method !== "POST" && req.method !== "PATCH") return na(req);

  const validation = validateBotAnalyticsUpdateInput(await parseJson(req));
  if (!validation.ok) return bad(validation.message, undefined, req);

  const current = await readBotAnalyticsConfig(env);
  const next = applyUpdateInput(current, validation.input);
  const nextToken = validation.input.apiToken?.trim() || "";
  if (nextToken) {
    try {
      next.apiTokenEncrypted = await encryptBotAnalyticsSecret(env, nextToken);
      next.apiTokenHint = makeSecretHint(nextToken);
      next.configured = true;
    } catch (error) {
      return bad(
        error instanceof Error
          ? error.message
          : "Unable to encrypt Cloudflare API token",
        "bot_analytics_secret_encryption_failed",
        req,
      );
    }
  }

  next.updatedAt = Date.now();
  next.updatedByUserId = actor instanceof Response ? undefined : actor.user.id;

  const configError = validateBotAnalyticsConfig(next);
  if (configError) return bad(configError, undefined, req);

  await upsertConfig(
    env,
    SYSTEM_BOT_ANALYTICS_CONFIG_KEY,
    next as unknown as Record<string, unknown>,
  );
  return jsonResponseFor(req, disabledResponseData(env, next));
}

export async function handleBotAnalyticsAdmin(
  req: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  const actor = await requireActor(env, req);
  const authError = requireAdmin(actor, req);
  if (authError) return authError;
  if (req.method !== "GET") return na(req);

  const config = await readBotAnalyticsConfig(env);
  if (analyticsEngineAvailability(env).analyticsEngineDisabled) {
    return jsonResponseFor(
      req,
      emptyBotAnalyticsResponse(env, config, "analytics_engine_disabled"),
    );
  }

  const configError = validateBotAnalyticsConfig(config);
  if (configError || !config.configured || !config.apiTokenEncrypted) {
    return jsonResponseFor(req, {
      ...emptyBotAnalyticsResponse(
        env,
        config,
        configError || "bot_analytics_not_configured",
      ),
    });
  }

  let token: string;
  try {
    token = await decryptBotAnalyticsSecret(env, config.apiTokenEncrypted);
  } catch {
    return bad(
      "Unable to decrypt Cloudflare API token",
      "bot_analytics_secret_decryption_failed",
      req,
    );
  }

  const generatedAt = Date.now();
  const timeWindow = parseTimeWindow(url, generatedAt);
  const { from, to, minutes, interval, bucketMs } = timeWindow;
  const limit = parseLimit(url);
  const detailTraceId = clampString(
    url.searchParams.get("traceId")?.trim() || "",
    128,
  );
  const detailRayId = clampString(
    url.searchParams.get("rayId")?.trim() || "",
    120,
  );

  if (url.searchParams.get("detail") === "1" || detailTraceId || detailRayId) {
    if (!detailTraceId && !detailRayId) {
      return bad(
        "Bot analytics detail requires traceId or rayId",
        "bot_analytics_detail_missing_id",
        req,
      );
    }

    const detailSql = buildBotAnalyticsDetailSql({
      dataset: config.dataset,
      since: from,
      traceId: detailTraceId,
      rayId: detailRayId,
      includeDoubles: true,
    });
    let detailResult = await queryCloudflareAnalyticsEngine({
      accountId: config.accountId,
      token,
      sql: detailSql,
    });
    if (
      !detailResult.ok &&
      shouldRetryBotAnalyticsWithoutDoubles(detailResult)
    ) {
      detailResult = await queryCloudflareAnalyticsEngine({
        accountId: config.accountId,
        token,
        sql: buildBotAnalyticsDetailSql({
          dataset: config.dataset,
          since: from,
          traceId: detailTraceId,
          rayId: detailRayId,
          includeDoubles: false,
        }),
      });
    }
    if (!detailResult.ok) {
      return bad(
        cloudflareAnalyticsErrorMessage(detailResult),
        "bot_analytics_query_failed",
        req,
      );
    }

    let detailRows: Record<string, unknown>[];
    try {
      detailRows = parseJsonEachRow(detailResult.body);
    } catch {
      return bad(
        "Cloudflare Analytics Engine returned invalid JSONEachRow data",
        "bot_analytics_parse_failed",
        req,
      );
    }

    const preliminaryEvents = detailRows.map((row) =>
      normalizeBotRow(row, new Map()),
    );
    const sites = await siteLookup(env, preliminaryEvents);
    const detail = detailRows[0] ? normalizeBotRow(detailRows[0], sites) : null;
    return jsonResponseFor(req, {
      ok: true,
      configured: true,
      generatedAt,
      config: redactBotAnalyticsConfig(
        config,
        analyticsEngineAvailability(env),
      ),
      detail,
    });
  }

  const sql = buildBotAnalyticsSql({
    dataset: config.dataset,
    from,
    to,
    limit,
    includeDoubles: true,
  });
  let result = await queryCloudflareAnalyticsEngine({
    accountId: config.accountId,
    token,
    sql,
  });
  if (!result.ok && shouldRetryBotAnalyticsWithoutDoubles(result)) {
    result = await queryCloudflareAnalyticsEngine({
      accountId: config.accountId,
      token,
      sql: buildBotAnalyticsSql({
        dataset: config.dataset,
        from,
        to,
        limit,
        includeDoubles: false,
      }),
    });
  }
  if (!result.ok) {
    return bad(
      cloudflareAnalyticsErrorMessage(result),
      "bot_analytics_query_failed",
      req,
    );
  }

  const normalSql = buildNormalAnalyticsSql({
    dataset: config.normalDataset,
    from,
    to,
    limit,
    includeDoubles: true,
  });
  let normalResult = await queryCloudflareAnalyticsEngine({
    accountId: config.accountId,
    token,
    sql: normalSql,
  });
  if (!normalResult.ok && shouldRetryBotAnalyticsWithoutDoubles(normalResult)) {
    normalResult = await queryCloudflareAnalyticsEngine({
      accountId: config.accountId,
      token,
      sql: buildNormalAnalyticsSql({
        dataset: config.normalDataset,
        from,
        to,
        limit,
        includeDoubles: false,
      }),
    });
  }
  if (!normalResult.ok) {
    return bad(
      cloudflareAnalyticsErrorMessage(normalResult),
      "bot_analytics_query_failed",
      req,
    );
  }

  let rawRows: Record<string, unknown>[];
  try {
    rawRows = parseJsonEachRow(result.body);
  } catch {
    return bad(
      "Cloudflare Analytics Engine returned invalid JSONEachRow data",
      "bot_analytics_parse_failed",
      req,
    );
  }

  let normalRawRows: Record<string, unknown>[];
  try {
    normalRawRows = parseJsonEachRow(normalResult.body);
  } catch {
    return bad(
      "Cloudflare Analytics Engine returned invalid JSONEachRow data",
      "bot_analytics_parse_failed",
      req,
    );
  }

  const preliminaryEvents = rawRows.map((row) =>
    normalizeBotRow(row, new Map()),
  );
  const preliminaryNormalEvents = normalRawRows.map((row) =>
    normalizeNormalRow(row, new Map()),
  );
  const sites = await siteLookup(env, [
    ...preliminaryEvents,
    ...preliminaryNormalEvents,
  ]);
  const events = rawRows.map((row) => normalizeBotRow(row, sites));
  const normalEvents = normalRawRows.map((row) =>
    normalizeNormalRow(row, sites),
  );
  const aggregates = aggregateEvents(events, minutes, to);
  const uniqueAsns = new Set(events.map((event) => event.asn).filter(Boolean));
  const uniqueCountries = new Set(
    events.map((event) => event.country).filter(Boolean),
  );
  const affectedSites = new Set(
    events.map((event) => event.siteId).filter(Boolean),
  );

  const abnormalTrendResult = await queryAnalyticsRows({
    accountId: config.accountId,
    token,
    sql: buildCountByBucketSql({
      dataset: config.dataset,
      from,
      to,
      bucketMs,
      source: "abnormal",
    }),
  });
  if (!abnormalTrendResult.ok) {
    return bad(
      cloudflareAnalyticsErrorMessage(abnormalTrendResult),
      "bot_analytics_query_failed",
      req,
    );
  }
  const normalTrendResult = await queryAnalyticsRows({
    accountId: config.accountId,
    token,
    sql: buildCountByBucketSql({
      dataset: config.normalDataset,
      from,
      to,
      bucketMs,
      source: "normal",
      includeLatency: true,
    }),
  });
  if (!normalTrendResult.ok) {
    return bad(
      cloudflareAnalyticsErrorMessage(normalTrendResult),
      "bot_analytics_query_failed",
      req,
    );
  }
  const abnormalMapResult = await queryAnalyticsRows({
    accountId: config.accountId,
    token,
    sql: buildMapPointsSql({
      dataset: config.dataset,
      from,
      to,
      source: "abnormal",
      limit: 500,
    }),
  });
  if (!abnormalMapResult.ok) {
    return bad(
      cloudflareAnalyticsErrorMessage(abnormalMapResult),
      "bot_analytics_query_failed",
      req,
    );
  }
  const normalMapResult = await queryAnalyticsRows({
    accountId: config.accountId,
    token,
    sql: buildMapPointsSql({
      dataset: config.normalDataset,
      from,
      to,
      source: "normal",
      limit: 500,
    }),
  });
  if (!normalMapResult.ok) {
    return bad(
      cloudflareAnalyticsErrorMessage(normalMapResult),
      "bot_analytics_query_failed",
      req,
    );
  }

  const trendWithRatio = mergeTrendRows({
    from,
    to,
    bucketMs,
    abnormalRows: abnormalTrendResult.rows,
    normalRows: normalTrendResult.rows,
  });
  const botRequests = trendWithRatio.reduce(
    (sum, point) => sum + point.abnormalCount,
    0,
  );
  const normalRequests = trendWithRatio.reduce(
    (sum, point) => sum + point.normalCount,
    0,
  );
  const totalRequests = normalRequests + botRequests;
  const botRequestRatio = totalRequests > 0 ? botRequests / totalRequests : 0;
  const normalRequestRatio =
    totalRequests > 0 ? normalRequests / totalRequests : 0;
  const pageviews = trendWithRatio.reduce(
    (sum, point) => sum + point.pageviews,
    0,
  );
  const customEvents = trendWithRatio.reduce(
    (sum, point) => sum + point.customEvents,
    0,
  );
  const latencyTrendPoints = trendWithRatio.filter(
    (point) => point.avgLatencyMs !== null && point.normalCount > 0,
  );
  const avgLatencyMs =
    latencyTrendPoints.length > 0
      ? latencyTrendPoints.reduce(
          (sum, point) =>
            sum + (point.avgLatencyMs ?? 0) * Math.max(1, point.normalCount),
          0,
        ) /
        latencyTrendPoints.reduce(
          (sum, point) => sum + Math.max(1, point.normalCount),
          0,
        )
      : null;
  const p95LatencyMs =
    latencyTrendPoints.length > 0
      ? Math.max(...latencyTrendPoints.map((point) => point.p95LatencyMs ?? 0))
      : null;
  const p50LatencyMs =
    latencyTrendPoints.length > 0
      ? Math.max(...latencyTrendPoints.map((point) => point.p50LatencyMs ?? 0))
      : null;
  const p75LatencyMs =
    latencyTrendPoints.length > 0
      ? Math.max(...latencyTrendPoints.map((point) => point.p75LatencyMs ?? 0))
      : null;
  const p99LatencyMs =
    latencyTrendPoints.length > 0
      ? Math.max(...latencyTrendPoints.map((point) => point.p99LatencyMs ?? 0))
      : null;
  const normalListSummary = aggregateNormalEvents(normalEvents);
  const abnormalMapPoints = normalizeMapRows(abnormalMapResult.rows);
  const normalMapPoints = normalizeMapRows(normalMapResult.rows);
  const mapPoints = abnormalMapPoints;

  return jsonResponseFor(req, {
    ok: true,
    configured: true,
    generatedAt,
    window: {
      minutes,
      from,
      to,
      interval,
    },
    config: redactBotAnalyticsConfig(config, analyticsEngineAvailability(env)),
    summary: {
      total: botRequests,
      baselineRequests: normalRequests,
      botRequestRatio,
      highConfidence: events.filter((event) => event.confidence === "high")
        .length,
      mediumConfidence: events.filter((event) => event.confidence === "medium")
        .length,
      affectedSites: affectedSites.size,
      uniqueAsns: uniqueAsns.size,
      uniqueCountries: uniqueCountries.size,
    },
    events: events.map(serializeBotListEvent),
    normalEvents: normalEvents.map(serializeNormalListEvent),
    ...aggregates,
    mapPoints,
    trend: trendWithRatio,
    overview: {
      totalRequests,
      normalRequests,
      abnormalRequests: botRequests,
      abnormalRequestRatio: botRequestRatio,
      normalRequestRatio,
      pageviews,
      customEvents,
      avgLatencyMs,
      p50LatencyMs,
      p75LatencyMs,
      p95LatencyMs,
      p99LatencyMs,
    },
    abnormal: {
      summary: {
        total: botRequests,
        ratio: botRequestRatio,
        highConfidence: events.filter((event) => event.confidence === "high")
          .length,
        mediumConfidence: events.filter(
          (event) => event.confidence === "medium",
        ).length,
        affectedSites: affectedSites.size,
        uniqueAsns: uniqueAsns.size,
        uniqueCountries: uniqueCountries.size,
      },
      mapPoints: abnormalMapPoints,
      events: events.map(serializeBotListEvent),
      reasons: aggregates.reasons,
      countries: aggregates.countries,
      asns: aggregates.asns,
    },
    normal: {
      summary: {
        ...normalListSummary,
        total: normalRequests,
        ratio: normalRequestRatio,
        pageviews,
        customEvents,
        avgLatencyMs,
        p50LatencyMs,
        p75LatencyMs,
        p95LatencyMs,
        p99LatencyMs,
      },
      mapPoints: normalMapPoints,
      events: normalEvents.map(serializeNormalListEvent),
    },
  });
}
