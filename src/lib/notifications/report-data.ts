import type { QueryWindow } from "@/lib/edge/query/core";
import { queryOverviewAggregate } from "@/lib/edge/query/overview";
import {
  queryPagesAggregate,
  queryReferrerAggregate,
} from "@/lib/edge/query/pages";
import type { Env } from "@/lib/edge/types";

export type NotificationMetric = "views" | "visitors" | "sessions";
export type NotificationMetricWindow = "last_1h" | "last_24h" | "yesterday";

export interface NotificationReportRange {
  from: number;
  to: number;
  label: string;
}

export interface DailyReportData {
  siteName: string;
  siteDomain: string;
  range: NotificationReportRange;
  metrics: {
    views: number;
    visitors: number;
    sessions: number;
  };
  topPages: Array<{
    path: string;
    views: number;
  }>;
  topReferrers: Array<{
    referrer: string;
    visits: number;
  }>;
}

export interface MetricValueResult {
  metric: NotificationMetric;
  window: NotificationMetricWindow;
  value: number;
  range: {
    from: number;
    to: number;
  };
}

function partsInTimezone(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = new Map(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  );
  const hour = Number(parts.get("hour") ?? 0);
  return {
    year: Number(parts.get("year") ?? 1970),
    month: Number(parts.get("month") ?? 1),
    day: Number(parts.get("day") ?? 1),
    hour: hour === 24 ? 0 : hour,
    minute: Number(parts.get("minute") ?? 0),
    second: Number(parts.get("second") ?? 0),
  };
}

function timezoneOffsetMs(utcMs: number, timeZone: string): number {
  const parts = partsInTimezone(new Date(utcMs), timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return asUtc - utcMs;
}

function zonedTimeToUtcMs(input: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second?: number;
  timeZone: string;
}): number {
  const localAsUtc = Date.UTC(
    input.year,
    input.month - 1,
    input.day,
    input.hour,
    input.minute,
    input.second ?? 0,
  );
  const firstGuess = localAsUtc - timezoneOffsetMs(localAsUtc, input.timeZone);
  return localAsUtc - timezoneOffsetMs(firstGuess, input.timeZone);
}

function cleanTimezone(value: unknown): string {
  const timeZone =
    typeof value === "string" && value.trim() ? value.trim() : "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return timeZone;
  } catch {
    return "UTC";
  }
}

function dateLabel(parts: { year: number; month: number; day: number }) {
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function notificationWindowFor(input: {
  window: NotificationMetricWindow;
  now: number;
  timezone?: string;
}): QueryWindow & { label: string } {
  const nowMs = Math.max(0, Math.trunc(input.now)) * 1000;
  const timeZone = cleanTimezone(input.timezone);
  if (input.window === "last_1h") {
    return {
      fromMs: nowMs - 60 * 60 * 1000,
      toMs: nowMs,
      nowMs,
      timeZone,
      label: "last 1 hour",
    };
  }
  if (input.window === "last_24h") {
    return {
      fromMs: nowMs - 24 * 60 * 60 * 1000,
      toMs: nowMs,
      nowMs,
      timeZone,
      label: "last 24 hours",
    };
  }
  const local = partsInTimezone(new Date(nowMs), timeZone);
  const startToday = zonedTimeToUtcMs({
    year: local.year,
    month: local.month,
    day: local.day,
    hour: 0,
    minute: 0,
    timeZone,
  });
  const startYesterday = zonedTimeToUtcMs({
    year: local.year,
    month: local.month,
    day: local.day - 1,
    hour: 0,
    minute: 0,
    timeZone,
  });
  const yesterdayParts = partsInTimezone(new Date(startYesterday), timeZone);
  return {
    fromMs: startYesterday,
    toMs: Math.max(startYesterday, startToday - 1),
    nowMs,
    timeZone,
    label: dateLabel(yesterdayParts),
  };
}

async function getSite(
  env: Env,
  siteId: string,
): Promise<{ name: string; domain: string } | null> {
  const row = await env.DB.prepare(
    "SELECT name, domain FROM sites WHERE id = ? LIMIT 1",
  )
    .bind(siteId)
    .first<{ name: string; domain: string }>();
  return row ?? null;
}

export async function loadDailyReportData(
  env: Env,
  input: {
    siteId: string;
    now: number;
    timezone?: string;
  },
): Promise<DailyReportData | null> {
  const site = await getSite(env, input.siteId);
  if (!site) return null;
  const window = notificationWindowFor({
    window: "yesterday",
    now: input.now,
    timezone: input.timezone,
  });
  const [overview, pages, referrers] = await Promise.all([
    queryOverviewAggregate(env, input.siteId, window, {}),
    queryPagesAggregate(env, input.siteId, window, {}, 5, false),
    queryReferrerAggregate(env, input.siteId, window, {}, 5, false),
  ]);
  return {
    siteName: site.name,
    siteDomain: site.domain,
    range: {
      from: Math.floor(window.fromMs / 1000),
      to: Math.floor(window.toMs / 1000),
      label: window.label,
    },
    metrics: {
      views: overview.value.views,
      visitors: overview.value.visitors,
      sessions: overview.value.sessions,
    },
    topPages: pages.map((row) => ({
      path: row.pathname || "/",
      views: row.views,
    })),
    topReferrers: referrers.map((row) => ({
      referrer: row.referrer || "Direct",
      visits: row.sessions,
    })),
  };
}

export async function loadMetricValue(
  env: Env,
  input: {
    siteId: string;
    metric: NotificationMetric;
    window: NotificationMetricWindow;
    now: number;
    timezone?: string;
  },
): Promise<MetricValueResult> {
  const window = notificationWindowFor({
    window: input.window,
    now: input.now,
    timezone: input.timezone,
  });
  const overview = await queryOverviewAggregate(env, input.siteId, window, {});
  return {
    metric: input.metric,
    window: input.window,
    value: overview.value[input.metric],
    range: {
      from: Math.floor(window.fromMs / 1000),
      to: Math.floor(window.toMs / 1000),
    },
  };
}

export async function loadSiteLastSeenAt(
  env: Env,
  siteId: string,
): Promise<number | null> {
  const row = await env.DB.prepare(
    `
      SELECT MAX(lastSeenAt) AS lastSeenAt
      FROM (
        SELECT MAX(last_activity_at) AS lastSeenAt
        FROM visits
        WHERE site_id = ?

        UNION ALL

        SELECT MAX(last_activity_at) AS lastSeenAt
        FROM visits_archive
        WHERE site_id = ?
      )
    `,
  )
    .bind(siteId, siteId)
    .first<{ lastSeenAt: number | null }>();
  const value = Number(row?.lastSeenAt ?? 0);
  return Number.isFinite(value) && value > 0 ? Math.floor(value / 1000) : null;
}
