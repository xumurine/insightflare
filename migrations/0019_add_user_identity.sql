ALTER TABLE visits ADD COLUMN user_id TEXT;
ALTER TABLE visits ADD COLUMN user_name TEXT;
ALTER TABLE custom_events ADD COLUMN user_id TEXT;

CREATE INDEX IF NOT EXISTS idx_visits_site_user_id ON visits(site_id, user_id);
CREATE INDEX IF NOT EXISTS idx_custom_events_site_user_id ON custom_events(site_id, user_id);
