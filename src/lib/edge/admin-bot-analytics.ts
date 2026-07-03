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
import {
  decryptBotAnalyticsSecret,
  encryptBotAnalyticsSecret,
} from "./secret-encryption";
import { deleteConfig, readConfig, upsertConfig } from "./system-config";
import type { Env } from "./types";
import { clampString } from "./utils";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
const WINDOW_OPTIONS_MINUTES = new Set([15, 60, 360, 1440, 10080]);
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
  latitude: number | null;
  longitude: number | null;
  botScore: number | null;
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
  const value = Number(url.searchParams.get("minutes") || "1440");
  return WINDOW_OPTIONS_MINUTES.has(value) ? value : 1440;
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

function buildBotAnalyticsSql(input: {
  dataset: string;
  since: number;
  limit: number;
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
  const doubleFilter = input.includeDoubles
    ? `
      AND double1 >= ${input.since}`
    : "";
  const orderBy = input.includeDoubles ? "double1" : "timestamp";
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
    WHERE timestamp >= toDateTime(${sinceSeconds})${doubleFilter}
    ORDER BY ${orderBy} DESC
    LIMIT ${input.limit}
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
    apiToken?: string;
    clearApiToken?: boolean;
  },
): BotAnalyticsConfig {
  const next = normalizeBotAnalyticsConfig(
    current as unknown as Record<string, unknown>,
  );
  if (input.accountId !== undefined) next.accountId = input.accountId;
  if (input.dataset !== undefined) next.dataset = input.dataset;
  if (input.clearApiToken) {
    next.apiTokenEncrypted = "";
    next.apiTokenHint = "";
    next.configured = false;
  }
  return next;
}

function responseData(config: BotAnalyticsConfig) {
  return { ok: true, data: redactBotAnalyticsConfig(config) };
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
    latitude: toNullableCoordinate(row.latitude),
    longitude: toNullableCoordinate(row.longitude),
    botScore: botScore > 0 ? botScore : null,
    userAgentLength: Math.trunc(toFiniteNumber(row.userAgentLength)),
  };
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
  if (minutes <= 60) return 5 * 60 * 1000;
  if (minutes <= 360) return 30 * 60 * 1000;
  if (minutes <= 1440) return 60 * 60 * 1000;
  return 6 * 60 * 60 * 1000;
}

function aggregateEvents(events: BotAnalyticsEvent[], minutes: number) {
  const now = Date.now();
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

  for (let bucket = since; bucket <= now; bucket += bucketMs) {
    trend.set(Math.floor(bucket / bucketMs) * bucketMs, 0);
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

async function siteLookup(env: Env, events: BotAnalyticsEvent[]) {
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
    return jsonResponseFor(req, responseData(config));
  }

  if (req.method === "DELETE") {
    await deleteConfig(env, SYSTEM_BOT_ANALYTICS_CONFIG_KEY);
    return jsonResponseFor(req, responseData(defaultBotAnalyticsConfig()));
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
  return jsonResponseFor(req, responseData(next));
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
  const configError = validateBotAnalyticsConfig(config);
  if (configError || !config.configured || !config.apiTokenEncrypted) {
    return jsonResponseFor(req, {
      ok: true,
      configured: false,
      generatedAt: Date.now(),
      config: redactBotAnalyticsConfig(config),
      error: configError || "bot_analytics_not_configured",
      events: [],
      summary: {
        total: 0,
        highConfidence: 0,
        mediumConfidence: 0,
        uniqueAsns: 0,
        uniqueCountries: 0,
      },
      mapPoints: [],
      trend: [],
      reasons: [],
      countries: [],
      asns: [],
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
  const minutes = parseWindowMinutes(url);
  const limit = parseLimit(url);
  const from = generatedAt - minutes * 60 * 1000;
  const sql = buildBotAnalyticsSql({
    dataset: config.dataset,
    since: from,
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
        since: from,
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

  const preliminaryEvents = rawRows.map((row) =>
    normalizeBotRow(row, new Map()),
  );
  const sites = await siteLookup(env, preliminaryEvents);
  const events = rawRows.map((row) => normalizeBotRow(row, sites));
  const aggregates = aggregateEvents(events, minutes);
  const uniqueAsns = new Set(events.map((event) => event.asn).filter(Boolean));
  const uniqueCountries = new Set(
    events.map((event) => event.country).filter(Boolean),
  );

  return jsonResponseFor(req, {
    ok: true,
    configured: true,
    generatedAt,
    window: {
      minutes,
      from,
      to: generatedAt,
    },
    config: redactBotAnalyticsConfig(config),
    summary: {
      total: events.length,
      highConfidence: events.filter((event) => event.confidence === "high")
        .length,
      mediumConfidence: events.filter((event) => event.confidence === "medium")
        .length,
      uniqueAsns: uniqueAsns.size,
      uniqueCountries: uniqueCountries.size,
    },
    events,
    ...aggregates,
  });
}
