// ---------------------------------------------------------------------------
//  Demo mock — filter / query-param parsing
//
//  All query-string parsing for /api/private and /api/public demo routes
//  flows through these helpers. Handlers call parseDemoFilters() to extract
//  user-selected dimension filters, plus parseDemoNumber / parseDemoLimit /
//  parseDemoBoolean / parseDemoInterval for primitive params.
// ---------------------------------------------------------------------------

import { DEMO_GEO_SEGMENT_SEPARATOR } from "@/lib/realtime/mock/dimension-pools";
import type {
  DemoQueryFilters,
  ParsedDemoGeoFilter,
} from "@/lib/realtime/mock/types";

export const DEMO_DIRECT_REFERRER_FILTER_VALUE = "__direct__";
export const DEMO_INTERVALS = new Set([
  "minute",
  "hour",
  "day",
  "week",
  "month",
]);

export function normalizeDemoFilterValue(
  value: string | number | undefined,
): string | undefined {
  if (value === undefined || value === null) return undefined;
  const normalized = String(value).trim().slice(0, 120);
  if (normalized.length === 0) return undefined;
  const lowered = normalized.toLowerCase();
  if (lowered === "all" || lowered === "null" || lowered === "undefined") {
    return undefined;
  }
  return normalized;
}

export function parseDemoFilters(
  params: Record<string, string | number>,
): DemoQueryFilters {
  const geo =
    normalizeDemoFilterValue(params.geo) ||
    normalizeDemoFilterValue(params.geoCountry) ||
    normalizeDemoFilterValue(params.geoRegion) ||
    normalizeDemoFilterValue(params.geoCity);
  return {
    country: normalizeDemoFilterValue(params.country),
    device: normalizeDemoFilterValue(params.device),
    browser: normalizeDemoFilterValue(params.browser),
    path: normalizeDemoFilterValue(params.path),
    query: normalizeDemoFilterValue(params.query),
    title: normalizeDemoFilterValue(params.title),
    hostname: normalizeDemoFilterValue(params.hostname),
    entry: normalizeDemoFilterValue(params.entry),
    exit: normalizeDemoFilterValue(params.exit),
    sourceDomain: normalizeDemoFilterValue(params.sourceDomain),
    sourceLink: normalizeDemoFilterValue(params.sourceLink),
    clientBrowser: normalizeDemoFilterValue(params.clientBrowser),
    clientOsVersion: normalizeDemoFilterValue(params.clientOsVersion),
    clientDeviceType: normalizeDemoFilterValue(params.clientDeviceType),
    clientLanguage: normalizeDemoFilterValue(params.clientLanguage),
    clientScreenSize: normalizeDemoFilterValue(params.clientScreenSize),
    geo,
    geoContinent: normalizeDemoFilterValue(params.geoContinent),
    geoTimezone: normalizeDemoFilterValue(params.geoTimezone),
    geoOrganization: normalizeDemoFilterValue(params.geoOrganization),
  };
}

export function normalizeDemoSearch(
  params: Record<string, string | number>,
): string {
  return String(params.search ?? params.q ?? "")
    .trim()
    .toLowerCase();
}

export function demoValuesIncludeSearch(
  search: string,
  values: unknown[],
): boolean {
  if (!search) return true;
  return values.some((value) =>
    String(value ?? "")
      .trim()
      .toLowerCase()
      .includes(search),
  );
}

export function withoutDemoGeoFilter(
  filters: DemoQueryFilters,
): DemoQueryFilters {
  return { ...filters, geo: undefined };
}

export function parseDemoGeoFilterValue(
  value: string | undefined,
): ParsedDemoGeoFilter | null {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;
  const segments = normalized
    .split(DEMO_GEO_SEGMENT_SEPARATOR)
    .map((segment) => segment.trim());
  const country = (segments[0] || "").toUpperCase();
  if (!country) return null;

  if (segments.length === 1) {
    return { country };
  }
  if (segments.length === 2) {
    const city = segments[1] || "";
    return city ? { country, city } : { country };
  }

  const regionCode = segments[1] || "";
  const regionName = segments[2] || "";
  const city =
    segments.length >= 4
      ? segments.slice(3).join(DEMO_GEO_SEGMENT_SEPARATOR).trim()
      : "";

  return {
    country,
    ...(regionCode ? { regionCode } : {}),
    ...(regionName ? { regionName } : {}),
    ...(city ? { city } : {}),
  };
}

export function parseDemoNumber(
  value: string | number | undefined,
  fallback: number,
): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function parseDemoLimit(
  value: string | number | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = Math.floor(parseDemoNumber(value, fallback));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

export function parseDemoBoolean(value: string | number | undefined): boolean {
  if (typeof value === "number") return value === 1;
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

export function parseDemoInterval(
  value: string | number | undefined,
): "minute" | "hour" | "day" | "week" | "month" {
  const normalized = String(value ?? "day")
    .trim()
    .toLowerCase();
  if (DEMO_INTERVALS.has(normalized)) {
    return normalized as "minute" | "hour" | "day" | "week" | "month";
  }
  return "day";
}
