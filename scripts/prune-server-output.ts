#!/usr/bin/env tsx

import fs from "node:fs";
import path from "node:path";

import { ROOT_DIR } from "./shared/paths";

const serverDir = path.join(ROOT_DIR, "dist", "server");
const assetsDir = path.join(serverDir, "assets");
const entryPath = path.join(serverDir, "index.js");
const importPattern =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)["']([^"']+)["']/g;

function relativeImports(filePath: string): string[] {
  const source = fs.readFileSync(filePath, "utf8");
  const imports: string[] = [];
  for (const match of source.matchAll(importPattern)) {
    const specifier = match[1];
    if (specifier?.startsWith(".")) imports.push(specifier);
  }
  return imports;
}

function reachableModules(): Set<string> {
  const reachable = new Set<string>();
  const queue = [entryPath];

  while (queue.length > 0) {
    const current = queue.pop();
    if (!current || reachable.has(current) || !fs.existsSync(current)) continue;
    reachable.add(current);
    for (const specifier of relativeImports(current)) {
      const resolved = path.resolve(path.dirname(current), specifier);
      if (resolved.startsWith(serverDir) && !reachable.has(resolved)) {
        queue.push(resolved);
      }
    }
  }
  return reachable;
}

function main(): void {
  if (!fs.existsSync(entryPath) || !fs.existsSync(assetsDir)) {
    throw new Error(
      "TanStack Start server output is missing; run vite build first.",
    );
  }

  const reachable = reachableModules();
  let removedFiles = 0;
  let removedBytes = 0;
  for (const entry of fs.readdirSync(assetsDir, { withFileTypes: true })) {
    if (!entry.isFile() || path.extname(entry.name) !== ".js") continue;
    const filePath = path.join(assetsDir, entry.name);
    if (reachable.has(filePath)) continue;
    removedBytes += fs.statSync(filePath).size;
    fs.rmSync(filePath);
    removedFiles += 1;
  }

  console.info(
    `Pruned ${removedFiles} unreachable server modules (${(removedBytes / 1024).toFixed(2)} KiB).`,
  );
}

main();
