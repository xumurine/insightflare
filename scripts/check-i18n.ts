import process from "node:process";

import { runCli } from "./i18n-check/cli";
import { rlog } from "./i18n-check/logger";

runCli().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.stack || error.message : String(error);
  rlog.error(message);
  process.exitCode = 1;
});
