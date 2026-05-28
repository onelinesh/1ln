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
  /**
   * GitHub OAuth App client id (public-ish — but we still inject via secret so
   * we don't have to redeploy to rotate the app). Set via `wrangler secret put`.
   */
  GITHUB_OAUTH_CLIENT_ID: string;
  /** GitHub OAuth App client secret. `wrangler secret put GITHUB_OAUTH_CLIENT_SECRET`. */
  GITHUB_OAUTH_CLIENT_SECRET: string;
};
