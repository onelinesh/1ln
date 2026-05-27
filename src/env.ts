export type Env = {
  DB: D1Database;
  SCRIPT_CACHE: KVNamespace;
  ASSETS: Fetcher;
  /**
   * Worker-only secret used to HMAC stored script content for tamper detection.
   * Set via `wrangler secret put SCRIPT_HMAC_SECRET` in prod, and via `.dev.vars`
   * (or miniflare bindings) for local dev / tests. Never commit a real value.
   */
  SCRIPT_HMAC_SECRET: string;
};
