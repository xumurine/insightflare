-- User-defined widgets (funnels, custom charts, etc.)
CREATE TABLE IF NOT EXISTS widgets (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  config_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_widgets_site_id ON widgets(site_id);
CREATE INDEX IF NOT EXISTS idx_widgets_site_type ON widgets(site_id, type);
