import { describe, it, expect } from "vitest";
import { SELF, env } from "cloudflare:test";

async function createScript(content: string) {
  const res = await SELF.fetch("http://x/api/scripts", {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": "192.0.2.4" },
    body: JSON.stringify({ content, visibility: "public" }),
  });
  return (await res.json()) as { slug: string };
}

describe("GET /:slug?view", () => {
  it("returns HTML preview", async () => {
    const { slug } = await createScript("echo preview");
    const res = await SELF.fetch(`http://x/${slug}?view`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/html/);
    const html = await res.text();
    expect(html).toContain(slug);
    expect(html).toContain("echo preview");
  });

  it("returns 404 for missing slug with ?view", async () => {
    const res = await SELF.fetch("http://x/nope?view");
    expect(res.status).toBe(404);
  });

  it("returns 410 for an expired script", async () => {
    const { slug } = await createScript("echo expire-view");
    await env.DB.prepare("UPDATE scripts SET expires_at = ? WHERE slug = ?")
      .bind(Date.now() - 1000, slug)
      .run();
    const res = await SELF.fetch(`http://x/${slug}?view`);
    expect(res.status).toBe(410);
    const html = await res.text();
    expect(html).toContain("expired");
  });

  it("returns 410 for a consumed 1run script", async () => {
    const res = await SELF.fetch("http://x/api/scripts", {
      method: "POST",
      headers: { "content-type": "application/json", "cf-connecting-ip": "192.0.2.5" },
      body: JSON.stringify({ content: "echo 1run-view", visibility: "public", expires: "1run" }),
    });
    const { slug } = (await res.json()) as { slug: string };
    // Consume via raw.
    const first = await SELF.fetch(`http://x/${slug}`);
    expect(first.status).toBe(200);
    // Now ?view should 410.
    const view = await SELF.fetch(`http://x/${slug}?view`);
    expect(view.status).toBe(410);
    const html = await view.text();
    expect(html).toContain("used");
  });
});
