import { describe, it, expect } from "vitest";
import { generateDeleteToken, hashToken, verifyToken } from "../src/tokens";

describe("tokens", () => {
  it("generates a 32-char base62 token", () => {
    const t = generateDeleteToken();
    expect(t).toMatch(/^[0-9A-Za-z]{32}$/);
  });

  it("hashToken is deterministic and 64 hex chars (sha-256)", async () => {
    const h1 = await hashToken("abc");
    const h2 = await hashToken("abc");
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  it("verifyToken returns true for matching token, false otherwise", async () => {
    const t = generateDeleteToken();
    const h = await hashToken(t);
    expect(await verifyToken(t, h)).toBe(true);
    expect(await verifyToken(t + "x", h)).toBe(false);
  });
});
