import fs from "node:fs/promises";

import YAML from "yaml";

import { rlog } from "./logger";
import { APP_MESSAGES_PATH, EN_PATH, ZH_PATH } from "./paths";
import type { JsonLike } from "./types";

function toTsInterface(
  obj: JsonLike,
  indent: number = 2,
  path: string[] = [],
): string {
  const currentPath = path.join(".");
  if (
    currentPath === "common.continentLabels" ||
    currentPath === "geo.investigation.typeLabels"
  ) {
    return "Record<string, string>";
  }

  if (obj && typeof obj === "object" && !Array.isArray(obj)) {
    const spaces = " ".repeat(indent);
    const childSpaces = " ".repeat(indent + 2);
    const lines = ["{"];
    for (const [key, value] of Object.entries(obj)) {
      const propType = toTsInterface(value, indent + 2, [...path, key]);
      lines.push(`${childSpaces}${key}: ${propType};`);
    }
    lines.push(`${spaces}}`);
    return lines.join("\n");
  }

  return "string";
}

function buildMessagesOutput(parsedEnYaml: unknown): string {
  const interfaceBody = [];
  for (const [key, value] of Object.entries(
    parsedEnYaml as Record<string, unknown>,
  )) {
    const propType = toTsInterface(value as JsonLike, 2, [key]);
    interfaceBody.push(`  ${key}: ${propType};`);
  }

  return `import en from "@/i18n/en.yaml";
import zh from "@/i18n/zh.yaml";

import type { Locale } from "./config";

export interface AppMessages {
${interfaceBody.join("\n")}
}

const DICTIONARIES: Record<Locale, AppMessages> = {
  en: en as AppMessages,
  zh: zh as AppMessages,
};

export function getMessages(locale: Locale): AppMessages {
  return DICTIONARIES[locale];
}
`;
}

export async function pruneUnusedKeys(
  unusedEnKeys: string[],
  unusedZhKeys: string[],
): Promise<void> {
  rlog.info("\nPruning unused keys from translation files...");

  const enText = await fs.readFile(EN_PATH, "utf8");
  const zhText = await fs.readFile(ZH_PATH, "utf8");

  const enDoc = YAML.parseDocument(enText);
  const zhDoc = YAML.parseDocument(zhText);

  let enPruned = 0;
  for (const key of unusedEnKeys) {
    enDoc.deleteIn(key.split("."));
    enPruned += 1;
  }

  let zhPruned = 0;
  for (const key of unusedZhKeys) {
    zhDoc.deleteIn(key.split("."));
    zhPruned += 1;
  }

  const prunedEnText = enDoc.toString();
  const prunedZhText = zhDoc.toString();

  await Promise.all([
    fs.writeFile(EN_PATH, prunedEnText, "utf8"),
    fs.writeFile(ZH_PATH, prunedZhText, "utf8"),
  ]);

  rlog.success(
    `Successfully pruned ${enPruned} keys from en.yaml and ${zhPruned} keys from zh.yaml!`,
  );

  rlog.info("Regenerating messages.ts schema to match pruned translations...");
  const parsedEnYaml = YAML.parse(prunedEnText);

  await fs.writeFile(
    APP_MESSAGES_PATH,
    buildMessagesOutput(parsedEnYaml),
    "utf8",
  );
  rlog.success("Successfully regenerated messages.ts schema!");
}
