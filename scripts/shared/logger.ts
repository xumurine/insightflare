import fs from "node:fs";
import path from "node:path";

import Rlog from "rlog-js";

import { LOGS_DIR } from "./paths";

interface ScriptLoggerOptions {
  logFile?: string | false;
  silent?: boolean;
}

function defaultLogFile(): string {
  const scriptPath = process.argv[1];
  if (!scriptPath) return "script.log";

  const name = path.basename(scriptPath).replace(/\.(?:c|m)?tsx?$/i, "");
  return `${name || "script"}.log`;
}

export function createScriptLogger(options: ScriptLoggerOptions = {}): Rlog {
  const logFile =
    options.logFile === false
      ? undefined
      : (options.logFile ?? defaultLogFile());
  const logFilePath = logFile ? path.join(LOGS_DIR, logFile) : undefined;

  if (logFilePath && !fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }

  return new Rlog({
    enableColorfulOutput: true,
    logFilePath,
    silent: options.silent,
  });
}
