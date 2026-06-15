import {
  SCHEDULED_TASK_LOG_RETENTION_DAYS,
  type ScheduledTaskLogLevel,
  type ScheduledTaskRun,
  type ScheduledTaskRunLog,
  type ScheduledTasksData,
  type ScheduledTaskStatus,
  type ScheduledTaskSummary,
} from "@/lib/scheduled-tasks";

import { forb, j, na } from "./admin-response";
import { SCHEDULED_TASKS } from "./scheduled-task-registry";
import type { Env } from "./types";

type AdminActor = { isAdmin: boolean };
type AdminActorResolver = (
  env: Env,
  req: Request,
) => Promise<AdminActor | Response>;

const STATUS_VALUES = new Set<ScheduledTaskStatus>([
  "running",
  "success",
  "partial",
  "failed",
  "skipped",
]);
const RETENTION_MS = SCHEDULED_TASK_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;
const STALE_RUNNING_MS = 6 * 60 * 60 * 1000;
const DEFAULT_RUN_PAGE_SIZE = 50;
const MAX_RUN_PAGE_SIZE = 100;

interface RunRow {
  id: string;
  invocationId: string;
  taskKey: string;
  taskName: string;
  triggerType: string;
  status: string;
  scheduledAt: number | null;
  startedAt: number;
  finishedAt: number | null;
  durationMs: number | null;
  scopeType: string;
  scopeId: string | null;
  summaryJson: string;
  errorName: string | null;
  errorMessage: string | null;
  workerVersion: string | null;
  createdAt: number;
  expiresAt: number;
}

interface LogRow {
  id: string;
  runId: string;
  taskKey: string;
  sequence: number;
  level: string;
  event: string;
  message: string;
  dataJson: string;
  createdAt: number;
}

interface TaskStatsRow {
  taskKey: string;
  runs30d: number;
  success30d: number;
  partial30d: number;
  failed30d: number;
  skipped30d: number;
  running: number;
  avgDurationMs: number | null;
}

interface HealthRow {
  totalRuns24h: number;
  failedRuns24h: number;
  partialRuns24h: number;
  runningRuns: number;
  staleRunningRuns: number;
  successRuns24h: number;
  lastRunAt: number | null;
}

function safeParseRecord(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function normalizeStatus(value: string): ScheduledTaskStatus {
  return STATUS_VALUES.has(value as ScheduledTaskStatus)
    ? (value as ScheduledTaskStatus)
    : "failed";
}

function normalizeLogLevel(value: string): ScheduledTaskLogLevel {
  if (
    value === "debug" ||
    value === "info" ||
    value === "warn" ||
    value === "error"
  ) {
    return value;
  }
  return "info";
}

function mapRun(row: RunRow): ScheduledTaskRun {
  return {
    id: String(row.id ?? ""),
    invocationId: String(row.invocationId ?? ""),
    taskKey: String(row.taskKey ?? ""),
    taskName: String(row.taskName ?? ""),
    triggerType: String(row.triggerType ?? ""),
    status: normalizeStatus(String(row.status ?? "")),
    scheduledAt:
      row.scheduledAt === null || row.scheduledAt === undefined
        ? null
        : Number(row.scheduledAt),
    startedAt: Number(row.startedAt ?? 0),
    finishedAt:
      row.finishedAt === null || row.finishedAt === undefined
        ? null
        : Number(row.finishedAt),
    durationMs:
      row.durationMs === null || row.durationMs === undefined
        ? null
        : Number(row.durationMs),
    scopeType: String(row.scopeType ?? "system"),
    scopeId:
      row.scopeId === null || row.scopeId === undefined
        ? null
        : String(row.scopeId),
    summary: safeParseRecord(String(row.summaryJson ?? "{}")),
    errorName:
      row.errorName === null || row.errorName === undefined
        ? null
        : String(row.errorName),
    errorMessage:
      row.errorMessage === null || row.errorMessage === undefined
        ? null
        : String(row.errorMessage),
    workerVersion:
      row.workerVersion === null || row.workerVersion === undefined
        ? null
        : String(row.workerVersion),
    createdAt: Number(row.createdAt ?? 0) * 1000,
    expiresAt: Number(row.expiresAt ?? 0) * 1000,
  };
}

function mapLog(row: LogRow): ScheduledTaskRunLog {
  return {
    id: String(row.id ?? ""),
    runId: String(row.runId ?? ""),
    taskKey: String(row.taskKey ?? ""),
    sequence: Number(row.sequence ?? 0),
    level: normalizeLogLevel(String(row.level ?? "")),
    event: String(row.event ?? ""),
    message: String(row.message ?? ""),
    data: safeParseRecord(String(row.dataJson ?? "{}")),
    createdAt: Number(row.createdAt ?? 0),
  };
}

const RUN_SELECT_COLUMNS = `
      id,
      invocation_id AS invocationId,
      task_key AS taskKey,
      task_name AS taskName,
      trigger_type AS triggerType,
      status,
      scheduled_at_ms AS scheduledAt,
      started_at_ms AS startedAt,
      finished_at_ms AS finishedAt,
      duration_ms AS durationMs,
      scope_type AS scopeType,
      scope_id AS scopeId,
      summary_json AS summaryJson,
      error_name AS errorName,
      error_message AS errorMessage,
      worker_version AS workerVersion,
      created_at AS createdAt,
      expires_at AS expiresAt
`;

function runSelectSql(whereClause: string): string {
  return `
    SELECT
      ${RUN_SELECT_COLUMNS}
    FROM scheduled_task_runs
    ${whereClause}
  `;
}

function successRate(success: number, total: number): number | null {
  return total > 0 ? success / total : null;
}

function parseIntegerParam(
  url: URL,
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const value = Math.trunc(Number(url.searchParams.get(key) ?? fallback));
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function parseRunPageSize(url: URL): number {
  const pageSize = url.searchParams.get("pageSize");
  const limit = url.searchParams.get("limit");
  const value = Math.trunc(Number(pageSize ?? limit ?? DEFAULT_RUN_PAGE_SIZE));
  if (!Number.isFinite(value)) return DEFAULT_RUN_PAGE_SIZE;
  return Math.min(MAX_RUN_PAGE_SIZE, Math.max(1, value));
}

export async function handleScheduledTasksAdmin(
  req: Request,
  env: Env,
  url: URL,
  requireActor: AdminActorResolver,
): Promise<Response> {
  const actor = await requireActor(env, req);
  if (actor instanceof Response) return actor;
  if (!actor.isAdmin) return forb("Only system admin can view scheduled tasks");
  if (req.method !== "GET") return na();

  const generatedAt = Date.now();
  const since30d = generatedAt - RETENTION_MS;
  const since24h = generatedAt - 24 * 60 * 60 * 1000;
  const staleBefore = generatedAt - STALE_RUNNING_MS;
  const page = parseIntegerParam(url, "page", 1, 1, 10_000);
  const pageSize = parseRunPageSize(url);
  const offset = (page - 1) * pageSize;
  const taskKey = (url.searchParams.get("taskKey") || "").trim();
  const status = (url.searchParams.get("status") || "").trim();
  const runId = (url.searchParams.get("runId") || "").trim();
  const runFilters: string[] = ["started_at_ms >= ?"];
  const runBindings: Array<string | number> = [since30d];
  if (taskKey) {
    runFilters.push("task_key = ?");
    runBindings.push(taskKey);
  }
  if (STATUS_VALUES.has(status as ScheduledTaskStatus)) {
    runFilters.push("status = ?");
    runBindings.push(status);
  }

  const [healthRow, statsRows, latestRows, runRows] = await Promise.all([
    env.DB.prepare(
      `
        SELECT
          COUNT(*) AS totalRuns24h,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failedRuns24h,
          SUM(CASE WHEN status = 'partial' THEN 1 ELSE 0 END) AS partialRuns24h,
          SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) AS runningRuns,
          SUM(CASE WHEN status = 'running' AND started_at_ms < ? THEN 1 ELSE 0 END) AS staleRunningRuns,
          SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS successRuns24h,
          MAX(started_at_ms) AS lastRunAt
        FROM scheduled_task_runs
        WHERE started_at_ms >= ?
      `,
    )
      .bind(staleBefore, since24h)
      .first<HealthRow>(),
    env.DB.prepare(
      `
        SELECT
          task_key AS taskKey,
          COUNT(*) AS runs30d,
          SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS success30d,
          SUM(CASE WHEN status = 'partial' THEN 1 ELSE 0 END) AS partial30d,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed30d,
          SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) AS skipped30d,
          SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) AS running,
          AVG(CASE WHEN duration_ms IS NOT NULL THEN duration_ms END) AS avgDurationMs
        FROM scheduled_task_runs
        WHERE started_at_ms >= ?
        GROUP BY task_key
      `,
    )
      .bind(since30d)
      .all<TaskStatsRow>(),
    env.DB.prepare(
      `
        WITH ranked AS (
          SELECT
            ${RUN_SELECT_COLUMNS},
            ROW_NUMBER() OVER (PARTITION BY task_key ORDER BY started_at_ms DESC) AS rn
          FROM scheduled_task_runs
          WHERE started_at_ms >= ?
        )
        SELECT *
        FROM ranked
        WHERE rn = 1
      `,
    )
      .bind(since30d)
      .all<RunRow>(),
    env.DB.prepare(
      `${runSelectSql(`WHERE ${runFilters.join(" AND ")}`)}
       ORDER BY started_at_ms DESC
       LIMIT ? OFFSET ?`,
    )
      .bind(...runBindings, pageSize + 1, offset)
      .all<RunRow>(),
  ]);

  const requestedRuns = runRows.results.map(mapRun);
  const hasMoreRuns = requestedRuns.length > pageSize;
  const runs = hasMoreRuns ? requestedRuns.slice(0, pageSize) : requestedRuns;
  let selectedRun = runId ? null : runs.length > 0 ? (runs[0] ?? null) : null;
  if (runId) {
    const selectedRow = await env.DB.prepare(
      `${runSelectSql("WHERE id = ?")} LIMIT 1`,
    )
      .bind(runId)
      .first<RunRow>();
    selectedRun = selectedRow ? mapRun(selectedRow) : null;
  }

  const logRows = selectedRun
    ? await env.DB.prepare(
        `
          SELECT
            id,
            run_id AS runId,
            task_key AS taskKey,
            sequence,
            level,
            event,
            message,
            data_json AS dataJson,
            created_at_ms AS createdAt
          FROM scheduled_task_run_logs
          WHERE run_id = ?
          ORDER BY sequence ASC
          LIMIT 300
        `,
      )
        .bind(selectedRun.id)
        .all<LogRow>()
    : { results: [] as LogRow[] };

  const statsByTask = new Map(
    statsRows.results.map((row) => [String(row.taskKey ?? ""), row]),
  );
  const lastRunByTask = new Map(
    latestRows.results.map((row) => [String(row.taskKey ?? ""), mapRun(row)]),
  );
  const tasks: ScheduledTaskSummary[] = SCHEDULED_TASKS.map((task) => {
    const stats = statsByTask.get(task.key);
    const runs30d = Number(stats?.runs30d ?? 0);
    const success30d = Number(stats?.success30d ?? 0);
    return {
      key: task.key,
      name: task.name,
      description: task.description,
      schedule: task.schedule,
      trigger: task.trigger,
      enabled: task.enabled,
      lastRun: lastRunByTask.get(task.key) ?? null,
      runs30d,
      success30d,
      partial30d: Number(stats?.partial30d ?? 0),
      failed30d: Number(stats?.failed30d ?? 0),
      skipped30d: Number(stats?.skipped30d ?? 0),
      running: Number(stats?.running ?? 0),
      successRate30d: successRate(success30d, runs30d),
      avgDurationMs:
        stats?.avgDurationMs === null || stats?.avgDurationMs === undefined
          ? null
          : Number(stats.avgDurationMs),
    };
  });

  const totalRuns24h = Number(healthRow?.totalRuns24h ?? 0);
  const successRuns24h = Number(healthRow?.successRuns24h ?? 0);
  const data: ScheduledTasksData = {
    ok: true,
    generatedAt,
    retentionDays: SCHEDULED_TASK_LOG_RETENTION_DAYS,
    tasks,
    runs,
    runsMeta: {
      page,
      pageSize,
      returned: runs.length,
      hasMore: hasMoreRuns,
      nextPage: hasMoreRuns ? page + 1 : null,
    },
    selectedRun,
    logs: logRows.results.map(mapLog),
    health: {
      totalRuns24h,
      failedRuns24h: Number(healthRow?.failedRuns24h ?? 0),
      partialRuns24h: Number(healthRow?.partialRuns24h ?? 0),
      runningRuns: Number(healthRow?.runningRuns ?? 0),
      staleRunningRuns: Number(healthRow?.staleRunningRuns ?? 0),
      successRate24h: successRate(successRuns24h, totalRuns24h),
      lastRunAt:
        healthRow?.lastRunAt === null || healthRow?.lastRunAt === undefined
          ? null
          : Number(healthRow.lastRunAt),
    },
  };
  return j(data);
}
