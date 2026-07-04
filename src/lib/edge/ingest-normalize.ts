import { j as jsonResponse } from "@/lib/response";

import type { TrackerPerformancePayload } from "./types";
import { coerceNumber } from "./utils";

export const MAX_CLIENT_EVENT_LAG_MS = 30 * 1000;

export interface RealtimeSnapshotRecord {
  id: string;
  eventType: string;
  eventAt: number;
  visitId: string;
  sessionId: string;
  pathname: string;
  hash: string;
  title: string;
  hostname: string;
  referrerUrl: string;
  referrerHost: string;
  visitorId: string;
  country: string;
  region: string;
  regionCode: string;
  city: string;
  continent: string;
  timezone: string;
  organization: string;
  browser: string;
  os: string;
  osVersion: string;
  deviceType: string;
  language: string;
  screenSize: string;
  latitude: number | null;
  longitude: number | null;
}

export interface RealtimeVisitPayloadInput {
  visitId: string;
  visitorId: string;
  sessionId: string;
  startedAt: number;
  lastActivityAt: number;
  pathname: string;
  hashFragment: string;
  title: string;
  hostname: string;
  referrerUrl: string;
  referrerHost: string;
  country: string;
  region: string;
  regionCode: string;
  city: string;
  continent: string;
  timezone: string;
  asOrganization: string;
  browser: string;
  os: string;
  osVersion: string;
  deviceType: string;
  language: string;
  screenWidth: number | null;
  screenHeight: number | null;
  latitude: number | null;
  longitude: number | null;
}

export { jsonResponse };

export function clampTimestamp(input: unknown, fallback: number): number {
  const value = coerceNumber(input, fallback) ?? fallback;
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.floor(value);
}

export function resolveTrustedClientTimestamp(
  input: unknown,
  receivedAt: number,
  fallback = receivedAt,
): number {
  const value = clampTimestamp(input, fallback);
  if (value > receivedAt) return receivedAt;
  if (receivedAt - value > MAX_CLIENT_EVENT_LAG_MS) return receivedAt;
  return value;
}

export function normalizePerformanceMetric(input: unknown): number | null {
  const value = coerceNumber(input, null);
  if (!Number.isFinite(value) || value == null || value < 0) return null;
  return Math.round(value * 1000) / 1000;
}

export function normalizePerformancePayload(
  input: unknown,
): TrackerPerformancePayload | null {
  if (!input || typeof input !== "object") return null;
  const source = input as Record<string, unknown>;
  const ttfb = normalizePerformanceMetric(source.ttfb);
  const fcp = normalizePerformanceMetric(source.fcp);
  const lcp = normalizePerformanceMetric(source.lcp);
  const cls = normalizePerformanceMetric(source.cls);
  const inp = normalizePerformanceMetric(source.inp);

  if (
    ttfb === null &&
    fcp === null &&
    lcp === null &&
    cls === null &&
    inp === null
  ) {
    return null;
  }

  return {
    ...(ttfb !== null ? { ttfb } : {}),
    ...(fcp !== null ? { fcp } : {}),
    ...(lcp !== null ? { lcp } : {}),
    ...(cls !== null ? { cls } : {}),
    ...(inp !== null ? { inp } : {}),
  };
}

export function toRealtimeScreenSize(
  width: number | null | undefined,
  height: number | null | undefined,
): string {
  const safeWidth = Number(width);
  const safeHeight = Number(height);
  if (!Number.isFinite(safeWidth) || !Number.isFinite(safeHeight)) {
    return "";
  }
  if (safeWidth <= 0 || safeHeight <= 0) {
    return "";
  }
  return `${Math.round(safeWidth)}x${Math.round(safeHeight)}`;
}

export function formatRealtimeOsLabel(os: string, osVersion: string): string {
  const normalizedOs = os.trim();
  const normalizedVersion = osVersion.trim();
  if (normalizedOs && normalizedVersion) {
    return `${normalizedOs} ${normalizedVersion}`;
  }
  return normalizedOs || normalizedVersion;
}

export function toRealtimePayload(
  record: RealtimeSnapshotRecord,
): Record<string, unknown> {
  return {
    id: record.id,
    eventType: record.eventType,
    eventAt: record.eventAt,
    visitId: record.visitId,
    sessionId: record.sessionId,
    pathname: record.pathname,
    hash: record.hash,
    title: record.title,
    hostname: record.hostname,
    referrerUrl: record.referrerUrl,
    referrerHost: record.referrerHost,
    visitorId: record.visitorId,
    country: record.country,
    region: record.region,
    regionCode: record.regionCode,
    city: record.city,
    continent: record.continent,
    timezone: record.timezone,
    organization: record.organization,
    browser: record.browser,
    osVersion: formatRealtimeOsLabel(record.os, record.osVersion),
    deviceType: record.deviceType,
    language: record.language,
    screenSize: record.screenSize,
    latitude: record.latitude,
    longitude: record.longitude,
  };
}

export function toRealtimeVisitPayload(
  visit: RealtimeVisitPayloadInput,
): Record<string, unknown> {
  return {
    visitId: visit.visitId,
    visitorId: visit.visitorId,
    sessionId: visit.sessionId,
    startedAt: visit.startedAt,
    lastActivityAt: visit.lastActivityAt,
    pathname: visit.pathname,
    hash: visit.hashFragment,
    title: visit.title,
    hostname: visit.hostname,
    referrerUrl: visit.referrerUrl,
    referrerHost: visit.referrerHost,
    country: visit.country,
    region: visit.region,
    regionCode: visit.regionCode,
    city: visit.city,
    continent: visit.continent,
    timezone: visit.timezone,
    organization: visit.asOrganization,
    browser: visit.browser,
    osVersion: formatRealtimeOsLabel(visit.os, visit.osVersion),
    deviceType: visit.deviceType,
    language: visit.language,
    screenSize: toRealtimeScreenSize(visit.screenWidth, visit.screenHeight),
    latitude: visit.latitude,
    longitude: visit.longitude,
  };
}
