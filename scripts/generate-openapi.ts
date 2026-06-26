#!/usr/bin/env tsx

import { execSync } from "child_process";
import { writeFileSync } from "fs";
import { resolve } from "path";
import YAML from "yaml";

type HttpMethod = "get" | "post" | "patch" | "delete";

interface Operation {
  operationId: string;
  summary: string;
  description: string;
  tags: string[];
  security?: Array<Record<string, unknown>>;
  parameters?: unknown[];
  requestBody?: unknown;
  responses: Record<string, unknown>;
}

interface OpenAPISpec {
  openapi: string;
  info: Record<string, unknown>;
  servers: Array<{ url: string; description: string }>;
  security: Array<Record<string, unknown>>;
  tags: Array<{ name: string; description: string }>;
  paths: Record<
    string,
    Partial<Record<HttpMethod, Operation>> & { parameters?: unknown[] }
  >;
  components: {
    schemas: Record<string, unknown>;
    securitySchemes: Record<string, unknown>;
    parameters: Record<string, unknown>;
    responses: Record<string, unknown>;
  };
}

const json = "application/json";

function ref(name: string) {
  return { $ref: `#/components/schemas/${name}` };
}

function response(description: string, schema: string, example?: unknown) {
  return {
    description,
    content: {
      [json]: {
        schema: ref(schema),
        ...(example ? { example } : {}),
      },
    },
  };
}

function requestBody(schema: string, description?: string) {
  return {
    required: true,
    ...(description ? { description } : {}),
    content: { [json]: { schema: ref(schema) } },
  };
}

function envelope(dataSchema: unknown, description = "Successful response") {
  return {
    allOf: [
      ref("SuccessEnvelope"),
      {
        type: "object",
        description,
        properties: {
          data: dataSchema,
        },
      },
    ],
  };
}

function listEnvelope(itemSchema: unknown) {
  return {
    allOf: [
      ref("ListEnvelope"),
      {
        type: "object",
        properties: {
          data: {
            type: "array",
            items: itemSchema,
          },
        },
      },
    ],
  };
}

function paginatedEnvelope(itemSchema: unknown) {
  return {
    allOf: [
      ref("PaginatedEnvelope"),
      {
        type: "object",
        properties: {
          data: {
            type: "array",
            items: itemSchema,
          },
        },
      },
    ],
  };
}

function ok(schema: string, description = "Successful response") {
  return response(description, schema);
}

function errorResponses(...codes: string[]) {
  const map: Record<string, unknown> = {};
  for (const code of codes) {
    const name =
      code === "400"
        ? "BadRequest"
        : code === "401"
          ? "Unauthorized"
          : code === "403"
            ? "Forbidden"
            : code === "404"
              ? "NotFound"
              : code === "409"
                ? "Conflict"
                : code === "413"
                  ? "PayloadTooLarge"
                  : "InternalError";
    map[code] = { $ref: `#/components/responses/${name}` };
  }
  return map;
}

function op(input: Operation): Operation {
  return input;
}

function queryParam(name: string, schema: unknown, description: string) {
  return { name, in: "query", schema, description };
}

function timeParams(includeInterval = false) {
  const defaultHint =
    " If from, to, and preset are omitted, analytics endpoints default to the last 7 days ending at request time.";
  return [
    queryParam(
      "from",
      { type: "string", format: "date-time" },
      `Inclusive ISO 8601 start time.${defaultHint}`,
    ),
    queryParam(
      "to",
      { type: "string", format: "date-time" },
      `Exclusive ISO 8601 end time.${defaultHint}`,
    ),
    queryParam(
      "preset",
      ref("Preset"),
      `Named time range preset. Mutually exclusive with from and to.${defaultHint}`,
    ),
    queryParam(
      "timeZone",
      { type: "string", maxLength: 80, default: "UTC" },
      "IANA time zone used to resolve presets. Defaults to UTC.",
    ),
    ...(includeInterval
      ? [
          queryParam(
            "interval",
            {
              type: "string",
              enum: ["minute", "hour", "day", "week", "month"],
              default: "day",
            },
            "Time bucket granularity.",
          ),
        ]
      : []),
  ];
}

function filterParam() {
  return {
    name: "filter",
    in: "query",
    style: "deepObject",
    explode: true,
    schema: ref("FilterObject"),
    description: "Simple equality filters as filter[field]=value.",
  };
}

function metricParam() {
  return {
    name: "metrics",
    in: "query",
    style: "form",
    explode: false,
    schema: {
      type: "array",
      items: {
        type: "string",
        enum: [
          "views",
          "sessions",
          "visitors",
          "bounces",
          "bounceRate",
          "avgDurationMs",
          "viewsPerSession",
          "events",
        ],
      },
    },
    description: "Comma-separated metrics to include.",
  };
}

function cursorParams() {
  return [
    queryParam(
      "limit",
      { type: "integer", minimum: 1, maximum: 1000, default: 100 },
      "Maximum number of results.",
    ),
    queryParam(
      "cursor",
      { type: "string", maxLength: 512 },
      "Opaque pagination cursor from the previous response.",
    ),
  ];
}

function sortParam() {
  return queryParam(
    "sort",
    { type: "string", maxLength: 120 },
    "Sort field. Prefix with '-' for descending order.",
  );
}

function buildSchemas(): Record<string, unknown> {
  const iso = { type: "string", format: "date-time" };
  const uuid = { type: "string", format: "uuid" };
  return {
    Meta: {
      type: "object",
      description: "Response metadata.",
      required: ["generatedAt"],
      properties: {
        requestId: {
          type: "string",
          description: "Request correlation identifier.",
        },
        generatedAt: {
          ...iso,
          description: "Response generation time in UTC.",
        },
        timeRange: ref("TimeRange"),
        interval: {
          type: "string",
          enum: ["minute", "hour", "day", "week", "month"],
        },
        partialFailure: { type: "boolean" },
      },
      additionalProperties: true,
    },
    LinkMap: {
      type: "object",
      description: "Machine-readable links for resource discovery.",
      additionalProperties: { type: "string" },
    },
    SuccessEnvelope: {
      type: "object",
      description: "Standard successful response envelope.",
      required: ["data", "meta"],
      properties: {
        data: {},
        links: ref("LinkMap"),
        meta: ref("Meta"),
      },
      additionalProperties: false,
    },
    ListEnvelope: {
      type: "object",
      description: "Standard list response envelope.",
      required: ["data", "meta"],
      properties: {
        data: { type: "array", items: {} },
        links: ref("LinkMap"),
        meta: ref("Meta"),
      },
      additionalProperties: false,
    },
    Pagination: {
      type: "object",
      description: "Cursor pagination state.",
      required: ["limit", "nextCursor", "hasMore"],
      properties: {
        limit: { type: "integer", minimum: 1, maximum: 1000 },
        nextCursor: { type: ["string", "null"], maxLength: 512 },
        hasMore: { type: "boolean" },
      },
    },
    PaginatedEnvelope: {
      type: "object",
      description: "Standard cursor-paginated list response envelope.",
      required: ["data", "pagination", "meta"],
      properties: {
        data: { type: "array", items: {} },
        pagination: ref("Pagination"),
        links: ref("LinkMap"),
        meta: ref("Meta"),
      },
      additionalProperties: false,
    },
    ErrorResponse: {
      type: "object",
      description: "Standard error response envelope.",
      required: ["error", "meta"],
      properties: {
        error: {
          type: "object",
          required: ["code", "message"],
          properties: {
            code: {
              type: "string",
              enum: [
                "invalid_request",
                "invalid_json",
                "validation_failed",
                "invalid_api_key",
                "api_key_expired",
                "api_key_revoked",
                "insufficient_scope",
                "site_not_found",
                "resource_not_found",
                "conflict",
                "payload_too_large",
                "internal_error",
              ],
            },
            message: { type: "string" },
            details: { type: "object", additionalProperties: true },
            help: {
              type: "object",
              properties: {
                token: { type: "string" },
                documentation: { type: "string" },
              },
            },
          },
        },
        meta: ref("Meta"),
      },
    },
    Preset: {
      type: "string",
      description: "Named time range preset.",
      enum: [
        "today",
        "yesterday",
        "last_7_days",
        "last_30_days",
        "this_week",
        "last_week",
        "this_month",
        "last_month",
      ],
    },
    TimeRange: {
      type: "object",
      description: "Resolved inclusive/exclusive time range.",
      required: ["from", "to", "timeZone"],
      properties: {
        from: { ...iso, description: "Inclusive start time." },
        to: { ...iso, description: "Exclusive end time." },
        timeZone: { type: "string", maxLength: 80 },
      },
    },
    TimeRangeInput: {
      type: "object",
      description:
        "Optional time range input. If from, to, and preset are omitted, analytics endpoints default to the last 7 days ending at request time. The default timeZone is UTC.",
      properties: {
        from: {
          ...iso,
          description: "Inclusive ISO 8601 start time.",
        },
        to: {
          ...iso,
          description: "Exclusive ISO 8601 end time.",
        },
        preset: ref("Preset"),
        timeZone: {
          type: "string",
          maxLength: 80,
          default: "UTC",
          description: "IANA time zone used to resolve presets.",
        },
      },
    },
    FilterObject: {
      type: "object",
      description: "Simple equality filters keyed by stable dimension name.",
      additionalProperties: { type: "string", maxLength: 500 },
    },
    ComplexFilter: {
      type: "object",
      description: "Advanced filter rule for explore and search endpoints.",
      required: ["field", "op"],
      properties: {
        field: {
          type: "string",
          maxLength: 120,
          description: "Stable filter field path.",
        },
        op: {
          type: "string",
          enum: [
            "eq",
            "neq",
            "in",
            "notIn",
            "contains",
            "startsWith",
            "endsWith",
            "gt",
            "gte",
            "lt",
            "lte",
            "exists",
            "notExists",
          ],
        },
        value: {},
      },
    },
    MetricDefinition: {
      type: "object",
      description: "Metric available for analytics queries.",
      required: ["key", "label", "type", "description"],
      properties: {
        key: { type: "string" },
        label: { type: "string" },
        type: { type: "string", enum: ["integer", "rate", "duration_ms"] },
        description: { type: "string" },
      },
    },
    DimensionDefinition: {
      type: "object",
      description: "Dimension available for analytics breakdowns and filters.",
      required: ["key", "label", "type"],
      properties: {
        key: { type: "string" },
        label: { type: "string" },
        type: { type: "string" },
        description: { type: "string" },
      },
    },
    SiteAccess: {
      type: "object",
      description: "Sites this token may access.",
      required: ["mode", "siteIds"],
      properties: {
        mode: { type: "string", enum: ["all", "restricted"] },
        siteIds: { type: "array", items: uuid },
      },
    },
    Token: {
      type: "object",
      required: ["id", "name", "status", "team", "scopes", "siteAccess"],
      properties: {
        id: uuid,
        name: { type: "string", maxLength: 120 },
        status: { type: "string", enum: ["active", "expired", "revoked"] },
        createdAt: iso,
        expiresAt: { type: ["string", "null"], format: "date-time" },
        lastUsedAt: { type: ["string", "null"], format: "date-time" },
        team: {
          type: "object",
          required: ["id", "name"],
          properties: { id: uuid, name: { type: "string", maxLength: 120 } },
        },
        scopes: {
          type: "array",
          items: {
            type: "string",
            enum: [
              "site:read",
              "site:write",
              "site_config:read",
              "site_config:write",
              "analytics:read",
            ],
          },
        },
        siteAccess: ref("SiteAccess"),
      },
    },
    TokenResponse: envelope(ref("Token")),
    TokenCheckRequest: {
      type: "object",
      required: ["checks"],
      properties: {
        checks: {
          type: "array",
          maxItems: 50,
          items: {
            type: "object",
            required: ["scope"],
            properties: {
              scope: { type: "string", maxLength: 80 },
              siteId: uuid,
            },
          },
        },
      },
    },
    TokenCheckResponse: envelope({
      type: "object",
      properties: {
        checks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              scope: { type: "string" },
              siteId: uuid,
              allowed: { type: "boolean" },
              reason: {
                type: "string",
                enum: ["missing_scope", "site_not_allowed", "token_inactive"],
              },
            },
          },
        },
      },
    }),
    CapabilitiesFeatures: {
      type: "object",
      description: "Feature availability flags for the current token.",
      required: [
        "sites",
        "tracking",
        "privacy",
        "sharing",
        "analytics",
        "events",
        "visitors",
        "sessions",
        "funnels",
        "performance",
        "realtime",
        "exports",
        "batch",
      ],
      properties: {
        sites: { type: "boolean" },
        tracking: { type: "boolean" },
        privacy: { type: "boolean" },
        sharing: { type: "boolean" },
        analytics: { type: "boolean" },
        events: { type: "boolean" },
        visitors: { type: "boolean" },
        sessions: { type: "boolean" },
        funnels: { type: "boolean" },
        performance: { type: "boolean" },
        realtime: { type: "boolean" },
        exports: { type: "boolean" },
        batch: { type: "boolean" },
      },
      additionalProperties: false,
    },
    CapabilitiesLimits: {
      type: "object",
      description: "Runtime limits exposed to clients.",
      required: [
        "batchMaxRequests",
        "defaultTimeRangeDays",
        "maxTimeRangeDays",
        "defaultPageLimit",
        "maxPageLimit",
      ],
      properties: {
        batchMaxRequests: { type: "integer", minimum: 1 },
        defaultTimeRangeDays: { type: "integer", minimum: 1 },
        maxTimeRangeDays: { type: "integer", minimum: 1 },
        defaultPageLimit: { type: "integer", minimum: 1 },
        maxPageLimit: { type: "integer", minimum: 1 },
      },
      additionalProperties: false,
    },
    Capabilities: {
      type: "object",
      description: "Runtime capabilities available to the current token.",
      required: ["apiVersion", "features", "limits", "links"],
      properties: {
        apiVersion: { type: "string" },
        features: ref("CapabilitiesFeatures"),
        limits: ref("CapabilitiesLimits"),
        links: ref("LinkMap"),
      },
      additionalProperties: false,
    },
    CapabilitiesResponse: envelope(ref("Capabilities")),
    RootDiscoveryResponse: envelope({
      type: "object",
      properties: {
        version: { type: "string" },
        service: { type: "string" },
        links: ref("LinkMap"),
      },
    }),
    Team: {
      type: "object",
      properties: {
        id: uuid,
        name: { type: "string", maxLength: 120 },
        createdAt: iso,
        links: ref("LinkMap"),
      },
    },
    TeamResponse: envelope(ref("Team")),
    Site: {
      type: "object",
      required: [
        "id",
        "name",
        "domain",
        "createdAt",
        "updatedAt",
        "sharing",
        "links",
      ],
      properties: {
        id: uuid,
        name: { type: "string", maxLength: 120 },
        domain: { type: "string", maxLength: 255 },
        createdAt: iso,
        updatedAt: iso,
        sharing: ref("SharingSettings"),
        links: ref("LinkMap"),
      },
    },
    SiteCreateInput: {
      type: "object",
      required: ["name", "domain"],
      properties: {
        name: { type: "string", minLength: 1, maxLength: 120 },
        domain: { type: "string", minLength: 1, maxLength: 255 },
        sharing: ref("SharingSettings"),
      },
    },
    SiteUpdateInput: {
      type: "object",
      properties: {
        name: { type: "string", minLength: 1, maxLength: 120 },
        domain: { type: "string", minLength: 1, maxLength: 255 },
        sharing: ref("SharingSettings"),
      },
    },
    SiteResponse: envelope(ref("Site")),
    SiteListResponse: listEnvelope(ref("Site")),
    TrackingSettings: {
      type: "object",
      description: "Tracking settings for the client script.",
      properties: {
        trackPageviews: { type: "boolean" },
        trackQuery: { type: "boolean" },
        trackHash: { type: "boolean" },
        trackCustomEvents: { type: "boolean" },
        trackEngagement: { type: "boolean" },
        trackWebVitals: { type: "boolean" },
        autoTrackOutboundLinks: { type: "boolean" },
        trackingStrength: {
          type: "string",
          enum: ["strong", "smart", "weak"],
          description: "Privacy-aware tracking mode.",
        },
        allowedDomains: {
          type: "array",
          items: { type: "string", maxLength: 255 },
        },
        excludedPaths: {
          type: "array",
          items: { type: "string", maxLength: 2048 },
        },
      },
    },
    TrackingSettingsResponse: envelope(ref("TrackingSettings")),
    TrackingScriptResponse: envelope({
      type: "object",
      properties: {
        siteId: uuid,
        src: { type: "string", format: "uri" },
        snippet: { type: "string" },
      },
    }),
    PrivacySettings: {
      type: "object",
      description: "Privacy settings for visitor data handling.",
      properties: {
        respectDoNotTrack: { type: "boolean" },
        anonymizeIp: { type: "boolean" },
        euMode: { type: "boolean" },
        visitorTokenMode: { type: "string", enum: ["daily"] },
        dataRetentionDays: { type: "integer", minimum: 1 },
      },
    },
    PrivacySettingsResponse: envelope(ref("PrivacySettings")),
    SharingSettings: {
      type: "object",
      properties: {
        publicEnabled: { type: "boolean" },
        publicSlug: { type: ["string", "null"], maxLength: 120 },
      },
    },
    SharingSettingsResponse: envelope(ref("SharingSettings")),
    AnalyticsSchemaResponse: envelope({
      type: "object",
      properties: {
        metrics: { type: "array", items: ref("MetricDefinition") },
        dimensions: { type: "array", items: ref("DimensionDefinition") },
        filters: { type: "array", items: { type: "string" } },
        operators: { type: "array", items: { type: "string" } },
        intervals: { type: "array", items: { type: "string" } },
        presets: { type: "array", items: ref("Preset") },
        timeRange: {
          type: "object",
          properties: {
            earliestAvailableAt: {
              type: ["string", "null"],
              format: "date-time",
            },
            latestAvailableAt: iso,
          },
        },
        links: ref("LinkMap"),
      },
    }),
    OverviewMetrics: {
      type: "object",
      properties: {
        views: { type: "integer" },
        sessions: { type: "integer" },
        visitors: { type: "integer" },
        bounces: { type: "integer" },
        bounceRate: { type: "number", minimum: 0, maximum: 1 },
        avgDurationMs: { type: "number" },
        viewsPerSession: { type: "number" },
        approximateVisitors: { type: "boolean" },
      },
    },
    AnalyticsOverviewResponse: envelope(ref("OverviewMetrics")),
    TimeseriesPoint: {
      type: "object",
      properties: {
        start: iso,
        end: iso,
        views: { type: "integer" },
        sessions: { type: "integer" },
        visitors: { type: "integer" },
        events: { type: "integer" },
      },
    },
    AnalyticsTimeseriesResponse: listEnvelope(ref("TimeseriesPoint")),
    BreakdownRow: {
      type: "object",
      properties: {
        key: { type: "string" },
        label: { type: "string" },
        views: { type: "integer" },
        sessions: { type: "integer" },
        visitors: { type: "integer" },
        events: { type: "integer" },
      },
    },
    AnalyticsBreakdownResponse: listEnvelope(ref("BreakdownRow")),
    AnalyticsExploreRequest: {
      type: "object",
      description: "Advanced analytics query input.",
      properties: {
        timeRange: ref("TimeRangeInput"),
        metrics: { type: "array", items: { type: "string" } },
        dimensions: { type: "array", items: { type: "string" } },
        filters: { type: "array", items: ref("ComplexFilter") },
        orderBy: {
          type: "array",
          items: {
            type: "object",
            properties: {
              field: { type: "string", maxLength: 120 },
              direction: { type: "string", enum: ["asc", "desc"] },
            },
          },
        },
        limit: { type: "integer", minimum: 1, maximum: 1000 },
      },
    },
    AnalyticsCompareResponse: envelope({
      type: "object",
      description: "Period-over-period analytics comparison.",
      properties: {
        current: ref("OverviewMetrics"),
        previous: ref("OverviewMetrics"),
        change: {
          type: "object",
          description:
            "Relative changes as 0-based rates. Example: 0.12 means +12%.",
          additionalProperties: { type: "number" },
        },
      },
    }),
    AnalyticsExploreRow: {
      type: "object",
      description: "One row returned by an analytics explore query.",
      additionalProperties: true,
    },
    AnalyticsExploreResponse: envelope({
      type: "object",
      description: "Advanced analytics query result.",
      properties: {
        rows: { type: "array", items: ref("AnalyticsExploreRow") },
        metrics: { type: "array", items: { type: "string" } },
        dimensions: { type: "array", items: { type: "string" } },
        filters: { type: "array", items: ref("ComplexFilter") },
      },
    }),
    RetentionCohortsResponse: envelope({
      type: "object",
      description: "Visitor retention cohort response.",
      properties: {
        interval: {
          type: "string",
          enum: ["minute", "hour", "day", "week", "month"],
        },
        cohorts: {
          type: "array",
          items: {
            type: "object",
            properties: {
              start: iso,
              size: { type: "integer", minimum: 0 },
              periods: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    index: { type: "integer", minimum: 0 },
                    visitors: { type: "integer", minimum: 0 },
                    rate: { type: "number", minimum: 0, maximum: 1 },
                  },
                },
              },
            },
          },
        },
      },
    }),
    GenericObjectResponse: envelope({
      type: "object",
      additionalProperties: true,
    }),
    EventsSummaryResponse: envelope({
      type: "object",
      description: "Event summary response.",
      properties: {
        events: { type: "integer", minimum: 0 },
        eventTypes: { type: "integer", minimum: 0 },
        sessions: { type: "integer", minimum: 0 },
        visitors: { type: "integer", minimum: 0 },
        avgEventsPerSession: { type: "number", minimum: 0 },
      },
    }),
    EventRecord: {
      type: "object",
      additionalProperties: true,
      properties: {
        id: uuid,
        eventName: { type: "string", maxLength: 120 },
        occurredAt: iso,
      },
    },
    EventListResponse: paginatedEnvelope(ref("EventRecord")),
    EventResponse: envelope(ref("EventRecord")),
    EventPayloadFilter: {
      type: "object",
      description: "Filter applied to custom event payload fields.",
      required: ["path", "op"],
      properties: {
        path: {
          type: "string",
          maxLength: 240,
          description: "Dot-notation path inside the event payload.",
        },
        op: {
          type: "string",
          enum: [
            "eq",
            "neq",
            "in",
            "notIn",
            "contains",
            "startsWith",
            "endsWith",
            "gt",
            "gte",
            "lt",
            "lte",
            "exists",
            "notExists",
          ],
        },
        value: {
          description:
            "Comparison value. Required unless op is exists or notExists.",
        },
      },
      additionalProperties: false,
    },
    EventSearchRequest: {
      type: "object",
      description: "Request for searching event records with complex filters.",
      properties: {
        timeRange: ref("TimeRangeInput"),
        eventName: {
          type: "string",
          maxLength: 120,
          description: "Optional event name filter.",
        },
        payloadFilters: {
          type: "array",
          items: ref("EventPayloadFilter"),
        },
        filters: {
          type: "array",
          items: ref("ComplexFilter"),
        },
        limit: { type: "integer", minimum: 1, maximum: 1000, default: 100 },
        cursor: { type: "string", maxLength: 512 },
      },
      additionalProperties: false,
    },
    Visitor: {
      type: "object",
      description: "Visitor resource.",
      additionalProperties: true,
      properties: {
        visitorId: { type: "string", maxLength: 160 },
        firstSeenAt: iso,
        lastSeenAt: iso,
        views: { type: "integer", minimum: 0 },
        sessions: { type: "integer", minimum: 0 },
        events: { type: "integer", minimum: 0 },
        links: ref("LinkMap"),
      },
    },
    VisitorListResponse: paginatedEnvelope(ref("Visitor")),
    VisitorResponse: envelope(ref("Visitor")),
    Session: {
      type: "object",
      description: "Session resource.",
      additionalProperties: true,
      properties: {
        sessionId: { type: "string", maxLength: 160 },
        visitorId: { type: "string", maxLength: 160 },
        startedAt: iso,
        endedAt: { type: ["string", "null"], format: "date-time" },
        views: { type: "integer", minimum: 0 },
        events: { type: "integer", minimum: 0 },
        links: ref("LinkMap"),
      },
    },
    SessionListResponse: paginatedEnvelope(ref("Session")),
    SessionResponse: envelope(ref("Session")),
    TeamUsageResponse: envelope({
      type: "object",
      description: "Usage information for the current team.",
      required: ["sites"],
      properties: {
        sites: { type: "integer", minimum: 0 },
      },
    }),
    PerformanceSummaryResponse: envelope({
      type: "object",
      additionalProperties: true,
    }),
    PerformanceMetricPoint: {
      type: "object",
      description: "Performance metric point.",
      additionalProperties: true,
      properties: {
        start: iso,
        end: iso,
        ttfb: { type: "number" },
        fcp: { type: "number" },
        lcp: { type: "number" },
        cls: { type: "number" },
        inp: { type: "number" },
      },
    },
    PerformanceTimeseriesResponse: listEnvelope(ref("PerformanceMetricPoint")),
    PerformanceBreakdownRow: {
      type: "object",
      description: "Performance breakdown row.",
      additionalProperties: true,
      properties: {
        key: { type: "string" },
        label: { type: "string" },
        ttfb: { type: "number" },
        fcp: { type: "number" },
        lcp: { type: "number" },
        cls: { type: "number" },
        inp: { type: "number" },
      },
    },
    PerformanceBreakdownResponse: listEnvelope(ref("PerformanceBreakdownRow")),
    FunnelStepInput: {
      type: "object",
      description: "One step in a funnel definition.",
      required: ["type", "value"],
      properties: {
        type: {
          type: "string",
          enum: ["pageview", "event"],
          description: "Step matching type.",
        },
        value: {
          type: "string",
          minLength: 1,
          maxLength: 500,
          description: "Page path or event name to match.",
        },
        label: {
          type: "string",
          maxLength: 120,
          description: "Optional display label.",
        },
      },
      additionalProperties: false,
    },
    FunnelCreateInput: {
      type: "object",
      description: "Input for creating a saved funnel.",
      required: ["name", "steps"],
      properties: {
        name: {
          type: "string",
          minLength: 1,
          maxLength: 200,
          description: "Human-readable funnel name.",
        },
        description: {
          type: ["string", "null"],
          maxLength: 500,
          description: "Optional funnel description.",
        },
        steps: {
          type: "array",
          minItems: 2,
          maxItems: 10,
          items: ref("FunnelStepInput"),
        },
      },
      additionalProperties: false,
    },
    FunnelUpdateInput: {
      type: "object",
      description: "Partial update for a saved funnel.",
      properties: {
        name: { type: "string", minLength: 1, maxLength: 200 },
        description: { type: ["string", "null"], maxLength: 500 },
        steps: {
          type: "array",
          minItems: 2,
          maxItems: 10,
          items: ref("FunnelStepInput"),
        },
      },
      additionalProperties: false,
    },
    FunnelAnalysisRequest: {
      type: "object",
      description: "Request for ad-hoc funnel analysis.",
      required: ["steps"],
      properties: {
        timeRange: ref("TimeRangeInput"),
        steps: {
          type: "array",
          minItems: 2,
          maxItems: 10,
          items: ref("FunnelStepInput"),
        },
        filters: { type: "array", items: ref("ComplexFilter") },
      },
      additionalProperties: false,
    },
    FunnelStep: {
      type: "object",
      description: "One saved funnel step.",
      required: ["type", "value"],
      properties: {
        type: { type: "string", enum: ["pageview", "event"] },
        value: { type: "string", maxLength: 500 },
        label: { type: "string", maxLength: 120 },
      },
    },
    Funnel: {
      type: "object",
      description: "Saved funnel definition.",
      required: ["id", "siteId", "name", "steps", "createdAt", "updatedAt"],
      properties: {
        id: uuid,
        siteId: uuid,
        name: { type: "string", maxLength: 200 },
        description: { type: ["string", "null"], maxLength: 500 },
        steps: { type: "array", items: ref("FunnelStep") },
        createdAt: iso,
        updatedAt: iso,
        links: ref("LinkMap"),
      },
    },
    FunnelResponse: envelope(ref("Funnel")),
    FunnelListResponse: listEnvelope(ref("Funnel")),
    FunnelAnalysisStep: {
      type: "object",
      description: "Funnel analysis metrics for one step.",
      properties: {
        index: { type: "integer", minimum: 0 },
        label: { type: "string" },
        type: { type: "string", enum: ["pageview", "event"] },
        sessions: { type: "integer", minimum: 0 },
        visitors: { type: "integer", minimum: 0 },
        conversionRate: { type: "number" },
        stepConversionRate: { type: "number" },
        dropOffSessions: { type: "integer", minimum: 0 },
        dropOffRate: { type: "number" },
      },
    },
    FunnelAnalysisSummary: {
      type: "object",
      properties: {
        totalSessions: { type: "integer", minimum: 0 },
        convertedSessions: { type: "integer", minimum: 0 },
        totalVisitors: { type: "integer", minimum: 0 },
        convertedVisitors: { type: "integer", minimum: 0 },
        overallConversionRate: { type: "number" },
        largestDropOffStepIndex: { type: ["integer", "null"] },
      },
    },
    FunnelAnalysis: {
      type: "object",
      description: "Funnel analysis result.",
      properties: {
        steps: { type: "array", items: ref("FunnelAnalysisStep") },
        summary: ref("FunnelAnalysisSummary"),
      },
    },
    FunnelAnalysisResponse: envelope(ref("FunnelAnalysis")),
    SavedFunnelAnalysisResponse: envelope({
      type: "object",
      description: "Saved funnel with current analysis result.",
      properties: {
        funnel: ref("Funnel"),
        analysis: ref("FunnelAnalysis"),
      },
    }),
    RealtimeEventListResponse: listEnvelope(ref("EventRecord")),
    RealtimeSessionListResponse: listEnvelope(ref("Session")),
    ActiveVisitorsResponse: envelope({
      type: "object",
      required: ["activeVisitors"],
      properties: {
        activeVisitors: { type: "integer", minimum: 0 },
      },
    }),
    RealtimeSnapshotResponse: envelope({
      type: "object",
      properties: {
        activeVisitors: { type: "integer" },
        events: { type: "array", items: ref("EventRecord") },
        sessions: { type: "array", items: ref("Session") },
      },
    }),
    BatchRequest: {
      type: "object",
      required: ["requests"],
      properties: {
        requests: {
          type: "array",
          minItems: 1,
          maxItems: 20,
          items: {
            type: "object",
            required: ["id", "method", "path"],
            properties: {
              id: { type: "string", maxLength: 80 },
              method: { type: "string", enum: ["GET"] },
              path: { type: "string", maxLength: 2048 },
              query: {
                type: "object",
                additionalProperties: { type: "string", maxLength: 500 },
              },
            },
          },
        },
      },
    },
    BatchResponse: envelope({
      type: "object",
      properties: {
        responses: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              status: { type: "integer" },
              body: {},
            },
          },
        },
      },
    }),
    CollectPayload: {
      type: "object",
      description: "Client SDK collection payload.",
      additionalProperties: true,
    },
  };
}

function buildPaths(): OpenAPISpec["paths"] {
  const siteParam = { $ref: "#/components/parameters/siteId" };
  const dimensionParam = { $ref: "#/components/parameters/dimension" };
  const eventNameParam = { $ref: "#/components/parameters/eventName" };
  const eventIdParam = { $ref: "#/components/parameters/eventId" };
  const visitorIdParam = { $ref: "#/components/parameters/visitorId" };
  const sessionIdParam = { $ref: "#/components/parameters/sessionId" };

  return {
    "/healthz": {
      get: op({
        operationId: "getHealth",
        summary: "Health check",
        description:
          "Returns service health status. No authentication required.",
        tags: ["Health"],
        security: [],
        responses: {
          "200": response("Service is healthy", "GenericObjectResponse"),
          ...errorResponses("400", "500"),
        },
      }),
    },
    "/collect": {
      post: op({
        operationId: "collectEvent",
        summary: "Collect tracking event",
        description:
          "/collect is the unauthenticated client SDK ingestion endpoint. Successful receipt or silent drop returns 204.",
        tags: ["Ingestion"],
        security: [],
        requestBody: requestBody("CollectPayload"),
        responses: {
          "204": { description: "No Content" },
          ...errorResponses("400", "413"),
        },
      }),
    },
    "/api/v1": {
      get: op({
        operationId: "getApiRoot",
        summary: "API root discovery",
        description:
          "Returns stable machine-readable discovery links. No authentication required.",
        tags: ["Discovery"],
        security: [],
        responses: {
          "200": ok("RootDiscoveryResponse"),
          ...errorResponses("400", "500"),
        },
      }),
    },
    "/api/v1/token": {
      get: op({
        operationId: "getToken",
        summary: "Inspect current token",
        description:
          "Returns non-secret metadata, scopes, team, and site access for the current bearer token.",
        tags: ["Token"],
        responses: { "200": ok("TokenResponse"), ...errorResponses("401") },
      }),
    },
    "/api/v1/token/check": {
      post: op({
        operationId: "checkToken",
        summary: "Check token permissions",
        description:
          "Checks whether the current token has requested scope and optional site permissions.",
        tags: ["Token"],
        requestBody: requestBody("TokenCheckRequest"),
        responses: {
          "200": ok("TokenCheckResponse"),
          ...errorResponses("400", "401"),
        },
      }),
    },
    "/api/v1/capabilities": {
      get: op({
        operationId: "getCapabilities",
        summary: "Get runtime capabilities",
        description:
          "Returns features and limits available to the current token.",
        tags: ["Discovery"],
        responses: {
          "200": ok("CapabilitiesResponse"),
          ...errorResponses("401"),
        },
      }),
    },
    "/api/v1/team": {
      get: op({
        operationId: "getTeam",
        summary: "Get current team",
        description: "Returns the team associated with the current token.",
        tags: ["Team"],
        responses: { "200": ok("TeamResponse"), ...errorResponses("401") },
      }),
    },
    "/api/v1/team/usage": {
      get: op({
        operationId: "getTeamUsage",
        summary: "Get team usage",
        description: "Returns usage information for the current team.",
        tags: ["Team"],
        responses: {
          "200": ok("TeamUsageResponse"),
          ...errorResponses("401"),
        },
      }),
    },
    "/api/v1/team/analytics/overview": {
      get: op({
        operationId: "getTeamAnalyticsOverview",
        summary: "Get team analytics overview",
        description:
          "Aggregates analytics over sites accessible to the current token.",
        tags: ["Analytics"],
        parameters: [...timeParams(), filterParam(), metricParam()],
        responses: {
          "200": ok("AnalyticsOverviewResponse"),
          ...errorResponses("400", "401", "403"),
        },
      }),
    },
    "/api/v1/team/analytics/timeseries": {
      get: op({
        operationId: "getTeamAnalyticsTimeseries",
        summary: "Get team analytics time series",
        description: "Returns time-bucketed analytics over accessible sites.",
        tags: ["Analytics"],
        parameters: [...timeParams(true), filterParam(), metricParam()],
        responses: {
          "200": ok("AnalyticsTimeseriesResponse"),
          ...errorResponses("400", "401", "403"),
        },
      }),
    },
    "/api/v1/team/analytics/sites": {
      get: op({
        operationId: "getTeamAnalyticsSites",
        summary: "Get team analytics by site",
        description: "Breaks down team analytics by accessible site.",
        tags: ["Analytics"],
        parameters: [...timeParams(), metricParam()],
        responses: {
          "200": ok("AnalyticsBreakdownResponse"),
          ...errorResponses("400", "401", "403"),
        },
      }),
    },
    "/api/v1/team/analytics/breakdowns/{dimension}": {
      parameters: [dimensionParam],
      get: op({
        operationId: "getTeamAnalyticsBreakdown",
        summary: "Get team analytics breakdown",
        description: "Breaks down team analytics by a stable dimension.",
        tags: ["Analytics"],
        parameters: [
          ...timeParams(),
          filterParam(),
          metricParam(),
          queryParam(
            "limit",
            { type: "integer", minimum: 1, maximum: 1000 },
            "Maximum rows.",
          ),
        ],
        responses: {
          "200": ok("AnalyticsBreakdownResponse"),
          ...errorResponses("400", "401", "403"),
        },
      }),
    },
    "/api/v1/sites": {
      get: op({
        operationId: "listSites",
        summary: "List sites",
        description: "Returns sites accessible to the current token.",
        tags: ["Sites"],
        responses: {
          "200": ok("SiteListResponse"),
          ...errorResponses("401", "403"),
        },
      }),
      post: op({
        operationId: "createSite",
        summary: "Create site",
        description:
          "Creates a site in the token's team. Supports Idempotency-Key.",
        tags: ["Sites"],
        parameters: [
          {
            name: "Idempotency-Key",
            in: "header",
            schema: { type: "string", maxLength: 200 },
            description: "Client-generated idempotency key.",
          },
        ],
        requestBody: requestBody("SiteCreateInput"),
        responses: {
          "201": ok("SiteResponse", "Created site"),
          ...errorResponses("400", "401", "403", "409"),
        },
      }),
    },
    "/api/v1/sites/{siteId}": {
      parameters: [siteParam],
      get: op({
        operationId: "getSite",
        summary: "Get site",
        description: "Returns a site by ID.",
        tags: ["Sites"],
        responses: {
          "200": ok("SiteResponse"),
          ...errorResponses("401", "403", "404"),
        },
      }),
      patch: op({
        operationId: "updateSite",
        summary: "Update site",
        description: "Updates site metadata.",
        tags: ["Sites"],
        requestBody: requestBody("SiteUpdateInput"),
        responses: {
          "200": ok("SiteResponse"),
          ...errorResponses("400", "401", "403", "404", "409"),
        },
      }),
      delete: op({
        operationId: "deleteSite",
        summary: "Delete site",
        description: "Deletes a site and associated analytics data.",
        tags: ["Sites"],
        responses: {
          "204": { description: "No Content" },
          ...errorResponses("401", "403", "404"),
        },
      }),
    },
    "/api/v1/sites/{siteId}/tracking": {
      parameters: [siteParam],
      get: op({
        operationId: "getTrackingSettings",
        summary: "Get tracking settings",
        description: "Returns tracking settings.",
        tags: ["Settings"],
        responses: {
          "200": ok("TrackingSettingsResponse"),
          ...errorResponses("401", "403", "404"),
        },
      }),
      patch: op({
        operationId: "updateTrackingSettings",
        summary: "Update tracking settings",
        description: "Updates tracking settings.",
        tags: ["Settings"],
        requestBody: requestBody("TrackingSettings"),
        responses: {
          "200": ok("TrackingSettingsResponse"),
          ...errorResponses("400", "401", "403", "404"),
        },
      }),
    },
    "/api/v1/sites/{siteId}/tracking/script": {
      parameters: [siteParam],
      get: op({
        operationId: "getTrackingScript",
        summary: "Get tracking script",
        description: "Returns the script URL and HTML snippet.",
        tags: ["Settings"],
        responses: {
          "200": ok("TrackingScriptResponse"),
          ...errorResponses("401", "403", "404"),
        },
      }),
    },
    "/api/v1/sites/{siteId}/privacy": {
      parameters: [siteParam],
      get: op({
        operationId: "getPrivacySettings",
        summary: "Get privacy settings",
        description: "Returns privacy settings.",
        tags: ["Settings"],
        responses: {
          "200": ok("PrivacySettingsResponse"),
          ...errorResponses("401", "403", "404"),
        },
      }),
      patch: op({
        operationId: "updatePrivacySettings",
        summary: "Update privacy settings",
        description: "Updates privacy settings.",
        tags: ["Settings"],
        requestBody: requestBody("PrivacySettings"),
        responses: {
          "200": ok("PrivacySettingsResponse"),
          ...errorResponses("400", "401", "403", "404"),
        },
      }),
    },
    "/api/v1/sites/{siteId}/sharing": {
      parameters: [siteParam],
      get: op({
        operationId: "getSharingSettings",
        summary: "Get sharing settings",
        description: "Returns sharing settings.",
        tags: ["Settings"],
        responses: {
          "200": ok("SharingSettingsResponse"),
          ...errorResponses("401", "403", "404"),
        },
      }),
      patch: op({
        operationId: "updateSharingSettings",
        summary: "Update sharing settings",
        description: "Updates sharing settings.",
        tags: ["Settings"],
        requestBody: requestBody("SharingSettings"),
        responses: {
          "200": ok("SharingSettingsResponse"),
          ...errorResponses("400", "401", "403", "404", "409"),
        },
      }),
    },
    "/api/v1/sites/{siteId}/analytics/schema": {
      parameters: [siteParam],
      get: op({
        operationId: "getAnalyticsSchema",
        summary: "Get analytics schema",
        description:
          "Returns metrics, dimensions, filters, operators, intervals, and presets.",
        tags: ["Analytics"],
        responses: {
          "200": ok("AnalyticsSchemaResponse"),
          ...errorResponses("401", "403", "404"),
        },
      }),
    },
    "/api/v1/sites/{siteId}/analytics/overview": {
      parameters: [siteParam],
      get: op({
        operationId: "getAnalyticsOverview",
        summary: "Get analytics overview",
        description: "Returns aggregate analytics metrics.",
        tags: ["Analytics"],
        parameters: [...timeParams(), filterParam(), metricParam()],
        responses: {
          "200": ok("AnalyticsOverviewResponse"),
          ...errorResponses("400", "401", "403", "404"),
        },
      }),
    },
    "/api/v1/sites/{siteId}/analytics/timeseries": {
      parameters: [siteParam],
      get: op({
        operationId: "getAnalyticsTimeseries",
        summary: "Get analytics time series",
        description: "Returns time-bucketed analytics metrics.",
        tags: ["Analytics"],
        parameters: [...timeParams(true), filterParam(), metricParam()],
        responses: {
          "200": ok("AnalyticsTimeseriesResponse"),
          ...errorResponses("400", "401", "403", "404"),
        },
      }),
    },
    "/api/v1/sites/{siteId}/analytics/breakdowns/{dimension}": {
      parameters: [siteParam, dimensionParam],
      get: op({
        operationId: "getAnalyticsBreakdown",
        summary: "Get analytics breakdown",
        description: "Returns a metric breakdown by dimension.",
        tags: ["Analytics"],
        parameters: [
          ...timeParams(),
          filterParam(),
          metricParam(),
          queryParam(
            "limit",
            { type: "integer", minimum: 1, maximum: 1000, default: 20 },
            "Maximum rows.",
          ),
        ],
        responses: {
          "200": ok("AnalyticsBreakdownResponse"),
          ...errorResponses("400", "401", "403", "404"),
        },
      }),
    },
    "/api/v1/sites/{siteId}/analytics/cross-breakdowns": {
      parameters: [siteParam],
      get: op({
        operationId: "getAnalyticsCrossBreakdown",
        summary: "Get analytics cross breakdown",
        description: "Returns a two-dimensional analytics breakdown.",
        tags: ["Analytics"],
        parameters: [
          ...timeParams(),
          filterParam(),
          queryParam(
            "primary",
            { type: "string", maxLength: 120 },
            "Primary dimension.",
          ),
          queryParam(
            "secondary",
            { type: "string", maxLength: 120 },
            "Secondary dimension.",
          ),
          queryParam(
            "metric",
            { type: "string", maxLength: 80 },
            "Metric to aggregate.",
          ),
        ],
        responses: {
          "200": ok("GenericObjectResponse"),
          ...errorResponses("400", "401", "403", "404"),
        },
      }),
    },
    "/api/v1/sites/{siteId}/analytics/compare": {
      parameters: [siteParam],
      get: op({
        operationId: "compareAnalytics",
        summary: "Compare analytics",
        description: "Compares analytics against another period.",
        tags: ["Analytics"],
        parameters: [
          ...timeParams(),
          filterParam(),
          queryParam(
            "compare",
            { type: "string", maxLength: 80, default: "previous_period" },
            "Comparison mode.",
          ),
        ],
        responses: {
          "200": ok("AnalyticsCompareResponse"),
          ...errorResponses("400", "401", "403", "404"),
        },
      }),
    },
    "/api/v1/sites/{siteId}/analytics/explore": {
      parameters: [siteParam],
      post: op({
        operationId: "exploreAnalytics",
        summary: "Explore analytics",
        description:
          "Runs an advanced multidimensional query with complex filters.",
        tags: ["Analytics"],
        requestBody: requestBody("AnalyticsExploreRequest"),
        responses: {
          "200": ok("AnalyticsExploreResponse"),
          ...errorResponses("400", "401", "403", "404"),
        },
      }),
    },
    "/api/v1/sites/{siteId}/analytics/retention/cohorts": {
      parameters: [siteParam],
      get: op({
        operationId: "getRetentionCohorts",
        summary: "Get retention cohorts",
        description: "Returns visitor retention cohorts.",
        tags: ["Analytics"],
        parameters: [...timeParams(true), filterParam()],
        responses: {
          "200": ok("RetentionCohortsResponse"),
          ...errorResponses("400", "401", "403", "404"),
        },
      }),
    },
    "/api/v1/sites/{siteId}/event-types": {
      parameters: [siteParam],
      get: op({
        operationId: "listEventTypes",
        summary: "List event types",
        description: "Lists custom event types.",
        tags: ["Events"],
        parameters: [
          ...timeParams(),
          queryParam(
            "limit",
            { type: "integer", minimum: 1, maximum: 1000 },
            "Maximum rows.",
          ),
        ],
        responses: {
          "200": ok("AnalyticsBreakdownResponse"),
          ...errorResponses("400", "401", "403", "404"),
        },
      }),
    },
    "/api/v1/sites/{siteId}/event-types/{eventName}": {
      parameters: [siteParam, eventNameParam],
      get: op({
        operationId: "getEventType",
        summary: "Get event type",
        description: "Returns details for one event type.",
        tags: ["Events"],
        parameters: timeParams(true),
        responses: {
          "200": ok("EventsSummaryResponse"),
          ...errorResponses("400", "401", "403", "404"),
        },
      }),
    },
    "/api/v1/sites/{siteId}/events": {
      parameters: [siteParam],
      get: op({
        operationId: "listEvents",
        summary: "List events",
        description: "Lists event records with cursor pagination.",
        tags: ["Events"],
        parameters: [
          ...timeParams(),
          filterParam(),
          ...cursorParams(),
          sortParam(),
          queryParam(
            "eventName",
            { type: "string", maxLength: 120 },
            "Event name filter.",
          ),
        ],
        responses: {
          "200": ok("EventListResponse"),
          ...errorResponses("400", "401", "403", "404"),
        },
      }),
    },
    "/api/v1/sites/{siteId}/events/summary": {
      parameters: [siteParam],
      get: op({
        operationId: "getEventsSummary",
        summary: "Get events summary",
        description: "Returns event summary metrics.",
        tags: ["Events"],
        parameters: [...timeParams(), filterParam()],
        responses: {
          "200": ok("GenericObjectResponse"),
          ...errorResponses("400", "401", "403", "404"),
        },
      }),
    },
    "/api/v1/sites/{siteId}/events/timeseries": {
      parameters: [siteParam],
      get: op({
        operationId: "getEventsTimeseries",
        summary: "Get events time series",
        description: "Returns event counts over time.",
        tags: ["Events"],
        parameters: [
          ...timeParams(true),
          filterParam(),
          queryParam(
            "eventName",
            { type: "string", maxLength: 120 },
            "Event name filter.",
          ),
        ],
        responses: {
          "200": ok("AnalyticsTimeseriesResponse"),
          ...errorResponses("400", "401", "403", "404"),
        },
      }),
    },
    "/api/v1/sites/{siteId}/events/search": {
      parameters: [siteParam],
      post: op({
        operationId: "searchEvents",
        summary: "Search events",
        description: "Searches events using complex payload filters.",
        tags: ["Events"],
        requestBody: requestBody("EventSearchRequest"),
        responses: {
          "200": ok("EventListResponse"),
          ...errorResponses("400", "401", "403", "404"),
        },
      }),
    },
    "/api/v1/sites/{siteId}/events/{eventId}": {
      parameters: [siteParam, eventIdParam],
      get: op({
        operationId: "getEvent",
        summary: "Get event",
        description: "Returns one event record.",
        tags: ["Events"],
        responses: {
          "200": ok("EventResponse"),
          ...errorResponses("401", "403", "404"),
        },
      }),
    },
    "/api/v1/sites/{siteId}/event-fields/values": {
      parameters: [siteParam],
      get: op({
        operationId: "getEventFieldValues",
        summary: "Get event field values",
        description: "Returns observed values for an event field.",
        tags: ["Events"],
        parameters: [
          ...timeParams(),
          queryParam(
            "eventName",
            { type: "string", maxLength: 120 },
            "Event name.",
          ),
          queryParam(
            "fieldPath",
            { type: "string", maxLength: 240 },
            "Field path.",
          ),
          queryParam(
            "search",
            { type: "string", maxLength: 160 },
            "Search text.",
          ),
        ],
        responses: {
          "200": ok("AnalyticsBreakdownResponse"),
          ...errorResponses("400", "401", "403", "404"),
        },
      }),
    },
    "/api/v1/sites/{siteId}/visitors": {
      parameters: [siteParam],
      get: op({
        operationId: "listVisitors",
        summary: "List visitors",
        description: "Lists visitors with cursor pagination.",
        tags: ["Visitors"],
        parameters: [
          ...timeParams(),
          filterParam(),
          ...cursorParams(),
          sortParam(),
          queryParam(
            "search",
            { type: "string", maxLength: 160 },
            "Search text.",
          ),
        ],
        responses: {
          "200": ok("VisitorListResponse"),
          ...errorResponses("400", "401", "403", "404"),
        },
      }),
    },
    "/api/v1/sites/{siteId}/visitors/{visitorId}": {
      parameters: [siteParam, visitorIdParam],
      get: op({
        operationId: "getVisitor",
        summary: "Get visitor",
        description: "Returns one visitor.",
        tags: ["Visitors"],
        responses: {
          "200": ok("VisitorResponse"),
          ...errorResponses("401", "403", "404"),
        },
      }),
    },
    "/api/v1/sites/{siteId}/visitors/{visitorId}/sessions": {
      parameters: [siteParam, visitorIdParam],
      get: op({
        operationId: "listVisitorSessions",
        summary: "List visitor sessions",
        description: "Lists sessions for a visitor.",
        tags: ["Visitors"],
        parameters: [...timeParams(), ...cursorParams()],
        responses: {
          "200": ok("SessionListResponse"),
          ...errorResponses("400", "401", "403", "404"),
        },
      }),
    },
    "/api/v1/sites/{siteId}/visitors/{visitorId}/events": {
      parameters: [siteParam, visitorIdParam],
      get: op({
        operationId: "listVisitorEvents",
        summary: "List visitor events",
        description: "Lists events for a visitor.",
        tags: ["Visitors"],
        parameters: [...timeParams(), ...cursorParams()],
        responses: {
          "200": ok("EventListResponse"),
          ...errorResponses("400", "401", "403", "404"),
        },
      }),
    },
    "/api/v1/sites/{siteId}/sessions": {
      parameters: [siteParam],
      get: op({
        operationId: "listSessions",
        summary: "List sessions",
        description: "Lists sessions with cursor pagination.",
        tags: ["Sessions"],
        parameters: [
          ...timeParams(),
          filterParam(),
          ...cursorParams(),
          sortParam(),
          queryParam(
            "search",
            { type: "string", maxLength: 160 },
            "Search text.",
          ),
        ],
        responses: {
          "200": ok("SessionListResponse"),
          ...errorResponses("400", "401", "403", "404"),
        },
      }),
    },
    "/api/v1/sites/{siteId}/sessions/{sessionId}": {
      parameters: [siteParam, sessionIdParam],
      get: op({
        operationId: "getSession",
        summary: "Get session",
        description: "Returns one session.",
        tags: ["Sessions"],
        responses: {
          "200": ok("SessionResponse"),
          ...errorResponses("401", "403", "404"),
        },
      }),
    },
    "/api/v1/sites/{siteId}/sessions/{sessionId}/events": {
      parameters: [siteParam, sessionIdParam],
      get: op({
        operationId: "listSessionEvents",
        summary: "List session events",
        description: "Lists events for a session.",
        tags: ["Sessions"],
        parameters: [...timeParams(), ...cursorParams()],
        responses: {
          "200": ok("EventListResponse"),
          ...errorResponses("400", "401", "403", "404"),
        },
      }),
    },
    "/api/v1/sites/{siteId}/funnels": {
      parameters: [siteParam],
      get: op({
        operationId: "listFunnels",
        summary: "List funnels",
        description: "Lists saved funnels.",
        tags: ["Funnels"],
        parameters: timeParams(),
        responses: {
          "200": ok("FunnelListResponse"),
          ...errorResponses("400", "401", "403", "404"),
        },
      }),
      post: op({
        operationId: "createFunnel",
        summary: "Create funnel",
        description: "Creates a saved funnel.",
        tags: ["Funnels"],
        parameters: [
          {
            name: "Idempotency-Key",
            in: "header",
            schema: { type: "string", maxLength: 200 },
            description: "Client-generated idempotency key.",
          },
        ],
        requestBody: requestBody("FunnelCreateInput"),
        responses: {
          "201": ok("FunnelResponse", "Created funnel"),
          ...errorResponses("400", "401", "403", "404"),
        },
      }),
    },
    "/api/v1/sites/{siteId}/funnels/analysis": {
      parameters: [siteParam],
      post: op({
        operationId: "analyzeFunnel",
        summary: "Analyze funnel",
        description: "Runs ad-hoc funnel analysis.",
        tags: ["Funnels"],
        requestBody: requestBody("FunnelAnalysisRequest"),
        responses: {
          "200": ok("FunnelAnalysisResponse"),
          ...errorResponses("400", "401", "403", "404"),
        },
      }),
    },
    "/api/v1/sites/{siteId}/funnels/{funnelId}": {
      parameters: [siteParam, { $ref: "#/components/parameters/funnelId" }],
      get: op({
        operationId: "getFunnel",
        summary: "Get funnel",
        description: "Returns one saved funnel.",
        tags: ["Funnels"],
        responses: {
          "200": ok("FunnelResponse"),
          ...errorResponses("401", "403", "404"),
        },
      }),
      patch: op({
        operationId: "updateFunnel",
        summary: "Update funnel",
        description: "Updates one saved funnel.",
        tags: ["Funnels"],
        requestBody: requestBody("FunnelUpdateInput"),
        responses: {
          "200": ok("FunnelResponse"),
          ...errorResponses("400", "401", "403", "404"),
        },
      }),
      delete: op({
        operationId: "deleteFunnel",
        summary: "Delete funnel",
        description: "Deletes one saved funnel.",
        tags: ["Funnels"],
        responses: {
          "204": { description: "No Content" },
          ...errorResponses("401", "403", "404"),
        },
      }),
    },
    "/api/v1/sites/{siteId}/funnels/{funnelId}/analysis": {
      parameters: [siteParam, { $ref: "#/components/parameters/funnelId" }],
      get: op({
        operationId: "getFunnelAnalysis",
        summary: "Get funnel analysis",
        description: "Runs analysis for a saved funnel.",
        tags: ["Funnels"],
        parameters: timeParams(),
        responses: {
          "200": ok("SavedFunnelAnalysisResponse"),
          ...errorResponses("400", "401", "403", "404"),
        },
      }),
    },
    "/api/v1/sites/{siteId}/performance/summary": {
      parameters: [siteParam],
      get: op({
        operationId: "getPerformanceSummary",
        summary: "Get performance summary",
        description:
          "Returns Core Web Vitals summary in milliseconds except CLS.",
        tags: ["Performance"],
        parameters: [...timeParams(), filterParam()],
        responses: {
          "200": ok("PerformanceSummaryResponse"),
          ...errorResponses("400", "401", "403", "404"),
        },
      }),
    },
    "/api/v1/sites/{siteId}/performance/timeseries": {
      parameters: [siteParam],
      get: op({
        operationId: "getPerformanceTimeseries",
        summary: "Get performance time series",
        description: "Returns Core Web Vitals over time.",
        tags: ["Performance"],
        parameters: [...timeParams(true), filterParam()],
        responses: {
          "200": ok("PerformanceTimeseriesResponse"),
          ...errorResponses("400", "401", "403", "404"),
        },
      }),
    },
    "/api/v1/sites/{siteId}/performance/breakdowns/{dimension}": {
      parameters: [siteParam, dimensionParam],
      get: op({
        operationId: "getPerformanceBreakdown",
        summary: "Get performance breakdown",
        description: "Breaks down Core Web Vitals by dimension.",
        tags: ["Performance"],
        parameters: [
          ...timeParams(),
          filterParam(),
          queryParam(
            "metric",
            { type: "string", enum: ["ttfb", "fcp", "lcp", "cls", "inp"] },
            "Performance metric.",
          ),
        ],
        responses: {
          "200": ok("PerformanceBreakdownResponse"),
          ...errorResponses("400", "401", "403", "404"),
        },
      }),
    },
    "/api/v1/sites/{siteId}/realtime/active-visitors": {
      parameters: [siteParam],
      get: op({
        operationId: "getRealtimeActiveVisitors",
        summary: "Get active visitors",
        description: "Returns the current active visitor count.",
        tags: ["Realtime"],
        responses: {
          "200": ok("ActiveVisitorsResponse"),
          ...errorResponses("401", "403", "404"),
        },
      }),
    },
    "/api/v1/sites/{siteId}/realtime/events": {
      parameters: [siteParam],
      get: op({
        operationId: "getRealtimeEvents",
        summary: "Get realtime events",
        description: "Returns recent realtime events.",
        tags: ["Realtime"],
        parameters: [
          queryParam(
            "limit",
            { type: "integer", minimum: 1, maximum: 1000 },
            "Maximum events.",
          ),
        ],
        responses: {
          "200": ok("RealtimeEventListResponse"),
          ...errorResponses("400", "401", "403", "404"),
        },
      }),
    },
    "/api/v1/sites/{siteId}/realtime/sessions": {
      parameters: [siteParam],
      get: op({
        operationId: "getRealtimeSessions",
        summary: "Get realtime sessions",
        description: "Returns recent realtime sessions.",
        tags: ["Realtime"],
        parameters: [
          queryParam(
            "limit",
            { type: "integer", minimum: 1, maximum: 1000 },
            "Maximum sessions.",
          ),
        ],
        responses: {
          "200": ok("RealtimeSessionListResponse"),
          ...errorResponses("400", "401", "403", "404"),
        },
      }),
    },
    "/api/v1/sites/{siteId}/realtime/snapshot": {
      parameters: [siteParam],
      get: op({
        operationId: "getRealtimeSnapshot",
        summary: "Get realtime snapshot",
        description:
          "Returns active visitors, recent events, and recent sessions.",
        tags: ["Realtime"],
        responses: {
          "200": ok("RealtimeSnapshotResponse"),
          ...errorResponses("401", "403", "404"),
        },
      }),
    },
    "/api/v1/batch": {
      post: op({
        operationId: "batch",
        summary: "Execute global batch",
        description: "Executes up to 20 GET subrequests under /api/v1.",
        tags: ["Batch"],
        parameters: [
          {
            name: "Idempotency-Key",
            in: "header",
            schema: { type: "string", maxLength: 200 },
            description: "Client-generated idempotency key.",
          },
        ],
        requestBody: requestBody("BatchRequest"),
        responses: {
          "200": ok("BatchResponse"),
          ...errorResponses("400", "401"),
        },
      }),
    },
  };
}

function buildSpec(): OpenAPISpec {
  const errorContent = {
    content: {
      [json]: {
        schema: ref("ErrorResponse"),
      },
    },
  };
  return {
    openapi: "3.1.0",
    info: {
      title: "InsightFlare API",
      description:
        "Privacy-focused web analytics API. Authenticated endpoints require an API key passed as a Bearer token in the Authorization header. All API times are ISO 8601 strings and analytics ranges use [from, to) semantics. If from, to, and preset are omitted, analytics endpoints default to the last 7 days ending at request time. The default timeZone is UTC.",
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
      { url: "https://insight.ravelloh.com", description: "Production" },
    ],
    security: [{ BearerAuth: [] }],
    tags: [
      { name: "Discovery", description: "API discovery and capabilities" },
      { name: "Token", description: "Token introspection" },
      { name: "Team", description: "Current team resources" },
      { name: "Sites", description: "Site resources" },
      {
        name: "Settings",
        description: "Tracking, privacy, and sharing settings",
      },
      { name: "Analytics", description: "Analytics data primitives" },
      { name: "Events", description: "Event resources" },
      { name: "Visitors", description: "Visitor resources" },
      { name: "Sessions", description: "Session resources" },
      { name: "Funnels", description: "Funnel resources and analysis" },
      { name: "Performance", description: "Core Web Vitals performance data" },
      { name: "Realtime", description: "Realtime activity" },
      { name: "Batch", description: "Global batch requests" },
      { name: "Ingestion", description: "Client SDK event collection" },
      { name: "Health", description: "Health checks" },
    ],
    paths: buildPaths(),
    components: {
      schemas: buildSchemas(),
      securitySchemes: {
        BearerAuth: {
          type: "http",
          scheme: "bearer",
          description:
            "API key passed as a Bearer token in the Authorization header.",
        },
      },
      parameters: {
        siteId: {
          name: "siteId",
          in: "path",
          required: true,
          schema: { type: "string", format: "uuid" },
          description: "Site UUID.",
        },
        dimension: {
          name: "dimension",
          in: "path",
          required: true,
          schema: { type: "string", maxLength: 120 },
          description: "Stable analytics dimension key.",
        },
        eventName: {
          name: "eventName",
          in: "path",
          required: true,
          schema: { type: "string", maxLength: 120 },
          description: "Event name.",
        },
        eventId: {
          name: "eventId",
          in: "path",
          required: true,
          schema: { type: "string", format: "uuid" },
          description: "Event UUID.",
        },
        visitorId: {
          name: "visitorId",
          in: "path",
          required: true,
          schema: { type: "string", format: "uuid" },
          description: "Visitor UUID.",
        },
        sessionId: {
          name: "sessionId",
          in: "path",
          required: true,
          schema: { type: "string", format: "uuid" },
          description: "Session UUID.",
        },
        funnelId: {
          name: "funnelId",
          in: "path",
          required: true,
          schema: { type: "string", format: "uuid" },
          description: "Funnel UUID.",
        },
      },
      responses: {
        BadRequest: { description: "Bad request", ...errorContent },
        Unauthorized: { description: "Authentication failed", ...errorContent },
        Forbidden: { description: "Insufficient permissions", ...errorContent },
        NotFound: { description: "Resource not found", ...errorContent },
        Conflict: { description: "Conflict", ...errorContent },
        PayloadTooLarge: { description: "Payload too large", ...errorContent },
        InternalError: { description: "Internal error", ...errorContent },
      },
    },
  };
}

function main() {
  const spec = buildSpec();
  const root = resolve(import.meta.dirname, "..");
  const yamlPath = resolve(root, "docs", "openapi.yaml");
  const jsonPath = resolve(root, "docs", "openapi.json");

  writeFileSync(yamlPath, YAML.stringify(spec, { indent: 2 }), "utf8");
  writeFileSync(jsonPath, JSON.stringify(spec, null, 2), "utf8");

  try {
    execSync(`npx prettier --write "${yamlPath}" "${jsonPath}"`, {
      stdio: "pipe",
    });
  } catch {
    // Files are valid even if formatting fails.
  }

  console.log(`Generated ${yamlPath}`);
  console.log(`Generated ${jsonPath}`);
}

main();
