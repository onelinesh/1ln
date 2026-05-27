import { Hono } from "hono";
import type { Env } from "../env";
import { getScriptBySlug, markConsumed } from "../repos/scripts";
import { verifyContentHmac } from "../integrity";

export const raw = new Hono<{ Bindings: Env }>();

const CACHE_KEY = (slug: string) => `script:${slug}`;
const GONE = (msg: string) =>
  new Response(msg, {
    status: 410,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });

const TAMPER_BODY = "Script content failed integrity check";

raw.get("/:slug", async (c) => {
  const slug = c.req.param("slug");
  if (slug === "health" || slug === "api") return c.notFound();

  const url = new URL(c.req.url);
  // The view/meta query flags get handled by their own routes (registered first).
  // If we got here with one of those flags it's because no specific route matched — treat as not found.
  if (url.searchParams.has("view") || url.searchParams.has("meta")) {
    return c.notFound();
  }

  // Hot-path KV cache (non-single-use only). The cache is populated only AFTER
  // a successful HMAC verification, so cached entries are trusted.
  const cached = await c.env.SCRIPT_CACHE.get(CACHE_KEY(slug));
  if (cached !== null) {
    return new Response(cached, {
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const row = await getScriptBySlug(c.env.DB, slug);
  if (!row || row.kind !== "hosted" || !row.content) return c.notFound();

  const now = Date.now();
  if (row.expires_at !== null && row.expires_at < now) return GONE("expired");

  // Tamper detection: verify the stored HMAC before serving. NULL = legacy row
  // pre-dating the migration; accept those for now (a backfill will tighten this).
  if (row.content_hmac !== null) {
    const ok = await verifyContentHmac(
      c.env.SCRIPT_HMAC_SECRET,
      row.slug,
      row.content,
      row.content_hmac
    );
    if (!ok) {
      console.warn(`integrity check failed for slug=${row.slug}`);
      return GONE(TAMPER_BODY);
    }
  }

  if (row.single_use === 1) {
    if (row.consumed_at !== null) return GONE("already consumed");
    const won = await markConsumed(c.env.DB, slug);
    if (!won) return GONE("already consumed");
    // Single-use: never cache.
    return new Response(row.content, {
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  await c.env.SCRIPT_CACHE.put(CACHE_KEY(slug), row.content, {
    expirationTtl: 300,
  });
  return new Response(row.content, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
});
