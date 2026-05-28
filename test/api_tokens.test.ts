import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { upsertByGithubId } from "../src/repos/users";
import {
  createApiToken,
  lookupApiToken,
  revokeApiToken,
  touchApiTokenLastUsed,
} from "../src/repos/api_tokens";

async function user(githubId: string) {
  return upsertByGithubId(env.DB, githubId);
}

describe("api_tokens repo", () => {
  it("createApiToken returns a token string and an id", async () => {
    const u = await user("1001");
    const { token, id } = await createApiToken(env.DB, u.id, "cli");
    expect(token).toMatch(/^[0-9A-Za-z]{32}$/);
    expect(id).toMatch(/^[0-9A-Za-z]{22}$/);
  });

  it("lookupApiToken resolves to the right user and updates last_used_at", async () => {
    const u = await user("1002");
    const { token, id } = await createApiToken(env.DB, u.id, null);
    const before = Date.now();
    const found = await lookupApiToken(env.DB, token);
    expect(found?.user_id).toBe(u.id);
    expect(found?.id).toBe(id);
    await touchApiTokenLastUsed(env.DB, id);
    const row = await env.DB
      .prepare("SELECT last_used_at FROM api_tokens WHERE id = ?")
      .bind(id)
      .first<{ last_used_at: number }>();
    expect(row?.last_used_at).toBeGreaterThanOrEqual(before);
  });

  it("lookupApiToken returns null on unknown token", async () => {
    expect(await lookupApiToken(env.DB, "doesnotexist")).toBeNull();
  });

  it("revokeApiToken removes the row", async () => {
    const u = await user("1003");
    const { token, id } = await createApiToken(env.DB, u.id, null);
    expect(await revokeApiToken(env.DB, id)).toBe(true);
    expect(await lookupApiToken(env.DB, token)).toBeNull();
    expect(await revokeApiToken(env.DB, id)).toBe(false);
  });
});
