#!/usr/bin/env tsx

import process from "node:process";

import {
  type CommonOptions,
  createRuntime,
  localCli,
  parseCommonOptions,
  resolveConfigPath,
  type StageResult,
  targetEnv,
} from "./shared/deploy-runtime";
import { ROOT_DIR } from "./shared/paths";

function deployArgs(options: CommonOptions): string[] {
  const args = ["deploy", "--config", resolveConfigPath(options.config)];
  if (options.envName) {
    args.push("--env", options.envName);
  }
  if (options.dryRun) {
    args.push("--dry-run");
  }
  args.push("--minify");
  return args;
}

async function runWranglerDeploy(options: CommonOptions): Promise<void> {
  if (options.target === "local") {
    throw new Error(
      "deploy does not support target=local; use publish for releases.",
    );
  }

  await runtime.runCommand(
    process.execPath,
    [localCli(ROOT_DIR, "wrangler", "bin/wrangler.js"), ...deployArgs(options)],
    targetEnv(options.target),
  );
}

const runtime = createRuntime("deploy", "Deploy");

async function main(): Promise<void> {
  const options = parseCommonOptions(process.argv.slice(2));
  const startedAt = Date.now();
  const stages: StageResult[] = [];

  runtime.logHeader(options);
  runtime.assertEnvironment(options);
  stages.push(
    await runtime.runStage(1, 1, "Deploying Worker", () =>
      runWranglerDeploy(options),
    ),
  );
  runtime.logSummary(stages, startedAt);
  runtime.rlog.success("InsightFlare deploy completed successfully.");
}

main().catch((error: unknown) => {
  runtime.rlog.log();
  runtime.rlog.error("InsightFlare deploy failed");
  runtime.rlog.error(error instanceof Error ? error.message : String(error));
  runtime.rlog.error(`Full log: ${runtime.logFilePath}`);
  process.exitCode = 1;
});
