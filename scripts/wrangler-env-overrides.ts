type EnvMap = Record<string, string | undefined>;

interface OverrideResult {
  applied: string[];
  content: string;
}

const KNOWN_VAR_KEYS = [
  "SESSION_WINDOW_MINUTES",
  "SCRIPT_CACHE_TTL_SECONDS",
  "PARQUET_WASM_URL",
  "NEXT_PUBLIC_DEMO_MODE",
  "DISABLE_CRON_TASKS",
] as const;

function normalizeEnvName(value: string): string {
  return value.replace(/[^A-Za-z0-9]/g, "_").toUpperCase();
}

function envValue(env: EnvMap, names: string[]): string | undefined {
  for (const name of names) {
    const value = env[name];
    if (value !== undefined && value.length > 0) {
      return value;
    }
  }
  return undefined;
}

function candidateNames(
  wranglerEnv: string | undefined,
  names: string[],
): string[] {
  if (!wranglerEnv) return names;
  const prefix = `INSIGHTFLARE_${normalizeEnvName(wranglerEnv)}_`;
  return [
    ...names.map((name) => `${prefix}${name.replace(/^INSIGHTFLARE_/, "")}`),
    ...names,
  ];
}

function tomlString(value: string): string {
  return `"${value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")}"`;
}

function tableHeader(prefix: string, table: string): string {
  if (table.length === 0) {
    return `[${prefix.replace(/\.$/, "")}]`;
  }
  return `[${prefix}${table}]`;
}

function arrayTableHeader(prefix: string, table: string): string {
  return `[[${prefix}${table}]]`;
}

function envTablePrefix(wranglerEnv: string | undefined): string {
  return wranglerEnv ? `env.${wranglerEnv}.` : "";
}

function replaceKeyLine(
  line: string,
  key: string,
  value: string,
): string | null {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = line.match(
    new RegExp(`^(\\s*${escapedKey}\\s*=\\s*)([^#\\r\\n]*)(.*)$`),
  );
  if (!match) return null;
  const suffix = match[3] ?? "";
  const commentGap =
    /\s$/.test(match[2] ?? "") && suffix.startsWith("#") ? " " : "";
  return `${match[1]}${tomlString(value)}${commentGap}${suffix}`;
}

function findTableRange(
  lines: string[],
  header: string,
): [number, number] | null {
  if (header === "") {
    const end = lines.findIndex((line) => /^\s*\[/.test(line));
    return [0, end < 0 ? lines.length : end];
  }

  const start = lines.findIndex((line) => line.trim() === header);
  if (start < 0) return null;

  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^\s*\[/.test(lines[index] ?? "")) {
      end = index;
      break;
    }
  }

  return [start, end];
}

function upsertKeyInTable(
  content: string,
  header: string,
  key: string,
  value: string,
): string {
  const lines = content.split("\n");
  const range = findTableRange(lines, header);

  if (!range) {
    const separator = content.endsWith("\n") ? "\n" : "\n\n";
    return `${content}${separator}${header}\n${key} = ${tomlString(value)}\n`;
  }

  const [start, end] = range;
  const keyStart = header === "" ? start : start + 1;
  for (let index = keyStart; index < end; index += 1) {
    const next = replaceKeyLine(lines[index] ?? "", key, value);
    if (next !== null) {
      lines[index] = next;
      return lines.join("\n");
    }
  }

  lines.splice(end, 0, `${key} = ${tomlString(value)}`);
  return lines.join("\n");
}

function findArrayTableRanges(
  lines: string[],
  header: string,
): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  for (let start = 0; start < lines.length; start += 1) {
    if (lines[start]?.trim() !== header) continue;

    let end = lines.length;
    for (let index = start + 1; index < lines.length; index += 1) {
      if (/^\s*\[/.test(lines[index] ?? "")) {
        end = index;
        break;
      }
    }
    ranges.push([start, end]);
  }
  return ranges;
}

function tableHasBinding(
  lines: string[],
  range: [number, number],
  binding: string,
): boolean {
  const [, end] = range;
  for (let index = range[0] + 1; index < end; index += 1) {
    const line = lines[index] ?? "";
    const match = line.match(/^\s*binding\s*=\s*"([^"]*)"/);
    if (match?.[1] === binding) return true;
  }
  return false;
}

function upsertKeyInArrayTable(
  content: string,
  header: string,
  binding: string,
  key: string,
  value: string,
  createTable: boolean,
): string {
  const lines = content.split("\n");
  const range = findArrayTableRanges(lines, header).find((candidate) =>
    tableHasBinding(lines, candidate, binding),
  );

  if (!range) {
    if (!createTable) return content;
    const separator = content.endsWith("\n") ? "\n" : "\n\n";
    return `${content}${separator}${header}\nbinding = ${tomlString(binding)}\n${key} = ${tomlString(value)}\n`;
  }

  const [start, end] = range;
  for (let index = start + 1; index < end; index += 1) {
    const next = replaceKeyLine(lines[index] ?? "", key, value);
    if (next !== null) {
      lines[index] = next;
      return lines.join("\n");
    }
  }

  lines.splice(end, 0, `${key} = ${tomlString(value)}`);
  return lines.join("\n");
}

function collectVarOverrides(
  env: EnvMap,
  wranglerEnv: string | undefined,
): Map<string, string> {
  const overrides = new Map<string, string>();
  for (const key of KNOWN_VAR_KEYS) {
    const value = envValue(env, candidateNames(wranglerEnv, [key]));
    if (value !== undefined) {
      overrides.set(key, value);
    }
  }

  const envSpecificPrefix = wranglerEnv
    ? `INSIGHTFLARE_${normalizeEnvName(wranglerEnv)}_VAR_`
    : "";
  const genericPrefix = "INSIGHTFLARE_VAR_";
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined || value.length === 0) continue;
    if (envSpecificPrefix && key.startsWith(envSpecificPrefix)) {
      overrides.set(key.slice(envSpecificPrefix.length), value);
    } else if (key.startsWith(genericPrefix)) {
      overrides.set(key.slice(genericPrefix.length), value);
    }
  }

  return overrides;
}

export function applyWranglerEnvOverrides(
  content: string,
  env: EnvMap,
  wranglerEnv?: string,
): OverrideResult {
  let nextContent = content;
  const applied: string[] = [];
  const prefix = envTablePrefix(wranglerEnv);

  const workerName = envValue(
    env,
    candidateNames(wranglerEnv, [
      "INSIGHTFLARE_WORKER_NAME",
      "CLOUDFLARE_WORKER_NAME",
    ]),
  );
  if (workerName !== undefined) {
    const nameHeader = wranglerEnv
      ? tableHeader(`env.${wranglerEnv}.`, "")
      : "";
    nextContent = upsertKeyInTable(nextContent, nameHeader, "name", workerName);
    applied.push("name");
  }

  const varOverrides = collectVarOverrides(env, wranglerEnv);
  for (const [key, value] of varOverrides) {
    nextContent = upsertKeyInTable(
      nextContent,
      tableHeader(prefix, "vars"),
      key,
      value,
    );
    applied.push(`${tableHeader(prefix, "vars")}.${key}`);
  }

  const d1Name = envValue(
    env,
    candidateNames(wranglerEnv, [
      "INSIGHTFLARE_D1_DATABASE",
      "INSIGHTFLARE_D1_DATABASE_NAME",
      "D1_DATABASE_NAME",
    ]),
  );
  if (d1Name !== undefined) {
    nextContent = upsertKeyInArrayTable(
      nextContent,
      arrayTableHeader(prefix, "d1_databases"),
      "DB",
      "database_name",
      d1Name,
      false,
    );
    applied.push(`${arrayTableHeader(prefix, "d1_databases")}.database_name`);
  }

  const d1Id = envValue(
    env,
    candidateNames(wranglerEnv, [
      "INSIGHTFLARE_D1_DATABASE_ID",
      "D1_DATABASE_ID",
      "DB_DATABASE_ID",
    ]),
  );
  if (d1Id !== undefined) {
    nextContent = upsertKeyInArrayTable(
      nextContent,
      arrayTableHeader(prefix, "d1_databases"),
      "DB",
      "database_id",
      d1Id,
      false,
    );
    applied.push(`${arrayTableHeader(prefix, "d1_databases")}.database_id`);
  }

  const kvId = envValue(
    env,
    candidateNames(wranglerEnv, [
      "INSIGHTFLARE_SITE_SETTINGS_KV_ID",
      "INSIGHTFLARE_KV_NAMESPACE_ID",
      "SITE_SETTINGS_KV_ID",
      "KV_NAMESPACE_ID",
    ]),
  );
  if (kvId !== undefined) {
    nextContent = upsertKeyInArrayTable(
      nextContent,
      arrayTableHeader(prefix, "kv_namespaces"),
      "SITE_SETTINGS_KV",
      "id",
      kvId,
      false,
    );
    applied.push(`${arrayTableHeader(prefix, "kv_namespaces")}.id`);
  }

  const r2Name = envValue(
    env,
    candidateNames(wranglerEnv, [
      "INSIGHTFLARE_ARCHIVE_BUCKET_NAME",
      "ARCHIVE_BUCKET_NAME",
      "R2_BUCKET_NAME",
    ]),
  );
  if (r2Name !== undefined) {
    nextContent = upsertKeyInArrayTable(
      nextContent,
      arrayTableHeader(prefix, "r2_buckets"),
      "ARCHIVE_BUCKET",
      "bucket_name",
      r2Name,
      true,
    );
    applied.push(`${arrayTableHeader(prefix, "r2_buckets")}.bucket_name`);
  }

  const r2PreviewName = envValue(
    env,
    candidateNames(wranglerEnv, [
      "INSIGHTFLARE_ARCHIVE_PREVIEW_BUCKET_NAME",
      "ARCHIVE_PREVIEW_BUCKET_NAME",
      "R2_PREVIEW_BUCKET_NAME",
    ]),
  );
  if (r2PreviewName !== undefined) {
    nextContent = upsertKeyInArrayTable(
      nextContent,
      arrayTableHeader(prefix, "r2_buckets"),
      "ARCHIVE_BUCKET",
      "preview_bucket_name",
      r2PreviewName,
      true,
    );
    applied.push(
      `${arrayTableHeader(prefix, "r2_buckets")}.preview_bucket_name`,
    );
  }

  return { applied, content: nextContent };
}
