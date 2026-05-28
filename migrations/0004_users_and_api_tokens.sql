-- Plan 2 — owned scripts.
-- Data minimization (locked by spec, do not relax): we store ONLY the numeric
-- GitHub user id. No email, no username, no avatar. Username can be re-fetched
-- from GitHub on demand if ever needed for display; do not persist it.

CREATE TABLE users (
  id          TEXT PRIMARY KEY,           -- random base62, 22 chars
  github_id   TEXT NOT NULL UNIQUE,        -- numeric GitHub user id, stored as text
  created_at  INTEGER NOT NULL
);

CREATE TABLE api_tokens (
  id            TEXT PRIMARY KEY,           -- random base62, 22 chars
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash    TEXT NOT NULL UNIQUE,        -- sha256 hex of the raw token (constant-time compared)
  name          TEXT,
  created_at    INTEGER NOT NULL,
  last_used_at  INTEGER
);

CREATE INDEX api_tokens_user_id ON api_tokens(user_id);
