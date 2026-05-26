import { describe, it, expect } from "vitest";
import { SELF } from "cloudflare:test";

describe("home", () => {
  it("GET / returns the paste form", async () => {
    const res = await SELF.fetch("http://x/");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/html/);
    expect(await res.text()).toContain('name="content"');
  });

  it("POST / form-submit creates a script and shows the result page", async () => {
    const body = new URLSearchParams({ content: "echo via form", visibility: "public" });
    const res = await SELF.fetch("http://x/", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "cf-connecting-ip": "192.0.2.3",
      },
      body,
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("curl 1ln.sh/");
    expect(html).toContain("Delete token");
  });
});
