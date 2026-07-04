CREATE TABLE IF NOT EXISTS visit_hourly_rollups (
  site_id TEXT NOT NULL,
  hour_bucket INTEGER NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  sessions INTEGER NOT NULL DEFAULT 0,
  visitors INTEGER NOT NULL DEFAULT 0,
  bounces INTEGER NOT NULL DEFAULT 0,
  duration_ms_sum INTEGER NOT NULL DEFAULT 0,
  duration_ms_count INTEGER NOT NULL DEFAULT 0,
  visitor_set_json TEXT NOT NULL DEFAULT '[]',
  session_counts_json TEXT NOT NULL DEFAULT '[]',
  perf_ttfb_sum REAL NOT NULL DEFAULT 0,
  perf_ttfb_count INTEGER NOT NULL DEFAULT 0,
  perf_fcp_sum REAL NOT NULL DEFAULT 0,
  perf_fcp_count INTEGER NOT NULL DEFAULT 0,
  perf_lcp_sum REAL NOT NULL DEFAULT 0,
  perf_lcp_count INTEGER NOT NULL DEFAULT 0,
  perf_cls_sum REAL NOT NULL DEFAULT 0,
  perf_cls_count INTEGER NOT NULL DEFAULT 0,
  perf_inp_sum REAL NOT NULL DEFAULT 0,
  perf_inp_count INTEGER NOT NULL DEFAULT 0,
  input_cutoff_ms INTEGER NOT NULL,
  aggregated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  schema_version INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (site_id, hour_bucket)
);

CREATE INDEX IF NOT EXISTS idx_visit_hourly_rollups_hour
  ON visit_hourly_rollups(hour_bucket);

CREATE TABLE IF NOT EXISTS visit_hourly_aggregation_state (
  site_id TEXT PRIMARY KEY,
  aggregated_until_hour INTEGER NOT NULL DEFAULT 0,
  lag_hours INTEGER NOT NULL DEFAULT 12,
  last_run_at INTEGER,
  last_success_at INTEGER,
  last_error TEXT
);
