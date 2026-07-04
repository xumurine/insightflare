ALTER TABLE users ADD COLUMN notification_preferences_json TEXT NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS notification_rules (
  id TEXT PRIMARY KEY,

  team_id TEXT NOT NULL,
  site_id TEXT,

  name TEXT NOT NULL,
  description TEXT,

  type TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,

  schedule_json TEXT NOT NULL DEFAULT '{}',
  condition_json TEXT NOT NULL DEFAULT '{}',
  recipient_json TEXT NOT NULL DEFAULT '{}',

  last_checked_at INTEGER,
  last_triggered_at INTEGER,
  next_run_at INTEGER,
  cooldown_until INTEGER,

  created_by_user_id TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),

  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_notification_rules_team
  ON notification_rules(team_id, enabled, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_rules_site
  ON notification_rules(site_id, enabled, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_rules_next_run
  ON notification_rules(enabled, next_run_at);

CREATE INDEX IF NOT EXISTS idx_notification_rules_type
  ON notification_rules(type, enabled);

CREATE TABLE IF NOT EXISTS notification_messages (
  id TEXT PRIMARY KEY,

  team_id TEXT NOT NULL,
  site_id TEXT,
  user_id TEXT NOT NULL,

  rule_id TEXT,
  run_id TEXT,
  batch_id TEXT,

  type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  requires_attention INTEGER NOT NULL DEFAULT 0,

  title TEXT NOT NULL,
  summary TEXT,
  body_text TEXT,
  body_html TEXT,
  data_json TEXT NOT NULL DEFAULT '{}',

  channels_json TEXT NOT NULL DEFAULT '{}',
  delivery_status TEXT NOT NULL DEFAULT 'created',
  delivery_results_json TEXT NOT NULL DEFAULT '{}',
  error_message TEXT,

  read_at INTEGER,
  dismissed_at INTEGER,
  archived_at INTEGER,

  triggered_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  sent_at INTEGER,
  failed_at INTEGER,
  expires_at INTEGER,

  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (rule_id) REFERENCES notification_rules(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_notification_messages_user_created
  ON notification_messages(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_messages_user_attention
  ON notification_messages(user_id, requires_attention, read_at, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_messages_team_created
  ON notification_messages(team_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_messages_site_created
  ON notification_messages(site_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_messages_rule_created
  ON notification_messages(rule_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_messages_run
  ON notification_messages(run_id);

CREATE INDEX IF NOT EXISTS idx_notification_messages_batch
  ON notification_messages(batch_id);
