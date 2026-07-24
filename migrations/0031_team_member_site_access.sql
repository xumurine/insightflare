PRAGMA foreign_keys = ON;

ALTER TABLE team_members ADD COLUMN site_ids_json TEXT NOT NULL DEFAULT '[]';
