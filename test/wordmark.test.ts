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

  it("renderFooter has the three documented links", () => {
    const html = renderFooter();
    expect(html).toContain("github");
    expect(html).toContain("onelinesh/1ln");
    expect(html).toContain("abuse");
    expect(html).toMatch(/curl-pipe-bash/i);
  });
});
