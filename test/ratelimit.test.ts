import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { checkAnonymousLimit } from "../src/ratelimit";

describe("checkAnonymousLimit", () => {
  it("allows the first 5 requests from an IP", async () => {
    const ip = "203.0.113.1";
    for (let i = 0; i < 5; i++) {
      expect(await checkAnonymousLimit(env.SCRIPT_CACHE, ip)).toBe(true);
    }
  });

  it("blocks the 6th request", async () => {
    const ip = "203.0.113.2";
    for (let i = 0; i < 5; i++) await checkAnonymousLimit(env.SCRIPT_CACHE, ip);
    expect(await checkAnonymousLimit(env.SCRIPT_CACHE, ip)).toBe(false);
  });
});
