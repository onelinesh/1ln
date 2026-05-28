import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { upsertByGithubId, getUserById } from "../src/repos/users";

describe("users repo", () => {
  it("creates a user on first upsert and returns it on second", async () => {
    const a = await upsertByGithubId(env.DB, "9999");
    expect(a.id).toMatch(/^[0-9A-Za-z]{22}$/);
    expect(a.github_id).toBe("9999");
    const b = await upsertByGithubId(env.DB, "9999");
    expect(b.id).toBe(a.id);
    expect(b.github_id).toBe("9999");
  });

  it("getUserById returns null on miss", async () => {
    expect(await getUserById(env.DB, "nope")).toBeNull();
  });

  it("getUserById returns the user on hit", async () => {
    const u = await upsertByGithubId(env.DB, "12345");
    const got = await getUserById(env.DB, u.id);
    expect(got?.github_id).toBe("12345");
  });
});
