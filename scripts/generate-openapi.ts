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
  queryName: string,
  operationId: string,
  summary: string,
  description: string,
  params: unknown[],
  responseSchema: string,
  responseExample: unknown,
) {
  const base = `/api/v1/sites/{siteId}/analytics/${queryName}`;
  return {
    [base]: {
      parameters: [{ $ref: "#/components/parameters/siteId" }],
      get: {
        operationId,
        summary,
        description,
        tags: ["Analytics"],
        parameters: params,
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
                    ok: { type: "boolean", const: true },
                    service: { type: "string", example: "insightflare" },
                    now: { type: "string", format: "date-time" },
                    bindings: {
                      type: "object",
                      properties: {
                        d1: { type: "boolean" },
                        durableObject: { type: "boolean" },
                        r2Archive: { type: "boolean" },
                      },
                    },
                  },
                },
                example: {
                  ok: true,
                  service: "insightflare",
                  now: "2026-06-26T12:00:00Z",
                  bindings: { d1: true, durableObject: true, r2Archive: false },
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
          "413": {
            description: "Request body too large (max 48 KB)",
          },
          "422": {
            description: "Event data validation failed",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorEnvelope" },
              },
            },
          },
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
                    siteId: "550e8400-e29b-41d4-a716-446655440000",
                    src: "https://insight.ravelloh.com/script.js?siteId=550e8400-e29b-41d4-a716-446655440000",
                    snippet:
                      '<script defer src="https://insight.ravelloh.com/script.js?siteId=550e8400-e29b-41d4-a716-446655440000"></script>',
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

  // ── Analytics Endpoints (one per queryName) ────────────────────────────
  //
  // The code uses a catch-all route where the LAST path segment is the
  // queryName (e.g. /analytics/overview → queryName="overview").
  // Each endpoint below uses a real queryName as its path segment.

  const envelopeExample = {
    ok: true,
    requestId: "abc123def456",
    timestamp: "2026-06-26T12:00:00Z",
  };

  // Common parameter sets by category
  const win = windowParams;
  const filt = allFilters;
  const int = intervalParam;
  const lim = limitParam;
  const pag = paginationParams;

  // Per-queryName endpoint config: [queryName, operationId, summary, description, params, responseSchema]
  const analyticsConfigs: Array<{
    q: string;
    op: string;
    sum: string;
    desc: string;
    params: unknown[];
    schema: string;
  }> = [
    // overview & dimension tabs
    {
      q: "overview",
      op: "queryOverview",
      sum: "Query overview metrics",
      desc: "Aggregate metrics: views, sessions, visitors, bounces, bounce rate, average duration.",
      params: [
        ...win(),
        int(),
        lim("Max results per dimension group", 10),
        ...filt(),
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
      ],
      schema: "OverviewResponse",
    },
    {
      q: "overview-page-path",
      op: "queryOverviewPagePath",
      sum: "Overview: top page paths",
      desc: "Top page paths by views.",
      params: [...win(), lim("Max results", 10), ...filt()],
      schema: "DimensionResponse",
    },
    {
      q: "overview-page-title",
      op: "queryOverviewPageTitle",
      sum: "Overview: top page titles",
      desc: "Top page titles by views.",
      params: [...win(), lim("Max results", 10), ...filt()],
      schema: "DimensionResponse",
    },
    {
      q: "overview-page-hostname",
      op: "queryOverviewPageHostname",
      sum: "Overview: top hostnames",
      desc: "Top hostnames by views.",
      params: [...win(), lim("Max results", 10), ...filt()],
      schema: "DimensionResponse",
    },
    {
      q: "overview-page-entry",
      op: "queryOverviewPageEntry",
      sum: "Overview: top entry pages",
      desc: "Top session entry pages.",
      params: [...win(), lim("Max results", 10), ...filt()],
      schema: "DimensionResponse",
    },
    {
      q: "overview-page-exit",
      op: "queryOverviewPageExit",
      sum: "Overview: top exit pages",
      desc: "Top session exit pages.",
      params: [...win(), lim("Max results", 10), ...filt()],
      schema: "DimensionResponse",
    },
    {
      q: "overview-source-domain",
      op: "queryOverviewSourceDomain",
      sum: "Overview: top referrer domains",
      desc: "Top referrer domains.",
      params: [...win(), lim("Max results", 10), ...filt()],
      schema: "DimensionResponse",
    },
    {
      q: "overview-source-link",
      op: "queryOverviewSourceLink",
      sum: "Overview: top referrer links",
      desc: "Top referrer URLs.",
      params: [...win(), lim("Max results", 10), ...filt()],
      schema: "DimensionResponse",
    },
    {
      q: "overview-client-browser",
      op: "queryOverviewClientBrowser",
      sum: "Overview: browser distribution",
      desc: "Browser distribution.",
      params: [...win(), lim("Max results", 10), ...filt()],
      schema: "DimensionResponse",
    },
    {
      q: "overview-client-os-version",
      op: "queryOverviewClientOsVersion",
      sum: "Overview: OS version distribution",
      desc: "OS version distribution.",
      params: [...win(), lim("Max results", 10), ...filt()],
      schema: "DimensionResponse",
    },
    {
      q: "overview-client-device-type",
      op: "queryOverviewClientDeviceType",
      sum: "Overview: device type distribution",
      desc: "Device type distribution.",
      params: [...win(), lim("Max results", 10), ...filt()],
      schema: "DimensionResponse",
    },
    {
      q: "overview-client-language",
      op: "queryOverviewClientLanguage",
      sum: "Overview: language distribution",
      desc: "Language distribution.",
      params: [...win(), lim("Max results", 10), ...filt()],
      schema: "DimensionResponse",
    },
    {
      q: "overview-client-screen-size",
      op: "queryOverviewClientScreenSize",
      sum: "Overview: screen size distribution",
      desc: "Screen size distribution.",
      params: [...win(), lim("Max results", 10), ...filt()],
      schema: "DimensionResponse",
    },
    {
      q: "overview-geo-country",
      op: "queryOverviewGeoCountry",
      sum: "Overview: country distribution",
      desc: "Country distribution.",
      params: [...win(), lim("Max results", 10), ...filt()],
      schema: "GeoTabResponse",
    },
    {
      q: "overview-geo-region",
      op: "queryOverviewGeoRegion",
      sum: "Overview: region distribution",
      desc: "Region distribution.",
      params: [...win(), lim("Max results", 10), ...filt()],
      schema: "GeoTabResponse",
    },
    {
      q: "overview-geo-city",
      op: "queryOverviewGeoCity",
      sum: "Overview: city distribution",
      desc: "City distribution.",
      params: [...win(), lim("Max results", 10), ...filt()],
      schema: "GeoTabResponse",
    },
    {
      q: "overview-geo-continent",
      op: "queryOverviewGeoContinent",
      sum: "Overview: continent distribution",
      desc: "Continent distribution.",
      params: [...win(), lim("Max results", 10), ...filt()],
      schema: "GeoTabResponse",
    },
    {
      q: "overview-geo-timezone",
      op: "queryOverviewGeoTimezone",
      sum: "Overview: timezone distribution",
      desc: "Timezone distribution.",
      params: [...win(), lim("Max results", 10), ...filt()],
      schema: "GeoTabResponse",
    },
    {
      q: "overview-geo-organization",
      op: "queryOverviewGeoOrganization",
      sum: "Overview: ISP/organization distribution",
      desc: "ISP/organization distribution.",
      params: [...win(), lim("Max results", 10), ...filt()],
      schema: "GeoTabResponse",
    },
    {
      q: "overview-geo-points",
      op: "queryOverviewGeoPoints",
      sum: "Overview: geo coordinate points",
      desc: "Geographic coordinate points for map rendering.",
      params: [
        ...win(),
        lim("Max results", 100),
        ...filt(),
        {
          name: "applyGeoFilter",
          in: "query",
          schema: { type: "boolean" },
          description: "Apply geo filters",
        },
      ],
      schema: "GeoPointsResponse",
    },

    // trend
    {
      q: "trend",
      op: "queryTrend",
      sum: "Query time-series trend",
      desc: "Time-bucketed views, visitors, and sessions over time.",
      params: [...win(), int(), ...filt()],
      schema: "TrendResponse",
    },

    // pages
    {
      q: "pages",
      op: "queryPages",
      sum: "Query top pages",
      desc: "Top pages ranked by views.",
      params: [
        ...win(),
        lim("Max results", 20),
        ...filt(),
        {
          name: "details",
          in: "query",
          schema: { type: "boolean" },
          description: "Include per-page trend breakdown",
        },
      ],
      schema: "PagesResponse",
    },
    {
      q: "pages-dashboard",
      op: "queryPagesDashboard",
      sum: "Query pages dashboard",
      desc: "Pages dashboard with aggregated metrics and trend.",
      params: [...win(), int(), lim("Max results", 20), ...filt(), ...pag()],
      schema: "PagesDashboardResponse",
    },
    {
      q: "page-hash",
      op: "queryPageHash",
      sum: "Query page hash fragments",
      desc: "URL hash fragment distribution.",
      params: [...win(), lim("Max results", 20), ...filt()],
      schema: "DimensionResponse",
    },
    {
      q: "page-query",
      op: "queryPageQuery",
      sum: "Query page query strings",
      desc: "URL query string distribution.",
      params: [...win(), lim("Max results", 20), ...filt()],
      schema: "DimensionResponse",
    },

    // referrers & sources
    {
      q: "referrers",
      op: "queryReferrers",
      sum: "Query referrer sources",
      desc: "Top referrer sources.",
      params: [
        ...win(),
        lim("Max results", 20),
        ...filt(),
        {
          name: "fullUrl",
          in: "query",
          schema: { type: "boolean" },
          description: "Show full referrer URL instead of domain",
        },
      ],
      schema: "ReferrersResponse",
    },
    {
      q: "countries",
      op: "queryCountries",
      sum: "Query visitor countries",
      desc: "Visitor distribution by country.",
      params: [...win(), lim("Max results", 20), ...filt()],
      schema: "GeoTabResponse",
    },
    {
      q: "utm-source",
      op: "queryUtmSource",
      sum: "Query UTM sources",
      desc: "UTM source breakdown.",
      params: [...win(), lim("Max results", 20), ...filt()],
      schema: "DimensionResponse",
    },
    {
      q: "utm-medium",
      op: "queryUtmMedium",
      sum: "Query UTM mediums",
      desc: "UTM medium breakdown.",
      params: [...win(), lim("Max results", 20), ...filt()],
      schema: "DimensionResponse",
    },
    {
      q: "utm-campaign",
      op: "queryUtmCampaign",
      sum: "Query UTM campaigns",
      desc: "UTM campaign breakdown.",
      params: [...win(), lim("Max results", 20), ...filt()],
      schema: "DimensionResponse",
    },
    {
      q: "utm-term",
      op: "queryUtmTerm",
      sum: "Query UTM terms",
      desc: "UTM term breakdown.",
      params: [...win(), lim("Max results", 20), ...filt()],
      schema: "DimensionResponse",
    },
    {
      q: "utm-content",
      op: "queryUtmContent",
      sum: "Query UTM content",
      desc: "UTM content breakdown.",
      params: [...win(), lim("Max results", 20), ...filt()],
      schema: "DimensionResponse",
    },

    // visitors & sessions
    {
      q: "visitors",
      op: "queryVisitors",
      sum: "Query visitors",
      desc: "Visitor list with pagination.",
      params: [...win(), ...filt(), ...pag()],
      schema: "VisitorsResponse",
    },
    {
      q: "visitor-detail",
      op: "queryVisitorDetail",
      sum: "Query visitor detail",
      desc: "Detailed information for a single visitor.",
      params: [
        {
          name: "visitorId",
          in: "query",
          required: true,
          schema: { type: "string", format: "uuid" },
          description: "Visitor ID",
        },
        {
          name: "timeZone",
          in: "query",
          schema: { type: "string" },
          description: "IANA timezone",
        },
      ],
      schema: "VisitorDetailResponse",
    },
    {
      q: "sessions",
      op: "querySessions",
      sum: "Query sessions",
      desc: "Session list with pagination.",
      params: [...win(), ...filt(), ...pag()],
      schema: "SessionsResponse",
    },
    {
      q: "session-detail",
      op: "querySessionDetail",
      sum: "Query session detail",
      desc: "Detailed information for a single session.",
      params: [
        {
          name: "sessionId",
          in: "query",
          required: true,
          schema: { type: "string", format: "uuid" },
          description: "Session ID",
        },
      ],
      schema: "SessionsResponse",
    },

    // events
    {
      q: "event-types",
      op: "queryEventTypes",
      sum: "Query event types",
      desc: "List all custom event types.",
      params: [...win(), lim("Max results", 20), ...filt()],
      schema: "EventTypesResponse",
    },
    {
      q: "events-summary",
      op: "queryEventsSummary",
      sum: "Query events summary",
      desc: "Custom event summary statistics.",
      params: [...win(), ...filt()],
      schema: "EventsSummaryResponse",
    },
    {
      q: "events-trend",
      op: "queryEventsTrend",
      sum: "Query events trend",
      desc: "Custom event time-series trend.",
      params: [
        ...win(),
        int(),
        lim("Max results", 12),
        ...filt(),
        {
          name: "eventName",
          in: "query",
          schema: { type: "string" },
          description: "Filter by event name",
        },
      ],
      schema: "EventsTrendResponse",
    },
    {
      q: "events-records",
      op: "queryEventsRecords",
      sum: "Query event records",
      desc: "Custom event records with pagination.",
      params: [
        ...win(),
        ...filt(),
        ...pag(),
        {
          name: "eventName",
          in: "query",
          schema: { type: "string" },
          description: "Filter by event name",
        },
      ],
      schema: "EventsSummaryResponse",
    },
    {
      q: "event-type-field-values",
      op: "queryEventTypeFieldValues",
      sum: "Query event type field values",
      desc: "Distinct field values for a specific event type.",
      params: [
        ...win(),
        lim("Max results", 25),
        ...filt(),
        {
          name: "eventName",
          in: "query",
          required: true,
          schema: { type: "string" },
          description: "Event type name",
        },
        {
          name: "fieldPath",
          in: "query",
          required: true,
          schema: { type: "string" },
          description: "Dot-notation field path",
        },
        {
          name: "fieldValueType",
          in: "query",
          required: true,
          schema: {
            type: "string",
            enum: ["string", "number", "boolean", "null", "object", "array"],
          },
          description: "Expected value type",
        },
      ],
      schema: "EventsSummaryResponse",
    },
    {
      q: "event-type-detail",
      op: "queryEventTypeDetail",
      sum: "Query event type detail",
      desc: "Detailed statistics for a specific event type.",
      params: [
        ...win(),
        int(),
        ...filt(),
        {
          name: "eventName",
          in: "query",
          required: true,
          schema: { type: "string" },
          description: "Event type name",
        },
      ],
      schema: "EventsSummaryResponse",
    },
    {
      q: "event-record-detail",
      op: "queryEventRecordDetail",
      sum: "Query event record detail",
      desc: "Detailed information for a single event record.",
      params: [
        {
          name: "eventId",
          in: "query",
          required: true,
          schema: { type: "string", format: "uuid" },
          description: "Event record ID",
        },
      ],
      schema: "EventsSummaryResponse",
    },

    // funnels
    {
      q: "funnels",
      op: "queryFunnels",
      sum: "Query funnels",
      desc: "Saved funnel definitions and analysis results.",
      params: [
        ...win(),
        ...filt(),
        {
          name: "id",
          in: "query",
          schema: { type: "string", format: "uuid" },
          description: "Funnel ID (omit to list all)",
        },
      ],
      schema: "FunnelAnalyticsResponse",
    },

    // retention & performance
    {
      q: "retention",
      op: "queryRetention",
      sum: "Query retention",
      desc: "Cohort-based retention analysis.",
      params: [
        ...win(),
        ...filt(),
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
      schema: "RetentionResponse",
    },
    {
      q: "performance",
      op: "queryPerformance",
      sum: "Query Web Vitals",
      desc: "Core Web Vitals metrics (TTFB, FCP, LCP, CLS, INP).",
      params: [...win(), int(), lim("Max results per group", 10), ...filt()],
      schema: "PerformanceResponse",
    },
    {
      q: "filter-options",
      op: "queryFilterOptions",
      sum: "Query filter options",
      desc: "Available filter values for a given dimension.",
      params: [
        ...win(),
        ...filt(),
        {
          name: "filterKey",
          in: "query",
          required: true,
          schema: { type: "string" },
          description: "Filter dimension key (e.g. country, browser, path)",
        },
        lim("Max results", 200),
      ],
      schema: "FilterOptionsResponse",
    },

    // technology
    {
      q: "browser-trend",
      op: "queryBrowserTrend",
      sum: "Query browser trend",
      desc: "Browser usage trends over time.",
      params: [...win(), int(), lim("Max results", 8), ...filt()],
      schema: "ShareTrendResponse",
    },
    {
      q: "browser-engine-trend",
      op: "queryBrowserEngineTrend",
      sum: "Query browser engine trend",
      desc: "Browser engine trends.",
      params: [...win(), int(), lim("Max results", 8), ...filt()],
      schema: "ShareTrendResponse",
    },
    {
      q: "browser-version-breakdown",
      op: "queryBrowserVersionBreakdown",
      sum: "Query browser version breakdown",
      desc: "Browser version distribution.",
      params: [
        ...win(),
        ...filt(),
        {
          name: "browserLimit",
          in: "query",
          schema: { type: "integer" },
          description: "Max browsers (0 = no limit)",
        },
        {
          name: "versionLimit",
          in: "query",
          schema: { type: "integer" },
          description: "Max versions per browser (1-8)",
        },
      ],
      schema: "BrowserVersionBreakdownResponse",
    },
    {
      q: "browser-cross-breakdown",
      op: "queryBrowserCrossBreakdown",
      sum: "Query browser cross-breakdown",
      desc: "Browser × OS cross-tabulation.",
      params: [
        ...win(),
        ...filt(),
        {
          name: "browserLimit",
          in: "query",
          schema: { type: "integer" },
          description: "Max browsers (1-12)",
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
          description: "Max device types (1-8)",
        },
      ],
      schema: "CrossBreakdownResponse",
    },
    {
      q: "browser-radar",
      op: "queryBrowserRadar",
      sum: "Query browser radar",
      desc: "Multi-axis browser comparison radar chart.",
      params: [...win(), ...filt()],
      schema: "RadarResponse",
    },
    {
      q: "referrer-radar",
      op: "queryReferrerRadar",
      sum: "Query referrer radar",
      desc: "Multi-axis referrer comparison radar chart.",
      params: [...win(), lim("Max results", 8), ...filt()],
      schema: "RadarResponse",
    },
    {
      q: "referrer-dimension-trend",
      op: "queryReferrerDimensionTrend",
      sum: "Query referrer dimension trend",
      desc: "Referrer dimension trends over time.",
      params: [...win(), int(), lim("Max results", 8), ...filt()],
      schema: "ShareTrendResponse",
    },
    {
      q: "client-dimension-trend",
      op: "queryClientDimensionTrend",
      sum: "Query client dimension trend",
      desc: "Client dimension (browser/OS/device) trends.",
      params: [
        ...win(),
        int(),
        lim("Max results", 8),
        ...filt(),
        {
          name: "dimension",
          in: "query",
          schema: { type: "string" },
          description: "Dimension key (e.g. browser, osVersion, deviceType)",
        },
      ],
      schema: "ShareTrendResponse",
    },
    {
      q: "utm-dimension-trend",
      op: "queryUtmDimensionTrend",
      sum: "Query UTM dimension trend",
      desc: "UTM dimension trends over time.",
      params: [
        ...win(),
        int(),
        lim("Max results", 8),
        ...filt(),
        {
          name: "dimension",
          in: "query",
          schema: { type: "string" },
          description: "UTM dimension (e.g. source, medium, campaign)",
        },
      ],
      schema: "ShareTrendResponse",
    },
    {
      q: "client-cross-breakdown",
      op: "queryClientCrossBreakdown",
      sum: "Query client cross-breakdown",
      desc: "Client dimension cross-tabulation.",
      params: [
        ...win(),
        ...filt(),
        {
          name: "primaryDimension",
          in: "query",
          required: true,
          schema: { type: "string" },
          description: "Primary dimension for rows",
        },
        {
          name: "secondaryDimension",
          in: "query",
          required: true,
          schema: { type: "string" },
          description: "Secondary dimension for columns",
        },
        {
          name: "primaryLimit",
          in: "query",
          schema: { type: "integer" },
          description: "Max rows (1-12)",
        },
        {
          name: "secondaryLimit",
          in: "query",
          schema: { type: "integer" },
          description: "Max columns (1-8)",
        },
      ],
      schema: "CrossBreakdownResponse",
    },
  ];

  // Generate all analytics endpoints
  const analyticsEndpoints: Record<string, unknown> = {};
  for (const c of analyticsConfigs) {
    const ep = analyticsEndpoint(c.q, c.op, c.sum, c.desc, c.params, c.schema, {
      ...envelopeExample,
      data: "(response shape varies by query — see schema)",
    });
    Object.assign(analyticsEndpoints, ep);
  }

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
                    partialFailure: false,
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
            schema: { type: "integer" },
            description: "Start timestamp (Unix ms, defaults to 24h ago)",
          },
          {
            name: "to",
            in: "query",
            schema: { type: "integer" },
            description: "End timestamp (Unix ms, defaults to now)",
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
    ...analyticsEndpoints,
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
