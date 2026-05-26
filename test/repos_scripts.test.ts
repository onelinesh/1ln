import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import {
  createHostedScript,
  getScriptBySlug,
  deleteScript,
} from "../src/repos/scripts";

describe("scripts repo", () => {
  it("creates a public hosted script with a 4-6 char slug", async () => {
    const row = await createHostedScript(env.DB, {
      content: "echo hi",
      visibility: "public",
      deleteTokenHash: "h",
    });
    expect(row.slug).toMatch(/^[0-9A-Za-z]{4,6}$/);
    expect(row.kind).toBe("hosted");
    expect(row.visibility).toBe("public");
    expect(row.content).toBe("echo hi");
  });

  it("creates a private hosted script with a 22-char slug", async () => {
    const row = await createHostedScript(env.DB, {
      content: "echo secret",
      visibility: "private",
      deleteTokenHash: "h",
    });
    expect(row.slug.length).toBe(22);
  });

  it("retrieves a script by slug", async () => {
    const row = await createHostedScript(env.DB, {
      content: "echo find-me",
      visibility: "public",
      deleteTokenHash: "h",
    });
    const found = await getScriptBySlug(env.DB, row.slug);
    expect(found?.content).toBe("echo find-me");
  });

  it("returns null for missing slug", async () => {
    expect(await getScriptBySlug(env.DB, "nope-not-real-slug")).toBeNull();
  });

  it("deletes a script by slug", async () => {
    const row = await createHostedScript(env.DB, {
      content: "echo bye",
      visibility: "public",
      deleteTokenHash: "h",
    });
    await deleteScript(env.DB, row.slug);
    expect(await getScriptBySlug(env.DB, row.slug)).toBeNull();
  });

  it("handles many public slug creations without crashing on collisions", async () => {
    for (let i = 0; i < 20; i++) {
      await createHostedScript(env.DB, {
        content: `s${i}`,
        visibility: "public",
        deleteTokenHash: "h",
      });
    }
    expect(true).toBe(true);
  });
});
