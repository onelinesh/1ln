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

  it("renderResult shows the one-liner and the delete token", () => {
    const html = renderResult({ slug: "abc", deleteToken: "T0K3N" });
    expect(html).toContain("curl 1ln.sh/abc | sh");
    expect(html).toContain("T0K3N");
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
});
