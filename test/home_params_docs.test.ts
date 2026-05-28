import { describe, it, expect } from "vitest";
import { SELF } from "cloudflare:test";

describe("homepage parameter docs", () => {
  it("mentions URL parameters and the ENV_1LN_ prefix", async () => {
    const res = await SELF.fetch("http://x/");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("ENV_1LN_");
    expect(html).toMatch(/curl 1ln\.sh\/[^?]+\?[a-z]+=/);
  });

  it("uses the block-label heading pattern, not a competing <h2>", async () => {
    const res = await SELF.fetch("http://x/");
    const html = await res.text();
    expect(html).toContain(`<p class="block-label">Pass parameters at runtime</p>`);
    // The old <h2> heading must not appear — that competed with the hero <h1>.
    expect(html).not.toMatch(/<h2>Pass parameters at runtime<\/h2>/);
  });

  it("renders the example as a hero-example terminal block (matches How it works)", async () => {
    const res = await SELF.fetch("http://x/");
    const html = await res.text();
    expect(html).toContain(`<div class="hero-example" aria-label="Pass parameters at runtime">`);
    // Should NOT use the old bare <pre> form for the example.
    expect(html).not.toContain("<pre>curl 1ln.sh/&lt;slug&gt;?port=");
  });

  it("uses design-token styling, not inline font-size", async () => {
    const res = await SELF.fetch("http://x/");
    const html = await res.text();
    expect(html).not.toContain(`style="font-size:12px;"`);
  });

  it("does not surface parameter validation rules on the homepage (they belong in MCP/agent surfaces)", async () => {
    const res = await SELF.fetch("http://x/");
    const html = await res.text();
    // The technical rules (key regex, byte caps, reserved keys) must NOT appear
    // on the homepage — they're agent-facing detail surfaced via the MCP tool
    // description and the npm README.
    expect(html).not.toMatch(/\[a-zA-Z\]\[a-zA-Z0-9_\]/);
    expect(html).not.toMatch(/1\s*KB per value/i);
    expect(html).not.toMatch(/silently dropped/i);
  });

  it("uses the same heading element as 'How it works' (visual parity)", async () => {
    const res = await SELF.fetch("http://x/");
    const html = await res.text();
    expect(html).toContain(`<p class="block-label">How it works</p>`);
    expect(html).toContain(`<p class="block-label">Pass parameters at runtime</p>`);
  });

  it("appears after 'How it works' and before the MCP section", async () => {
    const res = await SELF.fetch("http://x/");
    const html = await res.text();
    const howItWorks = html.indexOf("How it works");
    const params = html.indexOf("Pass parameters at runtime");
    const mcp = html.indexOf(`class="mcp"`);
    expect(howItWorks).toBeGreaterThan(-1);
    expect(params).toBeGreaterThan(-1);
    expect(mcp).toBeGreaterThan(-1);
    expect(params).toBeGreaterThan(howItWorks);
    expect(params).toBeLessThan(mcp);
  });

  it("sets twitter:title and twitter:description (mirrors og:* for X cards)", async () => {
    const res = await SELF.fetch("http://x/");
    const html = await res.text();
    expect(html).toMatch(/<meta name="twitter:title" content="[^"]+"/);
    expect(html).toMatch(/<meta name="twitter:description" content="[^"]+"/);
  });

  it("JSON-LD lists the parameter-passing feature in featureList", async () => {
    const res = await SELF.fetch("http://x/");
    const html = await res.text();
    const m = html.match(/<script type="application\/ld\+json">([^<]+)<\/script>/);
    expect(m).not.toBeNull();
    const ld = JSON.parse(m![1]);
    expect(ld.featureList).toEqual(expect.arrayContaining([
      expect.stringMatching(/ENV_1LN_/),
    ]));
    expect(ld.description).toMatch(/ENV_1LN_/);
  });
});
