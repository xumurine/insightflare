# Upstream sync patch could not be fully applied

The bot could not apply every hunk automatically. Files ending in `.rej` contain rejected hunks that must be merged manually before this PR is merged.

## git apply --3way output

```text
Applied patch to 'README.md' with conflicts.
Applied patch to 'package.json' cleanly.
error: scripts/install-sync-workflow.mjs: does not exist in index
```

## git apply --reject output

```text
Checking patch README.md...
error: while searching for:

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


error: patch failed: README.md:105
Checking patch package.json...
error: while searching for:
    "check:i18n": "tsx scripts/check-i18n.ts",
    "d1:migrate:local": "wrangler d1 migrations apply insightflare --config wrangler.toml --local",
    "d1:migrate:remote": "wrangler d1 migrations apply insightflare --config wrangler.toml --remote",
    "d1:migration:create": "wrangler d1 migrations create insightflare --config wrangler.toml",
    "setup:sync-upstream": "node scripts/install-sync-workflow.mjs"
  },
  "dependencies": {
    "@deck.gl/core": "^9.2.11",

error: patch failed: package.json:39
Checking patch scripts/install-sync-workflow.mjs...
error: scripts/install-sync-workflow.mjs: No such file or directory
Applying patch README.md with 1 reject...
Rejected hunk #1.
Applying patch package.json with 1 reject...
Rejected hunk #1.
```
