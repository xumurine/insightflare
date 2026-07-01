PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS account_action_tokens (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('team_invite', 'password_reset')),
  token_hash TEXT NOT NULL UNIQUE,
  team_id TEXT,
  user_id TEXT,
  email TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_by_user_id TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  used_by_user_id TEXT,
  revoked_at INTEGER,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (used_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_account_action_tokens_hash
  ON account_action_tokens(token_hash);

CREATE INDEX IF NOT EXISTS idx_account_action_tokens_team
  ON account_action_tokens(team_id, type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_account_action_tokens_user
  ON account_action_tokens(user_id, type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_account_action_tokens_email
  ON account_action_tokens(email, type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_account_action_tokens_expires
  ON account_action_tokens(expires_at);
