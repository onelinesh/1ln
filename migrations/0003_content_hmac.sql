-- Adds an HMAC-SHA256 of `content` (keyed by a Worker-only secret, bound to slug)
-- so that a tampered D1 row can be detected at read time. The Worker writes the
-- HMAC on insert and verifies on every read; mismatches return 410 Gone.
--
-- Nullable: existing rows pre-dating this migration will have content_hmac=NULL
-- and are treated by the Worker as "legacy, accept" so we don't break back-compat.
-- A follow-up backfill (separate migration) will populate hashes for legacy rows
-- and tighten the read path to require a non-null hmac.
--
-- Operational notes (NOT executed by this migration):
--   1. Set the secret before deploy:    wrangler secret put SCRIPT_HMAC_SECRET
--   2. For local dev / tests, set       SCRIPT_HMAC_SECRET in .dev.vars
--      (and via miniflare bindings in vitest.config.ts — already wired).

ALTER TABLE scripts ADD COLUMN content_hmac TEXT;
