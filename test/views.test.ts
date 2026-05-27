import { describe, it, expect } from "vitest";
import { renderHome } from "../src/views/home";
import { renderResult } from "../src/views/result";
import { renderPreview } from "../src/views/preview";

describe("views", () => {
  it("renderHome contains a textarea and two submit buttons (in a disclosure)", () => {
    const html = renderHome();
    expect(html).toContain("<textarea");
    expect(html).toContain('name="content"');
    expect(html).toContain("Create public link");
    expect(html).toContain("Create private link");
  });

  it("renderHome hides the paste form behind a <details> disclosure", () => {
    const html = renderHome();
    expect(html).toContain("<details");
    expect(html).toContain("<summary");
    expect(html).toMatch(/Try it in the browser/i);
  });

  it("renderHome shows the one-line hero tagline", () => {
    const html = renderHome();
    expect(html).toMatch(/paste a script/i);
    expect(html).toMatch(/curl/i);
  });

  it("renderHome leads with the CLI install command", () => {
    const html = renderHome();
    expect(html).toContain("curl 1ln.sh/install | sh");
    expect(html).toContain("1ln push");
  });

  it("renderHome shows the MCP install command", () => {
    const html = renderHome();
    expect(html).toContain("claude mcp add 1ln");
    expect(html).toContain("1ln-mcp");
  });

  it("renderHome links to github and npm", () => {
    const html = renderHome();
    expect(html).toContain("https://github.com/onelinesh/1ln");
    expect(html).toContain("https://www.npmjs.com/package/1ln-mcp");
  });

  it("renderHome mentions the GitHub proxy as a feature, not a hero CTA", () => {
    const html = renderHome();
    expect(html).toContain('class="features"');
    expect(html).toMatch(/GitHub script proxy/i);
    expect(html).not.toMatch(/<h1[^>]*>[^<]*gh\//i);
    expect(html).not.toMatch(/<h2[^>]*>[\s\S]{0,120}1ln\.sh\/gh\//i);
  });

  it("renderHome shows an example curl URL in the hero", () => {
    const html = renderHome();
    expect(html).toContain('class="hero-example"');
    expect(html).toMatch(/curl 1ln\.sh\/\S+ \| sh/);
  });

  it("renderHome has copy buttons on the install commands", () => {
    const html = renderHome();
    expect(html).toContain('data-copy-target="install-cmd"');
    expect(html).toContain('data-copy-target="push-cmd"');
    expect(html).toContain('data-copy-target="mcp-cmd"');
  });

  it("renderHome shows the bar+dot logo mark in the hero", () => {
    const html = renderHome();
    expect(html).toMatch(/<img[^>]*src="\/favicon\.svg"[^>]*class="hero-mark"/);
  });

  it("renderResult shows the one-liner and the delete token", () => {
    const html = renderResult({ slug: "abc", deleteToken: "T0K3N" });
    expect(html).toContain("curl 1ln.sh/abc | sh");
    expect(html).toContain("T0K3N");
  });

  it("renderResult shows a Ready heading and the one-liner with a copy button", () => {
    const html = renderResult({ slug: "abc", deleteToken: "T0K3N" });
    expect(html).toMatch(/Ready/);
    expect(html).toContain("curl 1ln.sh/abc | sh");
    expect(html).toContain('class="copy-btn"');
    expect(html).toContain('data-copy-target="oneliner"');
  });

  it("renderResult shows the delete token with its own copy button", () => {
    const html = renderResult({ slug: "abc", deleteToken: "T0K3N" });
    expect(html).toContain("T0K3N");
    expect(html).toContain('data-copy-target="delete-token"');
  });

  it("renderResult includes the copy-button script tag exactly once", () => {
    const html = renderResult({ slug: "abc", deleteToken: "T0K3N" });
    const matches = html.match(/<script>[\s\S]*?<\/script>/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it("renderPreview shows the script content escaped", () => {
    const html = renderPreview({
      slug: "abc",
      content: "<script>alert(1)</script>",
      visibility: "public",
      createdAt: Date.now(),
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("renderPreview shows the script body with shell syntax highlighting", () => {
    const html = renderPreview({
      slug: "abc",
      content: "# install\necho hi",
      visibility: "public",
      createdAt: Date.now(),
    });
    expect(html).toContain('class="sh-comment"');
    expect(html).toContain('class="sh-keyword"');
  });

  it("renderPreview shows the one-liner with a copy button", () => {
    const html = renderPreview({
      slug: "abc",
      content: "echo hi",
      visibility: "public",
      createdAt: Date.now(),
    });
    expect(html).toContain('data-copy-target="oneliner"');
    expect(html).toContain("curl 1ln.sh/abc | sh");
  });

  it("renderPreview shows a status row with visibility and age", () => {
    const html = renderPreview({
      slug: "abc",
      content: "echo hi",
      visibility: "private",
      createdAt: Date.now(),
    });
    expect(html).toContain("private");
    expect(html).toContain('class="status-row"');
  });
});
