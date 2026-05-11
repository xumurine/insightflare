import type { Env } from "./types";
import { ONE_HOUR_MS } from "./utils";

const RETENTION_DAYS = 365;
const ARCHIVE_BATCH_SIZE = 5_000;

async function moveVisitsToArchive(
  env: Env,
  cutoffMs: number,
): Promise<number> {
  const rows = await env.DB.prepare(
    `
      SELECT *
      FROM visits
      WHERE started_at < ?
        AND status != 'open'
      ORDER BY started_at ASC
      LIMIT ?
    `,
  )
    .bind(cutoffMs, ARCHIVE_BATCH_SIZE)
    .all<Record<string, unknown>>();

  if (rows.results.length === 0) return 0;

  await env.DB.prepare(
    `
      DELETE FROM custom_events
      WHERE visit_id IN (
        SELECT visit_id
        FROM visits
        WHERE started_at < ?
          AND status != 'open'
        ORDER BY started_at ASC
        LIMIT ?
      )
    `,
  )
    .bind(cutoffMs, ARCHIVE_BATCH_SIZE)
    .run();

  const statements = rows.results.flatMap((row) => [
    env.DB.prepare(
      `
        INSERT OR REPLACE INTO visits_archive (
          visit_id, site_id, visitor_id, session_id, status, started_at, last_activity_at,
          ended_at, finalized_at, duration_ms, duration_source, exit_reason,
          pathname, query_string, hash_fragment, hostname, title, referrer_url, referrer_host,
          utm_source, utm_medium, utm_campaign, utm_term, utm_content,
          is_eu, country, region, region_code, city, continent, latitude, longitude,
          postal_code, metro_code, timezone, as_organization, ua_raw, browser, browser_version,
          os, os_version, device_type, screen_width, screen_height, language,
          perf_ttfb_ms, perf_fcp_ms, perf_lcp_ms, perf_cls, perf_inp_ms,
          ae_synced_at, archived_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())
      `,
    ).bind(
      row.visit_id,
      row.site_id,
      row.visitor_id,
      row.session_id,
      row.status,
      row.started_at,
      row.last_activity_at,
      row.ended_at,
      row.finalized_at,
      row.duration_ms,
      row.duration_source,
      row.exit_reason,
      row.pathname,
      row.query_string,
      row.hash_fragment,
      row.hostname,
      row.title,
      row.referrer_url,
      row.referrer_host,
      row.utm_source,
      row.utm_medium,
      row.utm_campaign,
      row.utm_term,
      row.utm_content,
      row.is_eu,
      row.country,
      row.region,
      row.region_code,
      row.city,
      row.continent,
      row.latitude,
      row.longitude,
      row.postal_code,
      row.metro_code,
      row.timezone,
      row.as_organization,
      row.ua_raw,
      row.browser,
      row.browser_version,
      row.os,
      row.os_version,
      row.device_type,
      row.screen_width,
      row.screen_height,
      row.language,
      row.perf_ttfb_ms,
      row.perf_fcp_ms,
      row.perf_lcp_ms,
      row.perf_cls,
      row.perf_inp_ms,
      row.ae_synced_at,
    ),
    env.DB.prepare("DELETE FROM visits WHERE visit_id = ?").bind(row.visit_id),
  ]);

  await env.DB.batch(statements);
  return rows.results.length;
}

export async function runHourlyArchive(
  env: Env,
  scheduledTime?: number,
): Promise<void> {
  const nowMs =
    typeof scheduledTime === "number" && Number.isFinite(scheduledTime)
      ? scheduledTime
      : Date.now();
  const cutoffMs = nowMs - RETENTION_DAYS * 24 * ONE_HOUR_MS;

  while (true) {
    const movedVisits = await moveVisitsToArchive(env, cutoffMs);
    if (movedVisits < ARCHIVE_BATCH_SIZE) {
      return;
    }
  }
}
