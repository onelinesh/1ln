import { describe, it, expect } from "vitest";
import { SELF, env } from "cloudflare:test";

async function createPublic(content: string, ip = "192.0.2.80") {
  const res = await SELF.fetch("http://x/api/scripts", {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": ip },
    body: JSON.stringify({ content, visibility: "public" }),
  });
  return (await res.json()) as { slug: string; delete_token: string };
}

describe("tamper detection (HMAC integrity)", () => {
  it("round-trip: created script serves its content unchanged", async () => {
    const { slug } = await createPublic("echo round-trip", "192.0.2.81");
    const res = await SELF.fetch(`http://x/${slug}`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("echo round-trip");
  });

  it("createHostedScript persists a non-null content_hmac", async () => {
    const { slug } = await createPublic("echo with-hmac", "192.0.2.82");
    const row = await env.DB.prepare(
      "SELECT content_hmac FROM scripts WHERE slug = ?"
    )
      .bind(slug)
      .first<{ content_hmac: string | null }>();
    expect(row?.content_hmac).toMatch(/^[0-9a-f]{64}$/);
  });

  it("raw returns 410 when D1 content is tampered (hmac left intact)", async () => {
    const { slug } = await createPublic("echo original", "192.0.2.83");
    // Simulate attacker write: swap content but leave the hmac alone.
    await env.DB.prepare("UPDATE scripts SET content = ? WHERE slug = ?")
      .bind("rm -rf /", slug)
      .run();
    const res = await SELF.fetch(`http://x/${slug}`);
    expect(res.status).toBe(410);
    expect(await res.text()).toBe("Script content failed integrity check");
  });

  it("?view returns 410 when D1 content is tampered", async () => {
    const { slug } = await createPublic("echo view-orig", "192.0.2.84");
    await env.DB.prepare("UPDATE scripts SET content = ? WHERE slug = ?")
      .bind("evil", slug)
      .run();
    const res = await SELF.fetch(`http://x/${slug}?view=1`);
    expect(res.status).toBe(410);
  });

  it("?meta returns 410 when D1 content is tampered", async () => {
    const { slug } = await createPublic("echo meta-orig", "192.0.2.85");
    await env.DB.prepare("UPDATE scripts SET content = ? WHERE slug = ?")
      .bind("evil", slug)
      .run();
    const res = await SELF.fetch(`http://x/${slug}?meta=1`);
    expect(res.status).toBe(410);
  });

  it("tampered hmac (with original content) also returns 410", async () => {
    const { slug } = await createPublic("echo hmac-flip", "192.0.2.86");
    // Mutate just the hmac to a valid-looking but wrong hex string.
    const fake = "0".repeat(64);
    await env.DB.prepare("UPDATE scripts SET content_hmac = ? WHERE slug = ?")
      .bind(fake, slug)
      .run();
    const res = await SELF.fetch(`http://x/${slug}`);
    expect(res.status).toBe(410);
  });

  it("legacy row with NULL content_hmac is still served (back-compat)", async () => {
    // Manually insert a row as if it pre-dated the 0003 migration.
    const slug = "legacy-null-hmac-test";
    const now = Date.now();
    await env.DB.prepare(
      `INSERT INTO scripts (slug, kind, content, visibility, delete_token_hash, single_use, content_hmac, created_at, updated_at)
       VALUES (?, 'hosted', ?, 'public', NULL, 0, NULL, ?, ?)`
    )
      .bind(slug, "echo legacy", now, now)
      .run();

    const raw = await SELF.fetch(`http://x/${slug}`);
    expect(raw.status).toBe(200);
    expect(await raw.text()).toBe("echo legacy");

    const view = await SELF.fetch(`http://x/${slug}?view=1`);
    expect(view.status).toBe(200);

    const meta = await SELF.fetch(`http://x/${slug}?meta=1`);
    expect(meta.status).toBe(200);
  });
});
