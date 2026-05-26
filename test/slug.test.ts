import { describe, it, expect } from "vitest";
import { generatePublicSlug, generatePrivateSlug, BASE62 } from "../src/slug";

describe("generatePublicSlug", () => {
  it("returns 4-6 char base62", () => {
    for (let i = 0; i < 100; i++) {
      const s = generatePublicSlug();
      expect(s.length).toBeGreaterThanOrEqual(4);
      expect(s.length).toBeLessThanOrEqual(6);
      for (const c of s) expect(BASE62).toContain(c);
    }
  });
});

describe("generatePrivateSlug", () => {
  it("returns 22 char base62", () => {
    for (let i = 0; i < 100; i++) {
      const s = generatePrivateSlug();
      expect(s.length).toBe(22);
      for (const c of s) expect(BASE62).toContain(c);
    }
  });

  it("has high entropy (no collisions over 10k draws)", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 10000; i++) seen.add(generatePrivateSlug());
    expect(seen.size).toBe(10000);
  });
});
