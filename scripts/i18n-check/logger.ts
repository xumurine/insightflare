import standardFs from "node:fs";
import path from "node:path";

import Rlog from "rlog-js";

import { ROOT_DIR } from "./paths";

const logsDir = path.join(ROOT_DIR, "logs");
if (!standardFs.existsSync(logsDir)) {
  standardFs.mkdirSync(logsDir, { recursive: true });
}

export const rlog = new Rlog({
  logFilePath: path.join(logsDir, "i18n.log"),
  enableColorfulOutput: true,
});
