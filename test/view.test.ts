import { describe, it, expect } from "vitest";
import { SELF } from "cloudflare:test";

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
});
