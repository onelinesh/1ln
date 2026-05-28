import { describe, it, expect } from "vitest";
import { renderWordmark, renderHeader, renderFooter } from "../src/views/wordmark";

describe("wordmark", () => {
  it("renderWordmark renders the 1ln text-only wordmark (no image, no .sh suffix)", () => {
    const html = renderWordmark();
    expect(html).toContain('class="wm"');
    expect(html).toContain('href="/"');
    expect(html).not.toMatch(/<img[^>]*wm-logo/);
    expect(html).toContain('aria-label="1ln home"');
    expect(html).toContain('class="wm-text"');
    expect(html).not.toContain('class="wm-dot"');
    expect(html).toContain(">1ln<");
    expect(html).not.toMatch(/>1ln<\/[a-z]+>\s*<[^>]*>\.sh/);
  });

  it("renderHeader contains the wordmark", () => {
    const html = renderHeader();
    expect(html).toContain('class="wm"');
  });

  it("renderFooter has the documented links and tagline", () => {
    const html = renderFooter();
    expect(html).toContain("npm");
    expect(html).toContain("1ln-mcp");
    expect(html).toContain("abuse");
    expect(html).toMatch(/curl-pipe-bash/i);
    expect(html).not.toContain("github.com");
  });
});
