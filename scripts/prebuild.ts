#!/usr/bin/env tsx

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import {
  type CommonOptions,
  createRuntime,
  type DeployTarget,
  localCli,
  parseCommonOptions,
  resolveConfigPath,
  targetEnv,
} from "./shared/deploy-runtime";
import { ROOT_DIR } from "./shared/paths";
import { checkEnvironmentVariables } from "./check-env";
import { applyWranglerEnvOverrides } from "./wrangler-env-overrides";

function migrationMode(target: DeployTarget): "local" | "none" | "remote" {
  if (target === "local") return "local";
  if (target === "cf") return "remote";
  return "none";
}

function shouldPrecheck(target: DeployTarget): boolean {
  return target === "local";
}

function runtimeSecretsAvailable(target: DeployTarget): boolean {
  return target === "local";
}

function wranglerCli(rootDir: string, configPath: string): string {
  const configDir = path.dirname(configPath);
  const candidates = [
    path.join(configDir, "node_modules", "wrangler", "bin", "wrangler.js"),
    path.join(rootDir, "node_modules", "wrangler", "bin", "wrangler.js"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(
    "Cannot resolve local Wrangler CLI (node_modules/wrangler/bin/wrangler.js)",
  );
}

function migrationArgs(options: CommonOptions, configPath: string): string[] {
  const mode = migrationMode(options.target);
  if (mode === "none") return [];

  const args = [
    wranglerCli(ROOT_DIR, configPath),
    "d1",
    "migrations",
    "apply",
    options.database,
    "--config",
    configPath,
    mode === "remote" ? "--remote" : "--local",
  ];

  if (options.envName) {
    args.push("--env", options.envName);
  }

  return args;
}

async function runPrecheck(options: CommonOptions): Promise<void> {
  if (!shouldPrecheck(options.target)) {
    runtime.rlog.info("Precheck skipped for this target.");
    return;
  }

  await checkEnvironmentVariables({
    runtimeSecretsAvailable: runtimeSecretsAvailable(options.target),
    strict: true,
  });
}

async function applyConfigOverrides(options: CommonOptions): Promise<string> {
  const configPath = resolveConfigPath(options.config);
  if (!fs.existsSync(configPath)) {
    throw new Error(`Missing wrangler config: ${configPath}`);
  }

  const overrideResult = applyWranglerEnvOverrides(
    fs.readFileSync(configPath, "utf8"),
    process.env,
    options.envName,
  );
  if (overrideResult.applied.length > 0) {
    fs.writeFileSync(configPath, overrideResult.content);
    runtime.rlog.success(
      `Applied Wrangler config overrides: ${overrideResult.applied.join(", ")}`,
    );
  }

  return configPath;
}

async function runMigration(
  options: CommonOptions,
  configPath: string,
): Promise<void> {
  const args = migrationArgs(options, configPath);
  if (args.length === 0) {
    runtime.rlog.info("D1 migration skipped for this target.");
    return;
  }

  await runtime.runCommand(process.execPath, args, targetEnv(options.target));
  runtime.rlog.success(
    `D1 migrations applied (${migrationMode(options.target)})`,
  );
}

async function buildTrackerSdk(options: CommonOptions): Promise<void> {
  if (options.skipSdk) {
    runtime.rlog.info("Tracker SDK build skipped.");
    return;
  }

  await runtime.runCommand(
    process.execPath,
    [
      localCli(ROOT_DIR, "tsx", path.join("dist", "cli.mjs")),
      path.join(ROOT_DIR, "scripts", "build-tracker-sdk.ts"),
    ],
    targetEnv(options.target),
  );
}

async function writeBuildMeta(options: CommonOptions): Promise<void> {
  const cacheDir = path.join(ROOT_DIR, ".cache");
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(
    path.join(cacheDir, "build-meta.json"),
    JSON.stringify(
      {
        finishedAt: Date.now(),
        migrationMode: migrationMode(options.target),
        target: options.target,
      },
      null,
      2,
    ),
  );
}

const runtime = createRuntime("prebuild", "Prebuild");

async function main(): Promise<void> {
  const options = parseCommonOptions(process.argv.slice(2));
  const startedAt = Date.now();
  const stages = [];

  runtime.logHeader(options);
  runtime.assertEnvironment(options);

  stages.push(
    await runtime.runStage(1, 4, "Checking environment", () =>
      runPrecheck(options),
    ),
  );
  let configPath = "";
  stages.push(
    await runtime.runStage(2, 4, "Preparing Wrangler config", async () => {
      configPath = await applyConfigOverrides(options);
    }),
  );
  stages.push(
    await runtime.runStage(3, 4, "Applying D1 migrations", () =>
      runMigration(options, configPath),
    ),
  );
  stages.push(
    await runtime.runStage(4, 4, "Building tracker SDK", () =>
      buildTrackerSdk(options),
    ),
  );
  await writeBuildMeta(options);

  runtime.logSummary(stages, startedAt);
  runtime.rlog.success("InsightFlare prebuild completed successfully.");
}

main().catch((error: unknown) => {
  runtime.rlog.log();
  runtime.rlog.error("InsightFlare prebuild failed");
  runtime.rlog.error(error instanceof Error ? error.message : String(error));
  runtime.rlog.error(`Full log: ${runtime.logFilePath}`);
  process.exitCode = 1;
});
