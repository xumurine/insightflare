#!/usr/bin/env tsx

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

function replaceRefs(obj: unknown, oldRef: string, newRef: string): unknown {
  if (!obj || typeof obj !== "object") return obj;
  if (Array.isArray(obj))
    return obj.map((item) => replaceRefs(item, oldRef, newRef));
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (key === "$ref" && value === oldRef) {
      result[key] = newRef;
    } else {
      result[key] = replaceRefs(value, oldRef, newRef);
    }
  }
  return result;
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

function buildPaths(): Record<string, unknown> {
  return {
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
              },
            },
          },
        },
      },
    },
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
        },
      },
    },
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
          "200": {
            description: "Site created",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SiteResponse" },
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
          "200": {
            description: "Site deleted",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SiteDeleteResponse" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
    },
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
              },
            },
          },
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
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/api/v1/sites/{siteId}/analytics/{queryName}": {
      parameters: [
        { $ref: "#/components/parameters/siteId" },
        {
          name: "queryName",
          in: "path",
          required: true,
          schema: { $ref: "#/components/schemas/QueryName" },
          description: "Analytics query name",
        },
      ],
      get: {
        operationId: "queryAnalytics",
        summary: "Query analytics",
        description: "Executes an analytics query for the specified site.",
        tags: ["Analytics"],
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
            name: "interval",
            in: "query",
            schema: {
              type: "string",
              enum: ["minute", "hour", "day", "week", "month"],
            },
          },
          {
            name: "timeZone",
            in: "query",
            schema: { type: "string" },
            description: "IANA timezone",
          },
          {
            name: "tz",
            in: "query",
            schema: { type: "string" },
            description: "Alias for timeZone",
          },
          { name: "limit", in: "query", schema: { type: "integer" } },
          { name: "country", in: "query", schema: { type: "string" } },
          { name: "device", in: "query", schema: { type: "string" } },
          { name: "browser", in: "query", schema: { type: "string" } },
          { name: "path", in: "query", schema: { type: "string" } },
          { name: "title", in: "query", schema: { type: "string" } },
          { name: "hostname", in: "query", schema: { type: "string" } },
          { name: "entry", in: "query", schema: { type: "string" } },
          { name: "exit", in: "query", schema: { type: "string" } },
          { name: "sourceDomain", in: "query", schema: { type: "string" } },
          { name: "sourceLink", in: "query", schema: { type: "string" } },
          {
            name: "page",
            in: "query",
            schema: { type: "integer", minimum: 1 },
          },
          { name: "pageSize", in: "query", schema: { type: "integer" } },
          { name: "sortBy", in: "query", schema: { type: "string" } },
          {
            name: "sortDir",
            in: "query",
            schema: { type: "string", enum: ["asc", "desc"] },
          },
          { name: "search", in: "query", schema: { type: "string" } },
          { name: "q", in: "query", schema: { type: "string" } },
          {
            name: "visitorId",
            in: "query",
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "sessionId",
            in: "query",
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "eventId",
            in: "query",
            schema: { type: "string", format: "uuid" },
          },
          { name: "eventName", in: "query", schema: { type: "string" } },
          { name: "fieldPath", in: "query", schema: { type: "string" } },
          {
            name: "fieldValueType",
            in: "query",
            schema: {
              type: "string",
              enum: ["string", "number", "boolean", "null", "object", "array"],
            },
          },
          {
            name: "id",
            in: "query",
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "granularity",
            in: "query",
            schema: {
              type: "string",
              enum: ["minute", "hour", "day", "week", "month"],
            },
          },
          { name: "dimension", in: "query", schema: { type: "string" } },
          { name: "primaryDimension", in: "query", schema: { type: "string" } },
          {
            name: "secondaryDimension",
            in: "query",
            schema: { type: "string" },
          },
          { name: "primaryLimit", in: "query", schema: { type: "integer" } },
          { name: "secondaryLimit", in: "query", schema: { type: "integer" } },
          { name: "browserLimit", in: "query", schema: { type: "integer" } },
          { name: "versionLimit", in: "query", schema: { type: "integer" } },
          { name: "osLimit", in: "query", schema: { type: "integer" } },
          { name: "deviceTypeLimit", in: "query", schema: { type: "integer" } },
          { name: "filterKey", in: "query", schema: { type: "string" } },
          {
            name: "query",
            in: "query",
            schema: { type: "string" },
            description: "Filter by page query string",
          },
          { name: "clientBrowser", in: "query", schema: { type: "string" } },
          { name: "clientOsVersion", in: "query", schema: { type: "string" } },
          { name: "clientDeviceType", in: "query", schema: { type: "string" } },
          { name: "clientLanguage", in: "query", schema: { type: "string" } },
          { name: "clientScreenSize", in: "query", schema: { type: "string" } },
          {
            name: "geo",
            in: "query",
            schema: { type: "string" },
            description: "Filter by geo (country/region/city)",
          },
          { name: "geoCountry", in: "query", schema: { type: "string" } },
          { name: "geoRegion", in: "query", schema: { type: "string" } },
          { name: "geoCity", in: "query", schema: { type: "string" } },
          { name: "geoContinent", in: "query", schema: { type: "string" } },
          { name: "geoTimezone", in: "query", schema: { type: "string" } },
          { name: "geoOrganization", in: "query", schema: { type: "string" } },
          {
            name: "eventPayloadFilters",
            in: "query",
            schema: { type: "string" },
            description: "JSON-encoded array of event payload filter rules",
          },
          { name: "applyGeoFilter", in: "query", schema: { type: "boolean" } },
          { name: "includeChange", in: "query", schema: { type: "boolean" } },
          { name: "includeDetail", in: "query", schema: { type: "boolean" } },
          { name: "details", in: "query", schema: { type: "boolean" } },
          { name: "fullUrl", in: "query", schema: { type: "boolean" } },
        ],
        responses: {
          "200": {
            description: "Analytics query result",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AnalyticsQueryParams" },
                // Note: actual response shape varies by queryName.
                // Individual response schemas are registered (OverviewResponse, TrendResponse, etc.)
                // but cannot be statically referenced here since queryName is a path parameter.
              },
            },
          },
          "400": { $ref: "#/components/responses/BadRequest" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
    },
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
              },
            },
          },
          "400": { $ref: "#/components/responses/BadRequest" },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
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
              },
            },
          },
          "400": { $ref: "#/components/responses/BadRequest" },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
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
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
    },
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
          },
          { name: "timeZone", in: "query", schema: { type: "string" } },
        ],
        responses: {
          "200": {
            description: "Team dashboard data",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/TeamDashboardResponse" },
              },
            },
          },
          "400": { $ref: "#/components/responses/BadRequest" },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
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

  console.log(`\nGenerated:`);
  console.log(`  YAML: ${yamlPath}`);
  console.log(`  JSON: ${jsonPath}`);
}

main().catch((err) => {
  console.error("Failed to generate OpenAPI spec:", err);
  process.exit(1);
});
