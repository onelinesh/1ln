import { Hono } from "hono";
import type { Env } from "../env";
import { getScriptBySlug } from "../repos/scripts";
import { renderPreview } from "../views/preview";
import { renderGone } from "../views/gone";

export const view = new Hono<{ Bindings: Env }>();

view.get("/:slug", async (c, next) => {
  const url = new URL(c.req.url);
  if (!url.searchParams.has("view")) return next();
  const slug = c.req.param("slug");
  if (slug === "health" || slug === "api") return c.notFound();
  const row = await getScriptBySlug(c.env.DB, slug);
  if (!row || row.kind !== "hosted") return c.notFound();
  if (row.expires_at !== null && row.expires_at < Date.now()) {
    return c.html(renderGone({ reason: "expired", at: row.expires_at }), 410);
  }
  if (row.single_use === 1 && row.consumed_at !== null) {
    return c.html(renderGone({ reason: "consumed", at: row.consumed_at }), 410);
  }
  return c.html(
    renderPreview({
      slug: row.slug,
      content: row.content ?? "",
      visibility: row.visibility,
      createdAt: row.created_at,
    })
  );
});
