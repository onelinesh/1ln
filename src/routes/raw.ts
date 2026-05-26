import { Hono } from "hono";
import type { Env } from "../env";
import { getScriptBySlug } from "../repos/scripts";

export const raw = new Hono<{ Bindings: Env }>();

const CACHE_KEY = (slug: string) => `script:${slug}`;

raw.get("/:slug", async (c) => {
  const slug = c.req.param("slug");
  if (slug === "health" || slug === "api") return c.notFound();

  const url = new URL(c.req.url);
  // The view/meta query flags get handled by their own routes (registered first).
  // If we got here with one of those flags it's because no specific route matched — treat as not found.
  if (url.searchParams.has("view") || url.searchParams.has("meta")) {
    return c.notFound();
  }

  const cached = await c.env.SCRIPT_CACHE.get(CACHE_KEY(slug));
  if (cached !== null) {
    return new Response(cached, {
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const row = await getScriptBySlug(c.env.DB, slug);
  if (!row || row.kind !== "hosted" || !row.content) return c.notFound();

  await c.env.SCRIPT_CACHE.put(CACHE_KEY(slug), row.content, {
    expirationTtl: 300,
  });

  return new Response(row.content, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
});
