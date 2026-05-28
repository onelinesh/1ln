import { Hono } from "hono";
import type { Env } from "../env";
import { getScriptBySlug, markConsumed } from "../repos/scripts";
import { verifyContentHmac } from "../integrity";
import { parseParams, buildPreamble } from "../params";

export const raw = new Hono<{ Bindings: Env }>();

const CACHE_KEY = (slug: string) => `script:${slug}`;
const GONE = (msg: string) =>
  new Response(msg, {
    status: 410,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });

const TAMPER_BODY = "Script content failed integrity check";

/**
 * Serve a script body as text/plain. The `X-Content-Type-Options: nosniff`
 * header is set globally by middleware in `src/index.ts`, so it is not added
 * here.
 */
function serveScript(body: string): Response {
  return new Response(body, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

raw.get("/:slug", async (c) => {
  const slug = c.req.param("slug");
  if (slug === "health" || slug === "api") return c.notFound();

  const url = new URL(c.req.url);
  // The view/meta query flags are handled by their own routes (registered first).
  // If we got here with one of those flags, no specific route matched — treat as not found.
  if (url.searchParams.has("view") || url.searchParams.has("meta")) {
    return c.notFound();
  }

  // Parse runtime params from the URL. Empty preamble when there are no params
  // means no-param requests return byte-identical bodies to before this feature.
  const preamble = buildPreamble(parseParams(url));

  // Hot-path KV cache (non-single-use only). The cache stores the bare script
  // content (HMAC-verified at write time); we rebuild the preamble per request.
  const cached = await c.env.SCRIPT_CACHE.get(CACHE_KEY(slug));
  if (cached !== null) {
    return serveScript(preamble + cached);
  }

  const row = await getScriptBySlug(c.env.DB, slug);
  if (!row || row.kind !== "hosted" || !row.content) return c.notFound();

  const now = Date.now();
  if (row.expires_at !== null && row.expires_at < now) return GONE("expired");

  // Tamper detection: verify the stored HMAC before serving. NULL content_hmac
  // means a legacy row pre-dating the 0003 migration; accept for now (a backfill
  // will tighten this in a follow-up).
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
    return serveScript(preamble + row.content);
  }

  await c.env.SCRIPT_CACHE.put(CACHE_KEY(slug), row.content, {
    expirationTtl: 300,
  });
  return serveScript(preamble + row.content);
});
