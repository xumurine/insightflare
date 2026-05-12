#!/usr/bin/env node
// Installs the upstream-sync GitHub Actions workflow into this repository.
//
// Why this script exists:
//   Cloudflare's "Deploy to Cloudflare" button strips the `.github/`
//   directory from snapshot clones it creates. That means the
//   `sync-upstream.yml` workflow shipped in the upstream repository
//   never makes it into the user's repo and the automatic upstream-sync
//   PR feature does not work out of the box.
//
//   `scripts/` is preserved by the Deploy button, so this script ships
//   into every snapshot clone. Running it once re-installs the workflow,
//   commits and pushes it, and triggers the first workflow run.
//
// Usage:
//   npm run setup:sync-upstream            (default: download + commit + push + trigger)
//   npm run setup:sync-upstream -- --stage-only   (only download and stage)
//   node scripts/install-sync-workflow.mjs
//
// Fork and clean-clone users do NOT need to run this — they already
// inherit `.github/workflows/sync-upstream.yml` from the upstream tree.

import { spawnSync } from "node:child_process";
import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const UPSTREAM_RAW =
  "https://raw.githubusercontent.com/RavelloH/InsightFlare/main/.github/workflows/sync-upstream.yml";
const TARGET_PATH = ".github/workflows/sync-upstream.yml";
const WORKFLOW_FILE = "sync-upstream.yml";

const args = process.argv.slice(2);
const stageOnly =
  args.includes("--stage-only") ||
  args.includes("--no-commit") ||
  args.includes("--review");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hasCommand(cmd) {
  const probe = process.platform === "win32" ? "where" : "command";
  const probeArgs = process.platform === "win32" ? [cmd] : ["-v", cmd];
  const res = spawnSync(probe, probeArgs, { stdio: "ignore", shell: true });
  return res.status === 0;
}

function git(args, opts = {}) {
  return spawnSync("git", args, {
    stdio: opts.silent ? "ignore" : "inherit",
    ...opts,
  });
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function downloadWorkflow() {
  const isUpdate = await exists(TARGET_PATH);
  console.log(
    isUpdate
      ? `${TARGET_PATH} already exists. Refreshing to the latest upstream version...`
      : `Downloading workflow from ${UPSTREAM_RAW}...`,
  );

  let res;
  try {
    res = await fetch(UPSTREAM_RAW, { redirect: "follow" });
  } catch (err) {
    console.error(`Network error: ${err?.message ?? err}`);
    console.error(
      "Check your internet connection, then re-run `npm run setup:sync-upstream`.",
    );
    process.exit(1);
  }

  if (!res.ok) {
    console.error(`Download failed: HTTP ${res.status} ${res.statusText}`);
    console.error(`URL: ${UPSTREAM_RAW}`);
    process.exit(1);
  }

  const content = await res.text();
  if (!content.trim()) {
    console.error("Downloaded file is empty. Aborting.");
    process.exit(1);
  }

  await mkdir(dirname(TARGET_PATH), { recursive: true });
  await writeFile(TARGET_PATH, content, "utf8");

  const sizeKb = (content.length / 1024).toFixed(1);
  console.log(`✅ Installed workflow to ${TARGET_PATH} (${sizeKb} KB)`);
}

function printManualGitInstructions() {
  console.log("");
  console.log("Next steps (run manually):");
  console.log(`  git add ${TARGET_PATH}`);
  console.log("  git commit -m 'chore: install sync-upstream workflow'");
  console.log("  git push");
  console.log("");
  console.log(
    "After pushing, the workflow runs automatically every Monday at 03:17 UTC,",
  );
  console.log(
    "and can be triggered manually from your repository's Actions tab.",
  );
}

function printManualTriggerInstructions(repoSlug) {
  const url = repoSlug
    ? `https://github.com/${repoSlug}/actions/workflows/${WORKFLOW_FILE}`
    : `your repository's Actions tab → Sync upstream`;
  console.log("");
  console.log(
    "To trigger the first workflow run now, open the URL below and click",
  );
  console.log('"Run workflow":');
  console.log(`  ${url}`);
  console.log("");
  console.log(
    "Alternatively, install GitHub CLI (https://cli.github.com) and run:",
  );
  console.log(`  gh workflow run ${WORKFLOW_FILE}`);
}

function detectRepoSlug() {
  const remote = spawnSync("git", ["remote", "get-url", "origin"], {
    stdio: "pipe",
    encoding: "utf8",
  });
  if (remote.status !== 0) return null;
  const url = (remote.stdout || "").trim();
  const match = url.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
  return match ? `${match[1]}/${match[2]}` : null;
}

async function autoCommitAndPush() {
  console.log("");
  console.log("Staging the workflow file...");
  if (git(["add", TARGET_PATH]).status !== 0) process.exit(1);

  const cleanCheck = git(["diff", "--cached", "--quiet"], { silent: true });
  if (cleanCheck.status === 0) {
    console.log(
      "File is already committed at the latest version — nothing new to commit.",
    );
    return { committed: false };
  }

  console.log("Committing...");
  const commitRes = git([
    "-c",
    "user.name=insightflare-setup",
    "-c",
    "user.email=insightflare-setup@users.noreply.github.com",
    "commit",
    "-m",
    "chore: install sync-upstream workflow",
  ]);
  if (commitRes.status !== 0) {
    console.error("git commit failed.");
    process.exit(commitRes.status ?? 1);
  }

  console.log("Pushing to origin...");
  const pushRes = git(["push", "origin", "HEAD"]);
  if (pushRes.status !== 0) {
    console.error("");
    console.error(
      "git push failed. The file is committed locally — resolve the push error",
    );
    console.error(
      "(e.g. authentication, branch protection, network) and run `git push` manually.",
    );
    process.exit(pushRes.status ?? 1);
  }
  console.log("✅ Committed and pushed.");
  return { committed: true };
}

async function triggerWorkflowRun(repoSlug) {
  if (!hasCommand("gh")) {
    console.log("");
    console.log("`gh` CLI not found — skipping automatic workflow trigger.");
    printManualTriggerInstructions(repoSlug);
    return;
  }

  console.log("");
  console.log(
    "Waiting a few seconds for GitHub to index the new workflow file...",
  );
  await sleep(5000);

  console.log(`Dispatching \`gh workflow run ${WORKFLOW_FILE}\`...`);
  let attempt = 0;
  while (attempt < 3) {
    const res = spawnSync("gh", ["workflow", "run", WORKFLOW_FILE], {
      stdio: "inherit",
    });
    if (res.status === 0) {
      console.log("✅ Workflow run dispatched.");
      if (repoSlug) {
        console.log(
          `   Watch progress: https://github.com/${repoSlug}/actions/workflows/${WORKFLOW_FILE}`,
        );
      }
      console.log("   Or run locally: gh run watch");
      return;
    }
    attempt += 1;
    if (attempt < 3) {
      console.log(
        `Dispatch failed (attempt ${attempt}/3). Waiting 5s and retrying...`,
      );
      await sleep(5000);
    }
  }

  console.log("");
  console.log(
    "Could not dispatch the workflow automatically (GitHub may need more time",
  );
  console.log("to index the new file, or `gh` is not authenticated).");
  printManualTriggerInstructions(repoSlug);
}

async function main() {
  await downloadWorkflow();

  if (stageOnly) {
    if (git(["add", TARGET_PATH]).status !== 0) process.exit(1);
    console.log(`Staged ${TARGET_PATH}.`);
    printManualGitInstructions();
    return;
  }

  const { committed } = await autoCommitAndPush();
  const repoSlug = detectRepoSlug();

  if (committed) {
    await triggerWorkflowRun(repoSlug);
  } else {
    console.log("");
    console.log(
      "Skipping workflow dispatch since no new commit was pushed. You can",
    );
    console.log("trigger one manually anytime:");
    printManualTriggerInstructions(repoSlug);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
