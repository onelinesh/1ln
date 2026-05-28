import { describe, it, expect } from "vitest";
import { SELF } from "cloudflare:test";

async function createScript(content: string, ip: string): Promise<{ slug: string }> {
  const res = await SELF.fetch("http://x/api/scripts", {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": ip },
    body: JSON.stringify({ content, visibility: "public" }),
  });
  if (res.status !== 201) {
    throw new Error(`createScript failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as { slug: string };
}

describe("GET /:slug?view with query params", () => {
  it("renders the preview with no preamble section when there are no params", async () => {
    const { slug } = await createScript("echo hi\n", "192.0.2.120");
    const res = await SELF.fetch(`http://x/${slug}?view`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).not.toContain("Runtime parameters");
    expect(html).not.toContain("ENV_1LN_");
  });

  it("renders a Runtime parameters section showing the preamble exports", async () => {
    const { slug } = await createScript("echo hi\n", "192.0.2.121");
    const res = await SELF.fetch(`http://x/${slug}?view&port=8080&env=staging`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Runtime parameters");
    // Structural check: preamble must land inside a <pre>, not just anywhere in the HTML.
    expect(html).toContain("<pre># 1ln.sh runtime parameters\n");
    expect(html).toContain("export ENV_1LN_ENV=&#39;staging&#39;");
    expect(html).toContain("export ENV_1LN_PORT=&#39;8080&#39;");
  });

  it("escapes HTML metacharacters in param values", async () => {
    const { slug } = await createScript("echo hi\n", "192.0.2.122");
    const unsafe = encodeURIComponent("<script>alert(1)</script>");
    const res = await SELF.fetch(`http://x/${slug}?view&xss=${unsafe}`);
    const html = await res.text();
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("silently drops invalid params (no preamble section)", async () => {
    const { slug } = await createScript("echo hi\n", "192.0.2.123");
    const res = await SELF.fetch(`http://x/${slug}?view&1port=8080&_x=y`);
    const html = await res.text();
    expect(html).not.toContain("Runtime parameters");
  });
});
