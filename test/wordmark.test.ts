import { describe, it, expect } from "vitest";
import { renderWordmark, renderHeader, renderFooter } from "../src/views/wordmark";

describe("wordmark", () => {
  it("renderWordmark produces 1ln + amber .sh", () => {
    const html = renderWordmark();
    expect(html).toContain('class="wm"');
    expect(html).toContain("1ln");
    expect(html).toContain('class="wm-dot"');
    expect(html).toContain(".sh");
    expect(html).toContain('href="/"');
  });

  it("renderHeader contains the wordmark", () => {
    const html = renderHeader();
    expect(html).toContain('class="wm"');
  });

  it("renderFooter has the three documented links", () => {
    const html = renderFooter();
    expect(html).toContain("github");
    expect(html).toContain("YairEtzion/1ln");
    expect(html).toContain("abuse");
    expect(html).toMatch(/curl-pipe-bash/i);
  });
});
