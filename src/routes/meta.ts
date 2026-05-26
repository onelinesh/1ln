import { Hono } from "hono";
import type { Env } from "../env";
import { getScriptBySlug } from "../repos/scripts";

export const meta = new Hono<{ Bindings: Env }>();

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

meta.get("/:slug", async (c, next) => {
  const url = new URL(c.req.url);
  if (!url.searchParams.has("meta")) return next();
  const slug = c.req.param("slug");
  if (slug === "health" || slug === "api") return c.notFound();
  const row = await getScriptBySlug(c.env.DB, slug);
  if (!row) return c.notFound();
  const content = row.content ?? "";
  return c.json({
    content,
    size: new TextEncoder().encode(content).length,
    sha256: await sha256Hex(content),
    visibility: row.visibility,
    source: row.kind,
    pinned_ref: row.pinned_ref,
    expires_at: row.expires_at,
    created_at: row.created_at,
  });
});
