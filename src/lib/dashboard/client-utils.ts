import type { PrivateRequestParams } from "@/lib/dashboard/client-data-types";
import type { DashboardFilters } from "@/lib/dashboard/query-state";
import type { OverviewTabData } from "@/lib/edge-client";

import type { OverviewTabRows } from "./client-data-types";

export function normalizeOverviewRows(
  rows: OverviewTabData["data"] | Array<Record<string, unknown>> | undefined,
): OverviewTabRows {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => ({
    label:
      String((row as { label?: unknown }).label ?? "").trim() ||
      String((row as { value?: unknown }).value ?? "").trim(),
    views: Number((row as { views?: unknown }).views ?? 0),
    sessions: Number((row as { sessions?: unknown }).sessions ?? 0),
    visitors: Number((row as { visitors?: unknown }).visitors ?? 0),
  }));
}

export function decodeHashLabel(value: string): string {
  const normalized = String(value || "").trim();
  if (!normalized) return "";

  const prefixed = normalized.startsWith("#") ? normalized : `#${normalized}`;
  const encodedFragment = prefixed.slice(1);
  if (!encodedFragment) return "";

  try {
    return `#${decodeURIComponent(encodedFragment)}`;
  } catch {
    return prefixed;
  }
}

export function decodeQueryLabel(value: string): string {
  const normalized = String(value || "").trim();
  if (!normalized) return "";

  const prefixed = normalized.startsWith("?") ? normalized : `?${normalized}`;
  const encodedQuery = prefixed.slice(1);
  if (!encodedQuery) return "";

  try {
    return `?${decodeURIComponent(encodedQuery)}`;
  } catch {
    return prefixed;
  }
}

export function withFilters(
  params: PrivateRequestParams,
  filters?: DashboardFilters,
): PrivateRequestParams {
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
  if (filters.eventPayloadFilters?.length) {
    next.eventPayloadFilters = JSON.stringify(filters.eventPayloadFilters);
  }
  return next;
}

export function toQueryString(params?: PrivateRequestParams): string {
  if (!params) return "";
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    query.set(key, String(value));
  }
  const encoded = query.toString();
  return encoded.length > 0 ? `?${encoded}` : "";
}
