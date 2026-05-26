import { describe, it, expect } from "vitest";
import { renderHome } from "../src/views/home";
import { renderResult } from "../src/views/result";
import { renderPreview } from "../src/views/preview";

describe("views", () => {
  it("renderHome contains a textarea and two submit buttons", () => {
    const html = renderHome();
    expect(html).toContain("<textarea");
    expect(html).toContain('name="content"');
    expect(html).toContain("Create public link");
    expect(html).toContain("Create private link");
  });

  it("renderHome shows the one-line hero tagline", () => {
    const html = renderHome();
    expect(html).toMatch(/paste a script/i);
    expect(html).toMatch(/curl URL/i);
  });

  it("renderHome mentions the /gh/ proxy as a discoverability line", () => {
    const html = renderHome();
    expect(html).toContain("1ln.sh/gh/");
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
