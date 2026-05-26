import { Hono } from "hono";
import type { Env } from "../env";
import {
  createHostedScript,
  getScriptBySlug,
  deleteScript,
} from "../repos/scripts";
import { generateDeleteToken, hashToken, verifyToken } from "../tokens";
import { checkAnonymousLimit } from "../ratelimit";

export const MAX_ANON_SIZE = 16 * 1024;

export type CreateResult =
  | { ok: true; slug: string; deleteToken: string }
  | { ok: false; status: 400 | 413 | 429; error: string };

export async function createAnonymous(
  env: Env,
  ip: string,
  content: unknown,
  visibility: unknown
): Promise<CreateResult> {
  if (typeof content !== "string") {
    return { ok: false, status: 400, error: "content required" };
  }
  if (visibility !== "public" && visibility !== "private") {
    return { ok: false, status: 400, error: "visibility must be 'public' or 'private'" };
  }
  if (content.length > MAX_ANON_SIZE) {
    return { ok: false, status: 413, error: "script too large" };
  }
  if (!(await checkAnonymousLimit(env.SCRIPT_CACHE, ip))) {
    return { ok: false, status: 429, error: "rate limit exceeded" };
  }
  const deleteToken = generateDeleteToken();
  const deleteTokenHash = await hashToken(deleteToken);
  const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const row = await createHostedScript(env.DB, {
    content,
    visibility,
    deleteTokenHash,
    expiresAt,
  });
  return { ok: true, slug: row.slug, deleteToken };
}

export const apiScripts = new Hono<{ Bindings: Env }>();

apiScripts.post("/api/scripts", async (c) => {
  const ip = c.req.header("cf-connecting-ip") ?? "0.0.0.0";
  const body = await c.req.json().catch(() => null);
  const result = await createAnonymous(
    c.env,
    ip,
    body?.content,
    body?.visibility
  );
  if (!result.ok) return c.json({ error: result.error }, result.status);
  return c.json(
    {
      slug: result.slug,
      url: `https://1ln.sh/${result.slug}`,
      oneliner: `curl 1ln.sh/${result.slug} | sh`,
      delete_token: result.deleteToken,
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
