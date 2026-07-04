#!/usr/bin/env tsx

import path from "node:path";
import process from "node:process";

import {
  type CommonOptions,
  createRuntime,
  localCli,
  parseCommonOptions,
  type StageResult,
  targetEnv,
} from "./shared/deploy-runtime";
import { ROOT_DIR } from "./shared/paths";

function buildArgs(options: CommonOptions): string[] {
  const args = [
    localCli(ROOT_DIR, "tsx", path.join("dist", "cli.mjs")),
    path.join(ROOT_DIR, "scripts", "build.ts"),
    "--target",
    options.target,
    "--config",
    options.config,
    "--database",
    options.database,
  ];
  if (options.envName) {
    args.push("--env", options.envName);
  }
  return args;
}

function deployArgs(options: CommonOptions): string[] {
  const args = [
    localCli(ROOT_DIR, "tsx", path.join("dist", "cli.mjs")),
    path.join(ROOT_DIR, "scripts", "deploy.ts"),
    "--target",
    options.target,
    "--config",
    options.config,
  ];
  if (options.envName) {
    args.push("--env", options.envName);
  }
  if (options.dryRun) {
    args.push("--dry-run");
  }
  return args;
}

async function runBuild(options: CommonOptions): Promise<void> {
  await runtime.runCommand(
    process.execPath,
    buildArgs(options),
    targetEnv(options.target),
  );
}

async function runDeploy(options: CommonOptions): Promise<void> {
  await runtime.runCommand(
    process.execPath,
    deployArgs(options),
    targetEnv(options.target),
  );
}

const runtime = createRuntime("publish", "Publish");

async function main(): Promise<void> {
  const options = parseCommonOptions(process.argv.slice(2));
  const startedAt = Date.now();
  const stages: StageResult[] = [];

  if (options.target === "local") {
    throw new Error("publish does not support target=local.");
  }

  runtime.logHeader(options);
  runtime.assertEnvironment(options);
  stages.push(
    await runtime.runStage(1, 2, "Building release artifacts", () =>
      runBuild(options),
    ),
  );
  stages.push(
    await runtime.runStage(2, 2, "Publishing Worker", () => runDeploy(options)),
  );
  runtime.logSummary(stages, startedAt);
  runtime.rlog.success("InsightFlare publish completed successfully.");
}

main().catch((error: unknown) => {
  runtime.rlog.log();
  runtime.rlog.error("InsightFlare publish failed");
  runtime.rlog.error(error instanceof Error ? error.message : String(error));
  runtime.rlog.error(`Full log: ${runtime.logFilePath}`);
  process.exitCode = 1;
});
