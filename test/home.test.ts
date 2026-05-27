import { describe, it, expect } from "vitest";
import { SELF } from "cloudflare:test";

describe("home", () => {
  it("GET / returns the docs-first homepage with a link to /try", async () => {
    const res = await SELF.fetch("http://x/");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/html/);
    const html = await res.text();
    expect(html).toContain('href="/try"');
    expect(html).not.toContain('name="content"');
  });

  it("GET /try returns the paste form", async () => {
    const res = await SELF.fetch("http://x/try");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/html/);
    const html = await res.text();
    expect(html).toContain('name="content"');
    expect(html).toContain('action="/"');
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

  it("home includes the wordmark in the header", async () => {
    const res = await SELF.fetch("http://x/");
    const html = await res.text();
    expect(html).toContain('class="wm"');
    expect(html).toContain("1ln");
  });

  it("home links the favicon and og.png", async () => {
    const res = await SELF.fetch("http://x/");
    const html = await res.text();
    expect(html).toContain('href="/favicon.svg"');
    expect(html).toContain("https://1ln.sh/og.png");
  });
});
