CREATE TABLE scripts (
  slug          TEXT PRIMARY KEY,
  kind          TEXT NOT NULL CHECK (kind IN ('hosted', 'github_proxy')),
  content       TEXT,
  source_url    TEXT,
  pinned_ref    TEXT,
  visibility    TEXT NOT NULL CHECK (visibility IN ('public', 'private')),
  owner_id      TEXT,
  delete_token_hash TEXT,
  name          TEXT,
  expires_at    INTEGER,
  consumed_at   INTEGER,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE INDEX scripts_owner_id ON scripts(owner_id);
CREATE INDEX scripts_expires_at ON scripts(expires_at) WHERE expires_at IS NOT NULL;
