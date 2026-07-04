#!/usr/bin/env tsx

import process from "node:process";

import {
  type CommonOptions,
  createRuntime,
  localCli,
  parseCommonOptions,
  readOption,
  type StageResult,
  targetEnv,
} from "./shared/deploy-runtime";
import { ROOT_DIR } from "./shared/paths";

type OpsAction = "d1:create" | "secret" | "tail";

interface OpsOptions extends CommonOptions {
  action: OpsAction;
  name?: string;
}

const SECRET_NAMES = new Set([
  "MAIN_SECRET",
  "DAILY_SALT_SECRET",
  "BOOTSTRAP_ADMIN_PASSWORD",
]);

function parseAction(value: string | undefined): OpsAction {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (
    normalized === "d1:create" ||
    normalized === "secret" ||
    normalized === "tail"
  ) {
    return normalized;
  }
  throw new Error(`Unsupported ops action: ${value}`);
}

function parseOpsOptions(argv: string[]): OpsOptions {
  return {
    ...parseCommonOptions(argv),
    action: parseAction(readOption(argv, "action")),
    name: readOption(argv, "name"),
  };
}

function wranglerArgs(options: OpsOptions): string[] {
  if (options.action === "tail") {
    const args = ["tail", "--config", options.config];
    if (options.envName) args.push("--env", options.envName);
    return args;
  }

  if (options.action === "d1:create") {
    return [
      "d1",
      "create",
      options.name || options.database,
      "--config",
      options.config,
    ];
  }

  const secretName = options.name || "";
  if (!SECRET_NAMES.has(secretName)) {
    throw new Error(`Unsupported secret name: ${secretName}`);
  }
  const args = ["secret", "put", secretName, "--config", options.config];
  if (options.envName) args.push("--env", options.envName);
  return args;
}

async function runOpsAction(options: OpsOptions): Promise<void> {
  if (options.target !== "cf") {
    throw new Error("ops commands only support target=cf.");
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

const runtime = createRuntime("ops", "Operations");

async function main(): Promise<void> {
  const options = parseOpsOptions(process.argv.slice(2));
  const startedAt = Date.now();
  const stages: StageResult[] = [];

  runtime.logHeader(options);
  runtime.rlog.info(`Action: ${options.action}`);
  if (options.name) runtime.rlog.info(`Name: ${options.name}`);
  runtime.assertEnvironment(options);

  stages.push(
    await runtime.runStage(1, 1, "Running operations command", () =>
      runOpsAction(options),
    ),
  );
  runtime.logSummary(stages, startedAt);
  runtime.rlog.success(
    "InsightFlare operations command completed successfully.",
  );
}

main().catch((error: unknown) => {
  runtime.rlog.log();
  runtime.rlog.error("InsightFlare operations command failed");
  runtime.rlog.error(error instanceof Error ? error.message : String(error));
  runtime.rlog.error(`Full log: ${runtime.logFilePath}`);
  process.exitCode = 1;
});
