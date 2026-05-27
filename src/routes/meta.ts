import { Hono } from "hono";
import type { Env } from "../env";
import { getScriptBySlug } from "../repos/scripts";
import { verifyContentHmac } from "../integrity";

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
  if (row.expires_at !== null && row.expires_at < Date.now()) {
    return c.json({ error: "expired" }, 410);
  }
  if (row.single_use === 1 && row.consumed_at !== null) {
    return c.json({ error: "already consumed" }, 410);
  }
  // Tamper detection — see raw.ts. NULL hmac = legacy row, accept.
  if (row.content !== null && row.content_hmac !== null) {
    const ok = await verifyContentHmac(
      c.env.SCRIPT_HMAC_SECRET,
      row.slug,
      row.content,
      row.content_hmac
    );
    if (!ok) {
      console.warn(`integrity check failed for slug=${row.slug}`);
      return c.json({ error: "Script content failed integrity check" }, 410);
    }
  }
  const content = row.content ?? "";
  return c.json({
    content,
    size: new TextEncoder().encode(content).length,
    sha256: await sha256Hex(content),
    visibility: row.visibility,
    source: row.kind,
    pinned_ref: row.pinned_ref,
    expires_at: row.expires_at,
    consumed_at: row.consumed_at,
    single_use: row.single_use === 1,
    created_at: row.created_at,
  });
});
