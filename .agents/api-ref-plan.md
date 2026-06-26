InsightFlare API v1 重构计划

0. 背景与目标

InsightFlare 当前 API 仍处于开发阶段，尚未作为稳定公共 API 正式发布。因此，本次重构可以直接重塑 /api/v1 的长期契约，不需要引入 /api/v2，也不需要考虑向后兼容旧版 queryName 风格接口。

本次重构的目标是设计并实现一套未来几年可稳定演进的 API 系统，使其同时适合以下调用方：

* Web Dashboard 前端
* 第三方开发者
* 数据分析师
* SDK
* AI Agent / Skills / 自动化分析工具
* Codex / Claude Code 等代码 Agent

本次重构的核心原则：

1. /api/v1 作为正式稳定 API 入口。
2. /collect 保持现状，不纳入 /api/v1 重构。
3. API Key 是 team-scoped，不在外部 API 路径中暴露 {teamId}。
4. siteId 继续使用 UUID，保持与现有系统一致。
5. 彻底移除 queryName。
6. Analytics API 不再暴露 dashboard 图表内部名称，而是抽象为稳定的数据原语。
7. 所有时间输入输出统一使用 ISO 8601 字符串。
8. API 响应移除 ok 字段，统一使用 data / meta / error。
9. 支持默认时间范围与 preset 时间范围。
10. 查询过滤使用 filter[field]=value 风格。
11. 列表分页统一使用 cursor pagination。
12. 全局 batch 使用 /api/v1/batch。
13. 保留 /.well-known/skills.json，但彻底改为 Agent manifest，不再重复 OpenAPI 端点文档。
14. OpenAPI 是唯一正式 API 契约。
15. API 响应本身应尽量具备自解释能力，类似 GitHub API 的响应风格。

⸻

1. 不在本次重构范围内的内容

以下内容暂不实现，避免扩大复杂度：

1.1 不新增 /api/v2

当前 v1 尚未正式发布，因此直接重构 /api/v1。

1.2 不修改 /collect 路径

继续保留：

POST /collect

/collect 是客户端 SDK 数据采集入口，不纳入 /api/v1。

1.3 不公开 API Key 管理接口

暂不实现：

GET  /api/v1/team/api-keys
POST /api/v1/team/api-keys
POST /api/v1/team/api-keys/{keyId}/rotate
POST /api/v1/team/api-keys/{keyId}/revoke

API Key 管理继续仅在 Web Dashboard 中进行。

但需要新增 token 自省接口：

GET  /api/v1/token
POST /api/v1/token/check

1.4 不拆分 analytics 权限

暂时保持分析类权限统一：

analytics:read

该权限覆盖：

* analytics 聚合查询
* events 读取
* visitors 读取
* sessions 读取
* funnels 分析
* realtime 数据
* performance 数据

不拆为 events:read、journeys:read、realtime:read 等更细权限。

1.5 不加入自定义 rate limit header

限流由 Cloudflare 负责，应用层不返回：

RateLimit-Limit
RateLimit-Remaining
RateLimit-Reset

如被 Cloudflare 限流，按 Cloudflare 行为处理即可。OpenAPI 中不需要承诺应用层限流头。

1.6 不加入 stability / deprecation 体系

暂不加入：

x-stability
Deprecation
Sunset

未来若出现 breaking change，直接进入新版本 API。

1.7 不实现 reports / insights 层

暂不实现：

POST /api/v1/sites/{siteId}/reports
POST /api/v1/sites/{siteId}/insights

AI 分析先通过 Agent 组合底层 API 完成，不在本次重构中引入服务端生成报告能力。

⸻

2. 最终 API 目录结构

2.1 顶层结构

/api/v1
├─ GET /
├─ token
├─ capabilities
├─ team
├─ sites
└─ batch
/collect
├─ POST /
/.well-known
├─ openapi.json
└─ skills.json
/healthz

⸻

3. /api/v1 Root Discovery

3.1 Endpoint

GET /api/v1

3.2 认证

不需要认证。

3.3 用途

返回 API root discovery 信息，方便 SDK、AI Agent、调试工具发现 API 入口。

3.4 响应示例

{
  "data": {
    "version": "1.0.0",
    "service": "insightflare",
    "links": {
      "openapi": "/.well-known/openapi.json",
      "skills": "/.well-known/skills.json",
      "token": "/api/v1/token",
      "capabilities": "/api/v1/capabilities",
      "team": "/api/v1/team",
      "sites": "/api/v1/sites",
      "batch": "/api/v1/batch"
    }
  },
  "meta": {
    "generatedAt": "2026-06-26T12:00:00Z"
  }
}

3.5 实现要求

* 不应暴露任何用户数据。
* 不应依赖 API Key。
* 应返回稳定的 machine-readable links。
* generatedAt 使用 ISO 8601 UTC 时间。

⸻

4. 认证与 Token 自省

4.1 认证方式

所有 /api/v1/* 业务接口使用 Bearer API Key：

Authorization: Bearer <api_key>

OpenAPI 和 skills 中不要继续暴露 API Key 的具体内部格式。

推荐文档描述：

All authenticated API endpoints require an API key passed as a Bearer token in the Authorization header.

不要写：

ifk_live_<prefix>.<secret>

4.2 Token Scope

保留当前简化 scope 模型：

site:read
site:write
site_config:read
site_config:write
analytics:read

含义：

site:read
- list sites
- get site
site:write
- create site
- update site
- delete site
site_config:read
- read tracking settings
- read privacy settings
- read sharing settings
- read script snippet
site_config:write
- update tracking settings
- update privacy settings
- update sharing settings
analytics:read
- read analytics overview
- read timeseries
- read breakdowns
- read events
- read visitors
- read sessions
- read funnels analysis
- read realtime data
- read performance data
- read analytics schema

4.3 GET /api/v1/token

Endpoint

GET /api/v1/token

认证

需要 Bearer API Key。

用途

返回当前 token 的状态、有效期、所属 team、权限和可访问站点。

响应示例

{
  "data": {
    "id": "8f5a20c2-0d2b-4b93-a57c-f7df1f2ef111",
    "name": "Production API Key",
    "status": "active",
    "createdAt": "2026-06-01T00:00:00Z",
    "expiresAt": "2026-12-01T00:00:00Z",
    "lastUsedAt": "2026-06-26T12:00:00Z",
    "team": {
      "id": "5f3f2f3b-3f7a-41e4-9b96-2d6a7f650101",
      "name": "RavelloH"
    },
    "scopes": [
      "site:read",
      "analytics:read"
    ],
    "siteAccess": {
      "mode": "restricted",
      "siteIds": [
        "550e8400-e29b-41d4-a716-446655440000"
      ]
    }
  },
  "meta": {
    "requestId": "req_abc123",
    "generatedAt": "2026-06-26T12:00:00Z"
  }
}

siteAccess.mode

all
restricted

规则：

all
- 当前 token 可以访问所属 team 下全部 sites
restricted
- 当前 token 只能访问 siteIds 中列出的 sites

不允许返回

不得返回：

完整 API key
secret
key hash
内部加密材料

4.4 POST /api/v1/token/check

Endpoint

POST /api/v1/token/check

认证

需要 Bearer API Key。

用途

让调用方批量检查当前 token 是否具备某些 scope / site 权限。

请求示例

{
  "checks": [
    {
      "scope": "analytics:read",
      "siteId": "550e8400-e29b-41d4-a716-446655440000"
    },
    {
      "scope": "site:write"
    }
  ]
}

响应示例

{
  "data": {
    "checks": [
      {
        "scope": "analytics:read",
        "siteId": "550e8400-e29b-41d4-a716-446655440000",
        "allowed": true
      },
      {
        "scope": "site:write",
        "allowed": false,
        "reason": "missing_scope"
      }
    ]
  },
  "meta": {
    "requestId": "req_abc123",
    "generatedAt": "2026-06-26T12:00:00Z"
  }
}

reason enum

missing_scope
site_not_allowed
token_inactive

⸻

5. Capabilities

5.1 GET /api/v1/capabilities

Endpoint

GET /api/v1/capabilities

认证

需要 Bearer API Key。

用途

返回当前 token 在当前 team 下可用的运行时能力。

响应示例

{
  "data": {
    "apiVersion": "1.0.0",
    "features": {
      "sites": true,
      "tracking": true,
      "privacy": true,
      "sharing": true,
      "analytics": true,
      "events": true,
      "visitors": true,
      "sessions": true,
      "funnels": true,
      "performance": true,
      "realtime": true,
      "exports": false,
      "batch": true
    },
    "limits": {
      "batchMaxRequests": 20,
      "defaultTimeRangeDays": 7,
      "maxTimeRangeDays": 365,
      "defaultPageLimit": 100,
      "maxPageLimit": 1000
    },
    "links": {
      "token": "/api/v1/token",
      "sites": "/api/v1/sites",
      "batch": "/api/v1/batch"
    }
  },
  "meta": {
    "requestId": "req_abc123",
    "generatedAt": "2026-06-26T12:00:00Z"
  }
}

5.2 实现要求

* 返回值应根据 token scope 和系统功能动态生成。
* 不要暴露 Cloudflare 内部限流细节。
* exports 如尚未实现，返回 false。
* links 应帮助调用方继续发现 API。

⸻

6. Team API

6.1 设计原则

API Key 是 team-scoped，因此不使用：

/api/v1/teams/{teamId}

而使用：

/api/v1/team

6.2 Endpoints

GET /api/v1/team
GET /api/v1/team/usage
GET /api/v1/team/analytics/overview
GET /api/v1/team/analytics/timeseries
GET /api/v1/team/analytics/sites
GET /api/v1/team/analytics/breakdowns/{dimension}

6.3 GET /api/v1/team

返回当前 token 所属 team。

{
  "data": {
    "id": "5f3f2f3b-3f7a-41e4-9b96-2d6a7f650101",
    "name": "RavelloH",
    "createdAt": "2026-01-01T00:00:00Z",
    "links": {
      "usage": "/api/v1/team/usage",
      "sites": "/api/v1/sites",
      "analyticsOverview": "/api/v1/team/analytics/overview"
    }
  },
  "meta": {
    "requestId": "req_abc123",
    "generatedAt": "2026-06-26T12:00:00Z"
  }
}

6.4 Team analytics 说明

Team analytics 只聚合当前 token 可访问的 sites。

如果 token 是 restricted site access，则 team analytics 只能聚合允许访问的站点。

⸻

7. Sites API

7.1 Endpoints

GET    /api/v1/sites
POST   /api/v1/sites
GET    /api/v1/sites/{siteId}
PATCH  /api/v1/sites/{siteId}
DELETE /api/v1/sites/{siteId}

7.2 GET /api/v1/sites

Scope

site:read

响应示例

{
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "My Blog",
      "domain": "example.com",
      "createdAt": "2026-06-01T00:00:00Z",
      "updatedAt": "2026-06-26T12:00:00Z",
      "sharing": {
        "publicEnabled": false,
        "publicSlug": null
      },
      "links": {
        "self": "/api/v1/sites/550e8400-e29b-41d4-a716-446655440000",
        "tracking": "/api/v1/sites/550e8400-e29b-41d4-a716-446655440000/tracking",
        "analytics": "/api/v1/sites/550e8400-e29b-41d4-a716-446655440000/analytics/overview"
      }
    }
  ],
  "meta": {
    "requestId": "req_abc123",
    "generatedAt": "2026-06-26T12:00:00Z"
  }
}

7.3 Site Resource

Site 响应不需要默认返回 teamId，因为 team 已由 token 决定。

如确实需要调试，可通过 /api/v1/token 或 /api/v1/team 获取 team 信息。

7.4 Site Create

Endpoint

POST /api/v1/sites

Scope

site:write

请求

{
  "name": "My Blog",
  "domain": "example.com",
  "sharing": {
    "publicEnabled": false,
    "publicSlug": null
  }
}

响应

201 Created

返回创建后的 site resource。

Idempotency

支持：

Idempotency-Key: <client-generated-key>

用于避免客户端重试时重复创建 site。

⸻

8. Site Settings API

旧设计中的：

/api/v1/sites/{siteId}/config
/api/v1/sites/{siteId}/script-snippet

重构为更明确的 settings 资源。

8.1 Endpoints

GET   /api/v1/sites/{siteId}/tracking
PATCH /api/v1/sites/{siteId}/tracking
GET   /api/v1/sites/{siteId}/tracking/script
GET   /api/v1/sites/{siteId}/privacy
PATCH /api/v1/sites/{siteId}/privacy
GET   /api/v1/sites/{siteId}/sharing
PATCH /api/v1/sites/{siteId}/sharing

8.2 Tracking Settings

GET /api/v1/sites/{siteId}/tracking

Scope:

site_config:read

响应示例：

{
  "data": {
    "trackPageviews": true,
    "trackQuery": true,
    "trackHash": false,
    "trackCustomEvents": true,
    "trackEngagement": true,
    "trackWebVitals": true,
    "autoTrackOutboundLinks": true,
    "trackingStrength": "smart",
    "allowedDomains": [
      "example.com"
    ],
    "excludedPaths": []
  },
  "meta": {
    "requestId": "req_abc123",
    "generatedAt": "2026-06-26T12:00:00Z"
  }
}

8.3 Tracking Script

Endpoint

GET /api/v1/sites/{siteId}/tracking/script

Scope:

site_config:read

响应示例：

{
  "data": {
    "siteId": "550e8400-e29b-41d4-a716-446655440000",
    "src": "https://insight.ravelloh.com/script.js?siteId=550e8400-e29b-41d4-a716-446655440000",
    "snippet": "<script defer src=\"https://insight.ravelloh.com/script.js?siteId=550e8400-e29b-41d4-a716-446655440000\"></script>"
  },
  "meta": {
    "requestId": "req_abc123",
    "generatedAt": "2026-06-26T12:00:00Z"
  }
}

8.4 Privacy Settings

Endpoint

GET   /api/v1/sites/{siteId}/privacy
PATCH /api/v1/sites/{siteId}/privacy

Scope:

site_config:read
site_config:write

建议字段：

{
  "data": {
    "respectDoNotTrack": true,
    "anonymizeIp": true,
    "euMode": true,
    "visitorTokenMode": "daily",
    "dataRetentionDays": 180
  }
}

8.5 Sharing Settings

Endpoint

GET   /api/v1/sites/{siteId}/sharing
PATCH /api/v1/sites/{siteId}/sharing

Scope:

site_config:read
site_config:write

建议字段：

{
  "data": {
    "publicEnabled": false,
    "publicSlug": null
  }
}

⸻

9. Query Parameter 规范

9.1 时间参数

所有分析相关接口统一支持：

from
to
timeZone
preset

9.2 时间格式

所有时间输入输出均为 ISO 8601 字符串。

示例：

2026-06-26T12:00:00Z

不再在 /api/v1 查询参数中使用 Unix milliseconds。

9.3 时间范围语义

from inclusive
to exclusive

即：

[from, to)

9.4 默认时间范围

如果未传 from、to、preset：

from = now - 7 days
to = now
timeZone = UTC

9.5 Preset

支持：

today
yesterday
last_7_days
last_30_days
this_week
last_week
this_month
last_month

规则：

preset 与 from/to 互斥
preset 受 timeZone 影响
preset 解析后的 from/to 仍然遵守 from inclusive, to exclusive

示例：

GET /api/v1/sites/{siteId}/analytics/overview?preset=last_7_days&timeZone=Asia/Shanghai

9.6 Interval

仅时间序列类接口支持：

interval=minute|hour|day|week|month

不要在 overview、breakdowns 等不需要时间桶的接口中暴露 interval。

9.7 Metrics

数组参数统一使用逗号分隔：

metrics=views,sessions,visitors

OpenAPI 设置：

style: form
explode: false

9.8 Filters

简单 GET 过滤统一使用：

filter[geo.country]=US
filter[client.browser]=Chrome
filter[page.path]=/posts/hello

语义默认为 eq。

OpenAPI 中建议使用 deepObject 描述：

name: filter
in: query
style: deepObject
explode: true
schema:
  type: object
  additionalProperties:
    type: string

9.9 复杂过滤

复杂过滤只走 POST body。

适用接口：

POST /api/v1/sites/{siteId}/analytics/explore
POST /api/v1/sites/{siteId}/events/search

支持操作符：

eq
neq
in
notIn
contains
startsWith
endsWith
gt
gte
lt
lte
exists
notExists

示例：

{
  "filters": [
    {
      "field": "page.path",
      "op": "startsWith",
      "value": "/posts/"
    },
    {
      "field": "geo.country",
      "op": "in",
      "value": ["US", "JP", "GB"]
    }
  ]
}

9.10 Sort

统一使用单个 sort 参数。

sort=-visitors
sort=page.path
sort=-lastSeenAt

规则：

无前缀：升序
- 前缀：降序

不再使用：

sortBy
sortDir

9.11 Cursor Pagination

分页统一使用：

limit
cursor

示例：

GET /api/v1/sites/{siteId}/events?limit=100&cursor=cur_xxx

响应：

{
  "data": [],
  "pagination": {
    "limit": 100,
    "nextCursor": "cur_next",
    "hasMore": true
  },
  "meta": {
    "requestId": "req_abc123",
    "generatedAt": "2026-06-26T12:00:00Z"
  }
}

无下一页：

{
  "pagination": {
    "limit": 100,
    "nextCursor": null,
    "hasMore": false
  }
}

⸻

10. 响应格式规范

10.1 删除 ok

新 API 中不再返回：

{
  "ok": true
}

HTTP status 已表达成功或失败。

10.2 成功响应

对象响应：

{
  "data": {},
  "meta": {
    "requestId": "req_abc123",
    "generatedAt": "2026-06-26T12:00:00Z"
  }
}

数组响应：

{
  "data": [],
  "meta": {
    "requestId": "req_abc123",
    "generatedAt": "2026-06-26T12:00:00Z"
  }
}

分页响应：

{
  "data": [],
  "pagination": {
    "limit": 100,
    "nextCursor": null,
    "hasMore": false
  },
  "meta": {
    "requestId": "req_abc123",
    "generatedAt": "2026-06-26T12:00:00Z"
  }
}

10.3 错误响应

{
  "error": {
    "code": "insufficient_scope",
    "message": "The API key does not have permission to read analytics.",
    "details": {
      "requiredScope": "analytics:read"
    }
  },
  "meta": {
    "requestId": "req_abc123",
    "generatedAt": "2026-06-26T12:00:00Z"
  }
}

10.4 错误码

统一使用 snake_case：

invalid_request
invalid_json
validation_failed
invalid_api_key
api_key_expired
api_key_revoked
insufficient_scope
site_not_found
resource_not_found
conflict
payload_too_large
internal_error

10.5 认证错误

无效 token：

401 Unauthorized

错误码：

invalid_api_key
api_key_expired
api_key_revoked

权限不足：

403 Forbidden

错误码：

insufficient_scope

站点不可访问：

404 Not Found

不要返回 403 暴露该 site 存在但不可访问。

⸻

11. 响应自文档化设计

API 响应应尽量像 GitHub API 一样具备自解释能力。重点不是在每个响应里塞完整文档，而是让调用方可以顺着响应发现下一步操作。

11.1 Resource links

主要资源响应应包含 links。

示例 site：

{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "My Blog",
  "domain": "example.com",
  "links": {
    "self": "/api/v1/sites/550e8400-e29b-41d4-a716-446655440000",
    "tracking": "/api/v1/sites/550e8400-e29b-41d4-a716-446655440000/tracking",
    "privacy": "/api/v1/sites/550e8400-e29b-41d4-a716-446655440000/privacy",
    "sharing": "/api/v1/sites/550e8400-e29b-41d4-a716-446655440000/sharing",
    "analyticsOverview": "/api/v1/sites/550e8400-e29b-41d4-a716-446655440000/analytics/overview",
    "analyticsSchema": "/api/v1/sites/550e8400-e29b-41d4-a716-446655440000/analytics/schema",
    "events": "/api/v1/sites/550e8400-e29b-41d4-a716-446655440000/events",
    "sessions": "/api/v1/sites/550e8400-e29b-41d4-a716-446655440000/sessions",
    "visitors": "/api/v1/sites/550e8400-e29b-41d4-a716-446655440000/visitors",
    "realtime": "/api/v1/sites/550e8400-e29b-41d4-a716-446655440000/realtime/snapshot"
  }
}

11.2 Meta links

集合响应可以包含 meta.links 或顶层 links。

推荐优先：

{
  "data": [],
  "links": {
    "self": "/api/v1/sites",
    "create": "/api/v1/sites"
  },
  "meta": {
    "requestId": "req_abc123",
    "generatedAt": "2026-06-26T12:00:00Z"
  }
}

11.3 Schema discovery

不要在普通响应里塞完整字段字典。

字段字典交给：

GET /api/v1/sites/{siteId}/analytics/schema

11.4 Error help

错误响应可以包含可选 help：

{
  "error": {
    "code": "insufficient_scope",
    "message": "The API key does not have permission to read analytics.",
    "details": {
      "requiredScope": "analytics:read"
    },
    "help": {
      "token": "/api/v1/token",
      "documentation": "/.well-known/openapi.json"
    }
  },
  "meta": {
    "requestId": "req_abc123",
    "generatedAt": "2026-06-26T12:00:00Z"
  }
}

⸻

12. 数值、单位、格式规范

12.1 时间点

所有时间点字段使用 ISO 8601 字符串：

{
  "createdAt": "2026-06-26T12:00:00Z"
}

12.2 持续时间

持续时间字段统一以毫秒为单位，字段名以 Ms 结尾：

{
  "durationMs": 12345,
  "avgDurationMs": 506000
}

12.3 字节

大小字段以 bytes 为单位，字段名以 Bytes 结尾：

{
  "payloadSizeBytes": 2048
}

12.4 比率

比率使用 0 到 1 的小数：

{
  "bounceRate": 0.386,
  "conversionRate": 0.453
}

不要返回 0 到 100 的百分比，除非字段名明确包含 Percentage。

12.5 数量

数量使用 integer：

{
  "views": 1000,
  "sessions": 800,
  "visitors": 600
}

12.6 Unknown / Direct

未知值统一：

{
  "key": "__unknown__",
  "label": "Unknown"
}

直接访问统一：

{
  "key": "__direct__",
  "label": "Direct"
}

不要混用：

null
""
"Unknown"
"Direct"

null 只表示真实缺失，不表示 Unknown / Direct。

12.7 字段命名

API JSON 字段统一使用 camelCase。

示例：

createdAt
updatedAt
avgDurationMs
bounceRate
publicEnabled
siteAccess

⸻

13. Analytics API

13.1 设计原则

移除旧式：

/api/v1/sites/{siteId}/analytics/{queryName}

改为稳定数据原语：

overview
timeseries
breakdowns
cross-breakdowns
compare
explore
retention
schema

13.2 Endpoints

GET  /api/v1/sites/{siteId}/analytics/schema
GET  /api/v1/sites/{siteId}/analytics/overview
GET  /api/v1/sites/{siteId}/analytics/timeseries
GET  /api/v1/sites/{siteId}/analytics/breakdowns/{dimension}
GET  /api/v1/sites/{siteId}/analytics/cross-breakdowns
GET  /api/v1/sites/{siteId}/analytics/compare
POST /api/v1/sites/{siteId}/analytics/explore
GET  /api/v1/sites/{siteId}/analytics/retention/cohorts

13.3 GET /analytics/schema

Scope

analytics:read

用途

返回当前站点支持的 metrics、dimensions、filters、operators、intervals、timeRange 等。

响应示例

{
  "data": {
    "metrics": [
      {
        "key": "views",
        "label": "Views",
        "type": "integer",
        "description": "Total page views."
      },
      {
        "key": "bounceRate",
        "label": "Bounce Rate",
        "type": "rate",
        "description": "Bounces divided by sessions. Range: 0 to 1."
      },
      {
        "key": "avgDurationMs",
        "label": "Average Duration",
        "type": "duration_ms",
        "description": "Average session duration in milliseconds."
      }
    ],
    "dimensions": [
      {
        "key": "page.path",
        "label": "Page Path",
        "type": "string"
      },
      {
        "key": "referrer.domain",
        "label": "Referrer Domain",
        "type": "string"
      },
      {
        "key": "geo.country",
        "label": "Country",
        "type": "string"
      }
    ],
    "filters": [
      "page.path",
      "referrer.domain",
      "utm.source",
      "client.browser",
      "geo.country",
      "event.name"
    ],
    "operators": [
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
      "notExists"
    ],
    "intervals": [
      "minute",
      "hour",
      "day",
      "week",
      "month"
    ],
    "presets": [
      "today",
      "yesterday",
      "last_7_days",
      "last_30_days",
      "this_week",
      "last_week",
      "this_month",
      "last_month"
    ],
    "timeRange": {
      "earliestAvailableAt": "2026-01-01T00:00:00Z",
      "latestAvailableAt": "2026-06-26T12:00:00Z"
    },
    "links": {
      "overview": "/api/v1/sites/550e8400-e29b-41d4-a716-446655440000/analytics/overview",
      "timeseries": "/api/v1/sites/550e8400-e29b-41d4-a716-446655440000/analytics/timeseries",
      "explore": "/api/v1/sites/550e8400-e29b-41d4-a716-446655440000/analytics/explore"
    }
  },
  "meta": {
    "requestId": "req_abc123",
    "generatedAt": "2026-06-26T12:00:00Z"
  }
}

13.4 Recommended metrics

基础 metrics：

views
sessions
visitors
bounces
bounceRate
avgDurationMs
viewsPerSession
events

Performance metrics 单独在 performance API 中：

ttfb
fcp
lcp
cls
inp

13.5 Recommended dimensions

page.path
page.title
page.hostname
page.query
page.hash
session.entryPath
session.exitPath
referrer.domain
referrer.url
utm.source
utm.medium
utm.campaign
utm.term
utm.content
client.browser
client.browserVersion
client.browserEngine
client.os
client.osVersion
client.deviceType
client.language
client.screenSize
geo.country
geo.region
geo.city
geo.continent
geo.timeZone
geo.organization
event.name

13.6 GET /analytics/overview

返回一段时间内的汇总指标。

示例：

GET /api/v1/sites/{siteId}/analytics/overview?preset=last_30_days&timeZone=Asia/Shanghai

响应：

{
  "data": {
    "views": 12500,
    "sessions": 8300,
    "visitors": 6100,
    "bounces": 3200,
    "bounceRate": 0.386,
    "avgDurationMs": 506000,
    "viewsPerSession": 1.51,
    "approximateVisitors": false
  },
  "meta": {
    "requestId": "req_abc123",
    "generatedAt": "2026-06-26T12:00:00Z",
    "timeRange": {
      "from": "2026-05-27T00:00:00Z",
      "to": "2026-06-26T00:00:00Z",
      "timeZone": "Asia/Shanghai"
    }
  }
}

13.7 GET /analytics/timeseries

参数：

from
to
preset
timeZone
interval
metrics
filter[...]

示例：

GET /api/v1/sites/{siteId}/analytics/timeseries?preset=last_30_days&interval=day&metrics=views,sessions,visitors

响应：

{
  "data": [
    {
      "start": "2026-06-01T00:00:00Z",
      "end": "2026-06-02T00:00:00Z",
      "views": 420,
      "sessions": 350,
      "visitors": 310
    }
  ],
  "meta": {
    "requestId": "req_abc123",
    "generatedAt": "2026-06-26T12:00:00Z",
    "interval": "day"
  }
}

13.8 GET /analytics/breakdowns/{dimension}

替代旧式：

overview-page-path
overview-geo-country
utm-source
browser-trend
countries

示例：

GET /api/v1/sites/{siteId}/analytics/breakdowns/geo.country?preset=last_30_days&metrics=views,sessions,visitors&limit=20

响应：

{
  "data": [
    {
      "key": "US",
      "label": "United States",
      "views": 5200,
      "sessions": 3800,
      "visitors": 3100
    }
  ],
  "meta": {
    "requestId": "req_abc123",
    "generatedAt": "2026-06-26T12:00:00Z",
    "dimension": "geo.country",
    "metrics": [
      "views",
      "sessions",
      "visitors"
    ]
  }
}

13.9 GET /analytics/cross-breakdowns

参数：

primary
secondary
metric
primaryLimit
secondaryLimit
from
to
preset
timeZone
filter[...]

示例：

GET /api/v1/sites/{siteId}/analytics/cross-breakdowns?primary=client.browser&secondary=client.os&metric=visitors

13.10 POST /analytics/explore

用于高级多维查询。

请求示例：

{
  "timeRange": {
    "preset": "last_30_days",
    "timeZone": "Asia/Shanghai"
  },
  "metrics": [
    "views",
    "sessions",
    "visitors"
  ],
  "dimensions": [
    "geo.country",
    "client.browser"
  ],
  "filters": [
    {
      "field": "page.path",
      "op": "startsWith",
      "value": "/posts/"
    }
  ],
  "orderBy": [
    {
      "field": "visitors",
      "direction": "desc"
    }
  ],
  "limit": 100
}

⸻

14. Events API

14.1 Endpoints

GET  /api/v1/sites/{siteId}/event-types
GET  /api/v1/sites/{siteId}/event-types/{eventName}
GET  /api/v1/sites/{siteId}/events
GET  /api/v1/sites/{siteId}/events/summary
GET  /api/v1/sites/{siteId}/events/timeseries
POST /api/v1/sites/{siteId}/events/search
GET  /api/v1/sites/{siteId}/events/{eventId}
GET  /api/v1/sites/{siteId}/event-fields/values

14.2 Scope

analytics:read

14.3 说明

Events 是事件资源，不再放在 /analytics/events?queryName=... 中。

14.4 GET /events

列表接口，使用 cursor pagination。

参数：

from
to
preset
timeZone
eventName
limit
cursor
sort
filter[...]

14.5 POST /events/search

用于复杂 event payload 查询。

请求：

{
  "eventName": "signup",
  "timeRange": {
    "preset": "last_30_days",
    "timeZone": "Asia/Shanghai"
  },
  "payloadFilters": [
    {
      "path": "plan",
      "op": "eq",
      "value": "pro"
    }
  ],
  "limit": 100
}

⸻

15. Visitors / Sessions API

15.1 Endpoints

GET /api/v1/sites/{siteId}/visitors
GET /api/v1/sites/{siteId}/visitors/{visitorId}
GET /api/v1/sites/{siteId}/visitors/{visitorId}/sessions
GET /api/v1/sites/{siteId}/visitors/{visitorId}/events
GET /api/v1/sites/{siteId}/sessions
GET /api/v1/sites/{siteId}/sessions/{sessionId}
GET /api/v1/sites/{siteId}/sessions/{sessionId}/events

15.2 Scope

analytics:read

15.3 分页

GET /visitors 和 GET /sessions 使用 cursor pagination。

⸻

16. Funnels API

16.1 Endpoints

GET    /api/v1/sites/{siteId}/funnels
POST   /api/v1/sites/{siteId}/funnels
POST   /api/v1/sites/{siteId}/funnels/analysis
GET    /api/v1/sites/{siteId}/funnels/{funnelId}
PATCH  /api/v1/sites/{siteId}/funnels/{funnelId}
DELETE /api/v1/sites/{siteId}/funnels/{funnelId}
GET    /api/v1/sites/{siteId}/funnels/{funnelId}/analysis

16.2 Scope

analytics:read
site_config:write or site:write for saved funnel mutation

建议：

* 读取漏斗和分析漏斗需要 analytics:read
* 创建、更新、删除漏斗需要 site_config:write

16.3 Ad-hoc analysis

旧接口：

POST /api/v1/sites/{siteId}/analytics/funnels/analyze

改为：

POST /api/v1/sites/{siteId}/funnels/analysis

⸻

17. Performance API

17.1 Endpoints

GET /api/v1/sites/{siteId}/performance/summary
GET /api/v1/sites/{siteId}/performance/timeseries
GET /api/v1/sites/{siteId}/performance/breakdowns/{dimension}

17.2 Scope

analytics:read

17.3 Metrics

ttfb
fcp
lcp
cls
inp

17.4 响应单位

除 cls 外，Web Vitals 时间类指标使用毫秒。

{
  "data": {
    "lcp": {
      "avgMs": 1200,
      "p50Ms": 950,
      "p75Ms": 1800,
      "p95Ms": 3500,
      "samples": 5000
    },
    "cls": {
      "avg": 0.05,
      "p50": 0.03,
      "p75": 0.08,
      "p95": 0.18,
      "samples": 5000
    }
  }
}

⸻

18. Realtime API

18.1 Endpoints

GET /api/v1/sites/{siteId}/realtime/active-visitors
GET /api/v1/sites/{siteId}/realtime/events
GET /api/v1/sites/{siteId}/realtime/sessions
GET /api/v1/sites/{siteId}/realtime/snapshot

18.2 Scope

analytics:read

18.3 Snapshot

/snapshot 是 composite endpoint：

active-visitors + recent events + recent sessions

基础资源仍然拆开。

⸻

19. Exports API

可以在路径树中保留，但如果当前不实现，OpenAPI 不应声明为可用。

未来路径：

GET  /api/v1/sites/{siteId}/exports
POST /api/v1/sites/{siteId}/exports
GET  /api/v1/sites/{siteId}/exports/{exportId}
GET  /api/v1/sites/{siteId}/exports/{exportId}/file

当前 capabilities.features.exports 应返回 false。

⸻

20. Global Batch API

20.1 Endpoint

POST /api/v1/batch

20.2 Scope

每个子请求独立检查 scope。

20.3 限制

只允许 GET 子请求
最多 20 个子请求
不允许调用 /collect
不允许跨 host
不允许调用非 /api/v1 路径
每个子请求独立鉴权

20.4 请求示例

{
  "requests": [
    {
      "id": "overview",
      "method": "GET",
      "path": "/api/v1/sites/550e8400-e29b-41d4-a716-446655440000/analytics/overview",
      "query": {
        "preset": "last_30_days",
        "timeZone": "Asia/Shanghai"
      }
    },
    {
      "id": "topCountries",
      "method": "GET",
      "path": "/api/v1/sites/550e8400-e29b-41d4-a716-446655440000/analytics/breakdowns/geo.country",
      "query": {
        "preset": "last_30_days",
        "limit": "10"
      }
    }
  ]
}

20.5 响应示例

{
  "data": {
    "responses": [
      {
        "id": "overview",
        "status": 200,
        "body": {
          "data": {
            "views": 12500,
            "sessions": 8300,
            "visitors": 6100
          }
        }
      },
      {
        "id": "topCountries",
        "status": 200,
        "body": {
          "data": []
        }
      }
    ]
  },
  "meta": {
    "partialFailure": false,
    "requestId": "req_abc123",
    "generatedAt": "2026-06-26T12:00:00Z"
  }
}

20.6 Idempotency

支持：

Idempotency-Key

虽然 batch 只允许 GET 子请求，但该 header 可用于客户端安全重试和 trace。

⸻

21. /collect 文档要求

21.1 Endpoint

POST /collect

21.2 不变更

保持现状：

路径不变
认证方式不变
返回语义不变

21.3 文档需说明

/collect 是无 Bearer Auth 的客户端 SDK 采集入口。
成功接收或静默丢弃都返回 204。

21.4 OpenAPI 响应

至少声明：

204 No Content
400 Bad Request
413 Payload Too Large

不需要声明应用层 429，除非系统自身确实实现。Cloudflare 层面的限流不在应用 OpenAPI 中承诺。

⸻

22. /.well-known/skills.json 重构

22.1 新定位

skills.json 不再是 endpoint catalog。

它应改为：

Agent manifest
Task recipes
Workflow guidance
Discovery pointers
Error handling guidance

22.2 不应继续包含

不要继续完整复制：

所有 endpoint 列表
所有参数列表
完整 schema
旧 queryName 文档
Unix ms 时间戳说明
ok 响应格式

22.3 应包含

{
  "api": "InsightFlare Analytics API",
  "version": "1.0.0",
  "description": "Privacy-focused web analytics platform.",
  "baseUrl": "https://insight.ravelloh.com",
  "openapiUrl": "/.well-known/openapi.json",
  "discovery": {
    "root": "/api/v1",
    "token": "/api/v1/token",
    "capabilities": "/api/v1/capabilities",
    "analyticsSchema": "/api/v1/sites/{siteId}/analytics/schema"
  },
  "agentGuidance": {
    "authentication": {
      "required": true,
      "instruction": "Use a user-provided API key as a Bearer token. Do not guess or fabricate credentials."
    },
    "defaultWorkflow": [
      "Call GET /api/v1/token to inspect the token.",
      "Call GET /api/v1/sites to list accessible sites.",
      "Call GET /api/v1/sites/{siteId}/analytics/schema before advanced analytics.",
      "Use overview, timeseries, and breakdowns for most analysis tasks.",
      "Use explore for multi-dimensional or complex filtering.",
      "Use batch to reduce round trips when multiple GET requests are needed."
    ]
  },
  "taskRecipes": [
    {
      "intent": "traffic_overview",
      "description": "Summarize traffic for a site over a time range.",
      "calls": [
        "GET /api/v1/sites/{siteId}/analytics/overview",
        "GET /api/v1/sites/{siteId}/analytics/timeseries"
      ]
    },
    {
      "intent": "traffic_drop_analysis",
      "description": "Find likely causes of a traffic drop.",
      "calls": [
        "GET /api/v1/sites/{siteId}/analytics/overview?compare=previous_period",
        "GET /api/v1/sites/{siteId}/analytics/timeseries",
        "GET /api/v1/sites/{siteId}/analytics/breakdowns/referrer.domain",
        "GET /api/v1/sites/{siteId}/analytics/breakdowns/page.path",
        "GET /api/v1/sites/{siteId}/analytics/breakdowns/geo.country",
        "GET /api/v1/sites/{siteId}/analytics/breakdowns/client.browser"
      ]
    },
    {
      "intent": "performance_analysis",
      "description": "Analyze Core Web Vitals and identify weak pages or regions.",
      "calls": [
        "GET /api/v1/sites/{siteId}/performance/summary",
        "GET /api/v1/sites/{siteId}/performance/timeseries",
        "GET /api/v1/sites/{siteId}/performance/breakdowns/page.path",
        "GET /api/v1/sites/{siteId}/performance/breakdowns/geo.country"
      ]
    }
  ],
  "errorHandling": {
    "401": "Ask the user to provide a valid API key.",
    "403": "Explain that the API key lacks the required scope.",
    "404": "Treat inaccessible sites as not found."
  }
}

⸻

23. OpenAPI 重构要求

23.1 删除旧结构

删除或替换：

queryName
/api/v1/sites/{siteId}/analytics/{queryName}
ok
timestamp 作为顶层通用字段
Unix milliseconds query 参数
page/pageSize
sortBy/sortDir

23.2 新增通用 schemas

建议定义：

Meta
ErrorResponse
SuccessEnvelope
ListEnvelope
PaginatedEnvelope
Pagination
LinkMap
TimeRange
Preset
FilterObject
ComplexFilter
MetricDefinition
DimensionDefinition
AnalyticsSchemaResponse
TokenResponse
CapabilitiesResponse

23.3 Schema 命名要求

不要生成：

Envelope___schema0
SiteConfig___schema7

所有对外 schema 必须有明确语义名称。

23.4 所有 schema 应有 description

尤其是：

metric
dimension
filter
timeRange
siteAccess
trackingStrength
privacy settings

23.5 字符串输入字段应有 maxLength

至少覆盖：

site.name
site.domain
sharing.publicSlug
eventName
fieldPath
search
filter value
funnel.name

⸻

24. 实现步骤建议

Phase 1：基础响应与工具函数

实现：

jsonSuccess(data, options)
jsonList(data, options)
jsonPaginated(data, pagination, options)
jsonError(code, message, status, details)
getRequestMeta(request)
normalizeDateTime()
parseTimeRange()
parsePreset()
parseMetrics()
parseFilter()
parseCursorPagination()
parseSort()

验收：

所有新 API 响应不包含 ok
所有响应包含 meta.generatedAt
认证接口包含 meta.requestId
错误响应格式统一

Phase 2：认证与 discovery

实现：

GET /api/v1
GET /api/v1/token
POST /api/v1/token/check
GET /api/v1/capabilities

验收：

/api/v1 无需认证
/token 需要认证
/token 不返回 secret/hash/raw key
/token/check 能批量检查 scope/site
/capabilities 根据 token 返回可用功能

Phase 3：Sites 与 Settings

实现：

GET /sites
POST /sites
GET /sites/{siteId}
PATCH /sites/{siteId}
DELETE /sites/{siteId}
GET/PATCH /sites/{siteId}/tracking
GET /sites/{siteId}/tracking/script
GET/PATCH /sites/{siteId}/privacy
GET/PATCH /sites/{siteId}/sharing

验收：

restricted token 只能看到允许的 sites
site 不可访问返回 404
创建 site 支持 Idempotency-Key
settings 拆分后语义清晰
旧 /config 和 /script-snippet 不再出现在 OpenAPI

Phase 4：Analytics primitives

实现：

GET /analytics/schema
GET /analytics/overview
GET /analytics/timeseries
GET /analytics/breakdowns/{dimension}
GET /analytics/cross-breakdowns
GET /analytics/compare
POST /analytics/explore
GET /analytics/retention/cohorts

验收：

无 queryName
时间参数支持 ISO 8601
支持 preset
支持 filter[field]=value
breakdowns 使用 dimension enum
explore 支持复杂 filters
schema 返回 metrics/dimensions/filters/operators/intervals

Phase 5：Events / Sessions / Visitors / Funnels / Performance / Realtime

实现：

event-types
events
event-fields
visitors
sessions
funnels
performance
realtime

验收：

events 不再挂在 analytics queryName 下
visitors/sessions 使用 cursor pagination
performance metrics 单位统一
realtime snapshot 作为 composite endpoint
funnels analysis 使用 /funnels/analysis

Phase 6：Global batch

实现：

POST /api/v1/batch

验收：

只允许 GET 子请求
最多 20 个请求
禁止 /collect
禁止跨 host
禁止非 /api/v1 路径
每个子请求独立鉴权
支持 partialFailure

Phase 7：OpenAPI 与 skills

实现：

/.well-known/openapi.json
/.well-known/skills.json

验收：

OpenAPI 无 queryName
OpenAPI 无 ok
OpenAPI 时间参数为 ISO 8601
OpenAPI 使用 cursor pagination
OpenAPI schema 名称清晰
skills.json 不再复制 endpoint catalog
skills.json 指向 OpenAPI/token/capabilities/schema
skills.json 包含 taskRecipes

⸻

25. 测试要求

25.1 单元测试

必须覆盖：

parseTimeRange
parsePreset
parseMetrics
parseFilter
parseSort
parseCursorPagination
jsonSuccess
jsonError
token permission check
site allowlist check
dimension validation
metric validation

25.2 API 集成测试

覆盖：

GET /api/v1
GET /api/v1/token
POST /api/v1/token/check
GET /api/v1/capabilities
GET /api/v1/sites
GET /api/v1/sites/{siteId}
GET /api/v1/sites/{siteId}/analytics/schema
GET /api/v1/sites/{siteId}/analytics/overview
GET /api/v1/sites/{siteId}/analytics/timeseries
GET /api/v1/sites/{siteId}/analytics/breakdowns/geo.country
POST /api/v1/batch

25.3 认证测试

必须覆盖：

缺少 Authorization 返回 401
无效 token 返回 401
过期 token 返回 401
撤销 token 返回 401
缺少 scope 返回 403
访问非 allowlist site 返回 404
restricted token list sites 只返回允许站点

25.4 时间测试

必须覆盖：

ISO 8601 from/to 正常解析
from/to 使用 [from, to) 语义
preset=last_7_days 正常解析
preset 与 from/to 同时传入返回 400
timeZone 影响 today/yesterday/this_month 等 preset
非法 timeZone 返回 400

25.5 Filter 测试

必须覆盖：

filter[geo.country]=US
filter[client.browser]=Chrome
filter[page.path]=/posts/hello
未知 filter field 返回 400
complex filter op 校验
非法 operator 返回 400

25.6 Pagination 测试

必须覆盖：

limit 默认值
limit 最大值
cursor 正常翻页
非法 cursor 返回 400
无下一页时 nextCursor=null, hasMore=false

25.7 Batch 测试

必须覆盖：

多个 GET 子请求成功
单个子请求失败时 partialFailure=true
超过 20 个请求返回 400
POST 子请求被拒绝
/collect 子请求被拒绝
跨 host 被拒绝
非 /api/v1 路径被拒绝
子请求权限独立检查

25.8 OpenAPI 验证

必须覆盖：

OpenAPI JSON 可被解析
所有 operationId 唯一
所有 schema 名称无 ___
所有 public input string 有 maxLength
所有错误响应引用统一 ErrorResponse
所有分页响应引用 PaginatedEnvelope
无 queryName 参数
无 ok 字段
无 Unix milliseconds 查询参数描述

25.9 skills.json 验证

必须覆盖：

skills.json 可被解析
包含 openapiUrl
包含 discovery.root/token/capabilities/analyticsSchema
包含 taskRecipes
不包含旧 endpoints catalog
不包含 queryName
不包含 Unix milliseconds 作为新 API 说明
不包含 ok 响应格式

⸻

26. Codex 执行注意事项

1. 不要在新 API 中保留旧 queryName 兼容层，除非仅作为内部实现细节。
2. 不要让 OpenAPI 暴露旧路径。
3. /collect 保持原路径和行为。
4. 新响应格式必须全局统一。
5. 旧 timestamp 字段应替换为 meta.generatedAt。
6. requestId 应放入 meta.requestId。
7. API Key 格式不要在 OpenAPI 或 skills 中明文暴露。
8. 所有时间输入输出统一 ISO 8601。
9. 所有 ID 继续使用 UUID。
10. 所有列表分页使用 cursor。
11. skills.json 只做 Agent manifest，不做 endpoint 文档。
12. analytics/schema 是 AI Agent 和第三方分析师的重要入口，应优先实现。
13. API 响应应尽量提供 links，让调用方可以自发现下一步操作。
14. 不添加应用层 rate limit headers。
15. 不添加 stability/deprecation 体系。

⸻

27. 最终验收标准

本次重构完成后，应满足：

/api/v1 可作为长期稳定 API
OpenAPI 是唯一正式 API 契约
skills.json 是 Agent manifest
不再存在 queryName
不再存在 ok 响应字段
不再混用 Unix milliseconds 和 ISO time
不再使用 page/pageSize
不再使用 sortBy/sortDir
不再暴露 dashboard 图表内部 query 名称
analytics API 基于 overview/timeseries/breakdowns/explore 等数据原语
token/capabilities/schema 能支持 AI Agent 自发现
全局 batch 能支持 Agent 减少多次请求
site settings 被拆成 tracking/privacy/sharing
API 响应具备自文档能力，包含必要 links

这套 API 结构应作为 InsightFlare 未来三年内的主干契约。后续新增功能应优先作为现有资源的扩展，而不是破坏现有路径和响应格式。