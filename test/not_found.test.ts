import { describe, it, expect } from "vitest";
import { SELF } from "cloudflare:test";
import { renderNotFound } from "../src/views/not_found";

describe("renderNotFound (unit)", () => {
  it("includes the requested path, escaped", () => {
    const html = renderNotFound("/foo<script>x</script>");
    expect(html).toContain("404");
    expect(html).not.toContain("<script>x</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("404 handler (integration)", () => {
  it("any path the worker doesn't match returns the designed 404 HTML", async () => {
    const res = await SELF.fetch("http://x/this-does-not-exist-anywhere");
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toMatch(/text\/html/);
    const html = await res.text();
    expect(html).toContain("404");
    expect(html).toContain("this-does-not-exist-anywhere");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });
});
