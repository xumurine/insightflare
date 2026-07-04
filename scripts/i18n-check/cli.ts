import process from "node:process";

import ts from "typescript";

import { getAppMessagesType } from "./app-messages";
import {
  compareNodeShapes,
  comparePlaceholders,
  findUnusedLeaves,
  findUsedButMissing,
  formatUsageRefs,
} from "./diagnostics";
import { rlog } from "./logger";
import { EN_PATH, TSCONFIG_PATH, ZH_PATH } from "./paths";
import { pruneUnusedKeys } from "./prune";
import type { NodeInfo } from "./types";
import { collectTypePaths, parseTsConfig } from "./typescript";
import { collectUsedKeys } from "./usage-scanner";
import { collectNodes, readYaml } from "./yaml";

export async function runCli(
  args: string[] = process.argv.slice(2),
): Promise<void> {
  rlog.info("Loading translation files (en.yaml, zh.yaml)...");
  const [enYaml, zhYaml] = await Promise.all([
    readYaml(EN_PATH),
    readYaml(ZH_PATH),
  ]);

  rlog.info("Parsing translation keys and building tree maps...");
  const enNodes = new Map<string, NodeInfo>();
  const zhNodes = new Map<string, NodeInfo>();
  const enLeaves = new Map<string, string>();
  const zhLeaves = new Map<string, string>();
  collectNodes(enYaml, [], enNodes, enLeaves);
  collectNodes(zhYaml, [], zhNodes, zhLeaves);

  rlog.info("Parsing tsconfig.json...");
  const config = parseTsConfig(TSCONFIG_PATH);

  rlog.info(
    `Creating TypeScript program for ${config.fileNames.length} files...`,
  );
  const program = ts.createProgram({
    rootNames: config.fileNames,
    options: config.options,
  });

  rlog.info("Acquiring TypeScript TypeChecker...");
  const checker = program.getTypeChecker();

  rlog.info("Resolving referenced translation type paths...");
  const typePaths = collectTypePaths(program, checker);

  rlog.info("Analyzing AppMessages type properties...");
  const { type: appMessagesType, symbol: appMessagesSymbol } =
    getAppMessagesType(program, checker);

  rlog.info("Scanning codebase to collect all referenced keys...");
  const usageMap = collectUsedKeys(
    program,
    checker,
    appMessagesType,
    appMessagesSymbol,
    enNodes,
    typePaths,
  );
  const usedPaths = [...usageMap.keys()].sort();

  rlog.info("Running diagnostics validation...");

  const shapeDiff = compareNodeShapes(enNodes, zhNodes);
  const placeholderMismatches = comparePlaceholders(enLeaves, zhLeaves);
  const usedButMissingInEn = findUsedButMissing(usedPaths, enNodes);
  const usedButMissingInZh = findUsedButMissing(usedPaths, zhNodes);
  const unusedEnKeys = findUnusedLeaves(enLeaves, usedPaths);
  const unusedZhKeys = findUnusedLeaves(zhLeaves, usedPaths);

  const errors =
    shapeDiff.missingOnRight.length +
    shapeDiff.missingOnLeft.length +
    shapeDiff.kindMismatch.length +
    placeholderMismatches.length +
    usedButMissingInEn.length +
    usedButMissingInZh.length;

  if (errors > 0) {
    rlog.error("I18n Check Failed!");
  } else {
    rlog.success("I18n Check Passed Successfully!");
  }

  rlog.log(`- en leaf keys: ${enLeaves.size}`);
  rlog.log(`- zh leaf keys: ${zhLeaves.size}`);
  rlog.log(`- referenced key paths: ${usedPaths.length}`);
  if (errors > 0) {
    rlog.error(`- structural errors: ${errors}`);
  } else {
    rlog.success(`- structural errors: ${errors}`);
  }

  if (unusedEnKeys.length > 0) {
    rlog.warn(`- unused en leaf keys: ${unusedEnKeys.length}`);
  } else {
    rlog.log(`- unused en leaf keys: ${unusedEnKeys.length}`);
  }

  if (unusedZhKeys.length > 0) {
    rlog.warn(`- unused zh leaf keys: ${unusedZhKeys.length}`);
  } else {
    rlog.log(`- unused zh leaf keys: ${unusedZhKeys.length}`);
  }

  if (shapeDiff.missingOnRight.length > 0) {
    rlog.error("\nMissing In zh.yaml");
    for (const key of shapeDiff.missingOnRight) {
      rlog.warn(`- ${key}`);
    }
  }

  if (shapeDiff.missingOnLeft.length > 0) {
    rlog.error("\nMissing In en.yaml");
    for (const key of shapeDiff.missingOnLeft) {
      rlog.warn(`- ${key}`);
    }
  }

  if (shapeDiff.kindMismatch.length > 0) {
    rlog.error("\nType Mismatches");
    for (const key of shapeDiff.kindMismatch) {
      rlog.warn(`- ${key}`);
    }
  }

  if (placeholderMismatches.length > 0) {
    rlog.error("\nPlaceholder Mismatches");
    for (const mismatch of placeholderMismatches) {
      rlog.warn(`- ${mismatch.key}`);
      rlog.log(`  en: ${mismatch.en.join(", ") || "(none)"}`);
      rlog.log(`  zh: ${mismatch.zh.join(", ") || "(none)"}`);
    }
  }

  if (usedButMissingInEn.length > 0) {
    rlog.error("\nUsed But Missing In en.yaml");
    for (const key of usedButMissingInEn) {
      rlog.warn(`- ${key} (${formatUsageRefs(usageMap.get(key))})`);
    }
  }

  if (usedButMissingInZh.length > 0) {
    rlog.error("\nUsed But Missing In zh.yaml");
    for (const key of usedButMissingInZh) {
      rlog.warn(`- ${key} (${formatUsageRefs(usageMap.get(key))})`);
    }
  }

  if (unusedEnKeys.length > 0) {
    rlog.file.info("\nUnused en.yaml Keys");
    rlog.screen.info("Writing unused en.yaml keys to local log file...");
    let i = 0;
    for (const key of unusedEnKeys) {
      rlog.file.info(`- ${key}`);
      i += 1;
      rlog.progress(i, unusedEnKeys.length);
    }
  }

  if (unusedZhKeys.length > 0) {
    rlog.file.info("\nUnused zh.yaml Keys");
    rlog.screen.info("Writing unused zh.yaml keys to local log file...");
    let i = 0;
    for (const key of unusedZhKeys) {
      rlog.file.info(`- ${key}`);
      i += 1;
      rlog.progress(i, unusedZhKeys.length);
    }
  }

  const isPruneMode = args.includes("--prune");

  if (isPruneMode && (unusedEnKeys.length > 0 || unusedZhKeys.length > 0)) {
    await pruneUnusedKeys(unusedEnKeys, unusedZhKeys);
  }

  if (errors > 0) {
    process.exitCode = 1;
  }
}
