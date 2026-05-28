import type { Context, MiddlewareHandler } from "hono";
import type { Env } from "./env";
import { lookupApiToken, touchApiTokenLastUsed } from "./repos/api_tokens";

export type AuthUser = { user_id: string; token_id: string };
export type AuthVars = { authUser: AuthUser | undefined };

type AppContext = Context<{ Bindings: Env; Variables: AuthVars }>;

function parseBearer(c: AppContext): string | null {
  const h = c.req.header("authorization") ?? c.req.header("Authorization");
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/.exec(h);
  return m ? m[1] : null;
}

async function resolveBearer(c: AppContext, token: string): Promise<AuthUser | null> {
  const row = await lookupApiToken(c.env.DB, token);
  if (!row) return null;
  // Update last_used_at out-of-band so it doesn't block the response. Fall back
  // to awaiting it inline if no ExecutionContext is available (e.g. in unit
  // tests that call app.request without passing an ExecutionContext).
  const touch = touchApiTokenLastUsed(c.env.DB, row.id);
  try {
    c.executionCtx.waitUntil(touch);
  } catch {
    await touch;
  }
  return { user_id: row.user_id, token_id: row.id };
}

/** 401 unless a valid bearer token is present. */
export const requireBearer: MiddlewareHandler<{ Bindings: Env; Variables: AuthVars }> =
  async (c, next) => {
    const token = parseBearer(c);
    if (!token) return c.json({ error: "bearer token required" }, 401);
    const user = await resolveBearer(c, token);
    if (!user) return c.json({ error: "invalid bearer token" }, 401);
    c.set("authUser", user);
    await next();
  };

/**
 * Attach authUser if a valid bearer is present; pass through with undefined
 * authUser if no Authorization header. Return 401 if a header IS present but
 * invalid — we don't want callers to silently fall back to the anonymous path
 * with a stale token.
 */
export const optionalBearer: MiddlewareHandler<{ Bindings: Env; Variables: AuthVars }> =
  async (c, next) => {
    const token = parseBearer(c);
    if (!token) {
      c.set("authUser", undefined);
      await next();
      return;
    }
    const user = await resolveBearer(c, token);
    if (!user) return c.json({ error: "invalid bearer token" }, 401);
    c.set("authUser", user);
    await next();
  };
