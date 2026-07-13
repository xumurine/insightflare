#!/usr/bin/env tsx

import { type ChildProcess, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import process from "node:process";

import { createScriptLogger } from "./shared/logger";
import { ROOT_DIR } from "./shared/paths";

const rlog = createScriptLogger({ logFile: "e2e.log" });
const MIGRATION_PROGRESS_MAX = 85;
const TRACKER_BUILD_PROGRESS = 90;
const PREPARATION_PROGRESS_MAX = 100;

interface Options {
  debug: boolean;
  headed: boolean;
  keep: boolean;
  ui: boolean;
  workers: number | undefined;
}

interface Environment {
  adminPassword: string;
  baseURL: string;
  configPath: string;
  directory: string;
  id: string;
  mainSecret: string;
  persistencePath: string;
  port: number;
}

interface StartedProcess {
  child: ChildProcess;
  exited: Promise<void>;
  name: string;
}

function optionValue(argv: string[], name: string): string | undefined {
  const flag = `--${name}`;
  const index = argv.indexOf(flag);
  if (index >= 0) return argv[index + 1];
  return argv
    .find((value) => value.startsWith(`${flag}=`))
    ?.slice(flag.length + 1);
}

function parseWorkers(argv: string[]): number | undefined {
  const value = optionValue(argv, "workers");
  if (value === undefined) return undefined;
  const workers = Number(value);
  if (!Number.isInteger(workers) || workers < 1) {
    throw new Error("--workers must be a positive integer.");
  }
  return workers;
}

function parseOptions(argv: string[]): Options {
  return {
    debug: argv.includes("--debug"),
    headed: argv.includes("--headed"),
    keep: argv.includes("--keep"),
    ui: argv.includes("--ui"),
    workers: parseWorkers(argv),
  };
}

function runId(): string {
  return `${new Date().toISOString().replace(/[:.]/g, "-")}-${process.pid}`;
}

function tomlString(value: string): string {
  return JSON.stringify(value.replace(/\\/g, "/"));
}

function workerName(id: string): string {
  return `insightflare-e2e-${id.toLowerCase().replace(/[^a-z0-9-]/g, "-")}`;
}

function generatedWranglerConfig(input: {
  adminPassword: string;
  id: string;
  mainSecret: string;
}): string {
  const root = (relativePath: string) =>
    tomlString(path.join(ROOT_DIR, relativePath));
  const name = workerName(input.id);

  return `name = ${tomlString(name)}
main = ${root("src/server.ts")}
compatibility_date = "2026-03-01"
compatibility_flags = ["nodejs_compat", "global_fetch_strictly_public"]

[assets]
directory = ${root("public")}
binding = "ASSETS"

[vars]
DEMO_MODE = "0"
DISABLE_CRON_TASKS = "1"
MAIN_SECRET = ${tomlString(input.mainSecret)}
BOOTSTRAP_ADMIN_PASSWORD = ${tomlString(input.adminPassword)}
SESSION_WINDOW_MINUTES = "30"
SCRIPT_CACHE_TTL_SECONDS = "600"
PARQUET_WASM_URL = "https://cdn.jsdelivr.net/npm/parquet-wasm@0.7.1/esm/parquet_wasm_bg.wasm"

[[durable_objects.bindings]]
name = "INGEST_DO"
class_name = "IngestDurableObject"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["IngestDurableObject"]

[[d1_databases]]
binding = "DB"
database_name = ${tomlString(name)}
database_id = ${tomlString(name)}
migrations_dir = ${root("migrations")}

[[kv_namespaces]]
binding = "SITE_SETTINGS_KV"
id = ${tomlString(name)}

[[analytics_engine_datasets]]
binding = "BOT_ANALYTICS"
dataset = "insightflare_e2e_bot_events"

[[analytics_engine_datasets]]
binding = "NORMAL_ANALYTICS"
dataset = "insightflare_e2e_normal_events"
`;
}

async function findOpenPort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port: 0 }, () => resolve());
  });
  const address = server.address();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  if (!address || typeof address === "string") {
    throw new Error("Unable to allocate an E2E port.");
  }
  return address.port;
}

async function writeRunManifest(
  environment: Environment,
  options: Options,
): Promise<void> {
  await fs.writeFile(
    path.join(environment.directory, "manifest", "run.json"),
    `${JSON.stringify(
      {
        baseURL: environment.baseURL,
        createdAt: new Date().toISOString(),
        debug: options.debug,
        headed: options.headed,
        keep: options.keep,
        phase: 2,
        port: environment.port,
        runId: environment.id,
        ui: options.ui,
        workers: options.workers ?? 1,
      },
      null,
      2,
    )}\n`,
  );
}

async function createEnvironment(options: Options): Promise<Environment> {
  const id = runId();
  const directory = path.resolve(".tmp", "e2e", id);
  const configDirectory = path.join(directory, "config");
  const persistencePath = path.join(directory, "state");
  await Promise.all([
    fs.mkdir(path.join(directory, "artifacts"), { recursive: true }),
    fs.mkdir(configDirectory, { recursive: true }),
    fs.mkdir(path.join(directory, "logs"), { recursive: true }),
    fs.mkdir(path.join(directory, "manifest"), { recursive: true }),
    fs.mkdir(persistencePath, { recursive: true }),
  ]);

  const environment: Environment = {
    adminPassword: `e2e-${randomBytes(24).toString("hex")}`,
    baseURL: "",
    configPath: path.join(configDirectory, "wrangler.e2e.toml"),
    directory,
    id,
    mainSecret: randomBytes(32).toString("hex"),
    persistencePath,
    port: await findOpenPort(),
  };
  environment.baseURL = `http://127.0.0.1:${environment.port}`;

  await fs.writeFile(
    environment.configPath,
    generatedWranglerConfig({
      adminPassword: environment.adminPassword,
      id: environment.id,
      mainSecret: environment.mainSecret,
    }),
  );
  await writeRunManifest(environment, options);
  return environment;
}

function childExitError(
  name: string,
  code: number | null,
  signal: NodeJS.Signals | null,
): Error {
  const reason = signal
    ? `received ${signal}`
    : `exited with code ${code ?? 1}`;
  return new Error(`${name} ${reason}.`);
}

async function migrationFileCount(): Promise<number> {
  const entries = await fs.readdir(path.join(ROOT_DIR, "migrations"), {
    withFileTypes: true,
  });
  const count = entries.filter(
    (entry) => entry.isFile() && entry.name.endsWith(".sql"),
  ).length;
  if (count === 0) throw new Error("No D1 migration files were found.");
  return count;
}

function createMigrationProgress(totalMigrations: number): {
  complete: () => boolean;
  update: (chunk: Buffer) => void;
} {
  const completedMigrations = new Set<string>();
  let output = "";
  let progress = 0;

  const update = (chunk: Buffer) => {
    output += chunk.toString();
    for (const match of output.matchAll(/│\s*([^│\r\n]+?\.sql)\s*│\s*✅/g)) {
      completedMigrations.add(match[1].trim());
    }

    const nextProgress = Math.floor(
      (completedMigrations.size / totalMigrations) * MIGRATION_PROGRESS_MAX,
    );
    if (nextProgress > progress) {
      progress = nextProgress;
      rlog.progress(progress, PREPARATION_PROGRESS_MAX);
    }
  };

  return {
    complete: () => progress >= MIGRATION_PROGRESS_MAX,
    update,
  };
}

async function runCommand(input: {
  args: string[];
  env?: NodeJS.ProcessEnv;
  logPath: string;
  name: string;
  onOutput?: (chunk: Buffer) => void;
  showOutput?: boolean;
}): Promise<void> {
  const log = await fs.open(input.logPath, "w");
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(process.execPath, input.args, {
        cwd: ROOT_DIR,
        env: input.env,
        stdio: ["ignore", "pipe", "pipe"],
      });
      child.stdout?.on("data", (chunk: Buffer) => {
        if (input.showOutput) process.stdout.write(chunk);
        rlog.file.info(chunk.toString());
        input.onOutput?.(chunk);
        void log.write(chunk);
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        if (input.showOutput) process.stderr.write(chunk);
        rlog.file.info(chunk.toString());
        input.onOutput?.(chunk);
        void log.write(chunk);
      });
      child.once("error", reject);
      child.once("close", (code, signal) => {
        if (code === 0) resolve();
        else reject(childExitError(input.name, code, signal));
      });
    });
  } finally {
    await log.close();
  }
}

async function runPreparationStep<T>(
  name: string,
  task: () => Promise<T>,
): Promise<T> {
  const startedAt = Date.now();
  rlog.file.info(`[Preparation] ${name}`);

  try {
    const result = await task();
    rlog.file.info(
      `${name} completed in ${((Date.now() - startedAt) / 1000).toFixed(2)}s.`,
    );
    return result;
  } catch (error) {
    rlog.error(
      `${name} failed after ${((Date.now() - startedAt) / 1000).toFixed(2)}s.`,
    );
    throw error;
  }
}

async function startProcess(input: {
  args: string[];
  env: NodeJS.ProcessEnv;
  logPath: string;
  name: string;
}): Promise<StartedProcess> {
  const log = await fs.open(input.logPath, "w");
  const child = spawn(process.execPath, input.args, {
    cwd: ROOT_DIR,
    env: input.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const exited = new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0) resolve();
      else reject(childExitError(input.name, code, signal));
    });
  });
  void exited.catch(() => undefined);

  const write = (chunk: Buffer) => {
    rlog.file.info(chunk.toString());
    void log.write(chunk);
  };
  child.stdout?.on("data", write);
  child.stderr?.on("data", write);
  child.once("close", () => {
    void log.close();
  });

  return { child, exited, name: input.name };
}

async function waitForReady(
  baseURL: string,
  worker: StartedProcess,
): Promise<void> {
  const deadline = Date.now() + 120_000;
  let lastError = "";
  while (Date.now() < deadline) {
    const exited = await Promise.race([
      worker.exited.then(
        () => "stopped",
        (error: unknown) => error,
      ),
      new Promise<"running">((resolve) =>
        setTimeout(() => resolve("running"), 0),
      ),
    ]);
    if (exited !== "running") {
      throw exited instanceof Error
        ? exited
        : new Error("E2E worker stopped before becoming ready.");
    }

    try {
      const response = await fetch(`${baseURL}/healthz`);
      if (response.ok) return;
      lastError = `health check returned ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`E2E worker did not become ready: ${lastError}`);
}

async function stopProcess(
  processToStop: StartedProcess | null,
): Promise<void> {
  if (!processToStop?.child.pid || processToStop.child.exitCode !== null)
    return;
  processToStop.child.kill();
  await Promise.race([
    processToStop.exited.catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
  if (processToStop.child.exitCode !== null) return;

  if (process.platform === "win32") {
    await new Promise<void>((resolve) => {
      const killer = spawn(
        "taskkill",
        ["/pid", String(processToStop.child.pid), "/t", "/f"],
        {
          stdio: "ignore",
        },
      );
      killer.once("close", () => resolve());
      killer.once("error", () => resolve());
    });
    return;
  }
  processToStop.child.kill("SIGKILL");
}

function workerEnvironment(environment: Environment): NodeJS.ProcessEnv {
  return {
    ...process.env,
    BOOTSTRAP_ADMIN_PASSWORD: environment.adminPassword,
    CLOUDFLARE_CF_FETCH_ENABLED: "false",
    CLOUDFLARE_VITE_WRANGLER_CONFIG_PATH: environment.configPath,
    INSIGHTFLARE_LOCAL_PERSISTENCE_PATH: environment.persistencePath,
    INSIGHTFLARE_PORT: String(environment.port),
    MAIN_SECRET: environment.mainSecret,
  };
}

function localBin(packageName: string, relativePath: string): string {
  return path.join(ROOT_DIR, "node_modules", packageName, relativePath);
}

async function runPlaywright(
  environment: Environment,
  options: Options,
): Promise<void> {
  const args = [
    localBin("@playwright/test", "cli.js"),
    "test",
    "e2e/bootstrap-login.spec.ts",
    "--config",
    "playwright.config.ts",
  ];
  if (options.debug) args.push("--debug");
  if (options.headed) args.push("--headed");
  if (options.ui) args.push("--ui");
  if (options.workers) args.push(`--workers=${options.workers}`);

  await runCommand({
    args,
    env: {
      ...process.env,
      INSIGHTFLARE_E2E_ADMIN_PASSWORD: environment.adminPassword,
      INSIGHTFLARE_E2E_ARTIFACTS: path.join(
        environment.directory,
        "artifacts",
        "playwright",
      ),
      INSIGHTFLARE_E2E_BASE_URL: environment.baseURL,
    },
    logPath: path.join(environment.directory, "logs", "playwright.log"),
    name: "Playwright",
    showOutput: true,
  });
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  let worker: StartedProcess | null = null;
  let environment: Environment | null = null;
  let succeeded = false;
  const startedAt = Date.now();

  try {
    rlog.info("InsightFlare E2E");
    const activeEnvironment = await createEnvironment(options);
    environment = activeEnvironment;
    rlog.info("Preparing isolated E2E environment...");
    rlog.progress(0, PREPARATION_PROGRESS_MAX);
    rlog.file.info(`E2E run: ${activeEnvironment.id}`);
    rlog.file.info(`E2E state: ${activeEnvironment.persistencePath}`);

    const env = workerEnvironment(activeEnvironment);
    const updateMigrationProgress = createMigrationProgress(
      await migrationFileCount(),
    );
    await runPreparationStep("Applying D1 migrations", () =>
      runCommand({
        args: [
          localBin("wrangler", "bin/wrangler.js"),
          "d1",
          "migrations",
          "apply",
          workerName(activeEnvironment.id),
          "--config",
          activeEnvironment.configPath,
          "--local",
          "--persist-to",
          activeEnvironment.persistencePath,
        ],
        env,
        logPath: path.join(
          activeEnvironment.directory,
          "logs",
          "migrations.log",
        ),
        name: "D1 migrations",
        onOutput: updateMigrationProgress.update,
      }),
    );
    if (!updateMigrationProgress.complete()) {
      rlog.progress(MIGRATION_PROGRESS_MAX, PREPARATION_PROGRESS_MAX);
    }
    await runPreparationStep("Building tracker SDK", () =>
      runCommand({
        args: [
          localBin("tsx", "dist/cli.mjs"),
          path.join(ROOT_DIR, "scripts", "build-tracker-sdk.ts"),
        ],
        env,
        logPath: path.join(
          activeEnvironment.directory,
          "logs",
          "tracker-build.log",
        ),
        name: "tracker build",
      }),
    );
    rlog.progress(TRACKER_BUILD_PROGRESS, PREPARATION_PROGRESS_MAX);
    worker = await runPreparationStep("Starting local Worker", async () => {
      const startedWorker = await startProcess({
        args: [localBin("vite", "bin/vite.js"), "dev", "--mode", "development"],
        env,
        logPath: path.join(activeEnvironment.directory, "logs", "worker.log"),
        name: "E2E worker",
      });
      await waitForReady(activeEnvironment.baseURL, startedWorker);
      return startedWorker;
    });
    rlog.progress(PREPARATION_PROGRESS_MAX, PREPARATION_PROGRESS_MAX);
    rlog.success("Test environment is ready.");
    rlog.info("Running Playwright E2E...");
    await runPlaywright(activeEnvironment, options);
    succeeded = true;
    rlog.success(
      `E2E bootstrap login passed in ${((Date.now() - startedAt) / 1000).toFixed(2)}s.`,
    );
  } finally {
    await stopProcess(worker);
    if (environment) {
      if (succeeded && !options.keep) {
        await fs.rm(environment.directory, { force: true, recursive: true });
      } else {
        rlog.info(`E2E run directory retained: ${environment.directory}`);
      }
    }
  }
}

main().catch((error: unknown) => {
  rlog.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
