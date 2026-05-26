import { describe, it, expect } from "vitest";
import { renderCopyButton, copyButtonScript } from "../src/views/copy_button";

describe("copy button", () => {
  it("renderCopyButton produces a button referencing the target id", () => {
    const html = renderCopyButton("oneliner");
    expect(html).toContain('data-copy-target="oneliner"');
    expect(html).toContain('aria-label="Copy"');
    expect(html).toContain('class="copy-btn"');
  });

  it("copyButtonScript is a self-contained <script> tag", () => {
    const s = copyButtonScript();
    expect(s.startsWith("<script>")).toBe(true);
    expect(s.endsWith("</script>")).toBe(true);
    expect(s).toContain("clipboard");
    expect(s).toContain("data-copy-target");
  });
});
