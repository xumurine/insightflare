DROP TABLE IF EXISTS custom_event_json_values;
DROP TABLE IF EXISTS custom_event_json_nodes;
DROP TABLE IF EXISTS custom_events_archive;
DROP TABLE IF EXISTS custom_events;
DROP TABLE IF EXISTS custom_event_json_paths;
DROP TABLE IF EXISTS custom_event_json_keys;
DROP TABLE IF EXISTS custom_event_names;

CREATE TABLE custom_event_names (
  id INTEGER PRIMARY KEY,
  site_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  last_seen_at INTEGER NOT NULL,
  UNIQUE(site_id, name)
);

CREATE TABLE custom_event_json_keys (
  id INTEGER PRIMARY KEY,
  site_id TEXT NOT NULL,
  key TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  last_seen_at INTEGER NOT NULL,
  UNIQUE(site_id, key)
);

CREATE TABLE custom_event_json_paths (
  id INTEGER PRIMARY KEY,
  site_id TEXT NOT NULL,
  path TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  last_seen_at INTEGER NOT NULL,
  UNIQUE(site_id, path)
);

CREATE TABLE custom_events (
  event_pk INTEGER PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE,
  site_id TEXT NOT NULL,
  visit_id TEXT NOT NULL,
  event_name_id INTEGER NOT NULL,
  occurred_at INTEGER NOT NULL,
  received_at INTEGER NOT NULL,
  sequence INTEGER NOT NULL DEFAULT 0,
  node_count INTEGER NOT NULL,
  value_count INTEGER NOT NULL,
  ae_synced_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY(visit_id) REFERENCES visits(visit_id) ON DELETE CASCADE,
  FOREIGN KEY(event_name_id) REFERENCES custom_event_names(id)
);

CREATE TABLE custom_event_json_nodes (
  event_pk INTEGER NOT NULL,
  node_id INTEGER NOT NULL,
  parent_node_id INTEGER,
  key_id INTEGER,
  path_id INTEGER NOT NULL,
  value_type INTEGER NOT NULL,
  member_order INTEGER,
  array_index INTEGER,
  depth INTEGER NOT NULL,
  PRIMARY KEY(event_pk, node_id),
  FOREIGN KEY(event_pk) REFERENCES custom_events(event_pk) ON DELETE CASCADE,
  FOREIGN KEY(key_id) REFERENCES custom_event_json_keys(id),
  FOREIGN KEY(path_id) REFERENCES custom_event_json_paths(id)
);

CREATE TABLE custom_event_json_values (
  event_pk INTEGER NOT NULL,
  node_id INTEGER NOT NULL,
  site_id TEXT NOT NULL,
  event_name_id INTEGER NOT NULL,
  path_id INTEGER NOT NULL,
  occurred_at INTEGER NOT NULL,
  scope_node_id INTEGER,
  value_type INTEGER NOT NULL,
  string_value TEXT,
  string_hash TEXT,
  number_value REAL,
  boolean_value INTEGER,
  PRIMARY KEY(event_pk, node_id),
  FOREIGN KEY(event_pk, node_id) REFERENCES custom_event_json_nodes(event_pk, node_id) ON DELETE CASCADE,
  FOREIGN KEY(event_name_id) REFERENCES custom_event_names(id),
  FOREIGN KEY(path_id) REFERENCES custom_event_json_paths(id)
);

CREATE INDEX idx_custom_events_site_time
  ON custom_events(site_id, occurred_at, event_pk);
CREATE INDEX idx_custom_events_site_name_time
  ON custom_events(site_id, event_name_id, occurred_at, event_pk);
CREATE INDEX idx_custom_events_site_visit_time
  ON custom_events(site_id, visit_id, occurred_at, event_pk);
CREATE INDEX idx_custom_events_ae_synced_at
  ON custom_events(ae_synced_at);

CREATE INDEX idx_custom_event_nodes_event_parent
  ON custom_event_json_nodes(event_pk, parent_node_id, member_order, array_index);

CREATE INDEX idx_custom_event_values_path_time
  ON custom_event_json_values(site_id, path_id, occurred_at, event_pk);
CREATE INDEX idx_custom_event_values_string_eq
  ON custom_event_json_values(site_id, path_id, string_hash, occurred_at, event_pk)
  WHERE value_type = 1;
CREATE INDEX idx_custom_event_values_number_range
  ON custom_event_json_values(site_id, path_id, number_value, occurred_at, event_pk)
  WHERE value_type = 2;
CREATE INDEX idx_custom_event_values_boolean_eq
  ON custom_event_json_values(site_id, path_id, boolean_value, occurred_at, event_pk)
  WHERE value_type = 3;
