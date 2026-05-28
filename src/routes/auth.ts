import { Hono } from "hono";
import type { Env } from "../env";
import { randomBase62 } from "../slug";
import {
  buildAuthorizeUrl,
  exchangeCode,
  fetchGithubUserId,
} from "../oauth_github";
import { upsertByGithubId } from "../repos/users";
import { createApiToken } from "../repos/api_tokens";

const SESSION_TTL_SECONDS = 300;
const POLL_INTERVAL_SECONDS = 2;

export type CliSession =
  | { status: "pending" }
  | { status: "complete"; token: string };

function sessionKey(id: string): string {
  return `cli_session:${id}`;
}

function callbackUrl(origin: string): string {
  return `${origin}/auth/github/callback`;
}

async function readSession(env: Env, id: string): Promise<CliSession | null> {
  const raw = await env.SCRIPT_CACHE.get(sessionKey(id));
  return raw ? (JSON.parse(raw) as CliSession) : null;
}

async function writeSession(
  env: Env,
  id: string,
  s: CliSession,
  ttl = SESSION_TTL_SECONDS
): Promise<void> {
  await env.SCRIPT_CACHE.put(sessionKey(id), JSON.stringify(s), {
    expirationTtl: ttl,
  });
}

export const auth = new Hono<{ Bindings: Env }>();

auth.all("/auth/cli/init", async (c) => {
  if (c.req.method !== "POST") {
    return c.json({ error: "method not allowed" }, 405);
  }
  const sessionId = randomBase62(32);
  await writeSession(c.env, sessionId, { status: "pending" });
  const origin = new URL(c.req.url).origin;
  return c.json({
    session_id: sessionId,
    login_url: `${origin}/auth/cli/login?session=${sessionId}`,
    poll_url: `${origin}/auth/cli/poll?session=${sessionId}`,
    poll_interval_seconds: POLL_INTERVAL_SECONDS,
    expires_in_seconds: SESSION_TTL_SECONDS,
  });
});

auth.get("/auth/cli/login", async (c) => {
  const session = c.req.query("session");
  if (!session) return c.json({ error: "session required" }, 400);
  const existing = await readSession(c.env, session);
  if (!existing) return c.json({ error: "unknown or expired session" }, 400);
  const origin = new URL(c.req.url).origin;
  const url = buildAuthorizeUrl({
    clientId: c.env.GITHUB_OAUTH_CLIENT_ID,
    redirectUri: callbackUrl(origin),
    state: session,
  });
  return c.redirect(url, 302);
});

auth.get("/auth/github/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  if (!code || !state) {
    return c.html(
      "<h1>Login failed</h1><p>Missing code or state.</p>",
      400
    );
  }
  const session = await readSession(c.env, state);
  if (!session) {
    return c.html(
      "<h1>Login failed</h1><p>Unknown or expired session.</p>",
      400
    );
  }

  const origin = new URL(c.req.url).origin;
  let accessToken: string;
  let githubId: string;
  try {
    accessToken = await exchangeCode({
      clientId: c.env.GITHUB_OAUTH_CLIENT_ID,
      clientSecret: c.env.GITHUB_OAUTH_CLIENT_SECRET,
      code,
      redirectUri: callbackUrl(origin),
      fetch: globalThis.fetch,
    });
    githubId = await fetchGithubUserId({
      accessToken,
      fetch: globalThis.fetch,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return c.html(`<h1>Login failed</h1><p>${msg}</p>`, 502);
  }

  const user = await upsertByGithubId(c.env.DB, githubId);
  const { token } = await createApiToken(c.env.DB, user.id, "cli");
  await writeSession(c.env, state, { status: "complete", token });

  return c.html(
    `<!doctype html>
<meta charset="utf-8">
<title>1ln — logged in</title>
<style>body{font-family:ui-monospace,monospace;background:#0a0a0a;color:#eaeaea;padding:48px}h1{color:#ffb347}</style>
<h1>1ln &mdash; logged in</h1>
<p>You can close this window. Return to your terminal.</p>`,
    200
  );
});
