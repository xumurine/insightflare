CREATE INDEX IF NOT EXISTS idx_visits_site_session_started_at
  ON visits(site_id, session_id, started_at);

CREATE INDEX IF NOT EXISTS idx_visits_site_visitor_started_at
  ON visits(site_id, visitor_id, started_at);

CREATE INDEX IF NOT EXISTS idx_visits_archive_site_session_started_at
  ON visits_archive(site_id, session_id, started_at);

CREATE INDEX IF NOT EXISTS idx_visits_archive_site_visitor_started_at
  ON visits_archive(site_id, visitor_id, started_at);
