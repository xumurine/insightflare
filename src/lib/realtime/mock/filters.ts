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
  DemoEventPayloadFilterRule,
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

function normalizeDemoEventPayloadFilterPath(value: unknown): string | null {
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

function normalizeDemoEventPayloadFilterValue(
  value: unknown,
): DemoEventPayloadFilterRule["value"] | undefined {
  if (value === null) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.slice(0, 240);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return undefined;
}

function parseDemoEventPayloadFilters(
  value: string | number | undefined,
): DemoEventPayloadFilterRule[] | undefined {
  if (value === undefined || value === null) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(value));
  } catch {
    return undefined;
  }
  if (!Array.isArray(parsed)) return undefined;

  const rules: DemoEventPayloadFilterRule[] = [];
  for (const item of parsed.slice(0, 12)) {
    if (!item || typeof item !== "object") continue;
    const candidate = item as {
      path?: unknown;
      operator?: unknown;
      value?: unknown;
    };
    const path = normalizeDemoEventPayloadFilterPath(candidate.path);
    const operator =
      candidate.operator === "ne" || candidate.operator === "!=" ? "ne" : "eq";
    const filterValue = normalizeDemoEventPayloadFilterValue(candidate.value);
    if (!path || filterValue === undefined) continue;
    rules.push({ path, operator, value: filterValue });
  }

  return rules.length > 0 ? rules : undefined;
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
    eventPayloadFilters: parseDemoEventPayloadFilters(
      params.eventPayloadFilters,
    ),
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
