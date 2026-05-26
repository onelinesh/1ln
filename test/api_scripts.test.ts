import { describe, it, expect } from "vitest";
import { SELF } from "cloudflare:test";

const post = (body: unknown, ip = "198.51.100.1") =>
  SELF.fetch("http://x/api/scripts", {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": ip },
    body: JSON.stringify(body),
  });

describe("POST /api/scripts", () => {
  it("creates a public script and returns slug/url/oneliner/delete_token", async () => {
    const res = await post({ content: "echo hi", visibility: "public" });
    expect(res.status).toBe(201);
    const json: any = await res.json();
    expect(json.slug).toMatch(/^[0-9A-Za-z]{4,6}$/);
    expect(json.url).toBe(`https://1ln.sh/${json.slug}`);
    expect(json.oneliner).toBe(`curl 1ln.sh/${json.slug} | sh`);
    expect(json.delete_token).toMatch(/^[0-9A-Za-z]{32}$/);
  });

  it("creates a private script with a 22-char slug", async () => {
    const res = await post({ content: "echo secret", visibility: "private" });
    const json: any = await res.json();
    expect(json.slug.length).toBe(22);
  });

  it("rejects content over 16KB for anonymous", async () => {
    const big = "x".repeat(16 * 1024 + 1);
    const res = await post({ content: big, visibility: "public" });
    expect(res.status).toBe(413);
  });

  it("rejects multibyte content that exceeds 16KB when UTF-8 encoded", async () => {
    // '한' is 3 UTF-8 bytes but 1 UTF-16 code unit.
    // 8000 chars × 3 bytes = 24 000 bytes > 16 384. Old length check would pass (8000 < 16384).
    const big = "한".repeat(8000);
    const res = await post({ content: big, visibility: "public" });
    expect(res.status).toBe(413);
  });

  it("rejects missing visibility", async () => {
    const res = await post({ content: "echo hi" });
    expect(res.status).toBe(400);
  });

  it("rate-limits after 5 anonymous creates from one IP", async () => {
    const ip = "198.51.100.99";
    for (let i = 0; i < 5; i++) await post({ content: `e ${i}`, visibility: "public" }, ip);
    const res = await post({ content: "e 6", visibility: "public" }, ip);
    expect(res.status).toBe(429);
  });
});

describe("POST /api/scripts — expires field", () => {
  it("accepts expires=1h on API", async () => {
    const res = await post({ content: "x", visibility: "public", expires: "1h" });
    expect(res.status).toBe(201);
    const json: any = await res.json();
    expect(json.slug).toMatch(/^[0-9A-Za-z]{4,6}$/);
  });

  it("accepts expires=1run on API", async () => {
    const res = await post({ content: "x", visibility: "public", expires: "1run" });
    expect(res.status).toBe(201);
  });

  it("rejects invalid expires value with 400", async () => {
    const res = await post({ content: "x", visibility: "public", expires: "forever" });
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/scripts/:slug", () => {
  it("deletes when delete_token is correct", async () => {
    const created: any = await (await post({ content: "rm me", visibility: "public" }, "198.51.100.10")).json();
    const del = await SELF.fetch(`http://x/api/scripts/${created.slug}`, {
      method: "DELETE",
      headers: { "x-delete-token": created.delete_token },
    });
    expect(del.status).toBe(204);
  });

  it("rejects wrong delete_token with 403", async () => {
    const created: any = await (await post({ content: "keep me", visibility: "public" }, "198.51.100.11")).json();
    const del = await SELF.fetch(`http://x/api/scripts/${created.slug}`, {
      method: "DELETE",
      headers: { "x-delete-token": "wrong" },
    });
    expect(del.status).toBe(403);
  });
});
