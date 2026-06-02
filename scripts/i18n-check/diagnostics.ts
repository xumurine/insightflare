import type { NodeInfo, UsageRef } from "./types";
import { extractPlaceholders } from "./yaml";

function sameArray(left: string[], right: string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function startsWithPath(pathValue: string, prefix: string): boolean {
  return pathValue === prefix || pathValue.startsWith(`${prefix}.`);
}

export function findUsedButMissing(
  usedPaths: string[],
  definedNodes: Map<string, NodeInfo>,
): string[] {
  return usedPaths.filter((usedPath) => {
    if (definedNodes.has(usedPath)) return false;
    for (const definedPath of definedNodes.keys()) {
      if (startsWithPath(definedPath, usedPath)) return false;
    }
    return true;
  });
}

export function findUnusedLeaves(
  leaves: Map<string, string>,
  usedPaths: string[],
): string[] {
  return [...leaves.keys()].filter(
    (leafPath) =>
      !usedPaths.some((usedPath) => startsWithPath(leafPath, usedPath)),
  );
}

export function compareNodeShapes(
  left: Map<string, NodeInfo>,
  right: Map<string, NodeInfo>,
): {
  missingOnRight: string[];
  missingOnLeft: string[];
  kindMismatch: string[];
} {
  const missingOnRight: string[] = [];
  const missingOnLeft: string[] = [];
  const kindMismatch: string[] = [];

  for (const [key, value] of left) {
    const other = right.get(key);
    if (!other) {
      missingOnRight.push(key);
      continue;
    }
    if (other.kind !== value.kind) {
      kindMismatch.push(key);
    }
  }

  for (const key of right.keys()) {
    if (!left.has(key)) {
      missingOnLeft.push(key);
    }
  }

  return {
    missingOnRight: missingOnRight.sort(),
    missingOnLeft: missingOnLeft.sort(),
    kindMismatch: kindMismatch.sort(),
  };
}

export function comparePlaceholders(
  enLeaves: Map<string, string>,
  zhLeaves: Map<string, string>,
): Array<{ key: string; en: string[]; zh: string[] }> {
  const mismatches: Array<{ key: string; en: string[]; zh: string[] }> = [];

  for (const [key, enValue] of enLeaves) {
    const zhValue = zhLeaves.get(key);
    if (zhValue === undefined) continue;
    const enPlaceholders = extractPlaceholders(enValue);
    const zhPlaceholders = extractPlaceholders(zhValue);
    if (!sameArray(enPlaceholders, zhPlaceholders)) {
      mismatches.push({
        key,
        en: enPlaceholders,
        zh: zhPlaceholders,
      });
    }
  }

  return mismatches.sort((left, right) => left.key.localeCompare(right.key));
}

export function formatUsageRefs(refs: UsageRef[] | undefined): string {
  if (!refs || refs.length === 0) return "";
  return refs
    .slice(0, 3)
    .map((ref) => `${ref.file}:${ref.line}:${ref.column}`)
    .join(", ");
}
