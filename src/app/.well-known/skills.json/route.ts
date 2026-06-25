function getBaseUrl(request: Request): string {
  const host = request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

function getSkills(baseUrl: string) {
  return {
    api: "InsightFlare Analytics API",
    version: "1.0.0",
    base_url: baseUrl,
    github: {
      repository: "RavelloH/InsightFlare",
      url: "https://github.com/RavelloH/InsightFlare",
    },
    description:
      "Privacy-focused web analytics platform. Query pageviews, visitors, sessions, events, funnels, retention, and Core Web Vitals performance metrics. Manage sites and tracking configuration programmatically.",
    documentation_url: "/.well-known/openapi.json",
    openapi_url: "/.well-known/openapi.json",

    authentication: {
      type: "bearer",
      header: "Authorization",
      format: "Bearer ifk_live_<prefix>.<secret>",
      required: true,
      description:
        "All endpoints require an API key. If you do not have one, you MUST ask the user to provide their key or generate one from the InsightFlare dashboard under Settings → API Keys. Without a valid key, every request returns 401 Unauthorized.",
      obtain: {
        method: "Ask the user",
        instructions:
          "Before making any API call, ask the user: 'Do you have an InsightFlare API key? If so, please provide it. If not, you can generate one from the InsightFlare dashboard under Settings → API Keys.' The key format is ifk_live_<prefix>.<secret>.",
        dashboard_path: "/app/{team-slug}/settings/api-keys",
      },
      scopes: {
        "site:read": "List and view sites",
        "site:write": "Create, update, and delete sites",
        "site_config:read": "View tracking configuration and script snippets",
        "site_config:write": "Update tracking configuration",
        "analytics:read": "Query all analytics data",
      },
      error_responses: {
        401: {
          codes: ["invalid_api_key", "api_key_expired", "api_key_revoked"],
          action: "Ask the user for a valid key or to generate a new one.",
        },
        403: {
          codes: ["insufficient_scope"],
          action:
            "The key lacks the required scope. Ask the user to create a key with the needed permissions.",
        },
      },
    },

    standard_response_format: {
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
    },

    global_parameters: {
      from: {
        type: "integer",
        description: "Start timestamp in Unix milliseconds.",
        required_for: [
          "overview",
          "trend",
          "pages",
          "referrers",
          "visitors",
          "sessions",
          "events",
          "retention",
          "performance",
          "countries",
        ],
      },
      to: {
        type: "integer",
        description: "End timestamp in Unix milliseconds.",
        required_for: [
          "overview",
          "trend",
          "pages",
          "referrers",
          "visitors",
          "sessions",
          "events",
          "retention",
          "performance",
          "countries",
        ],
      },
      interval: {
        type: "string",
        enum: ["minute", "hour", "day", "week", "month"],
        description:
          "Time granularity for trend aggregation. Default varies by query.",
      },
      limit: {
        type: "integer",
        description: "Maximum number of results to return.",
      },
      siteId: {
        type: "string",
        format: "uuid",
        description:
          "Unique site identifier. Obtain from the list sites endpoint or the dashboard.",
      },
    },

    typical_workflow: [
      "1. Obtain an API key from the user (ask them, or direct them to dashboard → Settings → API Keys).",
      "2. Call GET /api/v1/sites to list available sites and get siteId values.",
      "3. Use the siteId to query analytics: GET /api/v1/sites/{siteId}/analytics/overview?from=...&to=...",
      "4. For time-series data, use the /trend endpoint with an interval parameter.",
      "5. For team-level summary, use GET /api/v1/team/dashboard.",
    ],

    endpoints: {
      sites: [
        {
          method: "GET",
          path: "/api/v1/sites",
          description: "List all sites accessible by the API key.",
          scope: "site:read",
          example: "/api/v1/sites",
        },
        {
          method: "POST",
          path: "/api/v1/sites",
          description:
            "Create a new site. Requires full site access (key must not be restricted to specific sites).",
          scope: "site:write",
          parameters: {
            name: "string (required) — site display name",
            domain: "string (required) — site domain",
            publicEnabled: "boolean (optional) — enable public stats page",
            publicSlug: "string (optional) — URL slug for public page",
          },
          example:
            'POST /api/v1/sites {"name": "My Blog", "domain": "blog.example.com"}',
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
          description: "Update site fields. Only provided fields are changed.",
          scope: "site:write",
          parameters: {
            name: "string",
            domain: "string",
            publicEnabled: "boolean",
            publicSlug: "string",
          },
        },
        {
          method: "DELETE",
          path: "/api/v1/sites/{siteId}",
          description: "Permanently delete a site and all its analytics data.",
          scope: "site:write",
        },
      ],

      site_config: [
        {
          method: "GET",
          path: "/api/v1/sites/{siteId}/config",
          description:
            "Get tracking script configuration (domain allowlists, blocked paths, etc.).",
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
          description:
            "Get the HTML <script> snippet to embed the tracking script on a website.",
          scope: "site_config:read",
          returns: {
            siteId: "string",
            src: "string — full URL to tracking script",
            snippet: "string — HTML script tag",
          },
        },
      ],

      analytics_overview: [
        {
          method: "GET",
          path: "/api/v1/sites/{siteId}/analytics/overview",
          description:
            "Get aggregate metrics: views, sessions, visitors, bounces, bounce rate, average duration.",
          scope: "analytics:read",
          parameters: {
            from: "Unix ms (required)",
            to: "Unix ms (required)",
            includeChange:
              "boolean — include previous period comparison and change rates",
            includeDetail: "boolean — include time-series trend breakdown",
            interval: "minute|hour|day|week|month",
          },
        },
        {
          method: "GET",
          path: "/api/v1/sites/{siteId}/analytics/trend",
          description:
            "Get time-series trend data (views, visitors, sessions, bounces per bucket).",
          scope: "analytics:read",
          parameters: {
            from: "Unix ms",
            to: "Unix ms",
            interval: "hour|day|week|month",
          },
        },
      ],

      analytics_content: [
        {
          method: "GET",
          path: "/api/v1/sites/{siteId}/analytics/pages",
          description: "Get top pages ranked by views.",
          scope: "analytics:read",
          parameters: { from: "Unix ms", to: "Unix ms", limit: "integer" },
        },
        {
          method: "GET",
          path: "/api/v1/sites/{siteId}/analytics/referrers",
          description: "Get top referrer sources.",
          scope: "analytics:read",
          parameters: { from: "Unix ms", to: "Unix ms", limit: "integer" },
        },
        {
          method: "GET",
          path: "/api/v1/sites/{siteId}/analytics/countries",
          description: "Get visitor distribution by country.",
          scope: "analytics:read",
        },
      ],

      analytics_visitors: [
        {
          method: "GET",
          path: "/api/v1/sites/{siteId}/analytics/visitors",
          description: "List visitors with pagination.",
          scope: "analytics:read",
          parameters: {
            from: "Unix ms",
            to: "Unix ms",
            page: "integer",
            pageSize: "integer",
          },
        },
        {
          method: "GET",
          path: "/api/v1/sites/{siteId}/analytics/sessions",
          description: "List sessions with pagination.",
          scope: "analytics:read",
          parameters: {
            from: "Unix ms",
            to: "Unix ms",
            page: "integer",
            pageSize: "integer",
          },
        },
      ],

      analytics_events: [
        {
          method: "GET",
          path: "/api/v1/sites/{siteId}/analytics/events-summary",
          description: "Get custom event summary statistics.",
          scope: "analytics:read",
        },
        {
          method: "GET",
          path: "/api/v1/sites/{siteId}/analytics/events-trend",
          description: "Get custom event time-series trend.",
          scope: "analytics:read",
        },
        {
          method: "GET",
          path: "/api/v1/sites/{siteId}/analytics/events-records",
          description: "List custom event records with pagination.",
          scope: "analytics:read",
        },
      ],

      analytics_advanced: [
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
          description:
            "Get Core Web Vitals metrics (TTFB, FCP, LCP, CLS, INP).",
          scope: "analytics:read",
        },
      ],

      analytics_technology: [
        {
          method: "GET",
          path: "/api/v1/sites/{siteId}/analytics/browser-trend",
          description: "Get browser usage trends over time.",
          scope: "analytics:read",
        },
        {
          method: "GET",
          path: "/api/v1/sites/{siteId}/analytics/browser-engine-trend",
          description: "Get browser engine trends.",
          scope: "analytics:read",
        },
        {
          method: "GET",
          path: "/api/v1/sites/{siteId}/analytics/browser-version-breakdown",
          description: "Get browser version distribution.",
          scope: "analytics:read",
        },
        {
          method: "GET",
          path: "/api/v1/sites/{siteId}/analytics/browser-cross-breakdown",
          description: "Get browser × OS cross-tabulation.",
          scope: "analytics:read",
        },
        {
          method: "GET",
          path: "/api/v1/sites/{siteId}/analytics/client-dimension-trend",
          description: "Get client dimension (browser/OS/device) trends.",
          scope: "analytics:read",
        },
        {
          method: "GET",
          path: "/api/v1/sites/{siteId}/analytics/utm-source",
          description: "Get UTM source breakdown.",
          scope: "analytics:read",
        },
        {
          method: "GET",
          path: "/api/v1/sites/{siteId}/analytics/utm-medium",
          description: "Get UTM medium breakdown.",
          scope: "analytics:read",
        },
        {
          method: "GET",
          path: "/api/v1/sites/{siteId}/analytics/utm-campaign",
          description: "Get UTM campaign breakdown.",
          scope: "analytics:read",
        },
        {
          method: "GET",
          path: "/api/v1/sites/{siteId}/analytics/utm-term",
          description: "Get UTM term breakdown.",
          scope: "analytics:read",
        },
        {
          method: "GET",
          path: "/api/v1/sites/{siteId}/analytics/utm-content",
          description: "Get UTM content breakdown.",
          scope: "analytics:read",
        },
      ],

      team: [
        {
          method: "GET",
          path: "/api/v1/team/dashboard",
          description:
            "Get aggregated team dashboard with per-site summaries and trend data.",
          scope: "analytics:read",
          parameters: {
            from: "Unix ms (required)",
            to: "Unix ms (required)",
            interval: "hour|day|week|month",
          },
        },
      ],
    },

    implementation_notes: [
      "All timestamps are in Unix milliseconds (not seconds).",
      "The siteId parameter is a UUID. Obtain it from GET /api/v1/sites.",
      "Pagination uses page/pageSize for visitors and sessions endpoints.",
      "The /analytics/{queryName} path supports all query names listed in the endpoints above.",
      "Rate limits are not currently enforced but may be added. Design for graceful 429 handling.",
      "For LLM agents: always ask the user for an API key before making any request. Do not attempt to guess or generate keys.",
    ],
  };
}

const HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "public, max-age=3600, s-maxage=3600",
  "access-control-allow-origin": "*",
};

export function GET(request: Request) {
  const baseUrl = getBaseUrl(request);
  const body = JSON.stringify(getSkills(baseUrl));
  return new Response(body, { status: 200, headers: HEADERS });
}

export function HEAD() {
  return new Response(null, { status: 200, headers: HEADERS });
}
