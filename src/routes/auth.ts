import { Hono } from "hono";
import type { Env } from "../env";
import { randomBase62 } from "../slug";

/** TTL for an in-flight CLI login session (KV expiration). */
const SESSION_TTL_SECONDS = 300;
const POLL_INTERVAL_SECONDS = 2;

export type CliSession =
  | { status: "pending" }
  | { status: "complete"; token: string };

function sessionKey(id: string): string {
  return `cli_session:${id}`;
}

export const auth = new Hono<{ Bindings: Env }>();

auth.all("/auth/cli/init", async (c) => {
  if (c.req.method !== "POST") {
    return c.json({ error: "method not allowed" }, 405);
  }
  const sessionId = randomBase62(32);
  const session: CliSession = { status: "pending" };
  await c.env.SCRIPT_CACHE.put(sessionKey(sessionId), JSON.stringify(session), {
    expirationTtl: SESSION_TTL_SECONDS,
  });
  const origin = new URL(c.req.url).origin;
  return c.json({
    session_id: sessionId,
    login_url: `${origin}/auth/cli/login?session=${sessionId}`,
    poll_url: `${origin}/auth/cli/poll?session=${sessionId}`,
    poll_interval_seconds: POLL_INTERVAL_SECONDS,
    expires_in_seconds: SESSION_TTL_SECONDS,
  });
});
