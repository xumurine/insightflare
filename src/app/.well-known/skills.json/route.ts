const SKILLS = {
  schema_version: "v1",
  name: "InsightFlare",
  description:
    "Privacy-focused web analytics platform API. Manage sites, retrieve analytics data (pageviews, visitors, sessions, events, funnels, retention, performance), and configure tracking scripts.",
  version: "1.0.0",
  documentation_url: "/.well-known/openapi.json",
  authentication: {
    type: "bearer",
    description:
      "API key in format ifk_live_<prefix>.<secret>. Generate from dashboard under Settings > API Keys.",
  },
  skills: [
    {
      id: "site-management",
      name: "Site Management",
      description: "Create, read, update, and delete analytics sites.",
      scopes: ["site:read", "site:write"],
      endpoints: [
        {
          method: "GET",
          path: "/api/v1/sites",
          description: "List all sites accessible by the API key.",
          scope: "site:read",
        },
        {
          method: "POST",
          path: "/api/v1/sites",
          description: "Create a new site.",
          scope: "site:write",
          parameters: {
            name: "string (required)",
            domain: "string (required)",
            publicEnabled: "boolean (optional)",
            publicSlug: "string (optional)",
          },
        },
        {
          method: "GET",
          path: "/api/v1/sites/{siteId}",
          description: "Get a single site by ID.",
          scope: "site:read",
        },
        {
          method: "PATCH",
          path: "/api/v1/sites/{siteId}",
          description: "Update site fields.",
          scope: "site:write",
        },
        {
          method: "DELETE",
          path: "/api/v1/sites/{siteId}",
          description: "Delete a site and all its data.",
          scope: "site:write",
        },
      ],
    },
    {
      id: "site-configuration",
      name: "Site Configuration",
      description:
        "Manage tracking script configuration and retrieve embed snippets.",
      scopes: ["site_config:read", "site_config:write"],
      endpoints: [
        {
          method: "GET",
          path: "/api/v1/sites/{siteId}/config",
          description: "Get tracking script configuration for a site.",
          scope: "site_config:read",
        },
        {
          method: "PATCH",
          path: "/api/v1/sites/{siteId}/config",
          description: "Update tracking script configuration.",
          scope: "site_config:write",
        },
        {
          method: "GET",
          path: "/api/v1/sites/{siteId}/script-snippet",
          description: "Get the HTML snippet to embed the tracking script.",
          scope: "site_config:read",
        },
      ],
    },
    {
      id: "analytics-queries",
      name: "Analytics Queries",
      description:
        "Query analytics data including pageviews, visitors, sessions, events, funnels, retention, and performance metrics.",
      scopes: ["analytics:read"],
      endpoints: [
        {
          method: "GET",
          path: "/api/v1/sites/{siteId}/analytics/overview",
          description:
            "Get overview metrics (views, sessions, visitors, bounces, duration).",
          scope: "analytics:read",
          parameters: {
            from: "Unix ms timestamp (required)",
            to: "Unix ms timestamp (required)",
            includeChange: "boolean — include previous period comparison",
            includeDetail: "boolean — include trend breakdown",
            interval: "minute|hour|day|week|month",
          },
        },
        {
          method: "GET",
          path: "/api/v1/sites/{siteId}/analytics/trend",
          description: "Get time-series trend data.",
          scope: "analytics:read",
          parameters: {
            from: "Unix ms timestamp",
            to: "Unix ms timestamp",
            interval: "minute|hour|day|week|month",
          },
        },
        {
          method: "GET",
          path: "/api/v1/sites/{siteId}/analytics/pages",
          description: "Get top pages by views.",
          scope: "analytics:read",
          parameters: { from: "Unix ms", to: "Unix ms", limit: "integer" },
        },
        {
          method: "GET",
          path: "/api/v1/sites/{siteId}/analytics/referrers",
          description: "Get top referrer sources.",
          scope: "analytics:read",
        },
        {
          method: "GET",
          path: "/api/v1/sites/{siteId}/analytics/visitors",
          description: "List visitors with pagination.",
          scope: "analytics:read",
          parameters: { page: "integer", pageSize: "integer" },
        },
        {
          method: "GET",
          path: "/api/v1/sites/{siteId}/analytics/sessions",
          description: "List sessions with pagination.",
          scope: "analytics:read",
          parameters: { page: "integer", pageSize: "integer" },
        },
        {
          method: "GET",
          path: "/api/v1/sites/{siteId}/analytics/events-summary",
          description: "Get custom event summary statistics.",
          scope: "analytics:read",
        },
        {
          method: "GET",
          path: "/api/v1/sites/{siteId}/analytics/funnels",
          description: "List or analyze conversion funnels.",
          scope: "analytics:read",
        },
        {
          method: "GET",
          path: "/api/v1/sites/{siteId}/analytics/retention",
          description: "Get user retention cohort analysis.",
          scope: "analytics:read",
        },
        {
          method: "GET",
          path: "/api/v1/sites/{siteId}/analytics/performance",
          description: "Get Core Web Vitals performance metrics.",
          scope: "analytics:read",
        },
        {
          method: "GET",
          path: "/api/v1/sites/{siteId}/analytics/countries",
          description: "Get visitor distribution by country.",
          scope: "analytics:read",
        },
        {
          method: "GET",
          path: "/api/v1/team/dashboard",
          description: "Get aggregated team dashboard with per-site summaries.",
          scope: "analytics:read",
          parameters: {
            from: "Unix ms timestamp (required)",
            to: "Unix ms timestamp (required)",
          },
        },
      ],
    },
  ],
  common_parameters: {
    from: {
      type: "integer",
      description: "Start timestamp in Unix milliseconds",
    },
    to: {
      type: "integer",
      description: "End timestamp in Unix milliseconds",
    },
    interval: {
      type: "string",
      enum: ["minute", "hour", "day", "week", "month"],
      description: "Time granularity for aggregation",
    },
    limit: {
      type: "integer",
      description: "Maximum number of results to return",
    },
  },
  response_envelope: {
    success: {
      ok: true,
      requestId: "string — Cloudflare Ray ID for tracing",
      timestamp: "ISO 8601 string",
      data: "object — response payload",
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
  },
} as const;

const BODY = JSON.stringify(SKILLS);
const HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "public, max-age=3600, s-maxage=3600",
  "access-control-allow-origin": "*",
};

export function GET() {
  return new Response(BODY, { status: 200, headers: HEADERS });
}

export function HEAD() {
  return new Response(null, { status: 200, headers: HEADERS });
}
