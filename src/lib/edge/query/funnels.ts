import type { Env } from "@/lib/edge/types";

import {
  badRequest,
  buildCustomEventSourceCte,
  buildVisitFilterSql,
  buildVisitSourceCte,
  eventSourceBindings,
  jsonResponse,
  notFound,
  parseFilters,
  parseWindow,
  queryD1All,
  visitSourceBindings,
} from "./core";

const FUNNEL_ANALYSIS_KIND = "funnel";

interface FunnelStepConfig {
  type: string;
  value: string;
}

function parseFunnelSteps(configJson: string): FunnelStepConfig[] {
  const parsed = JSON.parse(configJson) as
    | FunnelStepConfig[]
    | { steps?: FunnelStepConfig[] };
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.steps)) return parsed.steps;
  return [];
}

function serializeFunnelConfig(steps: FunnelStepConfig[]): string {
  return JSON.stringify({ steps });
}

export async function handleFunnelList(
  env: Env,
  siteId: string,
  _url: URL,
): Promise<Response> {
  const rows = await queryD1All<Record<string, unknown>>(
    env,
    "SELECT id, site_id, kind, name, config_json, created_at, updated_at FROM analysis_definitions WHERE site_id = ? AND kind = ? AND archived_at IS NULL ORDER BY created_at DESC",
    [siteId, FUNNEL_ANALYSIS_KIND],
  );
  const funnels = rows.map((row) => ({
    id: String(row.id ?? ""),
    siteId: String(row.site_id ?? ""),
    name: String(row.name ?? ""),
    steps: parseFunnelSteps(String(row.config_json ?? "{}")),
    createdAt: Number(row.created_at ?? 0),
    updatedAt: Number(row.updated_at ?? 0),
  }));
  return jsonResponse({ ok: true, funnels });
}

export async function handleFunnelCreate(
  env: Env,
  siteId: string,
  request: Request,
): Promise<Response> {
  let body: { name?: string; steps?: Array<{ type: string; value: string }> };
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }
  const name = String(body.name ?? "").trim();
  if (!name) return badRequest("Name is required");
  const steps = Array.isArray(body.steps) ? body.steps : [];
  if (steps.length < 2) return badRequest("At least 2 steps are required");
  for (const step of steps) {
    if (!step.type || !step.value)
      return badRequest("Each step needs type and value");
    if (step.type !== "pageview" && step.type !== "event")
      return badRequest("Step type must be pageview or event");
  }

  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    "INSERT INTO analysis_definitions (id, site_id, kind, name, config_json, config_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)",
  )
    .bind(
      id,
      siteId,
      FUNNEL_ANALYSIS_KIND,
      name,
      serializeFunnelConfig(steps),
      now,
      now,
    )
    .run();

  return jsonResponse(
    {
      ok: true,
      funnel: { id, siteId, name, steps, createdAt: now, updatedAt: now },
    },
    201,
  );
}

export async function handleFunnelDelete(
  env: Env,
  siteId: string,
  url: URL,
): Promise<Response> {
  const funnelId = url.searchParams.get("id");
  if (!funnelId) return badRequest("Funnel id is required");
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    "UPDATE analysis_definitions SET archived_at = ?, updated_at = ? WHERE id = ? AND site_id = ? AND kind = ? AND archived_at IS NULL",
  )
    .bind(now, now, funnelId, siteId, FUNNEL_ANALYSIS_KIND)
    .run();
  return jsonResponse({ ok: true });
}

export async function handleFunnelAnalysis(
  env: Env,
  siteId: string,
  url: URL,
): Promise<Response> {
  const funnelId = url.searchParams.get("funnelId");
  if (!funnelId) return badRequest("funnelId is required");
  const window = parseWindow(url);
  if (!window) return badRequest("Invalid time window");
  const filters = parseFilters(url);

  const funnelRow = await queryD1All<Record<string, unknown>>(
    env,
    "SELECT config_json FROM analysis_definitions WHERE id = ? AND site_id = ? AND kind = ? AND archived_at IS NULL",
    [funnelId, siteId, FUNNEL_ANALYSIS_KIND],
  );
  if (funnelRow.length === 0) return notFound();
  const steps = parseFunnelSteps(String(funnelRow[0].config_json ?? "{}"));
  if (steps.length < 2) return badRequest("Funnel has fewer than 2 steps");

  const filter = buildVisitFilterSql(filters);

  const pageviewSteps = steps.filter((s) => s.type === "pageview");
  const eventSteps = steps.filter((s) => s.type === "event");

  const sessionData: Map<
    string,
    Array<{ type: string; value: string; ts: number }>
  > = new Map();

  if (pageviewSteps.length > 0) {
    const pvFilter = filter.clause
      ? filter.clause.replace(/^WHERE\s+/i, "AND ")
      : "";
    const pvSql = `
WITH ${buildVisitSourceCte()},
filtered AS (
  SELECT session_id, pathname, started_at
  FROM visit_source
  WHERE session_id != '' ${pvFilter}
)
SELECT session_id AS sessionId, pathname, started_at AS ts
FROM filtered
WHERE pathname IN (${pageviewSteps.map(() => "?").join(",")})
ORDER BY ts ASC
`;
    const pvBindings = [
      ...visitSourceBindings(siteId, window),
      ...filter.bindings,
      ...pageviewSteps.map((s) => s.value),
    ];
    const pvRows = await queryD1All<Record<string, unknown>>(
      env,
      pvSql,
      pvBindings,
    );
    for (const row of pvRows) {
      const sid = String(row.sessionId ?? "");
      if (!sid) continue;
      if (!sessionData.has(sid)) sessionData.set(sid, []);
      sessionData.get(sid)!.push({
        type: "pageview",
        value: String(row.pathname ?? ""),
        ts: Number(row.ts ?? 0),
      });
    }
  }

  if (eventSteps.length > 0) {
    const evSql = `
WITH ${buildCustomEventSourceCte()},
filtered AS (
  SELECT session_id, event_name, occurred_at
  FROM event_source
  WHERE session_id != ''
)
SELECT session_id AS sessionId, event_name AS eventName, occurred_at AS ts
FROM filtered
WHERE event_name IN (${eventSteps.map(() => "?").join(",")})
ORDER BY ts ASC
`;
    const evBindings = [
      ...eventSourceBindings(siteId, window),
      ...eventSteps.map((s) => s.value),
    ];
    const evRows = await queryD1All<Record<string, unknown>>(
      env,
      evSql,
      evBindings,
    );
    for (const row of evRows) {
      const sid = String(row.sessionId ?? "");
      if (!sid) continue;
      if (!sessionData.has(sid)) sessionData.set(sid, []);
      sessionData.get(sid)!.push({
        type: "event",
        value: String(row.eventName ?? ""),
        ts: Number(row.ts ?? 0),
      });
    }
  }

  const stepResults = steps.map((step, i) => ({
    index: i,
    label: step.value,
    type: step.type,
    sessions: 0,
    dropOffRate: 0,
    conversionRate: 0,
  }));

  for (const [, events] of sessionData) {
    events.sort((a, b) => a.ts - b.ts);
    let lastTs = -1;
    let matched = true;
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const matchIdx = events.findIndex(
        (e) => e.type === step.type && e.value === step.value && e.ts > lastTs,
      );
      if (matchIdx === -1) {
        matched = false;
        break;
      }
      lastTs = events[matchIdx].ts;
      stepResults[i].sessions++;
    }
    if (!matched) {
      // partial match already counted in the loop
    }
  }

  const totalSessions = stepResults[0].sessions || 1;
  for (let i = 0; i < stepResults.length; i++) {
    stepResults[i].conversionRate = stepResults[i].sessions / totalSessions;
    stepResults[i].dropOffRate =
      i === 0
        ? 0
        : 1 - stepResults[i].sessions / (stepResults[i - 1].sessions || 1);
  }

  return jsonResponse({
    ok: true,
    steps: stepResults,
    overallConversionRate:
      stepResults.length > 0
        ? stepResults[stepResults.length - 1].sessions / totalSessions
        : 0,
  });
}
