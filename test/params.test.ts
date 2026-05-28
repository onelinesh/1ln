import { describe, it, expect } from "vitest";
import { parseParams, buildPreamble } from "../src/params";

function urlFor(qs: string): URL {
  return new URL(`https://1ln.sh/abc${qs}`);
}

describe("parseParams", () => {
  it("returns {} when there's no query string", () => {
    expect(parseParams(urlFor(""))).toEqual({});
  });

  it("accepts a simple key=value pair and uppercases the key", () => {
    expect(parseParams(urlFor("?port=8080"))).toEqual({ PORT: "8080" });
  });

  it("accepts multiple pairs", () => {
    expect(parseParams(urlFor("?port=8080&env=staging"))).toEqual({
      PORT: "8080",
      ENV: "staging",
    });
  });

  it("accepts an empty value", () => {
    expect(parseParams(urlFor("?port="))).toEqual({ PORT: "" });
  });

  it("silently drops the reserved keys view and meta", () => {
    expect(parseParams(urlFor("?view=1&meta=1&port=8080"))).toEqual({
      PORT: "8080",
    });
  });

  it("silently drops underscore-prefixed keys (reserved for future system flags)", () => {
    expect(parseParams(urlFor("?_format=raw&port=8080"))).toEqual({
      PORT: "8080",
    });
  });

  it("silently drops keys that don't match the charset", () => {
    // starts with digit
    expect(parseParams(urlFor("?1port=x&port=y"))).toEqual({ PORT: "y" });
    // contains dash
    expect(parseParams(urlFor("?port-name=x&port=y"))).toEqual({ PORT: "y" });
    // contains dot
    expect(parseParams(urlFor("?port.name=x&port=y"))).toEqual({ PORT: "y" });
  });

  it("silently drops keys longer than 32 chars", () => {
    const long = "a".repeat(33);
    expect(parseParams(urlFor(`?${long}=x&port=y`))).toEqual({ PORT: "y" });
  });

  it("accepts a key of exactly 32 chars", () => {
    const k = "a".repeat(32);
    const out = parseParams(urlFor(`?${k}=x`));
    expect(out).toEqual({ [k.toUpperCase()]: "x" });
  });

  it("silently drops values longer than 1024 bytes", () => {
    const big = "x".repeat(1025);
    expect(parseParams(urlFor(`?port=${big}&env=ok`))).toEqual({ ENV: "ok" });
  });

  it("accepts a value of exactly 1024 bytes", () => {
    const v = "x".repeat(1024);
    expect(parseParams(urlFor(`?port=${v}`))).toEqual({ PORT: v });
  });

  it("counts bytes (not chars) for the value cap — multi-byte unicode", () => {
    // "é" is 2 bytes in UTF-8. 513 of them = 1026 bytes, over the cap.
    const v = "é".repeat(513);
    expect(parseParams(urlFor(`?port=${encodeURIComponent(v)}`))).toEqual({});
  });

  it("caps at 16 params (drops extras in iteration order)", () => {
    const pairs = Array.from({ length: 20 }, (_, i) => `k${i}=v${i}`).join("&");
    const out = parseParams(urlFor(`?${pairs}`));
    expect(Object.keys(out)).toHaveLength(16);
    // First 16 are kept.
    expect(out.K0).toBe("v0");
    expect(out.K15).toBe("v15");
    expect(out.K16).toBeUndefined();
  });

  it("caps the total value size at 4096 bytes (drops the param that would overflow and beyond)", () => {
    // 4 params of 1024 bytes each = 4096 — fits exactly.
    // A 5th param of any size overflows and is dropped.
    const big = "x".repeat(1024);
    const out = parseParams(
      urlFor(`?a=${big}&b=${big}&c=${big}&d=${big}&e=tiny`)
    );
    expect(out.A).toBe(big);
    expect(out.B).toBe(big);
    expect(out.C).toBe(big);
    expect(out.D).toBe(big);
    expect(out.E).toBeUndefined();
  });

  it("rejects a dup-key replacement that would overflow the total cap WITHOUT corrupting accounting", () => {
    // Setup: 5 params that fill the 4096-byte total cap exactly:
    //   a=1, b=1024, c=1024, d=1024, e=1023  →  totalBytes=4096
    // Then dup a=1024 arrives: refund 1 → totalBytes=4095; 4095+1024=5119 > 4096,
    // so the dup is rejected. Without the fix totalBytes stays at 4095, meaning a
    // subsequent f=1 (4095+1=4096, not strictly greater) would be accepted even
    // though real content would be 4097 bytes. With the fix totalBytes is restored
    // to 4096 and f=1 is correctly rejected.
    const big = "x".repeat(1024);
    const out = parseParams(
      urlFor(
        `?a=x&b=${big}&c=${big}&d=${big}&e=${"x".repeat(1023)}&a=${big}&f=x`
      )
    );
    // Original a=1-byte value is preserved (dup rejected).
    expect(out.A).toBe("x");
    expect(out.B).toBe(big);
    expect(out.C).toBe(big);
    expect(out.D).toBe(big);
    // f=1 byte would push real total (4096) to 4097 — must be rejected.
    expect(out.F).toBeUndefined();
  });

  it("last-write-wins on duplicate keys", () => {
    expect(parseParams(urlFor("?port=8080&port=9090"))).toEqual({ PORT: "9090" });
  });

  it("decodes percent-encoding in values", () => {
    expect(parseParams(urlFor("?msg=hello%20world"))).toEqual({ MSG: "hello world" });
  });

  it("silently drops values containing null bytes", () => {
    const out = parseParams(urlFor("?msg=hello%00world&ok=fine"));
    expect(out.MSG).toBeUndefined();
    expect(out.OK).toBe("fine");
  });
});

describe("buildPreamble", () => {
  it("returns empty string for empty params", () => {
    expect(buildPreamble({})).toBe("");
  });

  it("emits a single export with single-quote wrapping", () => {
    expect(buildPreamble({ PORT: "8080" })).toBe(
      "# 1ln.sh runtime parameters\nexport ENV_1LN_PORT='8080'\n\n"
    );
  });

  it("emits multiple exports sorted alphabetically by key", () => {
    expect(buildPreamble({ PORT: "8080", ENV: "staging" })).toBe(
      "# 1ln.sh runtime parameters\nexport ENV_1LN_ENV='staging'\nexport ENV_1LN_PORT='8080'\n\n"
    );
  });

  it("escapes embedded single quotes (POSIX style: '\\'' )", () => {
    // value contains a single quote: it'll
    expect(buildPreamble({ MSG: "it's" })).toBe(
      "# 1ln.sh runtime parameters\nexport ENV_1LN_MSG='it'\\''s'\n\n"
    );
  });

  it("does NOT expand $ or backticks inside the quoted value", () => {
    // The whole point: the value is literal. We just wrap it.
    expect(buildPreamble({ V: "$(rm -rf /)" })).toBe(
      "# 1ln.sh runtime parameters\nexport ENV_1LN_V='$(rm -rf /)'\n\n"
    );
  });

  it("handles newlines and tabs inside values (single quotes preserve them)", () => {
    expect(buildPreamble({ V: "a\nb\tc" })).toBe(
      "# 1ln.sh runtime parameters\nexport ENV_1LN_V='a\nb\tc'\n\n"
    );
  });

  it("emits a trailing blank line so the user script body starts on its own line", () => {
    const out = buildPreamble({ PORT: "8080" });
    expect(out.endsWith("\n\n")).toBe(true);
  });

  it("handles empty-string values", () => {
    expect(buildPreamble({ PORT: "" })).toBe(
      "# 1ln.sh runtime parameters\nexport ENV_1LN_PORT=''\n\n"
    );
  });
});
