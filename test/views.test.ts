import { describe, it, expect } from "vitest";
import { renderHome } from "../src/views/home";
import { renderTry } from "../src/views/try";
import { renderResult } from "../src/views/result";
import { renderPreview } from "../src/views/preview";

describe("views", () => {
  it("renderHome does not include the paste form (moved to /try)", () => {
    const html = renderHome();
    expect(html).not.toContain("<textarea");
    expect(html).not.toContain('name="content"');
  });

  it("renderHome links to /try as a small bottom link", () => {
    const html = renderHome();
    expect(html).toContain('href="/try"');
    expect(html).toMatch(/try it in the browser/i);
  });

  it("renderTry contains the paste form and submit buttons", () => {
    const html = renderTry();
    expect(html).toContain("<textarea");
    expect(html).toContain('name="content"');
    expect(html).toContain("Create public link");
    expect(html).toContain("Create private link");
    expect(html).toContain('action="/"');
  });

  it("renderTry includes a back link to the homepage", () => {
    const html = renderTry();
    expect(html).toMatch(/href="\/"/);
  });

  it("renderHome shows the one-line hero tagline", () => {
    const html = renderHome();
    expect(html).toMatch(/(push|paste) a shell script/i);
    expect(html).toMatch(/url/i);
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

  it("renderHome links to npm but not github", () => {
    const html = renderHome();
    expect(html).toContain("https://www.npmjs.com/package/1ln-mcp");
    expect(html).not.toContain("github.com");
  });

  it("renderHome does not mention the /gh/ proxy anywhere on the landing page", () => {
    const html = renderHome();
    expect(html).not.toContain("1ln.sh/gh/");
    expect(html).not.toMatch(/github (script )?proxy/i);
  });

  it("renderHome does not include the legacy features list", () => {
    const html = renderHome();
    expect(html).not.toContain('class="features"');
    expect(html).not.toMatch(/expiring urls/i);
    expect(html).not.toMatch(/single-use/i);
  });

  it("renderHome shows an example curl URL in the hero", () => {
    const html = renderHome();
    expect(html).toContain('class="hero-example"');
    expect(html).toMatch(/curl 1ln\.sh\/\S+ \| sh/);
  });

  it("renderHome has copy buttons on the install commands", () => {
    const html = renderHome();
    expect(html).toContain('data-copy-target="install-cmd"');
    expect(html).toContain('data-copy-target="mcp-claude-code"');
    expect(html).toContain('data-copy-target="mcp-stdio"');
    expect(html).toContain('data-copy-target="mcp-desktop"');
  });

  it("renderHome no longer embeds a large hero logo image (mark moved to header)", () => {
    const html = renderHome();
    expect(html).not.toMatch(/<img[^>]*class="hero-mark"/);
  });

  it("renderHeader shows the 1ln.sh wordmark text", () => {
    const html = renderHome();
    expect(html).not.toMatch(/<img[^>]*wm-logo/);
    expect(html).toContain('aria-label="1ln.sh home"');
    expect(html).toContain('class="wm-text"');
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
