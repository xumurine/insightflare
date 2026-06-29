#!/usr/bin/env tsx

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { createScriptLogger } from "./shared/logger";
import { LOGS_DIR, ROOT_DIR } from "./shared/paths";

type BuildTarget = "local" | "remote";

interface BuildOptions {
  autoMigrate?: string;
  config: string;
  database?: string;
  demo: boolean;
  envName?: string;
  skipSdk: boolean;
  skipPrebuild: boolean;
  target: BuildTarget;
}

interface StageResult {
  durationMs: number;
  name: string;
}

const LOG_FILE = "cf-build.log";
const LOG_FILE_PATH = path.join(LOGS_DIR, LOG_FILE);

fs.mkdirSync(LOGS_DIR, { recursive: true });
fs.writeFileSync(LOG_FILE_PATH, "");

const rlog = createScriptLogger({
  logFile: LOG_FILE,
});

function readOption(argv: string[], name: string): string | undefined {
  const flag = `--${name}`;
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === flag) {
      return argv[index + 1];
    }
    if (current.startsWith(`${flag}=`)) {
      return current.slice(flag.length + 1);
    }
  }
  return undefined;
}

function hasFlag(argv: string[], name: string): boolean {
  return argv.includes(`--${name}`);
}

function parseArgs(argv: string[]): BuildOptions {
  const demo = hasFlag(argv, "demo");
  const ci = hasFlag(argv, "ci");
  const rawTarget = readOption(argv, "target");
  const target = hasFlag(argv, "remote")
    ? "remote"
    : hasFlag(argv, "local")
      ? "local"
      : rawTarget === "remote"
        ? "remote"
        : "local";

  return {
    autoMigrate: readOption(argv, "auto-migrate"),
    config:
      readOption(argv, "config") ??
      process.env.INSIGHTFLARE_WRANGLER_CONFIG ??
      (demo ? "wrangler.demo.toml" : "wrangler.toml"),
    database:
      readOption(argv, "database") ?? process.env.INSIGHTFLARE_D1_DATABASE,
    demo,
    envName: readOption(argv, "env") ?? process.env.INSIGHTFLARE_ENV,
    skipSdk: hasFlag(argv, "skip-sdk"),
    skipPrebuild: demo || ci || hasFlag(argv, "skip-prebuild"),
    target,
  };
}

function quoteArg(value: string): string {
  return /\s/.test(value) ? JSON.stringify(value) : value;
}

function commandLine(command: string, args: string[]): string {
  return [command, ...args.map(quoteArg)].join(" ");
}

function appendLog(chunk: Buffer | string): void {
  fs.appendFileSync(LOG_FILE_PATH, chunk);
}

function normalizeEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => {
      return entry[1] !== undefined;
    }),
  ) as NodeJS.ProcessEnv;
}

function runCommand(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  displayCommand = commandLine(command, args),
): Promise<void> {
  rlog.info(`$ ${displayCommand}`);
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: ROOT_DIR,
      env: normalizeEnv(env),
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout.on("data", (chunk: Buffer) => {
      process.stdout.write(chunk);
      appendLog(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      process.stderr.write(chunk);
      appendLog(chunk);
    });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      const reason =
        signal !== null
          ? `Command terminated by signal ${signal}`
          : `Command failed with exit code ${code ?? 1}`;
      reject(new Error(`${reason}: ${displayCommand}`));
    });
  });
}

function npmCommand(args: string[]): { args: string[]; command: string } {
  if (process.platform !== "win32") {
    return { args, command: "npm" };
  }

  return {
    args: ["/d", "/s", "/c", commandLine("npm", args)],
    command: process.env.ComSpec || "cmd.exe",
  };
}

function runNpm(args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  const command = npmCommand(args);
  return runCommand(
    command.command,
    command.args,
    env,
    commandLine("npm", args),
  );
}

async function runStage(
  index: number,
  total: number,
  name: string,
  task: () => Promise<void> | void,
): Promise<StageResult> {
  const startedAt = Date.now();
  rlog.log();
  rlog.info(`[${index}/${total}] ${name}`);
  await task();
  const durationMs = Date.now() - startedAt;
  rlog.success(`Done in ${(durationMs / 1000).toFixed(2)}s`);
  return { durationMs, name };
}

function folderSize(dirPath: string): number {
  if (!fs.existsSync(dirPath)) return 0;
  let size = 0;
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      size += folderSize(entryPath);
    } else if (entry.isFile()) {
      size += fs.statSync(entryPath).size;
    }
  }
  return size;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  return `${(bytes / 1024 ** index).toFixed(2)} ${units[index]}`;
}

function prebuildArgs(options: BuildOptions): string[] {
  const args = [
    "run",
    "build:pre",
    "--",
    "--config",
    options.config,
    "--target",
    options.target,
  ];
  if (options.database) {
    args.push("--database", options.database);
  }
  if (options.envName) {
    args.push("--env", options.envName);
  }
  if (options.autoMigrate !== undefined) {
    args.push("--auto-migrate", options.autoMigrate);
  }
  return args;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const env = {
    ...process.env,
    ...(options.demo ? { NEXT_PUBLIC_DEMO_MODE: "1" } : {}),
  };
  const startedAt = Date.now();
  const stages: StageResult[] = [];

  rlog.log();
  rlog.log("InsightFlare Cloudflare Build");
  rlog.log();
  rlog.info(`Config: ${options.config}`);
  rlog.info(`Target: ${options.target}`);
  if (options.envName) rlog.info(`Wrangler env: ${options.envName}`);
  if (options.demo) rlog.info("Demo mode: enabled");
  rlog.info(`Log file: ${LOG_FILE_PATH}`);

  const totalStages = 3;
  stages.push(
    await runStage(1, totalStages, "Preparing build inputs", async () => {
      if (options.skipPrebuild) {
        rlog.info("Prebuild skipped.");
        if (options.skipSdk) {
          rlog.info("Tracker SDK build skipped.");
          return;
        }
        rlog.info("Building tracker SDK directly.");
        await runNpm(["run", "build:sdk"], env);
        return;
      }
      await runNpm(prebuildArgs(options), env);
    }),
  );

  stages.push(
    await runStage(2, totalStages, "Checking native build dependencies", () =>
      runNpm(["run", "ensure:ast-grep"], env),
    ),
  );

  stages.push(
    await runStage(3, totalStages, "Building Cloudflare worker", () =>
      runNpm(["exec", "--", "opennextjs-cloudflare", "build"], env),
    ),
  );

  const totalMs = Date.now() - startedAt;
  rlog.log();
  rlog.success("Build Summary:");
  rlog.log("----------------------------------------");
  for (const stage of stages) {
    rlog.log(
      `${stage.name.padEnd(35)} ${(stage.durationMs / 1000).toFixed(2)}s`,
    );
  }
  rlog.log(`Total time${"".padEnd(25)} ${(totalMs / 1000).toFixed(2)}s`);
  rlog.log(
    `.next size${"".padEnd(25)} ${formatBytes(folderSize(path.join(ROOT_DIR, ".next")))}`,
  );
  rlog.log(
    `.open-next size${"".padEnd(20)} ${formatBytes(folderSize(path.join(ROOT_DIR, ".open-next")))}`,
  );
  rlog.log(`Log file${"".padEnd(27)} ${LOG_FILE_PATH}`);
  rlog.log("----------------------------------------");
  rlog.log();
  rlog.success("InsightFlare Cloudflare build completed successfully.");
}

main().catch((error: unknown) => {
  rlog.log();
  rlog.error("Cloudflare build failed");
  rlog.error(error instanceof Error ? error.message : String(error));
  rlog.error(`Full log: ${LOG_FILE_PATH}`);
  process.exitCode = 1;
});
