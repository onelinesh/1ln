import { describe, it, expect } from "vitest";
import { SELF, env } from "cloudflare:test";

async function setSession(id: string, body: unknown) {
  await env.SCRIPT_CACHE.put(`cli_session:${id}`, JSON.stringify(body), {
    expirationTtl: 300,
  });
}

describe("GET /auth/cli/poll", () => {
  it("returns {status: 'pending'} while session is pending", async () => {
    await setSession("S_PEND", { status: "pending" });
    const res = await SELF.fetch("http://x/auth/cli/poll?session=S_PEND");
    expect(res.status).toBe(200);
    const j: any = await res.json();
    expect(j.status).toBe("pending");
    expect(j.token).toBeUndefined();
  });

  it("returns the token once and deletes the session", async () => {
    await setSession("S_DONE", { status: "complete", token: "TKN" });
    const r1 = await SELF.fetch("http://x/auth/cli/poll?session=S_DONE");
    expect(r1.status).toBe(200);
    const j1: any = await r1.json();
    expect(j1.status).toBe("complete");
    expect(j1.token).toBe("TKN");
    // KV entry should be gone (one-shot delivery).
    const raw = await env.SCRIPT_CACHE.get("cli_session:S_DONE");
    expect(raw).toBeNull();
    // Subsequent poll returns 404.
    const r2 = await SELF.fetch("http://x/auth/cli/poll?session=S_DONE");
    expect(r2.status).toBe(404);
  });

  it("404 on unknown session", async () => {
    const res = await SELF.fetch("http://x/auth/cli/poll?session=nope");
    expect(res.status).toBe(404);
  });

  it("400 when session missing", async () => {
    const res = await SELF.fetch("http://x/auth/cli/poll");
    expect(res.status).toBe(400);
  });
});

describe("POST /auth/logout", () => {
  it("revokes the bearer's own token row and returns 204", async () => {
    // Mint a token directly via the API surfaces used in earlier tests.
    const { upsertByGithubId } = await import("../src/repos/users");
    const { createApiToken, lookupApiToken } = await import("../src/repos/api_tokens");
    const u = await upsertByGithubId(env.DB, "9990");
    const { token } = await createApiToken(env.DB, u.id, "cli");

    const res = await SELF.fetch("http://x/auth/logout", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(204);
    expect(await lookupApiToken(env.DB, token)).toBeNull();
  });

  it("401 without bearer", async () => {
    const res = await SELF.fetch("http://x/auth/logout", { method: "POST" });
    expect(res.status).toBe(401);
  });
});
