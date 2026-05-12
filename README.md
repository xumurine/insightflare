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

R2 是可选项，Deploy Button 默认不会要求绑定 R2。只有需要启用冷归档到 R2 时，才需要手动创建 R2 bucket，并在 `wrangler.toml` 中配置 `[[r2_buckets]]`。维护者自己的实例使用 `ravelloh` 环境绑定 R2，不影响默认部署流程。

### 接收上游更新

通过 Deploy Button 创建的仓库是 **clone**（不是 fork），所以 GitHub 自带的 "Sync fork" 按钮不可用。本仓库内置了 [`.github/workflows/sync-upstream.yml`](./.github/workflows/sync-upstream.yml)：

- 每周一 03:17 UTC 自动运行一次；也可以在仓库的 **Actions → Sync upstream → Run workflow** 手动触发。
- 同时兼容三种仓库形态：
  - **Fork**（GitHub Fork 按钮创建）和**干净 clone**（`git clone` 后改 remote）：和上游有共同 git 历史，workflow 走 `merge` 模式，用 `git merge --no-ff upstream/main` 同步，上游每个 commit 的作者与历史都被保留。
  - **Snapshot clone**（Cloudflare Deploy Button 创建）：只有一个 `source repo import` commit、与上游无共同历史，workflow 走 `squash` 模式：先用文件树比对（忽略 `wrangler.toml`）从上游历史反查出"克隆时的虚拟 base"，然后把该 base 到 `upstream/main` 之间的累积 diff 用 `git apply --3way` 应用为单个 squash commit，避免把上游全部历史塞进你的仓库。
- 模式选择是自动的：workflow 先跑 `git merge-base origin/main upstream/main`，能拿到就走 merge，拿不到就走 squash。
- 不论哪种模式，同步成功后会在你仓库打/更新一个 `upstream-sync-base` tag 指向已同步到的上游 commit，便于诊断。
- 检测到 `RavelloH/InsightFlare:main` 有新提交时，会自动创建（或更新）一个 PR；分支名固定为 `chore/sync-upstream`，所以同一个 PR 会被反复 force-update，不会刷屏。冲突文件会保留 `<<<<<<<` 标记进 commit，PR body 顶部用单独段落标记并给出本地解决步骤。
- 想跳过某次更新只需关闭 PR；想长期禁用，在 **Actions** 页停用此 workflow 即可。

> ⚠️ **Deploy Button 用户必读：一次性安装步骤**
>
> Cloudflare 的 Deploy Button 在创建 snapshot clone 时会**剥离整个 `.github/` 目录**（行为未在官方文档明说，但稳定可观察），所以上面的 workflow 文件不会自动出现在你的仓库里。需要跑一次安装脚本（脚本本身在 `scripts/` 下，Cloudflare 不剥离）。
>
> 默认会**自动**完成下载 → commit → push → 触发首次 workflow 运行，全程无需手动 git 命令。任选一种方式：
>
> **方式 A：用 GitHub Codespaces（推荐给不熟悉 git 的用户）**
>
> 1. 打开你刚创建的仓库（`https://github.com/<你的用户名>/<你的仓库名>`）。
> 2. 点绿色 **Code** 按钮 → **Codespaces** 标签 → **Create codespace on main**。等 30~60 秒 Codespace 启动。
> 3. 在 Codespace 的终端里依次跑：
>    ```bash
>    npm install
>    npm run setup:sync-upstream
>    ```
> 4. 脚本会自动 commit、push，并通过 Codespace 预装的 `gh` 触发首次 workflow 运行（终端会打印 Actions 页面 URL）。完成后可以关掉 Codespace。
>
> **方式 B：本地 clone**
>
> ```bash
> git clone https://github.com/<你的用户名>/<你的仓库名>.git
> cd <你的仓库名>
> npm install
> npm run setup:sync-upstream
> ```
>
> 同样会自动 commit、push。如果本地装了 [GitHub CLI](https://cli.github.com) 并已 `gh auth login`，会顺带触发首次 workflow 运行；否则脚本会打印 Actions 页面 URL 让你点一下 **Run workflow** 即可。
>
> **想自己审一遍再 commit**：加 `-- --stage-only` 参数：
>
> ```bash
> npm run setup:sync-upstream -- --stage-only
> ```
>
> 脚本只下载并 `git add`，剩下的 `git commit && git push` 你来。
>
> Fork 和干净 `git clone` 创建的仓库**不需要**这一步——它们已经从上游继承了完整的 `.github/` 目录。

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
- 按需开启 `[[r2_buckets]]`（可选，仅冷归档到 R2 时需要）
- 维护者在 Cloudflare Git 部署带 R2 的实例时使用 `npm run deploy:ravelloh`，本地完整构建并部署时使用 `npm run cf:deploy:ravelloh`

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

- **Build command**：`npm run build`
- **Deploy command**：`npm run deploy`

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
| `ARCHIVE_BUCKET`（R2，可选）         | 冷归档存储桶                |

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
