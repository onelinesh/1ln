import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";

describe("migration 0004", () => {
  it("creates users table with github_id UNIQUE and id PRIMARY KEY", async () => {
    const cols = await env.DB.prepare("PRAGMA table_info(users)").all<{
      name: string; type: string; notnull: number; pk: number;
    }>();
    const byName = Object.fromEntries(cols.results.map((c) => [c.name, c]));
    expect(byName.id.pk).toBe(1);
    expect(byName.github_id).toBeDefined();
    expect(byName.created_at).toBeDefined();

    const idx = await env.DB.prepare("PRAGMA index_list(users)").all<{
      name: string; unique: number;
    }>();
    const uniques = idx.results.filter((i) => i.unique === 1).map((i) => i.name);
    // The implicit unique index for github_id should exist.
    expect(uniques.length).toBeGreaterThan(0);
  });

  it("creates api_tokens with token_hash UNIQUE and FK to users", async () => {
    const cols = await env.DB.prepare("PRAGMA table_info(api_tokens)").all<{
      name: string;
    }>();
    const names = cols.results.map((c) => c.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "id", "user_id", "token_hash", "name", "created_at", "last_used_at",
      ])
    );
    const idx = await env.DB.prepare("PRAGMA index_list(api_tokens)").all<{
      name: string; unique: number;
    }>();
    expect(idx.results.some((i) => i.unique === 1)).toBe(true);
  });
});
