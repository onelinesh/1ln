import { describe, it, expect } from "vitest";
import { SELF, env } from "cloudflare:test";
import { upsertByGithubId } from "../src/repos/users";
import { createApiToken } from "../src/repos/api_tokens";

async function mintTokenFor(githubId: string): Promise<{ user_id: string; token: string }> {
  const u = await upsertByGithubId(env.DB, githubId);
  const { token } = await createApiToken(env.DB, u.id, null);
  return { user_id: u.id, token };
}

function postAuthed(token: string, body: unknown) {
  return SELF.fetch("http://x/api/scripts", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/scripts (authed)", () => {
  it("attaches owner_id and accepts expires=never with no clamp", async () => {
    const { user_id, token } = await mintTokenFor("3001");
    const res = await postAuthed(token, {
      content: "echo hi",
      visibility: "private",
      expires: "never",
    });
    expect(res.status).toBe(201);
    const j: any = await res.json();
    const row = await env.DB
      .prepare("SELECT owner_id, expires_at FROM scripts WHERE slug = ?")
      .bind(j.slug)
      .first<{ owner_id: string; expires_at: number | null }>();
    expect(row?.owner_id).toBe(user_id);
    expect(row?.expires_at).toBeNull();
  });

  it("accepts content up to 64KB for authed", async () => {
    const { token } = await mintTokenFor("3002");
    const big = "x".repeat(64 * 1024);
    const res = await postAuthed(token, { content: big, visibility: "private" });
    expect(res.status).toBe(201);
  });

  it("rejects content over 64KB for authed", async () => {
    const { token } = await mintTokenFor("3003");
    const big = "x".repeat(64 * 1024 + 1);
    const res = await postAuthed(token, { content: big, visibility: "private" });
    expect(res.status).toBe(413);
  });

  it("enforces 100/day per user rate limit (no IP-based limit)", async () => {
    const { token } = await mintTokenFor("3004");
    for (let i = 0; i < 100; i++) {
      const res = await postAuthed(token, {
        content: `echo ${i}`,
        visibility: "private",
      });
      expect(res.status).toBe(201);
    }
    const res = await postAuthed(token, { content: "echo nope", visibility: "private" });
    expect(res.status).toBe(429);
  });

  it("authed limit is per-user, not per-IP — two users from same IP both allowed", async () => {
    const { token: tokA } = await mintTokenFor("3005a");
    const { token: tokB } = await mintTokenFor("3005b");
    const ip = "203.0.113.7";
    const a = await SELF.fetch("http://x/api/scripts", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${tokA}`, "cf-connecting-ip": ip },
      body: JSON.stringify({ content: "x", visibility: "private" }),
    });
    const b = await SELF.fetch("http://x/api/scripts", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${tokB}`, "cf-connecting-ip": ip },
      body: JSON.stringify({ content: "y", visibility: "private" }),
    });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
  });

  it("invalid bearer returns 401 (does NOT fall back to anonymous)", async () => {
    const res = await postAuthed("not_a_real_token", { content: "x", visibility: "public" });
    expect(res.status).toBe(401);
  });

  it("does NOT return a delete_token when authed (ownership is the auth signal)", async () => {
    const { token } = await mintTokenFor("3006");
    const res = await postAuthed(token, { content: "x", visibility: "public" });
    expect(res.status).toBe(201);
    const j: any = await res.json();
    expect(j.delete_token).toBeUndefined();
    expect(j.slug).toBeDefined();
  });
});
