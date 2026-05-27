import { describe, it, expect } from "vitest";
import { computeContentHmac, verifyContentHmac } from "../src/integrity";

describe("integrity HMAC helpers", () => {
  const SECRET = "test-secret";

  it("computeContentHmac is deterministic for the same inputs", async () => {
    const a = await computeContentHmac(SECRET, "abc", "echo hi");
    const b = await computeContentHmac(SECRET, "abc", "echo hi");
    expect(a).toBe(b);
  });

  it("produces a 64-char hex string (SHA-256)", async () => {
    const h = await computeContentHmac(SECRET, "abc", "echo hi");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes when content changes", async () => {
    const a = await computeContentHmac(SECRET, "abc", "echo hi");
    const b = await computeContentHmac(SECRET, "abc", "echo HI");
    expect(a).not.toBe(b);
  });

  it("changes when slug changes (slug-bound — prevents hmac copy across rows)", async () => {
    const a = await computeContentHmac(SECRET, "abc", "echo hi");
    const b = await computeContentHmac(SECRET, "xyz", "echo hi");
    expect(a).not.toBe(b);
  });

  it("changes when the secret changes", async () => {
    const a = await computeContentHmac("secret-a", "abc", "echo hi");
    const b = await computeContentHmac("secret-b", "abc", "echo hi");
    expect(a).not.toBe(b);
  });

  it("verifyContentHmac accepts a valid hmac", async () => {
    const h = await computeContentHmac(SECRET, "abc", "echo hi");
    expect(await verifyContentHmac(SECRET, "abc", "echo hi", h)).toBe(true);
  });

  it("verifyContentHmac rejects tampered content", async () => {
    const h = await computeContentHmac(SECRET, "abc", "echo hi");
    expect(await verifyContentHmac(SECRET, "abc", "rm -rf /", h)).toBe(false);
  });

  it("verifyContentHmac rejects hmac copied from a different slug", async () => {
    const h = await computeContentHmac(SECRET, "abc", "echo hi");
    expect(await verifyContentHmac(SECRET, "xyz", "echo hi", h)).toBe(false);
  });

  it("verifyContentHmac rejects under a wrong secret", async () => {
    const h = await computeContentHmac("secret-a", "abc", "echo hi");
    expect(await verifyContentHmac("secret-b", "abc", "echo hi", h)).toBe(false);
  });

  it("verifyContentHmac rejects malformed hex input", async () => {
    expect(await verifyContentHmac(SECRET, "abc", "echo hi", "")).toBe(false);
    expect(await verifyContentHmac(SECRET, "abc", "echo hi", "zz")).toBe(false);
    expect(await verifyContentHmac(SECRET, "abc", "echo hi", "abc")).toBe(false); // odd length
  });
});
