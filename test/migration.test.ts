import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";

describe("migration", () => {
  it("has a scripts table with the expected columns", async () => {
    const result = await env.DB.prepare(
      "SELECT name FROM pragma_table_info('scripts')"
    ).all();
    const cols = result.results.map((r: any) => r.name);
    expect(cols).toEqual(expect.arrayContaining([
      "slug", "kind", "content", "source_url", "pinned_ref",
      "visibility", "owner_id", "delete_token_hash", "name",
      "expires_at", "consumed_at", "created_at", "updated_at",
    ]));
  });
});
