import { describe, it, expect } from "vitest";
import { SELF, env } from "cloudflare:test";

async function createScript(content: string) {
  const res = await SELF.fetch("http://x/api/scripts", {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": "192.0.2.1" },
    body: JSON.stringify({ content, visibility: "public" }),
  });
  return (await res.json()) as { slug: string };
}

describe("GET /:slug", () => {
  it("returns raw script as text/plain", async () => {
    const { slug } = await createScript("echo hello");
    const res = await SELF.fetch(`http://x/${slug}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^text\/plain/);
    expect(await res.text()).toBe("echo hello");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("returns 404 for missing slug", async () => {
    const res = await SELF.fetch("http://x/nonexistent");
    expect(res.status).toBe(404);
  });

  it("does NOT return text/html for bare curl-style request", async () => {
    const { slug } = await createScript("echo a");
    const res = await SELF.fetch(`http://x/${slug}`);
    expect(res.headers.get("content-type")).not.toMatch(/html/);
  });

  it("delete via /api/scripts removes from raw access (verifies KV cache invalidation)", async () => {
    const created: any = await (await SELF.fetch("http://x/api/scripts", {
      method: "POST",
      headers: { "content-type": "application/json", "cf-connecting-ip": "192.0.2.50" },
      body: JSON.stringify({ content: "tmp", visibility: "public" }),
    })).json();
    // Warm cache by reading once.
    await SELF.fetch(`http://x/${created.slug}`);
    // Delete.
    await SELF.fetch(`http://x/api/scripts/${created.slug}`, {
      method: "DELETE",
      headers: { "x-delete-token": created.delete_token },
    });
    // Should now 404.
    const after = await SELF.fetch(`http://x/${created.slug}`);
    expect(after.status).toBe(404);
  });

  it("returns 410 for an expired script", async () => {
    const c: any = await (await SELF.fetch("http://x/api/scripts", {
      method: "POST",
      headers: { "content-type": "application/json", "cf-connecting-ip": "192.0.2.40" },
      body: JSON.stringify({ content: "x", visibility: "public", expires: "1h" }),
    })).json();
    // Update expires_at to a past timestamp via env.DB.
    await env.DB.prepare("UPDATE scripts SET expires_at = ? WHERE slug = ?")
      .bind(Date.now() - 1000, c.slug)
      .run();
    const res = await SELF.fetch(`http://x/${c.slug}`);
    expect(res.status).toBe(410);
  });

  it("1run URL: first read 200, second read 410", async () => {
    const c: any = await (await SELF.fetch("http://x/api/scripts", {
      method: "POST",
      headers: { "content-type": "application/json", "cf-connecting-ip": "192.0.2.41" },
      body: JSON.stringify({ content: "once", visibility: "public", expires: "1run" }),
    })).json();
    const first = await SELF.fetch(`http://x/${c.slug}`);
    expect(first.status).toBe(200);
    expect(await first.text()).toBe("once");
    const second = await SELF.fetch(`http://x/${c.slug}`);
    expect(second.status).toBe(410);
  });
});
