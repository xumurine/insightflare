# API Route Inventory Before Hono-Native Refactor

Baseline HEAD: `70b09f0f820087f61f57839a2c68d1b2644691a1`

This inventory captures the production route surface after the Hono entry
migration and before the part 2 handler refactor. It is used as a parity
checklist; it is not an OpenAPI contract.

| Method | Path pattern | Current Hono route | Current production handler | Auth / scope | Site resolution | Cache / headers | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| OPTIONS | `/collect` | `routes/collect.ts` | `handleCollectOptionsRequest` | none | payload site only for POST | CORS 204 | Preflight only |
| POST | `/collect` | `routes/collect.ts` | `handleCollectRequest` | none | site settings by payload/query siteId | CORS 204, body limit, DO waitUntil | Bot/origin/path/custom event checks |
| GET | `/script.js` | `routes/tracker-script.ts` | `handleTrackerScriptRequest` | none | optional site config query | JS content/cache headers | Tracker SDK endpoint |
| GET | `/healthz` | `routes/health.ts` | inline Hono health handler | none | none | JSON | Binding status output |
| GET/HEAD | `/.well-known/openapi.json` | `routes/well-known.ts` | inline Hono handler | none | none | CORS/cache JSON | Dynamic server base URL |
| GET/HEAD | `/.well-known/skills.json` | `routes/well-known.ts` | inline Hono handler | none | none | CORS/cache JSON | Dynamic `${baseUrl}` replacement |
| GET/HEAD | `/.well-known/security.txt` | `routes/well-known.ts` | inline Hono handler | none | none | CORS/cache text | Static text |
| GET/HEAD | `/.well-known/change-password` | `routes/well-known.ts` | inline Hono handler | none | none | redirect/HEAD 200 | Redirects to `/app` |
| GET/HEAD | `/.well-known/health` | `routes/well-known.ts` | inline Hono handler | none | none | redirect/HEAD 200 | Redirects to `/healthz` |
| ALL | `/api/private/realtime/ws` | `routes/private/realtime.ts` | `handleAdminWs` | dashboard session | query `siteId` membership | DO websocket forward | Private realtime namespace |
| GET | `/api/public/resources/world-countries` | `routes/public/resources.ts` | `handleWorldCountriesRequest` | none | none | handler cache headers | Public helper resource |
| GET | `/api/public/resources/wiki-summary` | `routes/public/resources.ts` | `handleWikiSummaryRequest` | none | none | handler cache headers | Public helper resource |
| GET | `/api/public/resources/map-tiles/:z/:x/:y(.png)` | `routes/public/resources.ts` | `handleMapTileRequest` | none | none | upstream cache headers | Supports x wrap and dark fallback |
| ALL | `/api/private/admin/users` | `routes/private/admin.ts` | `handleUsersAdmin` | session | handler dependent | JSON | Resource-style admin route |
| ALL | `/api/private/admin/profile` | `routes/private/admin.ts` | `handleProfileAdmin` | session | handler dependent | JSON | Current profile update |
| ALL | `/api/private/admin/teams` | `routes/private/admin.ts` | `handleTeamsAdmin` | session | handler dependent | JSON | Team management |
| ALL | `/api/private/admin/sites` | `routes/private/admin.ts` | `handleSitesAdmin` | session | handler dependent | JSON | Site management |
| ALL | `/api/private/admin/members` | `routes/private/admin.ts` | `handleMembersAdmin` | session | handler dependent | JSON | Team member management |
| ALL | `/api/private/admin/site-config` | `routes/private/admin.ts` | `handleSiteConfigAdmin` | session | handler dependent | JSON | Tracker settings |
| ALL | `/api/private/archive/manifest` | `routes/private/archive.ts` | `handlePrivateArchiveManifest` | session | `siteId` membership | JSON | Archive manifest |
| GET/HEAD | `/api/private/archive/file` | `routes/private/archive.ts` | `handlePrivateArchiveFile` | session | archive row site membership | Range/ETag streaming | Archive file |
| GET | `/api/private/:queryPath` | `routes/private/query.ts` | `dispatchQueryRoute` | session | private site from query | private dashboard cache after auth/site | Dashboard query |
| POST/DELETE | `/api/private/funnels` | `routes/private/query.ts` | `dispatchQueryRoute` | session | private site from query | no read cache | Funnel mutation exception |
| ALL | `/api/private/team-dashboard` | `routes/private/query.ts` | `dispatchQueryRoute` | session | team context | no dashboard site cache | Special dashboard route |
| GET | `/api/public/share/:slug/site` | `routes/public/query.ts` | inline metadata handler | none | public enabled slug | public cache | Public site data |
| GET | `/api/public/share/:slug/:queryPath` | `routes/public/query.ts` | `dispatchQueryRoute` | none | public enabled slug | public cache | Allowlist via `PUBLIC_QUERY_PATHS` |
| POST/PATCH/DELETE | `/api/public/share/:slug/:queryPath` | `routes/public/query.ts` | method middleware | none | none if method rejected first | 405 JSON | Public API is GET-only |
| POST | `/api/public/session` | `routes/public/session.ts` | `handleLegacyAuthLogin` | credentials | none | Set-Cookie | Hono path avoids internal HTTP |
| DELETE | `/api/public/session` | `routes/public/session.ts` | `handleLegacyAuthLogout` | none | none | Clear Set-Cookie | Idempotent logout |
| GET | `/api/private/session` | `routes/private/session.ts` | `handleAuthMeAdmin` | session | user teams/profile | JSON | Current dashboard profile |
| GET | `/api/v1` | `routes/v1/index.ts` | `handleApiV1` | none | none | JSON v1 envelope | Root docs/capabilities links |
| ALL | `/api/v1/token` | `routes/v1/index.ts` | `handleApiV1` | API key | principal team | JSON v1 envelope | Segments router still in production |
| ALL | `/api/v1/token/check` | `routes/v1/index.ts` | `handleApiV1` | API key | principal team | JSON v1 envelope | Segments router still in production |
| ALL | `/api/v1/capabilities` | `routes/v1/index.ts` | `handleApiV1` | API key | principal team | JSON v1 envelope | Segments router still in production |
| ALL | `/api/v1/team/*` | `routes/v1/index.ts` | `handleApiV1` | API key + scopes | principal team | JSON v1 envelope | Segments router still in production |
| ALL | `/api/v1/sites` | `routes/v1/index.ts` | `handleApiV1` | API key + scopes | principal team/sites | JSON v1 envelope | Segments router still in production |
| ALL | `/api/v1/sites/:siteId/*` | `routes/v1/index.ts` | `handleApiV1` | API key + scopes | `siteById`/access semantics | JSON v1 envelope | Segments router still in production |
| POST | `/api/v1/batch` | `routes/v1/index.ts` | `handleApiV1` | API key | per subrequest | JSON v1 envelope | Subrequests currently call `handleApiV1` |

Production path match is controlled by `src/lib/hono/path-match.ts`; non-API
page traffic continues to the application router.
