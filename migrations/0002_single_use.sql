ALTER TABLE scripts ADD COLUMN single_use INTEGER NOT NULL DEFAULT 0;
CREATE INDEX scripts_single_use_unconsumed
  ON scripts(slug)
  WHERE single_use = 1 AND consumed_at IS NULL;
