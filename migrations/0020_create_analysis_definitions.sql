-- Saved analysis definitions (funnels, paths, segments, custom reports).
CREATE TABLE IF NOT EXISTS analysis_definitions (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  config_json TEXT NOT NULL DEFAULT '{}',
  config_version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  archived_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_analysis_definitions_site_id
  ON analysis_definitions(site_id);
CREATE INDEX IF NOT EXISTS idx_analysis_definitions_site_kind
  ON analysis_definitions(site_id, kind);
CREATE INDEX IF NOT EXISTS idx_analysis_definitions_site_archived
  ON analysis_definitions(site_id, archived_at);

-- The old widgets table temporarily stored analysis-like definitions.
-- Move all historical rows into analysis_definitions, then leave widgets empty
-- for the dedicated widgets feature.
INSERT OR IGNORE INTO analysis_definitions (
  id,
  site_id,
  kind,
  name,
  config_json,
  config_version,
  created_at,
  updated_at,
  archived_at
)
SELECT
  id,
  site_id,
  type,
  name,
  CASE
    WHEN type = 'funnel'
      THEN '{"steps":' || COALESCE(NULLIF(TRIM(config_json), ''), '[]') || '}'
    ELSE COALESCE(NULLIF(config_json, ''), '{}')
  END,
  1,
  created_at,
  updated_at,
  NULL
FROM widgets;

DELETE FROM widgets;
