import type { ChildProcess } from "node:child_process";
import { spawn, spawnSync } from "node:child_process";

const isWindows = process.platform === "win32";
const npmCommand = isWindows ? "npm.cmd" : "npm";
const npxCommand = isWindows ? "npx.cmd" : "npx";

const children: ChildProcess[] = [];
let shuttingDown = false;

function terminate(child: ChildProcess): void {
  if (!child.pid || child.killed) return;
  if (isWindows) {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
    });
    return;
  }
  child.kill();
}

function start(name: string, command: string, args: string[]): ChildProcess {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: process.env,
    shell: isWindows,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.pipe(process.stdout);
  child.stderr?.pipe(process.stderr);
  children.push(child);
  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    for (const other of children) {
      if (other !== child && !other.killed) {
        terminate(other);
      }
    }
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
  child.on("error", (error) => {
    console.error(`[dev] Failed to start ${name}:`, error);
    process.exit(1);
  });
  return child;
}

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    terminate(child);
  }
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log("[dev] Next dev server: http://127.0.0.1:3000");
console.log("[dev] Worker entrypoint: http://127.0.0.1:8787");
console.log("[dev] Use the Worker URL for normal local development.");

start("Next dev", npmCommand, ["run", "dev:next"]);
start("Wrangler dev", npxCommand, [
  "wrangler",
  "dev",
  "--config",
  "wrangler.dev.toml",
  "--port",
  "8787",
]);
