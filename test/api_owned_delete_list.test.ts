import { describe, it, expect } from "vitest";
import { SELF, env } from "cloudflare:test";
import { upsertByGithubId } from "../src/repos/users";
import { createApiToken } from "../src/repos/api_tokens";

async function mint(githubId: string) {
  const u = await upsertByGithubId(env.DB, githubId);
  const { token } = await createApiToken(env.DB, u.id, null);
  return { user_id: u.id, token };
}

async function push(token: string, content: string, visibility: "public" | "private" = "private") {
  const r = await SELF.fetch("http://x/api/scripts", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ content, visibility, expires: "never" }),
  });
  if (r.status !== 201) throw new Error(`push failed: ${r.status}`);
  return ((await r.json()) as any).slug as string;
}

describe("DELETE /api/scripts/:slug (authed)", () => {
  it("204 deletes own owned script via bearer (no x-delete-token needed)", async () => {
    const { token } = await mint("4001");
    const slug = await push(token, "echo a");
    const res = await SELF.fetch(`http://x/api/scripts/${slug}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(204);
    const row = await env.DB.prepare("SELECT 1 FROM scripts WHERE slug = ?").bind(slug).first();
    expect(row).toBeNull();
  });

  it("403 deleting someone else's script", async () => {
    const { token: t1 } = await mint("4002");
    const { token: t2 } = await mint("4003");
    const slug = await push(t1, "echo a");
    const res = await SELF.fetch(`http://x/api/scripts/${slug}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${t2}` },
    });
    expect(res.status).toBe(403);
    const row = await env.DB.prepare("SELECT 1 FROM scripts WHERE slug = ?").bind(slug).first();
    expect(row).not.toBeNull();
  });

  it("anonymous DELETE on owned script still requires x-delete-token (and there isn't one) → 404", async () => {
    const { token } = await mint("4004");
    const slug = await push(token, "echo a");
    const res = await SELF.fetch(`http://x/api/scripts/${slug}`, {
      method: "DELETE",
      headers: { "x-delete-token": "anything" },
    });
    expect(res.status).toBe(404);
  });
});

describe("GET /api/scripts (authed list)", () => {
  it("401 without bearer", async () => {
    const res = await SELF.fetch("http://x/api/scripts");
    expect(res.status).toBe(401);
  });

  it("returns only the caller's scripts, newest-first, with no `content`", async () => {
    const { token: tA } = await mint("4101");
    const { token: tB } = await mint("4102");
    const aSlug1 = await push(tA, "echo a1");
    const aSlug2 = await push(tA, "echo a2", "public");
    const bSlug = await push(tB, "echo b1");

    const res = await SELF.fetch("http://x/api/scripts", {
      headers: { authorization: `Bearer ${tA}` },
    });
    expect(res.status).toBe(200);
    const j: any = await res.json();
    const slugs = j.scripts.map((s: any) => s.slug);
    expect(slugs).toEqual(expect.arrayContaining([aSlug1, aSlug2]));
    expect(slugs).not.toContain(bSlug);
    for (const s of j.scripts) {
      expect(s.content).toBeUndefined();
      expect(s.slug).toBeDefined();
      expect(s.visibility).toMatch(/^(public|private)$/);
      expect(typeof s.created_at).toBe("number");
      expect(typeof s.size).toBe("number");
    }
    const times = j.scripts.map((s: any) => s.created_at);
    const sorted = [...times].sort((a: number, b: number) => b - a);
    expect(times).toEqual(sorted);
  });
});
