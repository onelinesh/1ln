import { describe, it, expect } from "vitest";
import { parseExpires, MAX_ANON_TTL_MS } from "../src/expires";

const now = () => Date.now();

describe("parseExpires (anonymous)", () => {
  it("'1h' → +1 hour, not single-use", () => {
    const t = now();
    const r = parseExpires("1h", { authed: false, nowMs: t });
    expect(r.expiresAt).toBe(t + 60 * 60 * 1000);
    expect(r.singleUse).toBe(false);
  });

  it("'24h' → +24 hours", () => {
    const t = now();
    const r = parseExpires("24h", { authed: false, nowMs: t });
    expect(r.expiresAt).toBe(t + 24 * 60 * 60 * 1000);
  });

  it("'1run' → 7-day backstop + singleUse=true", () => {
    const t = now();
    const r = parseExpires("1run", { authed: false, nowMs: t });
    expect(r.expiresAt).toBe(t + MAX_ANON_TTL_MS);
    expect(r.singleUse).toBe(true);
  });

  it("'never' → clamped to 7 days (anonymous-only)", () => {
    const t = now();
    const r = parseExpires("never", { authed: false, nowMs: t });
    expect(r.expiresAt).toBe(t + MAX_ANON_TTL_MS);
    expect(r.singleUse).toBe(false);
  });

  it("undefined → defaults to 24h (API default)", () => {
    const t = now();
    const r = parseExpires(undefined, { authed: false, nowMs: t });
    expect(r.expiresAt).toBe(t + 24 * 60 * 60 * 1000);
  });

  it("'7d-web-default' → 7d, not single-use (matches existing anonymous-web behavior)", () => {
    const t = now();
    const r = parseExpires("7d-web-default", { authed: false, nowMs: t });
    expect(r.expiresAt).toBe(t + MAX_ANON_TTL_MS);
    expect(r.singleUse).toBe(false);
  });

  it("invalid string throws", () => {
    expect(() => parseExpires("forever", { authed: false, nowMs: now() })).toThrow();
  });
});
