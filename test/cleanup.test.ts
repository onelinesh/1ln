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
      expiresAt: null,
    });
    await cleanupExpired(env.DB);
    expect(await getScriptBySlug(env.DB, row.slug)).not.toBeNull();
  });
});
