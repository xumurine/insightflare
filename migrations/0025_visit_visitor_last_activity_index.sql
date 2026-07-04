CREATE INDEX IF NOT EXISTS idx_visits_site_visitor_last_activity
  ON visits(site_id, visitor_id, last_activity_at);
