#!/usr/bin/env tsx

import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(import.meta.dirname, "..");
const OPENAPI_PATH = resolve(ROOT, "docs/openapi.json");
const TEMPLATE_PATH = resolve(ROOT, "scripts/skills-template.json");
const OUTPUT_PATH = resolve(ROOT, "docs/skills.json");

// ── queryName → skills.json endpoint group ──────────────────────────────

const QUERY_NAME_GROUPS: Record<string, string> = {
  overview: "analytics_overview",
  trend: "analytics_overview",
  pages: "analytics_pages",
  "pages-dashboard": "analytics_pages",
  "page-hash": "analytics_pages",
  "page-query": "analytics_pages",
  referrers: "analytics_sources",
  countries: "analytics_sources",
  "utm-source": "analytics_sources",
  "utm-medium": "analytics_sources",
  "utm-campaign": "analytics_sources",
  "utm-term": "analytics_sources",
  "utm-content": "analytics_sources",
  visitors: "analytics_visitors",
  "visitor-detail": "analytics_visitors",
  sessions: "analytics_visitors",
  "session-detail": "analytics_visitors",
  "event-types": "analytics_events",
  "events-summary": "analytics_events",
  "events-trend": "analytics_events",
  "events-records": "analytics_events",
  "event-type-field-values": "analytics_events",
  "event-type-detail": "analytics_events",
  "event-record-detail": "analytics_events",
  funnels: "analytics_funnels",
  retention: "analytics_advanced",
  performance: "analytics_advanced",
  "filter-options": "analytics_advanced",
  "browser-trend": "analytics_technology",
  "browser-engine-trend": "analytics_technology",
  "browser-version-breakdown": "analytics_technology",
  "browser-cross-breakdown": "analytics_technology",
  "browser-radar": "analytics_technology",
  "referrer-radar": "analytics_technology",
  "referrer-dimension-trend": "analytics_technology",
  "client-dimension-trend": "analytics_technology",
  "utm-dimension-trend": "analytics_technology",
  "client-cross-breakdown": "analytics_technology",
  "overview-page-path": "overview_tabs",
  "overview-page-title": "overview_tabs",
  "overview-page-hostname": "overview_tabs",
  "overview-page-entry": "overview_tabs",
  "overview-page-exit": "overview_tabs",
  "overview-source-domain": "overview_tabs",
  "overview-source-link": "overview_tabs",
  "overview-client-browser": "overview_tabs",
  "overview-client-os-version": "overview_tabs",
  "overview-client-device-type": "overview_tabs",
  "overview-client-language": "overview_tabs",
  "overview-client-screen-size": "overview_tabs",
  "overview-geo-country": "overview_tabs",
  "overview-geo-region": "overview_tabs",
  "overview-geo-city": "overview_tabs",
  "overview-geo-continent": "overview_tabs",
  "overview-geo-timezone": "overview_tabs",
  "overview-geo-organization": "overview_tabs",
  "overview-geo-points": "overview_tabs",
};

// Group display order
const GROUP_ORDER = [
  "public_endpoints",
  "sites",
  "site_config",
  "analytics_overview",
  "analytics_pages",
  "analytics_sources",
  "analytics_visitors",
  "analytics_events",
  "analytics_funnels",
  "analytics_advanced",
  "analytics_technology",
  "overview_tabs",
  "realtime",
  "batch",
  "team",
];

// ── Per-queryName specific parameters ───────────────────────────────────

interface QueryParamSpec {
  noCommonWindow?: boolean;
  noCommonFilters?: boolean;
  params: Record<string, string>;
}

const QUERY_NAME_PARAMS: Record<string, QueryParamSpec> = {
  // ── analytics_overview ──
  overview: {
    params: {
      includeChange:
        "boolean — include previous period comparison and change rates",
      includeDetail: "boolean — include time-series trend breakdown",
      interval: "minute|hour|day|week|month",
    },
  },
  trend: {
    params: {
      interval: "minute|hour|day|week|month",
    },
  },

  // ── analytics_pages ──
  pages: {
    params: {
      limit: "integer",
      details: "boolean — include detailed page metrics",
    },
  },
  "pages-dashboard": {
    params: {
      interval: "minute|hour|day|week|month",
      page: "integer (1-indexed)",
      pageSize: "integer",
    },
  },
  "page-hash": { params: { limit: "integer" } },
  "page-query": { params: { limit: "integer" } },

  // ── analytics_sources ──
  referrers: {
    params: {
      limit: "integer",
      fullUrl: "boolean — show full referrer URL instead of just domain",
    },
  },
  countries: { params: { limit: "integer" } },
  "utm-source": { params: { limit: "integer" } },
  "utm-medium": { params: { limit: "integer" } },
  "utm-campaign": { params: { limit: "integer" } },
  "utm-term": { params: { limit: "integer" } },
  "utm-content": { params: { limit: "integer" } },

  // ── analytics_visitors ──
  visitors: {
    params: {
      page: "integer (1-indexed)",
      pageSize: "integer",
      sortBy: "string — field to sort by",
      sortDir: "asc|desc",
      search: "string — search visitors by identifier (alias: q)",
    },
  },
  sessions: {
    params: {
      page: "integer (1-indexed)",
      pageSize: "integer",
      sortBy: "string — field to sort by",
      sortDir: "asc|desc",
      search: "string — search sessions by identifier (alias: q)",
    },
  },
  "visitor-detail": {
    noCommonWindow: true,
    noCommonFilters: true,
    params: {
      visitorId: "UUID (required) — visitor identifier",
      timeZone: "IANA timezone",
      tz: "Alias for timeZone",
    },
  },
  "session-detail": {
    noCommonWindow: true,
    noCommonFilters: true,
    params: {
      sessionId: "UUID (required) — session identifier",
    },
  },

  // ── analytics_events ──
  "event-types": { params: { limit: "integer" } },
  "events-summary": { params: {} },
  "events-trend": {
    params: {
      interval: "minute|hour|day|week|month",
      limit: "integer",
      eventName: "string — filter by event name",
    },
  },
  "events-records": {
    params: {
      page: "integer (1-indexed)",
      pageSize: "integer",
      sortBy: "string — field to sort by",
      sortDir: "asc|desc",
      search: "string — search event records (alias: q)",
      eventName: "string — filter by event name",
    },
  },
  "event-type-detail": {
    params: {
      eventName: "string (required) — event type name",
      interval: "minute|hour|day|week|month",
    },
  },
  "event-type-field-values": {
    params: {
      eventName: "string (required) — event type name",
      fieldPath: "string (required) — dot-notation path to the field",
      fieldValueType:
        "string|number|boolean|null|object|array — filter by value type",
      limit: "integer",
    },
  },
  "event-record-detail": {
    noCommonWindow: true,
    noCommonFilters: true,
    params: {
      eventId: "UUID (required) — event record identifier",
    },
  },

  // ── analytics_funnels ──
  funnels: {
    params: {
      id: "UUID — funnel ID. If omitted, lists all saved funnels for the site.",
    },
  },

  // ── analytics_advanced ──
  retention: {
    params: {
      granularity:
        "minute|hour|day|week|month — cohort granularity (falls back to interval)",
      interval: "minute|hour|day|week|month — alias for granularity",
    },
  },
  performance: {
    params: {
      interval: "minute|hour|day|week|month",
      limit: "integer",
    },
  },
  "filter-options": {
    params: {
      filterKey:
        "string (required) — which filter dimension to list values for",
      limit: "integer",
    },
  },

  // ── analytics_technology ──
  "browser-trend": {
    params: { interval: "minute|hour|day|week|month", limit: "integer" },
  },
  "browser-engine-trend": {
    params: { interval: "minute|hour|day|week|month", limit: "integer" },
  },
  "browser-version-breakdown": {
    params: {
      browserLimit: "integer — max browsers to return",
      versionLimit: "integer — max versions per browser",
    },
  },
  "browser-cross-breakdown": {
    params: {
      browserLimit: "integer",
      osLimit: "integer",
      deviceTypeLimit: "integer",
    },
  },
  "browser-radar": { params: {} },
  "referrer-radar": { params: { limit: "integer" } },
  "referrer-dimension-trend": {
    params: { interval: "minute|hour|day|week|month", limit: "integer" },
  },
  "client-dimension-trend": {
    params: {
      dimension:
        "string (required) — which client dimension (e.g. browser, osVersion, deviceType, language, screenSize)",
      interval: "minute|hour|day|week|month",
      limit: "integer",
    },
  },
  "utm-dimension-trend": {
    params: {
      dimension:
        "string (required) — which UTM dimension (e.g. source, medium, campaign, term, content)",
      interval: "minute|hour|day|week|month",
      limit: "integer",
    },
  },
  "client-cross-breakdown": {
    params: {
      primaryDimension: "string (required) — primary dimension for rows",
      secondaryDimension: "string (required) — secondary dimension for columns",
      primaryLimit: "integer — max rows",
      secondaryLimit: "integer — max columns",
    },
  },

  // ── overview_tabs ──
  "overview-page-path": { params: { limit: "integer" } },
  "overview-page-title": { params: { limit: "integer" } },
  "overview-page-hostname": { params: { limit: "integer" } },
  "overview-page-entry": { params: { limit: "integer" } },
  "overview-page-exit": { params: { limit: "integer" } },
  "overview-source-domain": { params: { limit: "integer" } },
  "overview-source-link": { params: { limit: "integer" } },
  "overview-client-browser": { params: { limit: "integer" } },
  "overview-client-os-version": { params: { limit: "integer" } },
  "overview-client-device-type": { params: { limit: "integer" } },
  "overview-client-language": { params: { limit: "integer" } },
  "overview-client-screen-size": { params: { limit: "integer" } },
  "overview-geo-country": { params: { limit: "integer" } },
  "overview-geo-region": { params: { limit: "integer" } },
  "overview-geo-city": { params: { limit: "integer" } },
  "overview-geo-continent": { params: { limit: "integer" } },
  "overview-geo-timezone": { params: { limit: "integer" } },
  "overview-geo-organization": { params: { limit: "integer" } },
  "overview-geo-points": {
    params: {
      limit: "integer",
      applyGeoFilter: "boolean — whether to apply geo filters to points",
    },
  },
};

// ── Types ───────────────────────────────────────────────────────────────

interface OpenAPISpec {
  info: {
    title: string;
    description: string;
    version: string;
    contact: Record<string, string>;
  };
  tags: Array<{ name: string; description: string }>;
  paths: Record<string, PathItem>;
  components: {
    schemas: Record<string, unknown>;
    securitySchemes: Record<string, unknown>;
  };
}

interface PathItem {
  get?: Operation;
  post?: Operation;
  patch?: Operation;
  delete?: Operation;
  parameters?: Array<{ $ref?: string; name?: string }>;
}

interface Operation {
  operationId: string;
  summary: string;
  description: string;
  tags: string[];
  parameters?: Array<{
    name: string;
    in: string;
    description?: string;
    schema?: Record<string, unknown>;
    required?: boolean;
  }>;
  responses?: Record<string, unknown>;
}

interface SkillsEndpoint {
  method: string;
  path: string;
  description: string;
  scope?: string;
  parameters?: Record<string, string>;
  returns?: Record<string, string>;
  example?: string;
}

interface SkillsTemplate {
  authentication_extras: {
    obtain: Record<string, unknown>;
    scopes: Record<string, string>;
    error_responses: Record<string, unknown>;
  };
  common_query_parameters: Record<string, unknown>;
  typical_workflow: string[];
  implementation_notes: string[];
}

// ── Helpers ─────────────────────────────────────────────────────────────

function descForQueryName(queryName: string): string {
  const descriptions: Record<string, string> = {
    overview:
      "Get aggregate metrics: views, sessions, visitors, bounces, bounce rate, average duration.",
    trend:
      "Get time-series trend data (views, visitors, sessions, bounces per bucket).",
    pages: "Get top pages ranked by views.",
    "pages-dashboard": "Get pages dashboard data with aggregated page metrics.",
    "page-hash": "Get page URL hash fragment distribution.",
    "page-query": "Get page query string distribution.",
    referrers: "Get top referrer sources.",
    countries: "Get visitor distribution by country.",
    "utm-source": "Get UTM source breakdown.",
    "utm-medium": "Get UTM medium breakdown.",
    "utm-campaign": "Get UTM campaign breakdown.",
    "utm-term": "Get UTM term breakdown.",
    "utm-content": "Get UTM content breakdown.",
    visitors: "List visitors with pagination.",
    "visitor-detail": "Get detailed information for a single visitor.",
    sessions: "List sessions with pagination.",
    "session-detail": "Get detailed information for a single session.",
    "event-types": "List all custom event types for a site.",
    "events-summary": "Get custom event summary statistics.",
    "events-trend": "Get custom event time-series trend.",
    "events-records": "List custom event records with pagination.",
    "event-record-detail":
      "Get detailed information for a single event record.",
    "event-type-detail": "Get detailed statistics for a specific event type.",
    "event-type-field-values":
      "Get distinct field values for a specific event type.",
    funnels: "List saved conversion funnels for a site.",
    retention: "Get user retention cohort analysis.",
    performance: "Get Core Web Vitals metrics (TTFB, FCP, LCP, CLS, INP).",
    "filter-options":
      "Get available filter dimension values for a site (used to populate filter UIs).",
    "browser-trend": "Get browser usage trends over time.",
    "browser-engine-trend": "Get browser engine trends.",
    "browser-version-breakdown": "Get browser version distribution.",
    "browser-cross-breakdown": "Get browser × OS cross-tabulation.",
    "browser-radar":
      "Get browser radar chart data (multi-axis browser comparison).",
    "referrer-radar":
      "Get referrer radar chart data (multi-axis referrer comparison).",
    "referrer-dimension-trend": "Get referrer dimension trends over time.",
    "client-dimension-trend":
      "Get client dimension (browser/OS/device) trends.",
    "utm-dimension-trend": "Get UTM dimension trends over time.",
    "client-cross-breakdown":
      "Get client dimension cross-tabulation breakdown.",
    "overview-page-path": "Overview tab: top page paths.",
    "overview-page-title": "Overview tab: top page titles.",
    "overview-page-hostname": "Overview tab: top hostnames.",
    "overview-page-entry": "Overview tab: top entry pages.",
    "overview-page-exit": "Overview tab: top exit pages.",
    "overview-source-domain": "Overview tab: top referrer domains.",
    "overview-source-link": "Overview tab: top referrer links.",
    "overview-client-browser": "Overview tab: browser distribution.",
    "overview-client-os-version": "Overview tab: OS version distribution.",
    "overview-client-device-type": "Overview tab: device type distribution.",
    "overview-client-language": "Overview tab: language distribution.",
    "overview-client-screen-size": "Overview tab: screen size distribution.",
    "overview-geo-country": "Overview tab: country distribution.",
    "overview-geo-region": "Overview tab: region distribution.",
    "overview-geo-city": "Overview tab: city distribution.",
    "overview-geo-continent": "Overview tab: continent distribution.",
    "overview-geo-timezone": "Overview tab: timezone distribution.",
    "overview-geo-organization": "Overview tab: organization/ISP distribution.",
    "overview-geo-points":
      "Overview tab: geographic coordinate points for map rendering.",
  };
  return descriptions[queryName] ?? `Query: ${queryName}`;
}

function buildEndpoint(
  method: string,
  path: string,
  op: Operation,
  extra?: Partial<SkillsEndpoint>,
): SkillsEndpoint {
  const ep: SkillsEndpoint = {
    method,
    path,
    description: op.description || op.summary,
  };
  if (extra?.scope) ep.scope = extra.scope;
  if (extra?.parameters) ep.parameters = extra.parameters;
  if (extra?.returns) ep.returns = extra.returns;
  if (extra?.example) ep.example = extra.example;
  return ep;
}

// ── Main ────────────────────────────────────────────────────────────────

function generate() {
  const spec: OpenAPISpec = JSON.parse(readFileSync(OPENAPI_PATH, "utf-8"));
  const template: SkillsTemplate = JSON.parse(
    readFileSync(TEMPLATE_PATH, "utf-8"),
  );

  // Extract QueryName enum
  const queryNameSchema = spec.components.schemas.QueryName as {
    enum?: string[];
  };
  const queryNames: string[] = queryNameSchema?.enum ?? [];

  // Group queryNames
  const queryNameGroups: Record<string, string[]> = {};
  for (const qn of queryNames) {
    const group = QUERY_NAME_GROUPS[qn];
    if (!group) {
      console.warn(`  WARN: queryName "${qn}" has no group mapping`);
      continue;
    }
    if (!queryNameGroups[group]) queryNameGroups[group] = [];
    queryNameGroups[group].push(qn);
  }

  // Build endpoint groups
  const endpoints: Record<string, SkillsEndpoint[]> = {};

  // -- public_endpoints
  const healthOp = spec.paths["/healthz"]?.get;
  const collectOp = spec.paths["/collect"]?.post;
  const publicEps: SkillsEndpoint[] = [];
  if (healthOp) publicEps.push(buildEndpoint("GET", "/healthz", healthOp));
  if (collectOp) publicEps.push(buildEndpoint("POST", "/collect", collectOp));
  if (publicEps.length) endpoints.public_endpoints = publicEps;

  // -- sites
  const sitesPath = spec.paths["/api/v1/sites"];
  const siteIdPath = spec.paths["/api/v1/sites/{siteId}"];
  const sitesEps: SkillsEndpoint[] = [];
  if (sitesPath?.get)
    sitesEps.push(
      buildEndpoint("GET", "/api/v1/sites", sitesPath.get, {
        scope: "site:read",
      }),
    );
  if (sitesPath?.post) {
    const op = sitesPath.post;
    const params: Record<string, string> = {
      name: "string (required) — site display name",
      domain: "string (required) — site domain",
      publicEnabled: "boolean (optional) — enable public stats page",
      publicSlug: "string (optional) — URL slug for public page",
    };
    sitesEps.push(
      buildEndpoint("POST", "/api/v1/sites", op, {
        scope: "site:write",
        parameters: params,
        example:
          'POST /api/v1/sites {"name": "My Blog", "domain": "blog.example.com"}',
      }),
    );
  }
  if (siteIdPath?.get)
    sitesEps.push(
      buildEndpoint("GET", "/api/v1/sites/{siteId}", siteIdPath.get, {
        scope: "site:read",
      }),
    );
  if (siteIdPath?.patch) {
    const params: Record<string, string> = {
      name: "string",
      domain: "string",
      publicEnabled: "boolean",
      publicSlug: "string",
    };
    sitesEps.push(
      buildEndpoint("PATCH", "/api/v1/sites/{siteId}", siteIdPath.patch, {
        scope: "site:write",
        parameters: params,
      }),
    );
  }
  if (siteIdPath?.delete)
    sitesEps.push(
      buildEndpoint("DELETE", "/api/v1/sites/{siteId}", siteIdPath.delete, {
        scope: "site:write",
      }),
    );
  if (sitesEps.length) endpoints.sites = sitesEps;

  // -- site_config
  const configPath = spec.paths["/api/v1/sites/{siteId}/config"];
  const snippetPath = spec.paths["/api/v1/sites/{siteId}/script-snippet"];
  const configEps: SkillsEndpoint[] = [];
  if (configPath?.get)
    configEps.push(
      buildEndpoint("GET", "/api/v1/sites/{siteId}/config", configPath.get, {
        scope: "site_config:read",
      }),
    );
  if (configPath?.patch)
    configEps.push(
      buildEndpoint(
        "PATCH",
        "/api/v1/sites/{siteId}/config",
        configPath.patch,
        {
          scope: "site_config:write",
        },
      ),
    );
  if (snippetPath?.get) {
    configEps.push(
      buildEndpoint(
        "GET",
        "/api/v1/sites/{siteId}/script-snippet",
        snippetPath.get,
        {
          scope: "site_config:read",
          returns: {
            siteId: "string",
            src: "string — full URL to tracking script",
            snippet: "string — HTML script tag",
          },
        },
      ),
    );
  }
  if (configEps.length) endpoints.site_config = configEps;

  // -- analytics queryName groups (with per-queryName parameters)
  if (queryNames.length > 0) {
    for (const group of GROUP_ORDER) {
      const qns = queryNameGroups[group];
      if (!qns) continue;
      const eps: SkillsEndpoint[] = [];
      for (const qn of qns) {
        const path = `/api/v1/sites/{siteId}/analytics/${qn}`;
        const paramSpec = QUERY_NAME_PARAMS[qn];
        const ep: SkillsEndpoint = {
          method: "GET",
          path,
          description: descForQueryName(qn),
          scope: "analytics:read",
        };

        // Build endpoint-specific parameters
        const epParams: Record<string, string> = {};

        // Common window params unless the endpoint opts out
        if (!paramSpec?.noCommonWindow) {
          epParams.from = "Unix ms (required)";
          epParams.to = "Unix ms (required)";
          epParams.timeZone = "IANA timezone (optional)";
          epParams.tz = "Alias for timeZone";
        }

        // Filter availability note unless the endpoint opts out
        if (!paramSpec?.noCommonFilters) {
          epParams._filters =
            "All common filter parameters are supported (see common_query_parameters.filter_parameters)";
        }

        // Query-specific params
        if (paramSpec?.params) {
          Object.assign(epParams, paramSpec.params);
        }

        if (Object.keys(epParams).length > 0) {
          ep.parameters = epParams;
        }

        eps.push(ep);
      }
      endpoints[group] = eps;
    }
  }

  // -- funnels/analyze
  const analyzePath =
    spec.paths["/api/v1/sites/{siteId}/analytics/funnels/analyze"];
  if (analyzePath?.post) {
    const funnelsGroup = endpoints.analytics_funnels ?? [];
    funnelsGroup.push(
      buildEndpoint(
        "POST",
        "/api/v1/sites/{siteId}/analytics/funnels/analyze",
        analyzePath.post,
        {
          scope: "analytics:read",
          parameters: {
            from: "Unix ms (required, query param)",
            to: "Unix ms (required, query param)",
            timeZone: "IANA timezone (optional)",
            tz: "Alias for timeZone",
            steps: "array of step objects (required, body)",
            _filters: "All common filter parameters are supported",
          },
        },
      ),
    );
    endpoints.analytics_funnels = funnelsGroup;
  }

  // -- batch
  const batchPath = spec.paths["/api/v1/sites/{siteId}/analytics/batch"];
  if (batchPath?.post) {
    endpoints.batch = [
      buildEndpoint(
        "POST",
        "/api/v1/sites/{siteId}/analytics/batch",
        batchPath.post,
        {
          scope: "analytics:read",
          parameters: {
            queries:
              "array of objects, each with a queryName field and optional overrides (from, to, interval, timeZone, and any filter parameter)",
          },
          example:
            'POST /api/v1/sites/{siteId}/analytics/batch {"queries": [{"queryName": "overview", "from": 0, "to": 1, "includeChange": true}, {"queryName": "trend", "interval": "day"}, {"queryName": "pages", "limit": 5}]}',
        },
      ),
    ];
  }

  // -- realtime
  const snapshotPath = spec.paths["/api/v1/sites/{siteId}/realtime/snapshot"];
  const activePath = spec.paths["/api/v1/sites/{siteId}/realtime/active"];
  const realtimeEps: SkillsEndpoint[] = [];
  if (snapshotPath?.get) {
    realtimeEps.push(
      buildEndpoint(
        "GET",
        "/api/v1/sites/{siteId}/realtime/snapshot",
        snapshotPath.get,
        {
          scope: "analytics:read",
          returns: {
            activeNow: "integer — number of currently active visitors",
            events: "array — recent activity events",
          },
        },
      ),
    );
  }
  if (activePath?.get) {
    realtimeEps.push(
      buildEndpoint(
        "GET",
        "/api/v1/sites/{siteId}/realtime/active",
        activePath.get,
        {
          scope: "analytics:read",
          returns: {
            activeNow: "integer — number of currently active visitors",
          },
        },
      ),
    );
  }
  if (realtimeEps.length) endpoints.realtime = realtimeEps;

  // -- team
  const teamPath = spec.paths["/api/v1/team/dashboard"];
  if (teamPath?.get) {
    endpoints.team = [
      buildEndpoint("GET", "/api/v1/team/dashboard", teamPath.get, {
        scope: "analytics:read",
        parameters: {
          from: "Unix ms (required)",
          to: "Unix ms (required)",
          interval: "hour|day|week|month",
        },
      }),
    ];
  }

  // Reorder endpoint groups
  const orderedEndpoints: Record<string, SkillsEndpoint[]> = {};
  for (const group of GROUP_ORDER) {
    if (endpoints[group]) orderedEndpoints[group] = endpoints[group];
  }
  for (const [group, eps] of Object.entries(endpoints)) {
    if (!orderedEndpoints[group]) orderedEndpoints[group] = eps;
  }

  // Standard response format
  const standardResponseFormat = {
    success: {
      ok: true,
      requestId:
        "string — Cloudflare Ray ID for tracing, include this when reporting issues",
      timestamp: "ISO 8601 string — response generation time",
      data: "object or array — the response payload",
    },
    error: {
      ok: false,
      requestId: "string",
      timestamp: "ISO 8601 string",
      error: {
        code: "string — machine-readable snake_case code",
        message: "string — human-readable description",
      },
    },
  };

  // Build global_parameters
  const PARAM_DESCRIPTIONS: Record<string, string> = {
    from: "Start timestamp in Unix milliseconds.",
    to: "End timestamp in Unix milliseconds.",
    interval:
      "Time granularity for trend aggregation. Default varies by query.",
    limit: "Maximum number of results to return.",
  };
  const globalParams: Record<string, Record<string, unknown>> = {};
  const queryAnalyticsOp =
    spec.paths["/api/v1/sites/{siteId}/analytics/{queryName}"]?.get;
  const analyticsParams = queryAnalyticsOp?.parameters ?? [];
  for (const p of analyticsParams) {
    if (
      p.in === "query" &&
      ["from", "to", "interval", "limit"].includes(p.name)
    ) {
      globalParams[p.name] = {
        type: p.schema?.type ?? "string",
        description: p.description || PARAM_DESCRIPTIONS[p.name] || "",
      };
      if (p.schema?.enum) globalParams[p.name].enum = p.schema.enum;
    }
  }
  globalParams.siteId = {
    type: "string",
    format: "uuid",
    description:
      "Unique site identifier. Obtain from the list sites endpoint or the dashboard.",
  };

  // Assemble final output
  const skills = {
    api: spec.info.title.replace("API", "Analytics API"),
    version: spec.info.version,
    base_url: "${baseUrl}",
    github: {
      repository:
        spec.info.contact.url?.replace("https://github.com/", "") ??
        "RavelloH/InsightFlare",
      url: spec.info.contact.url ?? "https://github.com/RavelloH/InsightFlare",
    },
    description:
      "Privacy-focused web analytics platform. Query pageviews, visitors, sessions, events, funnels, retention, Core Web Vitals performance metrics, realtime activity, and technology/browser/UTM breakdowns. Manage sites and tracking configuration programmatically.",
    documentation_url: "/.well-known/openapi.json",
    openapi_url: "/.well-known/openapi.json",

    authentication: {
      type: "bearer",
      header: "Authorization",
      format: "Bearer ifk_live_<prefix>.<secret>",
      required: true,
      description:
        "All /api/v1/ endpoints require an API key. If you do not have one, you MUST ask the user to provide their key or generate one from the InsightFlare dashboard under Settings → API Keys. Without a valid key, every request returns 401 Unauthorized.",
      obtain: template.authentication_extras.obtain,
      scopes: template.authentication_extras.scopes,
      error_responses: template.authentication_extras.error_responses,
    },

    standard_response_format: standardResponseFormat,
    global_parameters: globalParams,
    common_query_parameters: template.common_query_parameters,
    typical_workflow: template.typical_workflow,
    endpoints: orderedEndpoints,
    implementation_notes: template.implementation_notes,
  };

  const output = JSON.stringify(skills, null, 2);
  writeFileSync(OUTPUT_PATH, output + "\n", "utf-8");
  console.log(`Generated ${OUTPUT_PATH}`);
}

generate();
