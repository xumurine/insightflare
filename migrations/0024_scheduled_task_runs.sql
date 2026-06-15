CREATE TABLE IF NOT EXISTS scheduled_task_runs (
  id TEXT PRIMARY KEY,
  invocation_id TEXT NOT NULL,
  task_key TEXT NOT NULL,
  task_name TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  status TEXT NOT NULL,
  scheduled_at_ms INTEGER,
  started_at_ms INTEGER NOT NULL,
  finished_at_ms INTEGER,
  duration_ms INTEGER,
  scope_type TEXT NOT NULL DEFAULT 'system',
  scope_id TEXT,
  summary_json TEXT NOT NULL DEFAULT '{}',
  error_name TEXT,
  error_message TEXT,
  error_stack TEXT,
  worker_version TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_scheduled_task_runs_task_started
  ON scheduled_task_runs(task_key, started_at_ms);

CREATE INDEX IF NOT EXISTS idx_scheduled_task_runs_status_started
  ON scheduled_task_runs(status, started_at_ms);

CREATE INDEX IF NOT EXISTS idx_scheduled_task_runs_expires_at
  ON scheduled_task_runs(expires_at);

CREATE TABLE IF NOT EXISTS scheduled_task_run_logs (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  task_key TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  level TEXT NOT NULL,
  event TEXT NOT NULL,
  message TEXT NOT NULL,
  data_json TEXT NOT NULL DEFAULT '{}',
  created_at_ms INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_scheduled_task_run_logs_run_sequence
  ON scheduled_task_run_logs(run_id, sequence);

CREATE INDEX IF NOT EXISTS idx_scheduled_task_run_logs_expires_at
  ON scheduled_task_run_logs(expires_at);
