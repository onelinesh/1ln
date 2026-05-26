import { describe, it, expect } from "vitest";
import { SELF, env } from "cloudflare:test";

async function createScript(content: string) {
  const res = await SELF.fetch("http://x/api/scripts", {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": "192.0.2.2" },
    body: JSON.stringify({ content, visibility: "public" }),
  });
  return (await res.json()) as { slug: string };
}

describe("GET /:slug?meta", () => {
  it("returns JSON metadata for an existing script", async () => {
    const { slug } = await createScript("echo hi");
    const res = await SELF.fetch(`http://x/${slug}?meta`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    const json: any = await res.json();
    expect(json.content).toBe("echo hi");
    expect(json.size).toBe(7);
    expect(json.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(json.visibility).toBe("public");
    expect(typeof json.created_at).toBe("number");
    expect(typeof json.expires_at).toBe("number");
    expect(json.source).toBe("hosted");
    expect(json.pinned_ref).toBeNull();
    expect(json.consumed_at).toBeNull();
    expect(json.single_use).toBe(false);
  });

  it("returns 404 for missing slug", async () => {
    const res = await SELF.fetch("http://x/nope?meta");
    expect(res.status).toBe(404);
  });

  it("returns 410 with error=expired for an expired script", async () => {
    const { slug } = await createScript("echo expire-meta");
    await env.DB.prepare("UPDATE scripts SET expires_at = ? WHERE slug = ?")
      .bind(Date.now() - 1000, slug)
      .run();
    const res = await SELF.fetch(`http://x/${slug}?meta`);
    expect(res.status).toBe(410);
    const json: any = await res.json();
    expect(json.error).toBe("expired");
  });

  it("returns 410 with error=already consumed for a consumed 1run script", async () => {
    const res = await SELF.fetch("http://x/api/scripts", {
      method: "POST",
      headers: { "content-type": "application/json", "cf-connecting-ip": "192.0.2.3" },
      body: JSON.stringify({ content: "echo 1run-meta", visibility: "public", expires: "1run" }),
    });
    const { slug } = (await res.json()) as { slug: string };
    // Consume via raw.
    const first = await SELF.fetch(`http://x/${slug}`);
    expect(first.status).toBe(200);
    // Now ?meta should 410.
    const meta = await SELF.fetch(`http://x/${slug}?meta`);
    expect(meta.status).toBe(410);
    const json: any = await meta.json();
    expect(json.error).toBe("already consumed");
  });
});
