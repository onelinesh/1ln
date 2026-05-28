import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";

async function uniqueIndexedColumns(table: string): Promise<string[]> {
  const idx = await env.DB
    .prepare(`PRAGMA index_list(${table})`)
    .all<{ name: string; unique: number }>();
  const cols: string[] = [];
  for (const i of idx.results) {
    if (i.unique !== 1) continue;
    const info = await env.DB
      .prepare(`PRAGMA index_info(${i.name})`)
      .all<{ name: string }>();
    for (const c of info.results) cols.push(c.name);
  }
  return cols;
}

describe("migration 0004", () => {
  it("creates users with id PRIMARY KEY and github_id UNIQUE", async () => {
    const cols = await env.DB.prepare("PRAGMA table_info(users)").all<{
      name: string; type: string; notnull: number; pk: number;
    }>();
    const byName = Object.fromEntries(cols.results.map((c) => [c.name, c]));
    expect(byName.id?.pk).toBe(1);
    expect(byName.github_id).toBeDefined();
    expect(byName.github_id.notnull).toBe(1);
    expect(byName.created_at?.notnull).toBe(1);
    expect(await uniqueIndexedColumns("users")).toContain("github_id");
  });

  it("creates api_tokens with id PK, user_id FK, and token_hash UNIQUE", async () => {
    const cols = await env.DB.prepare("PRAGMA table_info(api_tokens)").all<{
      name: string; notnull: number; pk: number;
    }>();
    const byName = Object.fromEntries(cols.results.map((c) => [c.name, c]));
    expect(byName.id?.pk).toBe(1);
    expect(byName.user_id?.notnull).toBe(1);
    expect(byName.token_hash?.notnull).toBe(1);
    expect(byName.name).toBeDefined();
    expect(byName.created_at?.notnull).toBe(1);
    expect(byName.last_used_at).toBeDefined();
    expect(await uniqueIndexedColumns("api_tokens")).toContain("token_hash");
  });

  it("cascades api_tokens deletion when their user is deleted (D1 enforces FKs)", async () => {
    await env.DB.prepare(
      "INSERT INTO users (id, github_id, created_at) VALUES (?, ?, ?)"
    ).bind("u_cascade", "777777", Date.now()).run();
    await env.DB.prepare(
      "INSERT INTO api_tokens (id, user_id, token_hash, created_at) VALUES (?, ?, ?, ?)"
    ).bind("t_cascade", "u_cascade", "hash_cascade", Date.now()).run();

    await env.DB.prepare("DELETE FROM users WHERE id = ?").bind("u_cascade").run();

    const tokens = await env.DB
      .prepare("SELECT COUNT(*) AS n FROM api_tokens WHERE user_id = ?")
      .bind("u_cascade")
      .first<{ n: number }>();
    expect(tokens?.n).toBe(0);
  });
});
