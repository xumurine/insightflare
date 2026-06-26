#!/usr/bin/env tsx

import { execSync } from "child_process";
import { writeFileSync } from "fs";
import { resolve } from "path";
import YAML from "yaml";
import type { z } from "zod";
import { createSchema } from "zod-openapi";

// Import all schemas to trigger registerSchema() calls
import { getAllRegisteredSchemas } from "../src/schemas/index.js";

interface OpenAPISpec {
  openapi: string;
  info: Record<string, unknown>;
  servers: Array<{ url: string; description: string }>;
  security: Array<Record<string, unknown>>;
  tags: Array<{ name: string; description: string }>;
  paths: Record<string, unknown>;
  components: {
    schemas: Record<string, unknown>;
    securitySchemes: Record<string, unknown>;
    parameters: Record<string, unknown>;
    responses: Record<string, unknown>;
  };
}

function convertSchema(spec: OpenAPISpec, name: string, schema: z.ZodTypeAny) {
  try {
    if (!schema || !("_def" in (schema as object))) {
      console.error(`  SKIP ${name}: not a valid Zod schema`);
      return;
    }

    const { schema: openapiSchema, components } = createSchema(schema, {
      io: "output",
      openapiVersion: "3.1.0",
      opts: {
        reused: "ref",
        override: ({ jsonSchema }) => {
          const fixExclusiveBounds = (s: unknown): void => {
            if (!s || typeof s !== "object") return;
            const obj = s as Record<string, unknown>;
            if (typeof obj.exclusiveMinimum === "number") {
              obj.minimum = obj.exclusiveMinimum;
              obj.exclusiveMinimum = true;
            }
            if (typeof obj.exclusiveMaximum === "number") {
              obj.maximum = obj.exclusiveMaximum;
              obj.exclusiveMaximum = true;
            }
            if (obj.properties) {
              Object.values(obj.properties as Record<string, unknown>).forEach(
                fixExclusiveBounds,
              );
            }
            if (obj.items) {
              if (Array.isArray(obj.items))
                obj.items.forEach(fixExclusiveBounds);
              else fixExclusiveBounds(obj.items);
            }
            for (const key of ["allOf", "anyOf", "oneOf"]) {
              if (Array.isArray(obj[key]))
                (obj[key] as unknown[]).forEach(fixExclusiveBounds);
            }
          };
          fixExclusiveBounds(jsonSchema);
        },
      },
    });

    let finalSchema: unknown = openapiSchema;

    // collect __schema* entries from components (zod-openapi puts them here directly)
    const componentEntries: Record<string, unknown> = {};
    if (components) {
      for (const [key, value] of Object.entries(
        components as Record<string, unknown>,
      )) {
        if (key.startsWith("__schema")) {
          componentEntries[key] = value;
        }
      }
    }

    // rewrite __schema refs → named component refs
    // createSchema returns refs as "#/components/schemas/__schemaX"
    // We need to replace ALL __schema refs in ALL component schemas, not just matching ones
    const rewriteAllSchemaRefs = (obj: unknown): unknown => {
      if (!obj || typeof obj !== "object") return obj;
      if (Array.isArray(obj)) return obj.map(rewriteAllSchemaRefs);
      const result: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        if (
          k === "$ref" &&
          typeof v === "string" &&
          v.startsWith("#/components/schemas/__schema")
        ) {
          const refName = v.replace("#/components/schemas/", "");
          result[k] = `#/components/schemas/${name}_${refName}`;
        } else {
          result[k] = rewriteAllSchemaRefs(v);
        }
      }
      return result;
    };
    for (const [defName, defSchema] of Object.entries(componentEntries)) {
      const uniqueName = `${name}_${defName}`;
      spec.components.schemas[uniqueName] = rewriteAllSchemaRefs(defSchema);
      finalSchema = rewriteAllSchemaRefs(finalSchema);
    }

    spec.components.schemas[name] = finalSchema;
    console.log(`  OK  ${name}`);
  } catch (err) {
    console.error(`  ERR ${name}: ${err}`);
  }
}

// ─── Reusable parameter builders for split analytics endpoints ──────────

function windowParams() {
  return [
    {
      name: "from",
      in: "query",
      schema: { type: "integer" },
      description: "Start timestamp (Unix ms)",
    },
    {
      name: "to",
      in: "query",
      schema: { type: "integer" },
      description: "End timestamp (Unix ms)",
    },
    {
      name: "timeZone",
      in: "query",
      schema: { type: "string" },
      description: "IANA timezone identifier (e.g. America/New_York)",
    },
  ];
}

function intervalParam() {
  return {
    name: "interval",
    in: "query",
    schema: {
      type: "string",
      enum: ["minute", "hour", "day", "week", "month"],
    },
    description: "Time bucket granularity for aggregation",
  };
}

function limitParam(desc: string, defaultVal?: number) {
  return {
    name: "limit",
    in: "query",
    schema: {
      type: "integer",
      ...(defaultVal !== undefined ? { default: defaultVal } : {}),
    },
    description: desc,
  };
}

function dashboardFilterParams() {
  return [
    {
      name: "country",
      in: "query",
      schema: { type: "string" },
      description: "Filter by country code",
    },
    {
      name: "device",
      in: "query",
      schema: { type: "string" },
      description: "Filter by device type",
    },
    {
      name: "browser",
      in: "query",
      schema: { type: "string" },
      description: "Filter by browser name",
    },
    {
      name: "path",
      in: "query",
      schema: { type: "string" },
      description: "Filter by page pathname",
    },
    {
      name: "query",
      in: "query",
      schema: { type: "string" },
      description: "Filter by page query string",
    },
    {
      name: "title",
      in: "query",
      schema: { type: "string" },
      description: "Filter by page title",
    },
    {
      name: "hostname",
      in: "query",
      schema: { type: "string" },
      description: "Filter by page hostname",
    },
    {
      name: "entry",
      in: "query",
      schema: { type: "string" },
      description: "Filter by session entry path",
    },
    {
      name: "exit",
      in: "query",
      schema: { type: "string" },
      description: "Filter by session exit path",
    },
    {
      name: "sourceDomain",
      in: "query",
      schema: { type: "string" },
      description: "Filter by referrer domain",
    },
    {
      name: "sourceLink",
      in: "query",
      schema: { type: "string" },
      description: "Filter by referrer URL",
    },
  ];
}

function clientFilterParams() {
  return [
    {
      name: "clientBrowser",
      in: "query",
      schema: { type: "string" },
      description: "Filter by client-reported browser",
    },
    {
      name: "clientOsVersion",
      in: "query",
      schema: { type: "string" },
      description: "Filter by client OS version",
    },
    {
      name: "clientDeviceType",
      in: "query",
      schema: { type: "string" },
      description: "Filter by client device type",
    },
    {
      name: "clientLanguage",
      in: "query",
      schema: { type: "string" },
      description: "Filter by client language",
    },
    {
      name: "clientScreenSize",
      in: "query",
      schema: { type: "string" },
      description: "Filter by screen size (e.g. 1920x1080)",
    },
  ];
}

function geoFilterParams() {
  return [
    {
      name: "geoCountry",
      in: "query",
      schema: { type: "string" },
      description: "Filter by geo country",
    },
    {
      name: "geoRegion",
      in: "query",
      schema: { type: "string" },
      description: "Filter by geo region",
    },
    {
      name: "geoCity",
      in: "query",
      schema: { type: "string" },
      description: "Filter by geo city",
    },
    {
      name: "geoContinent",
      in: "query",
      schema: { type: "string" },
      description: "Filter by geo continent",
    },
    {
      name: "geoTimezone",
      in: "query",
      schema: { type: "string" },
      description: "Filter by geo timezone",
    },
    {
      name: "geoOrganization",
      in: "query",
      schema: { type: "string" },
      description: "Filter by geo organization",
    },
  ];
}

function allFilters() {
  return [
    ...dashboardFilterParams(),
    ...clientFilterParams(),
    ...geoFilterParams(),
    {
      name: "eventPayloadFilters",
      in: "query",
      schema: { type: "string" },
      description: "JSON-encoded array of event payload filter rules",
    },
  ];
}

function paginationParams() {
  return [
    {
      name: "page",
      in: "query",
      schema: { type: "integer", minimum: 1 },
      description: "Page number (1-indexed)",
    },
    {
      name: "pageSize",
      in: "query",
      schema: { type: "integer" },
      description: "Results per page",
    },
    {
      name: "sortBy",
      in: "query",
      schema: { type: "string" },
      description: "Sort field name",
    },
    {
      name: "sortDir",
      in: "query",
      schema: { type: "string", enum: ["asc", "desc"] },
      description: "Sort direction",
    },
    {
      name: "search",
      in: "query",
      schema: { type: "string" },
      description: "Search/filter text",
    },
  ];
}

function analyticsEndpoint(
  pathSuffix: string,
  operationId: string,
  summary: string,
  description: string,
  queryEnum: string[],
  params: unknown[],
  responseSchema: string,
  responseExample: unknown,
  extraResponses: Record<string, unknown> = {},
) {
  const base = `/api/v1/sites/{siteId}/analytics/${pathSuffix}`;
  return {
    [base]: {
      parameters: [{ $ref: "#/components/parameters/siteId" }],
      get: {
        operationId,
        summary,
        description,
        tags: ["Analytics"],
        parameters: [
          {
            name: "queryName",
            in: "query",
            required: true,
            schema: { type: "string", enum: queryEnum },
            description: "Analytics query name",
          },
          ...params,
        ],
        responses: {
          "200": {
            description: "Analytics query result",
            content: {
              "application/json": {
                schema: { $ref: `#/components/schemas/${responseSchema}` },
                example: responseExample,
              },
            },
          },
          "400": { $ref: "#/components/responses/BadRequest" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "404": { $ref: "#/components/responses/NotFound" },
          ...extraResponses,
        },
      },
    },
  };
}

function buildPaths(): Record<string, unknown> {
  // ── Health & Ingestion ─────────────────────────────────────────────────

  const healthz = {
    "/healthz": {
      get: {
        operationId: "getHealth",
        summary: "Health check",
        description:
          "Returns service health status. No authentication required.",
        tags: ["Health"],
        security: [],
        responses: {
          "200": {
            description: "Service is healthy",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    service: { type: "string", example: "insightflare" },
                    timestamp: { type: "string", format: "date-time" },
                    bindings: {
                      type: "object",
                      properties: {
                        kv: { type: "boolean" },
                        d1: { type: "boolean" },
                        durableObjects: { type: "boolean" },
                      },
                    },
                  },
                },
                example: {
                  service: "insightflare",
                  timestamp: "2026-06-26T12:00:00Z",
                  bindings: { kv: true, d1: true, durableObjects: true },
                },
              },
            },
          },
        },
      },
    },
  };

  const collect = {
    "/collect": {
      post: {
        operationId: "collectEvent",
        summary: "Collect tracking event",
        description:
          "Ingests a tracking event from the InsightFlare client SDK. Always returns 204.",
        tags: ["Ingestion"],
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/TrackerClientPayload" },
            },
          },
        },
        responses: {
          "204": {
            description: "Event accepted (always returned, even if dropped)",
          },
          "400": { $ref: "#/components/responses/BadRequest" },
        },
      },
    },
  };

  // ── Sites ──────────────────────────────────────────────────────────────

  const sites = {
    "/api/v1/sites": {
      get: {
        operationId: "listSites",
        summary: "List sites",
        description:
          "Returns all sites accessible by the authenticated API key within its team.",
        tags: ["Sites"],
        responses: {
          "200": {
            description: "List of sites",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SiteListResponse" },
                example: {
                  ok: true,
                  requestId: "abc123def456",
                  timestamp: "2026-06-26T12:00:00Z",
                  data: [
                    {
                      id: "550e8400-e29b-41d4-a716-446655440000",
                      teamId: "team-1",
                      name: "My Site",
                      domain: "example.com",
                      publicEnabled: false,
                      publicSlug: "",
                      createdAt: 1719403200,
                      updatedAt: 1719403200,
                    },
                  ],
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
        },
      },
      post: {
        operationId: "createSite",
        summary: "Create site",
        description: "Creates a new site within the API key's team.",
        tags: ["Sites"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/SiteCreateInput" },
            },
          },
        },
        responses: {
          "201": {
            description: "Site created",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SiteResponse" },
                example: {
                  ok: true,
                  requestId: "abc123def456",
                  timestamp: "2026-06-26T12:00:00Z",
                  data: {
                    id: "550e8400-e29b-41d4-a716-446655440000",
                    teamId: "team-1",
                    name: "My Site",
                    domain: "example.com",
                    publicEnabled: false,
                    publicSlug: "",
                    createdAt: 1719403200,
                    updatedAt: 1719403200,
                  },
                },
              },
            },
          },
          "400": { $ref: "#/components/responses/BadRequest" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
        },
      },
    },
    "/api/v1/sites/{siteId}": {
      parameters: [{ $ref: "#/components/parameters/siteId" }],
      get: {
        operationId: "getSite",
        summary: "Get site",
        description: "Returns a single site by ID.",
        tags: ["Sites"],
        responses: {
          "200": {
            description: "Site details",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SiteResponse" },
                example: {
                  ok: true,
                  requestId: "abc123def456",
                  timestamp: "2026-06-26T12:00:00Z",
                  data: {
                    id: "550e8400-e29b-41d4-a716-446655440000",
                    teamId: "team-1",
                    name: "My Site",
                    domain: "example.com",
                    publicEnabled: false,
                    publicSlug: "",
                    createdAt: 1719403200,
                    updatedAt: 1719403200,
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
      patch: {
        operationId: "updateSite",
        summary: "Update site",
        description: "Updates site fields. Only provided fields are changed.",
        tags: ["Sites"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/SiteUpdateInput" },
            },
          },
        },
        responses: {
          "200": {
            description: "Site updated",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SiteResponse" },
                example: {
                  ok: true,
                  requestId: "abc123def456",
                  timestamp: "2026-06-26T12:00:00Z",
                  data: {
                    id: "550e8400-e29b-41d4-a716-446655440000",
                    teamId: "team-1",
                    name: "Updated Site",
                    domain: "example.com",
                    publicEnabled: false,
                    publicSlug: "",
                    createdAt: 1719403200,
                    updatedAt: 1719490000,
                  },
                },
              },
            },
          },
          "400": { $ref: "#/components/responses/BadRequest" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
      delete: {
        operationId: "deleteSite",
        summary: "Delete site",
        description: "Permanently deletes a site and all associated data.",
        tags: ["Sites"],
        responses: {
          "204": {
            description: "Site deleted",
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
    },
  };

  // ── Site Config ────────────────────────────────────────────────────────

  const siteConfig = {
    "/api/v1/sites/{siteId}/config": {
      parameters: [{ $ref: "#/components/parameters/siteId" }],
      get: {
        operationId: "getSiteConfig",
        summary: "Get site config",
        description: "Returns the tracking script configuration for a site.",
        tags: ["Site Config"],
        responses: {
          "200": {
            description: "Site configuration",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SiteConfigResponse" },
                example: {
                  ok: true,
                  requestId: "abc123def456",
                  timestamp: "2026-06-26T12:00:00Z",
                  data: {
                    siteDomain: "example.com",
                    trackPaths: true,
                    trackQuery: true,
                    trackHash: false,
                    trackEvents: true,
                    trackEngagement: true,
                    trackWebVitals: true,
                    trackingStrength: "smart",
                    domains: ["example.com"],
                    outboundLinks: true,
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
      patch: {
        operationId: "updateSiteConfig",
        summary: "Update site config",
        description:
          "Updates the tracking script configuration for a site. Only provided fields are changed.",
        tags: ["Site Config"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/SiteConfigUpdateInput" },
            },
          },
        },
        responses: {
          "200": {
            description: "Config updated",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SiteConfigResponse" },
                example: {
                  ok: true,
                  requestId: "abc123def456",
                  timestamp: "2026-06-26T12:00:00Z",
                  data: {
                    siteDomain: "example.com",
                    trackPaths: true,
                    trackQuery: true,
                    trackHash: false,
                    trackEvents: true,
                    trackEngagement: true,
                    trackWebVitals: true,
                    trackingStrength: "smart",
                    domains: ["example.com"],
                    outboundLinks: true,
                  },
                },
              },
            },
          },
          "400": { $ref: "#/components/responses/BadRequest" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/api/v1/sites/{siteId}/script-snippet": {
      parameters: [{ $ref: "#/components/parameters/siteId" }],
      get: {
        operationId: "getScriptSnippet",
        summary: "Get script snippet",
        description:
          "Returns the HTML snippet to embed the tracking script on a website.",
        tags: ["Site Config"],
        responses: {
          "200": {
            description: "Script snippet",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ScriptSnippetResponse" },
                example: {
                  ok: true,
                  requestId: "abc123def456",
                  timestamp: "2026-06-26T12:00:00Z",
                  data: {
                    snippet:
                      '<script defer src="https://insight.ravelloh.com/script.js" data-site-id="550e8400-e29b-41d4-a716-446655440000"></script>',
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
    },
  };

  // ── Split Analytics Endpoints ──────────────────────────────────────────

  const overviewQueries = [
    "overview",
    "overview-page-path",
    "overview-page-title",
    "overview-page-hostname",
    "overview-page-entry",
    "overview-page-exit",
    "overview-source-domain",
    "overview-source-link",
    "overview-client-browser",
    "overview-client-os-version",
    "overview-client-device-type",
    "overview-client-language",
    "overview-client-screen-size",
    "overview-geo-country",
    "overview-geo-region",
    "overview-geo-city",
    "overview-geo-continent",
    "overview-geo-timezone",
    "overview-geo-organization",
    "overview-geo-points",
  ];

  const envelopeExample = {
    ok: true,
    requestId: "abc123def456",
    timestamp: "2026-06-26T12:00:00Z",
  };

  const analyticsOverview = analyticsEndpoint(
    "overview",
    "queryOverview",
    "Query overview metrics",
    "Returns overview metrics and dimension breakdowns (page, source, client, geo).",
    overviewQueries,
    [
      ...windowParams(),
      intervalParam(),
      limitParam("Max results per dimension group", 10),
      ...allFilters(),
      {
        name: "includeChange",
        in: "query",
        schema: { type: "boolean" },
        description: "Include period-over-period change rates",
      },
      {
        name: "includeDetail",
        in: "query",
        schema: { type: "boolean" },
        description: "Include detailed breakdown data",
      },
      {
        name: "applyGeoFilter",
        in: "query",
        schema: { type: "boolean" },
        description: "Apply geo filters to geo-points query",
      },
    ],
    "OverviewResponse",
    {
      ...envelopeExample,
      data: {
        views: 12500,
        sessions: 8300,
        visitors: 6100,
        bounces: 3200,
        totalDurationMs: 4200000,
        avgDurationMs: 506,
        bounceRate: 0.386,
        approximateVisitors: false,
      },
    },
  );

  const analyticsTrend = analyticsEndpoint(
    "trend",
    "queryTrend",
    "Query time-series trend",
    "Returns time-bucketed views, visitors, and sessions over time.",
    ["trend"],
    [...windowParams(), intervalParam(), ...allFilters()],
    "TrendResponse",
    {
      ...envelopeExample,
      data: {
        interval: "day",
        data: [
          {
            bucket: 1719403200000,
            timestampMs: 1719403200000,
            views: 420,
            visitors: 310,
            sessions: 350,
          },
        ],
      },
    },
  );

  const analyticsPages = analyticsEndpoint(
    "pages",
    "queryPages",
    "Query page analytics",
    "Returns page-level analytics including views, sessions, and optional trend data.",
    ["pages", "pages-dashboard", "page-hash", "page-query"],
    [
      ...windowParams(),
      intervalParam(),
      limitParam("Max results", 20),
      ...allFilters(),
      ...paginationParams(),
      {
        name: "details",
        in: "query",
        schema: { type: "boolean" },
        description: "Include per-page trend breakdown",
      },
    ],
    "PagesResponse",
    {
      ...envelopeExample,
      data: {
        data: [{ pathname: "/blog/hello-world", views: 850, sessions: 720 }],
      },
    },
  );

  const analyticsReferrers = analyticsEndpoint(
    "referrers",
    "queryReferrers",
    "Query referrer analytics",
    "Returns referrer sources with views, sessions, and visitor counts.",
    ["referrers"],
    [
      ...windowParams(),
      limitParam("Max results", 20),
      ...allFilters(),
      {
        name: "fullUrl",
        in: "query",
        schema: { type: "boolean" },
        description: "Show full referrer URLs instead of domains only",
      },
    ],
    "ReferrersResponse",
    {
      ...envelopeExample,
      data: {
        data: [
          { referrer: "google.com", views: 1200, sessions: 980, visitors: 850 },
        ],
      },
    },
  );

  const analyticsEvents = analyticsEndpoint(
    "events",
    "queryEvents",
    "Query event analytics",
    "Returns event-related data: types, summary, trend, records, and field values.",
    [
      "event-types",
      "events-summary",
      "events-trend",
      "events-records",
      "event-type-field-values",
      "event-type-detail",
      "event-record-detail",
    ],
    [
      ...windowParams(),
      intervalParam(),
      limitParam("Max results", 20),
      ...allFilters(),
      ...paginationParams(),
      {
        name: "eventName",
        in: "query",
        schema: { type: "string" },
        description: "Filter by event name",
      },
      {
        name: "eventId",
        in: "query",
        schema: { type: "string", format: "uuid" },
        description: "Specific event record ID",
      },
      {
        name: "fieldPath",
        in: "query",
        schema: { type: "string" },
        description: "Event payload field path (e.g. /payload/plan)",
      },
      {
        name: "fieldValueType",
        in: "query",
        schema: {
          type: "string",
          enum: ["string", "number", "boolean", "null", "object", "array"],
        },
        description: "Expected value type for field filtering",
      },
    ],
    "EventsSummaryResponse",
    {
      ...envelopeExample,
      data: {
        summary: {
          events: 5200,
          eventTypes: 12,
          sessions: 3100,
          visitors: 2400,
          avgEventsPerSession: 1.68,
        },
        cards: {
          event: {
            name: [
              { label: "signup", views: 320, sessions: 310, visitors: 300 },
            ],
          },
          page: { path: [], title: [], hostname: [] },
        },
      },
    },
  );

  const analyticsVisitors = analyticsEndpoint(
    "visitors",
    "queryVisitors",
    "Query visitor analytics",
    "Returns visitor list with pagination, or individual visitor detail.",
    ["visitors", "visitor-detail"],
    [
      ...windowParams(),
      ...allFilters(),
      ...paginationParams(),
      {
        name: "visitorId",
        in: "query",
        schema: { type: "string", format: "uuid" },
        description: "Specific visitor ID for detail view",
      },
    ],
    "VisitorsResponse",
    {
      ...envelopeExample,
      data: {
        data: [
          {
            visitorId: "550e8400-e29b-41d4-a716-446655440000",
            firstSeenAt: 1719403200,
            lastSeenAt: 1719489600,
            views: 12,
            sessions: 3,
            country: "US",
          },
        ],
      },
      meta: {
        page: 1,
        pageSize: 80,
        returned: 1,
        hasMore: false,
        nextPage: null,
      },
    },
  );

  const analyticsSessions = analyticsEndpoint(
    "sessions",
    "querySessions",
    "Query session analytics",
    "Returns session list with pagination, or individual session detail.",
    ["sessions", "session-detail"],
    [
      ...windowParams(),
      ...allFilters(),
      ...paginationParams(),
      {
        name: "sessionId",
        in: "query",
        schema: { type: "string", format: "uuid" },
        description: "Specific session ID for detail view",
      },
    ],
    "SessionsResponse",
    {
      ...envelopeExample,
      data: {
        data: [
          {
            sessionId: "660e8400-e29b-41d4-a716-446655440000",
            visitorId: "550e8400-e29b-41d4-a716-446655440000",
            startedAt: 1719403200,
            endedAt: 1719406800,
            durationMs: 3600000,
            active: false,
            views: 8,
            events: 2,
            bounce: false,
            entryPath: "/",
            exitPath: "/pricing",
            country: "US",
            browser: "Chrome",
            os: "Windows",
            deviceType: "desktop",
          },
        ],
      },
      meta: {
        page: 1,
        pageSize: 80,
        returned: 1,
        hasMore: false,
        nextPage: null,
      },
    },
  );

  const analyticsRetention = analyticsEndpoint(
    "retention",
    "queryRetention",
    "Query retention analysis",
    "Returns cohort-based retention analysis over time.",
    ["retention"],
    [
      ...windowParams(),
      ...allFilters(),
      {
        name: "granularity",
        in: "query",
        schema: {
          type: "string",
          enum: ["minute", "hour", "day", "week", "month"],
        },
        description: "Cohort period granularity (default: week)",
      },
    ],
    "RetentionResponse",
    {
      ...envelopeExample,
      data: {
        granularity: "week",
        cohorts: [
          {
            bucket: 1718400000000,
            size: 150,
            periods: [
              { index: 0, visitors: 150, rate: 1.0 },
              { index: 1, visitors: 68, rate: 0.453 },
            ],
          },
        ],
      },
    },
  );

  const analyticsPerformance = analyticsEndpoint(
    "performance",
    "queryPerformance",
    "Query Web Vitals performance",
    "Returns Core Web Vitals metrics (TTFB, FCP, LCP, CLS, INP) with trends and breakdowns.",
    ["performance"],
    [
      ...windowParams(),
      intervalParam(),
      limitParam("Max results per group", 10),
      ...allFilters(),
    ],
    "PerformanceResponse",
    {
      ...envelopeExample,
      data: {
        interval: "day",
        summaries: {
          ttfb: { avg: 120, p50: 95, p75: 180, p95: 350, samples: 5000 },
          fcp: { avg: 800, p50: 650, p75: 1100, p95: 2200, samples: 5000 },
          lcp: { avg: 1200, p50: 950, p75: 1800, p95: 3500, samples: 5000 },
          cls: { avg: 0.05, p50: 0.03, p75: 0.08, p95: 0.18, samples: 5000 },
          inp: { avg: 85, p50: 60, p75: 120, p95: 280, samples: 5000 },
        },
        trends: {},
        routes: [],
        countries: [],
      },
    },
  );

  const analyticsTechnology = analyticsEndpoint(
    "technology",
    "queryTechnology",
    "Query technology breakdowns",
    "Returns browser, OS, referrer, and UTM technology breakdowns and cross-analysis.",
    [
      "browser-trend",
      "browser-engine-trend",
      "browser-version-breakdown",
      "browser-cross-breakdown",
      "browser-radar",
      "referrer-radar",
      "referrer-dimension-trend",
      "client-dimension-trend",
      "utm-dimension-trend",
      "client-cross-breakdown",
      "utm-source",
      "utm-medium",
      "utm-campaign",
      "utm-term",
      "utm-content",
    ],
    [
      ...windowParams(),
      intervalParam(),
      limitParam("Max results per group", 8),
      ...allFilters(),
      {
        name: "dimension",
        in: "query",
        schema: { type: "string" },
        description: "Dimension key for trend queries",
      },
      {
        name: "primaryDimension",
        in: "query",
        schema: { type: "string" },
        description: "Primary dimension for cross-breakdown",
      },
      {
        name: "secondaryDimension",
        in: "query",
        schema: { type: "string" },
        description: "Secondary dimension for cross-breakdown",
      },
      {
        name: "primaryLimit",
        in: "query",
        schema: { type: "integer" },
        description: "Max primary dimension groups (1-12)",
      },
      {
        name: "secondaryLimit",
        in: "query",
        schema: { type: "integer" },
        description: "Max secondary dimension groups (1-8)",
      },
      {
        name: "browserLimit",
        in: "query",
        schema: { type: "integer" },
        description: "Max browser groups (0 = no limit)",
      },
      {
        name: "versionLimit",
        in: "query",
        schema: { type: "integer" },
        description: "Max version groups per browser (1-8)",
      },
      {
        name: "osLimit",
        in: "query",
        schema: { type: "integer" },
        description: "Max OS groups (1-8)",
      },
      {
        name: "deviceTypeLimit",
        in: "query",
        schema: { type: "integer" },
        description: "Max device type groups (1-8)",
      },
    ],
    "ShareTrendResponse",
    {
      ...envelopeExample,
      data: {
        interval: "day",
        series: [
          {
            key: "chrome",
            label: "Chrome",
            views: 5200,
            visitors: 3800,
            sessions: 4100,
          },
        ],
        data: [
          {
            bucket: 1719403200000,
            timestampMs: 1719403200000,
            totalVisitors: 6100,
            visitorsBySeries: { chrome: 3800 },
          },
        ],
      },
    },
  );

  const analyticsFunnels = analyticsEndpoint(
    "funnels",
    "queryFunnels",
    "Query funnel analytics",
    "Returns saved funnel definitions and analysis results.",
    ["funnels"],
    [
      ...windowParams(),
      ...allFilters(),
      {
        name: "id",
        in: "query",
        schema: { type: "string", format: "uuid" },
        description: "Specific funnel ID for detail view",
      },
    ],
    "FunnelAnalyticsResponse",
    {
      ...envelopeExample,
      data: {
        funnels: [
          {
            id: "770e8400-e29b-41d4-a716-446655440000",
            siteId: "site-123",
            name: "Signup Flow",
            steps: [
              { type: "pageview", value: "/signup" },
              { type: "pageview", value: "/welcome" },
            ],
            createdAt: 1719403200,
            updatedAt: 1719403200,
          },
        ],
      },
    },
  );

  const analyticsFilterOptions = analyticsEndpoint(
    "filter-options",
    "queryFilterOptions",
    "Query filter options",
    "Returns available filter values for a given filter dimension.",
    ["filter-options"],
    [
      ...windowParams(),
      ...allFilters(),
      {
        name: "filterKey",
        in: "query",
        schema: { type: "string" },
        required: true,
        description: "Filter dimension key (e.g. country, browser, path)",
      },
      limitParam("Max filter options returned", 200),
    ],
    "FilterOptionsResponse",
    {
      ...envelopeExample,
      data: {
        data: [
          { value: "US", label: "United States" },
          { value: "GB", label: "United Kingdom" },
        ],
      },
    },
  );

  const analyticsGeo = analyticsEndpoint(
    "geo",
    "queryGeo",
    "Query geo analytics",
    "Returns geographic breakdowns: country/region/city tabs and map points.",
    ["countries", "filter-options"],
    [...windowParams(), limitParam("Max results", 20), ...allFilters()],
    "GeoTabResponse",
    {
      ...envelopeExample,
      data: {
        data: [
          {
            value: "US",
            label: "United States",
            views: 5200,
            sessions: 3800,
            visitors: 3100,
          },
        ],
      },
    },
  );

  // ── Other analytics endpoints (non-query) ─────────────────────────────

  const analyticsFunnelsAnalyze = {
    "/api/v1/sites/{siteId}/analytics/funnels/analyze": {
      parameters: [{ $ref: "#/components/parameters/siteId" }],
      post: {
        operationId: "analyzeFunnel",
        summary: "Analyze funnel (ad-hoc)",
        description:
          "Runs a funnel analysis without saving the funnel definition.",
        tags: ["Analytics"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/FunnelAnalyzeInput" },
            },
          },
        },
        responses: {
          "200": {
            description: "Funnel analysis result",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/FunnelAnalyzeResponse" },
                example: {
                  ok: true,
                  requestId: "abc123def456",
                  timestamp: "2026-06-26T12:00:00Z",
                  data: {
                    totalVisitors: 1000,
                    steps: [
                      { visitors: 1000, dropoff: 0 },
                      { visitors: 450, dropoff: 550 },
                    ],
                  },
                },
              },
            },
          },
          "400": { $ref: "#/components/responses/BadRequest" },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
  };

  const analyticsBatch = {
    "/api/v1/sites/{siteId}/analytics/batch": {
      parameters: [{ $ref: "#/components/parameters/siteId" }],
      post: {
        operationId: "batchAnalytics",
        summary: "Batch analytics queries",
        description: "Executes multiple analytics queries in a single request.",
        tags: ["Analytics"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/BatchInput" },
            },
          },
        },
        responses: {
          "200": {
            description: "Batch results",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/BatchResponse" },
                example: {
                  ok: true,
                  requestId: "abc123def456",
                  timestamp: "2026-06-26T12:00:00Z",
                  data: {
                    results: [
                      {
                        queryName: "overview",
                        ok: true,
                        data: { views: 12500, sessions: 8300, visitors: 6100 },
                      },
                      {
                        queryName: "trend",
                        ok: true,
                        data: { interval: "day", data: [] },
                      },
                    ],
                  },
                },
              },
            },
          },
          "400": { $ref: "#/components/responses/BadRequest" },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
  };

  // ── Realtime ───────────────────────────────────────────────────────────

  const realtime = {
    "/api/v1/sites/{siteId}/realtime/snapshot": {
      parameters: [{ $ref: "#/components/parameters/siteId" }],
      get: {
        operationId: "getRealtimeSnapshot",
        summary: "Realtime snapshot",
        description:
          "Returns a snapshot of recent real-time activity for a site.",
        tags: ["Realtime"],
        parameters: [
          {
            name: "from",
            in: "query",
            schema: { type: "integer" },
            description: "Start timestamp (Unix ms)",
          },
          {
            name: "to",
            in: "query",
            schema: { type: "integer" },
            description: "End timestamp (Unix ms)",
          },
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", default: 20000 },
            description: "Max events to return",
          },
        ],
        responses: {
          "200": {
            description: "Realtime snapshot",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/RealtimeSnapshotResponse",
                },
                example: {
                  ok: true,
                  requestId: "abc123def456",
                  timestamp: "2026-06-26T12:00:00Z",
                  data: {
                    activeNow: 42,
                    events: [
                      {
                        visitorId: "v1",
                        sessionId: "s1",
                        kind: "pageview",
                        pathname: "/",
                        timestamp: 1719403200,
                      },
                    ],
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/api/v1/sites/{siteId}/realtime/active": {
      parameters: [{ $ref: "#/components/parameters/siteId" }],
      get: {
        operationId: "getRealtimeActiveVisitors",
        summary: "Active visitor count",
        description:
          "Returns the number of visitors currently active on the site.",
        tags: ["Realtime"],
        responses: {
          "200": {
            description: "Active visitor count",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ActiveVisitorsResponse" },
                example: {
                  ok: true,
                  requestId: "abc123def456",
                  timestamp: "2026-06-26T12:00:00Z",
                  data: { activeNow: 42 },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
    },
  };

  // ── Team ───────────────────────────────────────────────────────────────

  const team = {
    "/api/v1/team/dashboard": {
      get: {
        operationId: "getTeamDashboard",
        summary: "Team dashboard",
        description: "Returns an aggregated dashboard for the API key's team.",
        tags: ["Analytics"],
        parameters: [
          {
            name: "from",
            in: "query",
            required: true,
            schema: { type: "integer" },
            description: "Start timestamp (Unix ms)",
          },
          {
            name: "to",
            in: "query",
            required: true,
            schema: { type: "integer" },
            description: "End timestamp (Unix ms)",
          },
          {
            name: "interval",
            in: "query",
            schema: {
              type: "string",
              enum: ["minute", "hour", "day", "week", "month"],
            },
            description: "Time bucket granularity",
          },
          {
            name: "timeZone",
            in: "query",
            schema: { type: "string" },
            description: "IANA timezone identifier",
          },
        ],
        responses: {
          "200": {
            description: "Team dashboard data",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/TeamDashboardResponse" },
                example: {
                  ok: true,
                  requestId: "abc123def456",
                  timestamp: "2026-06-26T12:00:00Z",
                  data: {
                    sites: [
                      {
                        siteId: "550e8400",
                        name: "My Site",
                        domain: "example.com",
                        views: 12500,
                        visitors: 6100,
                        sessions: 8300,
                      },
                    ],
                  },
                },
              },
            },
          },
          "400": { $ref: "#/components/responses/BadRequest" },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
  };

  // ── Merge all paths ────────────────────────────────────────────────────

  return {
    ...healthz,
    ...collect,
    ...sites,
    ...siteConfig,
    ...analyticsOverview,
    ...analyticsTrend,
    ...analyticsPages,
    ...analyticsReferrers,
    ...analyticsEvents,
    ...analyticsVisitors,
    ...analyticsSessions,
    ...analyticsRetention,
    ...analyticsPerformance,
    ...analyticsTechnology,
    ...analyticsFunnels,
    ...analyticsFilterOptions,
    ...analyticsGeo,
    ...analyticsFunnelsAnalyze,
    ...analyticsBatch,
    ...realtime,
    ...team,
  };
}

function buildSpec(): OpenAPISpec {
  return {
    openapi: "3.1.0",
    info: {
      title: "InsightFlare API",
      description:
        "InsightFlare is a privacy-focused web analytics platform. This API allows programmatic management of sites and retrieval of analytics data.\n\n## Authentication\n\nAll `/api/v1/` endpoints require an API key passed via the `Authorization` header:\n\n```\nAuthorization: Bearer ifk_live_<prefix>.<secret>\n```\n\n## Timestamps\n\nAll timestamps in query parameters (`from`, `to`) are **Unix milliseconds**.\nTimestamps in response objects are **Unix seconds** unless the field name contains `Ms`.",
      version: "1.0.0",
      contact: {
        name: "InsightFlare",
        url: "https://github.com/ravelloh/InsightFlare",
      },
      license: {
        name: "MIT",
        url: "https://github.com/ravelloh/InsightFlare/blob/main/LICENSE",
      },
    },
    servers: [
      { url: "https://insightflare.example.com", description: "Production" },
    ],
    security: [{ BearerAuth: [] }],
    tags: [
      {
        name: "Health",
        description: "Health check endpoint (no auth required)",
      },
      {
        name: "Ingestion",
        description: "Tracking data collection (no auth required)",
      },
      {
        name: "Sites",
        description: "Create, read, update, and delete analytics sites",
      },
      {
        name: "Site Config",
        description: "Manage site tracking configuration and embed snippets",
      },
      {
        name: "Analytics",
        description: "Query analytics data and team dashboards",
      },
      {
        name: "Realtime",
        description: "Real-time visitor activity and active visitor counts",
      },
    ],
    paths: {},
    components: {
      schemas: {},
      securitySchemes: {
        BearerAuth: {
          type: "http",
          scheme: "bearer",
          description: "API key in the format `ifk_live_<prefix>.<secret>`.",
        },
      },
      parameters: {
        siteId: {
          name: "siteId",
          in: "path",
          required: true,
          schema: { type: "string", format: "uuid" },
          description: "Unique site identifier",
        },
      },
      responses: {
        BadRequest: {
          description: "Bad request",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorEnvelope" },
            },
          },
        },
        Unauthorized: {
          description: "Authentication failed",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorEnvelope" },
            },
          },
        },
        Forbidden: {
          description: "Insufficient permissions",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorEnvelope" },
            },
          },
        },
        NotFound: {
          description: "Resource not found",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorEnvelope" },
            },
          },
        },
        TooManyRequests: {
          description: "Rate limit exceeded",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorEnvelope" },
            },
          },
        },
      },
    },
  };
}

async function main() {
  console.log("Generating OpenAPI spec from Zod schemas...\n");

  const spec = buildSpec();

  // Convert all registered schemas
  const schemas = getAllRegisteredSchemas();
  console.log(`Found ${schemas.length} registered schemas:`);

  for (const { name, schema } of schemas) {
    convertSchema(spec, name, schema);
  }

  // Build paths
  spec.paths = buildPaths();
  console.log(`\nBuilt ${Object.keys(spec.paths).length} paths`);

  // Output
  const root = resolve(import.meta.dirname, "..");
  const yamlPath = resolve(root, "docs", "openapi.yaml");
  const jsonPath = resolve(root, "docs", "openapi.json");

  writeFileSync(yamlPath, YAML.stringify(spec, { indent: 2 }), "utf8");
  writeFileSync(jsonPath, JSON.stringify(spec, null, 2), "utf8");

  // format with prettier to match project style
  try {
    execSync(`npx prettier --write "${yamlPath}" "${jsonPath}"`, {
      stdio: "pipe",
    });
  } catch {
    // prettier not available or failed — files are still valid, just unformatted
  }

  console.log(`\nGenerated:`);
  console.log(`  YAML: ${yamlPath}`);
  console.log(`  JSON: ${jsonPath}`);
}

main().catch((err) => {
  console.error("Failed to generate OpenAPI spec:", err);
  process.exit(1);
});
