import { Hono } from "hono";
import type { Env } from "../env";
import {
  createHostedScript,
  getScriptBySlug,
  deleteScript,
} from "../repos/scripts";
import { generateDeleteToken, hashToken, verifyToken } from "../tokens";
import { checkAnonymousLimit } from "../ratelimit";

const MAX_ANON_SIZE = 16 * 1024;

export const apiScripts = new Hono<{ Bindings: Env }>();

apiScripts.post("/api/scripts", async (c) => {
  const ip = c.req.header("cf-connecting-ip") ?? "0.0.0.0";
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body.content !== "string") {
    return c.json({ error: "content required" }, 400);
  }
  if (body.visibility !== "public" && body.visibility !== "private") {
    return c.json({ error: "visibility must be 'public' or 'private'" }, 400);
  }
  if (body.content.length > MAX_ANON_SIZE) {
    return c.json({ error: "script too large" }, 413);
  }
  if (!(await checkAnonymousLimit(c.env.SCRIPT_CACHE, ip))) {
    return c.json({ error: "rate limit exceeded" }, 429);
  }

  const deleteToken = generateDeleteToken();
  const deleteTokenHash = await hashToken(deleteToken);
  const row = await createHostedScript(c.env.DB, {
    content: body.content,
    visibility: body.visibility,
    deleteTokenHash,
  });

  return c.json(
    {
      slug: row.slug,
      url: `https://1ln.sh/${row.slug}`,
      oneliner: `curl 1ln.sh/${row.slug} | sh`,
      delete_token: deleteToken,
    },
    201
  );
});

apiScripts.delete("/api/scripts/:slug", async (c) => {
  const slug = c.req.param("slug");
  const token = c.req.header("x-delete-token");
  if (!token) return c.json({ error: "x-delete-token header required" }, 400);
  const row = await getScriptBySlug(c.env.DB, slug);
  if (!row || !row.delete_token_hash) return c.json({ error: "not found" }, 404);
  if (!(await verifyToken(token, row.delete_token_hash))) {
    return c.json({ error: "forbidden" }, 403);
  }
  await deleteScript(c.env.DB, slug);
  await c.env.SCRIPT_CACHE.delete(`script:${slug}`);
  return new Response(null, { status: 204 });
});
