CREATE INDEX IF NOT EXISTS idx_visits_open_site_started_at
  ON visits(site_id, started_at)
  WHERE status = 'open';
