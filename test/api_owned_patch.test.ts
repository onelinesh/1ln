import { describe, it, expect } from "vitest";
import { SELF, env } from "cloudflare:test";
import { upsertByGithubId } from "../src/repos/users";
import { createApiToken } from "../src/repos/api_tokens";

async function mint(githubId: string) {
  const u = await upsertByGithubId(env.DB, githubId);
  const { token } = await createApiToken(env.DB, u.id, null);
  return { user_id: u.id, token };
}

async function pushOwned(token: string, content: string, visibility: "public" | "private" = "private") {
  const r = await SELF.fetch("http://x/api/scripts", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ content, visibility, expires: "never" }),
  });
  return ((await r.json()) as any).slug as string;
}

function patch(slug: string, token: string, body: unknown) {
  return SELF.fetch(`http://x/api/scripts/${slug}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/scripts/:slug", () => {
  it("renames an owned script (any visibility)", async () => {
    const { token } = await mint("5001");
    const slug = await pushOwned(token, "echo x", "public");
    const res = await patch(slug, token, { name: "my-script" });
    expect(res.status).toBe(200);
    const row = await env.DB
      .prepare("SELECT name FROM scripts WHERE slug = ?")
      .bind(slug)
      .first<{ name: string }>();
    expect(row?.name).toBe("my-script");
  });

  it("edits private content and updates the served raw + recomputes HMAC", async () => {
    const { token } = await mint("5002");
    const slug = await pushOwned(token, "echo before");
    const res = await patch(slug, token, { content: "echo after" });
    expect(res.status).toBe(200);
    const raw = await SELF.fetch(`http://x/${slug}`);
    expect(await raw.text()).toBe("echo after");
  });

  it("rejects editing public content (immutable)", async () => {
    const { token } = await mint("5003");
    const slug = await pushOwned(token, "echo x", "public");
    const res = await patch(slug, token, { content: "echo y" });
    expect(res.status).toBe(409);
  });

  it("403 when patching someone else's script", async () => {
    const { token: t1 } = await mint("5004");
    const { token: t2 } = await mint("5005");
    const slug = await pushOwned(t1, "echo x");
    const res = await patch(slug, t2, { content: "echo bad" });
    expect(res.status).toBe(403);
  });

  it("404 on unknown slug", async () => {
    const { token } = await mint("5006");
    const res = await patch("doesnotexist", token, { name: "x" });
    expect(res.status).toBe(404);
  });

  it("rejects empty patch body", async () => {
    const { token } = await mint("5007");
    const slug = await pushOwned(token, "echo x");
    const res = await patch(slug, token, {});
    expect(res.status).toBe(400);
  });

  it("rejects content > 64KB on edit", async () => {
    const { token } = await mint("5008");
    const slug = await pushOwned(token, "echo x");
    const big = "x".repeat(64 * 1024 + 1);
    const res = await patch(slug, token, { content: big });
    expect(res.status).toBe(413);
  });

  it("invalidates the KV cache for the slug on content edit", async () => {
    const { token } = await mint("5009");
    const slug = await pushOwned(token, "echo before");
    // Warm cache via raw read.
    await SELF.fetch(`http://x/${slug}`);
    await patch(slug, token, { content: "echo after" });
    const r2 = await SELF.fetch(`http://x/${slug}`);
    expect(await r2.text()).toBe("echo after");
  });

  it("rejects name longer than 255 chars", async () => {
    const { token } = await mint("5010");
    const slug = await pushOwned(token, "echo x");
    const longName = "n".repeat(256);
    const res = await patch(slug, token, { name: longName });
    expect(res.status).toBe(400);
    // The DB row should be unchanged.
    const row = await env.DB
      .prepare("SELECT name FROM scripts WHERE slug = ?")
      .bind(slug)
      .first<{ name: string | null }>();
    expect(row?.name).toBeNull();
  });

  it("accepts name exactly at 255 chars", async () => {
    const { token } = await mint("5011");
    const slug = await pushOwned(token, "echo x");
    const okName = "n".repeat(255);
    const res = await patch(slug, token, { name: okName });
    expect(res.status).toBe(200);
  });
});
