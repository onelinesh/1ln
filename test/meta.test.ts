import { describe, it, expect } from "vitest";
import { SELF } from "cloudflare:test";

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
    expect(json.expires_at).toBeNull();
    expect(json.source).toBe("hosted");
    expect(json.pinned_ref).toBeNull();
  });

  it("returns 404 for missing slug", async () => {
    const res = await SELF.fetch("http://x/nope?meta");
    expect(res.status).toBe(404);
  });
});
