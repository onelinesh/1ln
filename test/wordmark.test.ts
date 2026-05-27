import { describe, it, expect } from "vitest";
import { renderWordmark, renderHeader, renderFooter } from "../src/views/wordmark";

describe("wordmark", () => {
  it("renderWordmark pairs the logo.svg with the 1ln.sh text", () => {
    const html = renderWordmark();
    expect(html).toContain('class="wm"');
    expect(html).toContain('href="/"');
    expect(html).toMatch(/<img[^>]*class="wm-logo"[^>]*src="\/logo\.svg"/);
    expect(html).toContain('aria-label="1ln.sh home"');
    expect(html).toContain('class="wm-text"');
    expect(html).toContain('class="wm-dot"');
    expect(html).toContain("1ln");
    expect(html).toContain(".sh");
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
