import type { SqlBinding } from "./ingest-sql";
import { CREATE_BUFFERED_CUSTOM_EVENTS_SQL } from "./ingest-sql";

interface DurableObjectSqlStorage {
  exec(
    query: string,
    ...bindings: SqlBinding[]
  ): {
    toArray(): unknown[];
  };
}

function tableColumnNames(
  sql: DurableObjectSqlStorage,
  tableName: string,
): Set<string> {
  const rows = sql.exec(`PRAGMA table_info(${tableName})`).toArray() as Array<{
    name?: string;
  }>;
  return new Set(rows.map((row) => row.name ?? ""));
}

function ensureColumn(
  sql: DurableObjectSqlStorage,
  tableName: string,
  columnName: string,
  columnType: string,
): void {
  if (tableColumnNames(sql, tableName).has(columnName)) return;
  sql.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType}`);
}

export function initializeIngestSqlSchema(sql: DurableObjectSqlStorage): void {
  sql.exec(`
      CREATE TABLE IF NOT EXISTS buffered_visits (
        visit_id TEXT PRIMARY KEY,
        site_id TEXT NOT NULL,
        visitor_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        client_session_id TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        last_activity_at INTEGER NOT NULL,
        hidden_at INTEGER,
        ended_at INTEGER,
        finalized_at INTEGER,
        duration_ms INTEGER,
        duration_source TEXT,
        exit_reason TEXT,
        pathname TEXT NOT NULL,
        query_string TEXT NOT NULL DEFAULT '',
        hash_fragment TEXT NOT NULL DEFAULT '',
        hostname TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        referrer_url TEXT NOT NULL DEFAULT '',
        referrer_host TEXT NOT NULL DEFAULT '',
        utm_source TEXT NOT NULL DEFAULT '',
        utm_medium TEXT NOT NULL DEFAULT '',
        utm_campaign TEXT NOT NULL DEFAULT '',
        utm_term TEXT NOT NULL DEFAULT '',
        utm_content TEXT NOT NULL DEFAULT '',
        is_eu INTEGER NOT NULL DEFAULT 0,
        country TEXT NOT NULL DEFAULT '',
        region TEXT NOT NULL DEFAULT '',
        region_code TEXT NOT NULL DEFAULT '',
        city TEXT NOT NULL DEFAULT '',
        continent TEXT NOT NULL DEFAULT '',
        latitude REAL,
        longitude REAL,
        postal_code TEXT NOT NULL DEFAULT '',
        metro_code TEXT NOT NULL DEFAULT '',
        timezone TEXT NOT NULL DEFAULT '',
        as_organization TEXT NOT NULL DEFAULT '',
        ua_raw TEXT NOT NULL DEFAULT '',
        browser TEXT NOT NULL DEFAULT '',
        browser_version TEXT NOT NULL DEFAULT '',
        os TEXT NOT NULL DEFAULT '',
        os_version TEXT NOT NULL DEFAULT '',
        device_type TEXT NOT NULL DEFAULT '',
        screen_width INTEGER,
        screen_height INTEGER,
        language TEXT NOT NULL DEFAULT '',
        user_id TEXT NOT NULL DEFAULT '',
        user_name TEXT NOT NULL DEFAULT '',
        perf_ttfb_ms REAL,
        perf_fcp_ms REAL,
        perf_lcp_ms REAL,
        perf_cls REAL,
        perf_inp_ms REAL,
        dirty INTEGER NOT NULL DEFAULT 1,
        flush_attempts INTEGER NOT NULL DEFAULT 0,
        last_flush_error TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
  ensureColumn(sql, "buffered_visits", "perf_ttfb_ms", "REAL");
  ensureColumn(sql, "buffered_visits", "perf_fcp_ms", "REAL");
  ensureColumn(sql, "buffered_visits", "perf_lcp_ms", "REAL");
  ensureColumn(sql, "buffered_visits", "perf_cls", "REAL");
  ensureColumn(sql, "buffered_visits", "perf_inp_ms", "REAL");
  ensureColumn(sql, "buffered_visits", "user_id", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(sql, "buffered_visits", "user_name", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(sql, "buffered_visits", "hidden_at", "INTEGER");
  ensureColumn(
    sql,
    "buffered_visits",
    "client_session_id",
    "TEXT NOT NULL DEFAULT ''",
  );
  sql.exec(`
      CREATE INDEX IF NOT EXISTS idx_buffered_visits_dirty_updated
      ON buffered_visits(dirty, updated_at, started_at)
    `);
  sql.exec(`
      CREATE INDEX IF NOT EXISTS idx_buffered_visits_status_last_activity
      ON buffered_visits(status, last_activity_at, started_at)
    `);
  sql.exec(`
      CREATE INDEX IF NOT EXISTS idx_buffered_visits_status_hidden_at
      ON buffered_visits(status, hidden_at)
    `);
  sql.exec(`
      CREATE INDEX IF NOT EXISTS idx_buffered_visits_site_session_status_started
      ON buffered_visits(site_id, session_id, status, started_at)
    `);
  sql.exec(`
      CREATE INDEX IF NOT EXISTS idx_buffered_visits_site_client_session_status_started
      ON buffered_visits(site_id, client_session_id, status, started_at)
    `);
  sql.exec(`
      CREATE INDEX IF NOT EXISTS idx_buffered_visits_site_visit_status
      ON buffered_visits(site_id, visit_id, status)
    `);
  sql.exec(`
      CREATE INDEX IF NOT EXISTS idx_buffered_visits_site_visitor_status
      ON buffered_visits(site_id, visitor_id, status)
    `);
  sql.exec(`
      CREATE INDEX IF NOT EXISTS idx_buffered_visits_started_at
      ON buffered_visits(started_at)
    `);
  sql.exec(`
      CREATE INDEX IF NOT EXISTS idx_buffered_visits_ended_at
      ON buffered_visits(status, ended_at)
    `);
  sql.exec(CREATE_BUFFERED_CUSTOM_EVENTS_SQL);

  const eventColumnNames = tableColumnNames(sql, "buffered_custom_events");
  const hasLegacyEventContextColumns =
    eventColumnNames.has("visitor_id") ||
    eventColumnNames.has("session_id") ||
    eventColumnNames.has("pathname") ||
    eventColumnNames.has("hostname");
  const hasCurrentEventColumns =
    eventColumnNames.has("received_at") && eventColumnNames.has("sequence");
  if (hasLegacyEventContextColumns || !hasCurrentEventColumns) {
    sql.exec("DROP TABLE buffered_custom_events");
    sql.exec(CREATE_BUFFERED_CUSTOM_EVENTS_SQL);
  }
  ensureColumn(
    sql,
    "buffered_custom_events",
    "user_id",
    "TEXT NOT NULL DEFAULT ''",
  );
  sql.exec(`
      CREATE INDEX IF NOT EXISTS idx_buffered_custom_events_dirty_occurred
      ON buffered_custom_events(dirty, created_at, occurred_at)
    `);
  sql.exec(`
      CREATE INDEX IF NOT EXISTS idx_buffered_custom_events_occurred
      ON buffered_custom_events(occurred_at)
    `);
}
