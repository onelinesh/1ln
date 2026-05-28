import { describe, it, expect } from "vitest";
import { SELF } from "cloudflare:test";

describe("homepage parameter docs", () => {
  it("mentions URL parameters and the ENV_1LN_ prefix", async () => {
    const res = await SELF.fetch("http://x/");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("ENV_1LN_");
    // The example shows the canonical ?port=…&env=… form.
    expect(html).toMatch(/curl 1ln\.sh\/[^?]+\?port=/);
  });
});
