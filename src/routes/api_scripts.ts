import { Hono } from "hono";
import type { Env } from "../env";
import {
  createHostedScript,
  getScriptBySlug,
  deleteScript,
  listByOwner,
} from "../repos/scripts";
import { generateDeleteToken, hashToken, verifyToken } from "../tokens";
import { checkAnonymousLimit, checkAuthedLimit } from "../ratelimit";
import { parseExpires } from "../expires";
import { optionalBearer, requireBearer, type AuthUser, type AuthVars } from "../auth";

export const MAX_ANON_SIZE = 16 * 1024;
export const MAX_AUTHED_SIZE = 64 * 1024;

type CreateOk = { ok: true; slug: string; deleteToken?: string };
type CreateErr = { ok: false; status: 400 | 401 | 413 | 429; error: string };
export type CreateResult = CreateOk | CreateErr;

export async function createAnonymous(
  env: Env,
  ip: string,
  content: unknown,
  visibility: unknown,
  expires: unknown
): Promise<CreateResult> {
  if (typeof content !== "string") {
    return { ok: false, status: 400, error: "content required" };
  }
  if (visibility !== "public" && visibility !== "private") {
    return { ok: false, status: 400, error: "visibility must be 'public' or 'private'" };
  }
  if (new TextEncoder().encode(content).length > MAX_ANON_SIZE) {
    return { ok: false, status: 413, error: "script too large" };
  }
  if (!(await checkAnonymousLimit(env.SCRIPT_CACHE, ip))) {
    return { ok: false, status: 429, error: "rate limit exceeded" };
  }
  let parsed;
  try {
    parsed = parseExpires(
      typeof expires === "string" ? expires : undefined,
      { authed: false, nowMs: Date.now() }
    );
  } catch (e) {
    return { ok: false, status: 400, error: (e as Error).message };
  }
  const deleteToken = generateDeleteToken();
  const deleteTokenHash = await hashToken(deleteToken);
  const row = await createHostedScript(env.DB, {
    content,
    visibility,
    deleteTokenHash,
    hmacSecret: env.SCRIPT_HMAC_SECRET,
    expiresAt: parsed.expiresAt,
    singleUse: parsed.singleUse,
  });
  return { ok: true, slug: row.slug, deleteToken };
}

export async function createOwned(
  env: Env,
  user: AuthUser,
  content: unknown,
  visibility: unknown,
  expires: unknown
): Promise<CreateResult> {
  if (typeof content !== "string") {
    return { ok: false, status: 400, error: "content required" };
  }
  if (visibility !== "public" && visibility !== "private") {
    return { ok: false, status: 400, error: "visibility must be 'public' or 'private'" };
  }
  if (new TextEncoder().encode(content).length > MAX_AUTHED_SIZE) {
    return { ok: false, status: 413, error: "script too large" };
  }
  if (!(await checkAuthedLimit(env.SCRIPT_CACHE, user.user_id))) {
    return { ok: false, status: 429, error: "rate limit exceeded" };
  }
  let parsed;
  try {
    parsed = parseExpires(
      typeof expires === "string" ? expires : undefined,
      { authed: true, nowMs: Date.now() }
    );
  } catch (e) {
    return { ok: false, status: 400, error: (e as Error).message };
  }
  const row = await createHostedScript(env.DB, {
    content,
    visibility,
    deleteTokenHash: null,
    hmacSecret: env.SCRIPT_HMAC_SECRET,
    ownerId: user.user_id,
    expiresAt: parsed.expiresAt,
    singleUse: parsed.singleUse,
  });
  return { ok: true, slug: row.slug };
}

export const apiScripts = new Hono<{ Bindings: Env; Variables: AuthVars }>();

apiScripts.post("/api/scripts", optionalBearer, async (c) => {
  const ip = c.req.header("cf-connecting-ip") ?? "0.0.0.0";
  const body = await c.req.json().catch(() => null);
  const user = c.get("authUser");
  const result = user
    ? await createOwned(c.env, user, body?.content, body?.visibility, body?.expires)
    : await createAnonymous(c.env, ip, body?.content, body?.visibility, body?.expires);
  if (!result.ok) return c.json({ error: result.error }, result.status);
  const payload: Record<string, string> = {
    slug: result.slug,
    url: `https://1ln.sh/${result.slug}`,
    oneliner: `curl 1ln.sh/${result.slug} | sh`,
  };
  if (result.deleteToken) payload.delete_token = result.deleteToken;
  return c.json(payload, 201);
});

apiScripts.delete("/api/scripts/:slug", optionalBearer, async (c) => {
  const slug = c.req.param("slug");
  const row = await getScriptBySlug(c.env.DB, slug);
  if (!row) return c.json({ error: "not found" }, 404);

  const user = c.get("authUser");
  if (user) {
    if (row.owner_id !== user.user_id) {
      return c.json({ error: "forbidden" }, 403);
    }
    await deleteScript(c.env.DB, slug);
    await c.env.SCRIPT_CACHE.delete(`script:${slug}`);
    return new Response(null, { status: 204 });
  }

  const token = c.req.header("x-delete-token");
  if (!token) return c.json({ error: "x-delete-token header required" }, 400);
  if (!row.delete_token_hash) return c.json({ error: "not found" }, 404);
  if (!(await verifyToken(token, row.delete_token_hash))) {
    return c.json({ error: "forbidden" }, 403);
  }
  await deleteScript(c.env.DB, slug);
  await c.env.SCRIPT_CACHE.delete(`script:${slug}`);
  return new Response(null, { status: 204 });
});

apiScripts.get("/api/scripts", requireBearer, async (c) => {
  const user = c.get("authUser")!;
  const items = await listByOwner(c.env.DB, user.user_id);
  return c.json({ scripts: items });
});
