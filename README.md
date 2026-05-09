# InsightFlare

> 运行在 Cloudflare 上的开源、隐私友好的网站访问分析平台。

InsightFlare 集采集、存储、查询、可视化于一体，前端是 Next.js 16 + React 19 的多语言仪表板，后端是 Cloudflare Workers / Durable Objects / D1 / R2 / KV 组成的边缘架构。整套系统可以一键部署到一个 Cloudflare 账户中，无需自建服务器，也无需额外数据库。

---

## 特性

### 数据采集

- 动态 `GET /script.js`：根据 `request.cf.isEUCountry` 自动切换 EU 模式
- `POST /collect`：客户端事件上报
- Durable Object 并行写入：内存缓冲、WebSocket 广播、Alarm 调度
- 每日 salt 轮换的访客标识，无 Cookie、无跨站追踪

### 存储与归档

- Alarm 批量落盘 D1，避免高频小写
- 每小时归档：热归档（D1 小时聚合）+ 冷归档（可选 R2 Parquet）
- Parquet 文件查询走 HTTP Range Requests，按需流式读取

### 仪表板

内置一个完整的 Next.js 多语言（中文 / English）控制台，覆盖以下视图：

- **总览 / 实时**：在线人数、实时事件流（WebSocket）
- **页面 / 来源 / 活动 (UTM)**
- **会话 / 访客**：含详情页与时间线
- **事件 / 漏斗 / 留存**
- **地理位置**：deck.gl + maplibre 矢量地图、国家/城市下钻
- **设备 / 浏览器 / 操作系统**
- **性能**：Core Web Vitals 与 Durable Object 堆积分析
- **站点设置 / 成员 / 团队 / 系统性能**

### 多租户与权限

- Team / Site / Member 三级组织模型
- 角色化权限（管理员、成员、只读等）
- 每个站点独立配置，团队间数据隔离

---

## 技术栈

| 层   | 技术                                                                                           |
| ---- | ---------------------------------------------------------------------------------------------- |
| 前端 | Next.js 16, React 19, Tailwind CSS 4, Radix UI, shadcn, Recharts, deck.gl, maplibre-gl, Motion |
| 后端 | Cloudflare Workers, Durable Objects, D1, R2, KV                                                |
| 构建 | OpenNext for Cloudflare, Wrangler 4, TypeScript 5                                              |
| i18n | 自研 YAML 方案（`src/i18n/{en,zh}.yaml`），脚本校验完整性                                      |

---

## 架构概览

单应用、单 `wrangler.toml`：

```
                     ┌───────────────────────────┐
   浏览器 ──script──▶ │  Cloudflare Worker (entry)│
   浏览器 ──collect──▶│   workers/cf-worker.js    │
                     └────────────┬──────────────┘
                                  │
         ┌─────────────┬──────────┼──────────┐
         ▼             ▼          ▼          ▼
    Next.js         Durable      D1          R2
    Dashboard       Object     (热数据)    (冷归档)
    (App Router)   (缓冲/广播)    │        Parquet
                                  ▼
                              KV (站点配置)
```

主要入口：

- `/script.js`、`/collect`
- `/api/public/*`、`/api/private/*`、`/api/admin/*`、`/api/auth/*`、`/api/archive/*`
- `/api/geo-*`、`/map-tiles/*`、`/world-countries`（地图相关）
- `/healthz`
- `/admin/ws`（实时 WebSocket，由 `cf-worker.js` 透传到 DO）

`workers/cf-worker.js` 负责：导出 Durable Object 类、透传 `/admin/ws`、执行定时归档（cron `0 * * * *`）。

---

## 快速开始

> Windows 用户建议在 WSL / Linux / CI 中执行构建（OpenNext 官方建议）。

### 一键部署到 Cloudflare

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fgithub.com%2FRavelloH%2FInsightFlare)

Deploy Button 会在你的 Cloudflare 账户中自动创建并绑定 Worker、D1、KV、Durable Object、Assets 与 Cron。部署时只需要按页面提示填写 `.dev.vars.example` 中的 Secret：

| 名称                       | 用途                    |
| -------------------------- | ----------------------- |
| `DAILY_SALT_SECRET`        | 每日访客标识 salt       |
| `DASHBOARD_SESSION_SECRET` | 仪表板登录 session 签名 |

部署完成后，如果要使用自定义域名，请在 Cloudflare 控制台为 Worker 绑定域名，并将 `INSIGHTFLARE_EDGE_URL` / `EDGE_PUBLIC_BASE_URL` 调整为最终访问地址。

### 手动部署

#### 1. 安装依赖

```bash
npm ci
```

#### 2. 创建 D1 数据库（首次）

```bash
npm run cf:d1:create
```

将输出的 `database_id` 填入 `wrangler.toml` 的 `[[d1_databases]]`。

#### 3. 配置 `wrangler.toml`

- `INSIGHTFLARE_EDGE_URL` 设为部署后的访问地址
- 按需开启 `[[r2_buckets]]`（冷归档）

#### 4. 设置 Secret

至少需要 `DAILY_SALT_SECRET` 与 `DASHBOARD_SESSION_SECRET`：

```bash
npm run cf:secret:daily-salt
npm run cf:secret:session-secret
```

可选：

```bash
npm run cf:secret:bootstrap-admin-password   # 首个管理员密码
```

#### 5. 本地开发 / 构建 / 部署

```bash
npm run dev               # 本地开发仪表板（next dev）
npm run cf:preview        # 本地用 wrangler dev 预览完整 Worker
npm run cf:build          # 本地构建验证
npm run cf:deploy:dry-run # 部署前 dry-run
npm run cf:deploy         # 部署到 Cloudflare
```

---

## Cloudflare Git 自动部署

如果在 Cloudflare 控制台使用 Git 集成，请设置：

- **Build command**：`npm run ci:build`
- **Deploy command**：`npm run ci:deploy`

不要跳过 `build:pre:remote`，否则 D1 迁移与远端配置注入不会执行。

---

## 常用命令

| 命令                              | 用途                                           |
| --------------------------------- | ---------------------------------------------- |
| `npm run dev`                     | 本地开发仪表板                                 |
| `npm run check`                   | 一键执行 typecheck + lint + format + i18n 校验 |
| `npm run typecheck`               | TypeScript 类型检查                            |
| `npm run lint` / `lint:fix`       | ESLint                                         |
| `npm run format` / `format:check` | Prettier                                       |
| `npm run check:i18n`              | 校验中英文翻译键的完整性                       |
| `npm run d1:migrate:local`        | 本地 D1 迁移                                   |
| `npm run d1:migrate:remote`       | 线上 D1 迁移                                   |
| `npm run d1:migration:create`     | 新建迁移文件                                   |
| `npm run cf:tail`                 | 查看线上 Worker 日志                           |

---

## 关键配置项

| 名称                                 | 含义                        |
| ------------------------------------ | --------------------------- |
| `SESSION_WINDOW_MINUTES`             | 会话窗口分钟数（默认 `30`） |
| `SCRIPT_CACHE_TTL_SECONDS`           | `/script.js` CDN 缓存秒数   |
| `PARQUET_WASM_URL`                   | Parquet wasm 下载地址       |
| `INSIGHTFLARE_EDGE_URL`              | InsightFlare 服务基准 URL   |
| `DAILY_SALT_SECRET`（Secret）        | 每日访客标识 salt           |
| `DASHBOARD_SESSION_SECRET`（Secret） | 仪表板会话签名              |
| `BOOTSTRAP_ADMIN_PASSWORD`（Secret） | 初始化管理员密码            |

---

## 目录结构

```
src/
  app/                    # Next.js App Router
    [locale]/             # 多语言路由（en / zh）
      app/[teamSlug]/...  # 仪表板（团队 → 站点 → 模块）
    api/                  # Route Handlers（public / private / admin / auth / archive ...）
  components/             # UI 组件（仪表板、图表、地图、设置等）
  i18n/                   # 多语言 YAML
  lib/                    # 业务逻辑（edge / realtime / archive / auth ...）
workers/cf-worker.js      # Cloudflare Worker 入口（DO 导出 + WS 透传 + cron）
migrations/               # D1 SQL 迁移
scripts/                  # 构建与校验脚本（build:pre、i18n 检查等）
```

---

## License

[MIT](./LICENSE) © 2026 RavelloH
