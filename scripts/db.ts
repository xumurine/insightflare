#!/usr/bin/env tsx

import process from "node:process";

import {
  type CommonOptions,
  createRuntime,
  type DeployTarget,
  hasFlag,
  localCli,
  parseCommonOptions,
  readOption,
  type StageResult,
  targetEnv,
} from "./shared/deploy-runtime";
import { ROOT_DIR } from "./shared/paths";

type DbAction = "create" | "migrate" | "migration:create";

interface DbOptions extends CommonOptions {
  action: DbAction;
  name: string;
}

function parseAction(value: string | undefined): DbAction {
  const normalized = String(value || "migrate")
    .trim()
    .toLowerCase();
  if (
    normalized === "create" ||
    normalized === "migrate" ||
    normalized === "migration:create"
  ) {
    return normalized;
  }
  throw new Error(`Unsupported db action: ${value}`);
}

function parseDbOptions(argv: string[]): DbOptions {
  const common = parseCommonOptions(argv);
  return {
    ...common,
    action: parseAction(readOption(argv, "action")),
    name:
      readOption(argv, "name") ||
      readOption(argv, "database") ||
      process.env.INSIGHTFLARE_D1_DATABASE ||
      "insightflare",
  };
}

function migrationTargetFlag(target: DeployTarget): string {
  if (target === "local") return "--local";
  if (target === "cf") return "--remote";
  throw new Error("Demo target does not use D1.");
}

function wranglerArgs(options: DbOptions): string[] {
  const base = ["d1"];
  if (options.action === "create") {
    return [...base, "create", options.name, "--config", options.config];
  }
  if (options.action === "migration:create") {
    return [
      ...base,
      "migrations",
      "create",
      options.name,
      "--config",
      options.config,
    ];
  }
  return [
    ...base,
    "migrations",
    "apply",
    options.name,
    "--config",
    options.config,
    migrationTargetFlag(options.target),
  ];
}

async function runDbAction(options: DbOptions): Promise<void> {
  if (options.target === "demo") {
    throw new Error("db commands do not support target=demo.");
  }
  if (hasFlag(process.argv.slice(2), "dry-run")) {
    runtime.rlog.info("D1 commands do not support dry-run; ignoring flag.");
  }
  await runtime.runCommand(
    process.execPath,
    [
      localCli(ROOT_DIR, "wrangler", "bin/wrangler.js"),
      ...wranglerArgs(options),
    ],
    targetEnv(options.target),
  );
}

const runtime = createRuntime("db", "Database");

async function main(): Promise<void> {
  const options = parseDbOptions(process.argv.slice(2));
  const startedAt = Date.now();
  const stages: StageResult[] = [];

  runtime.logHeader(options);
  runtime.rlog.info(`Action: ${options.action}`);
  runtime.rlog.info(`Database: ${options.name}`);
  runtime.assertEnvironment(options);

  stages.push(
    await runtime.runStage(1, 1, "Running database command", () =>
      runDbAction(options),
    ),
  );
  runtime.logSummary(stages, startedAt);
  runtime.rlog.success("InsightFlare database command completed successfully.");
}

main().catch((error: unknown) => {
  runtime.rlog.log();
  runtime.rlog.error("InsightFlare database command failed");
  runtime.rlog.error(error instanceof Error ? error.message : String(error));
  runtime.rlog.error(`Full log: ${runtime.logFilePath}`);
  process.exitCode = 1;
});
