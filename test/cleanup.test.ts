import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { createHostedScript, getScriptBySlug } from "../src/repos/scripts";
import { cleanupExpired } from "../src/cleanup";

describe("cleanupExpired", () => {
  it("deletes scripts past expires_at", async () => {
    const row = await createHostedScript(env.DB, {
      content: "old",
      visibility: "public",
      deleteTokenHash: "h",
      hmacSecret: env.SCRIPT_HMAC_SECRET,
      expiresAt: Date.now() - 1000,
    });
    await cleanupExpired(env.DB);
    expect(await getScriptBySlug(env.DB, row.slug)).toBeNull();
  });

  it("keeps scripts not yet expired", async () => {
    const row = await createHostedScript(env.DB, {
      content: "new",
      visibility: "public",
      deleteTokenHash: "h",
      hmacSecret: env.SCRIPT_HMAC_SECRET,
      expiresAt: Date.now() + 60_000,
    });
    await cleanupExpired(env.DB);
    expect(await getScriptBySlug(env.DB, row.slug)).not.toBeNull();
  });

  it("keeps scripts with null expires_at", async () => {
    const row = await createHostedScript(env.DB, {
      content: "forever",
      visibility: "public",
      deleteTokenHash: "h",
      hmacSecret: env.SCRIPT_HMAC_SECRET,
      expiresAt: null,
    });
    await cleanupExpired(env.DB);
    expect(await getScriptBySlug(env.DB, row.slug)).not.toBeNull();
  });

  it("does not delete rows with NULL expires_at (authed `never`)", async () => {
    await env.DB.prepare(
      `INSERT INTO scripts (slug, kind, content, visibility, owner_id, expires_at, content_hmac, created_at, updated_at)
       VALUES ('keepme', 'hosted', 'echo keep', 'private', 'u_1', NULL, 'd0', ?, ?)`
    ).bind(Date.now(), Date.now()).run();
    const { cleanupExpired } = await import("../src/cleanup");
    await cleanupExpired(env.DB);
    const row = await env.DB.prepare("SELECT 1 FROM scripts WHERE slug = 'keepme'").first();
    expect(row).not.toBeNull();
  });
});
