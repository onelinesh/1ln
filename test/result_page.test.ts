import { describe, it, expect } from "vitest";
import { SELF } from "cloudflare:test";

describe("result page (integration)", () => {
  it("after creating a script, result page shows copy button + ready heading", async () => {
    const form = new URLSearchParams({ content: "echo ok", visibility: "public" });
    const res = await SELF.fetch("http://x/", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", "cf-connecting-ip": "203.0.113.99" },
      body: form,
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toMatch(/Ready/);
    expect(html).toContain('data-copy-target="oneliner"');
    expect(html).toContain('data-copy-target="delete-token"');
    expect(html).toContain("curl 1ln.sh/");
  });
});
