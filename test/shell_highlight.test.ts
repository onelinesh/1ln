import { describe, it, expect } from "vitest";
import { highlightShell } from "../src/views/shell_highlight";

describe("highlightShell", () => {
  it("HTML-escapes input before highlighting", () => {
    const html = highlightShell("echo \"<hi>\"");
    expect(html).not.toContain("<hi>");
    expect(html).toContain("&lt;hi&gt;");
  });

  it("colors # line comments with the comment class", () => {
    const html = highlightShell("# install\necho hi");
    expect(html).toContain('<span class="sh-comment"># install</span>');
  });

  it("colors double-quoted strings", () => {
    const html = highlightShell('echo "hello"');
    expect(html).toContain('<span class="sh-string">"hello"</span>');
  });

  it("colors single-quoted strings", () => {
    const html = highlightShell("echo 'hi'");
    expect(html).toContain(`<span class="sh-string">'hi'</span>`);
  });

  it("colors shell keywords", () => {
    const html = highlightShell("if true; then echo hi; fi");
    expect(html).toContain('<span class="sh-keyword">if</span>');
    expect(html).toContain('<span class="sh-keyword">then</span>');
    expect(html).toContain('<span class="sh-keyword">fi</span>');
    expect(html).toContain('<span class="sh-keyword">echo</span>');
  });

  it("does not match keyword substrings inside identifiers", () => {
    // "echoed" should not be highlighted; "ifs" should not be highlighted
    const html = highlightShell("ifs=1; echoed=x");
    expect(html).not.toContain('<span class="sh-keyword">if</span>');
    expect(html).not.toContain('<span class="sh-keyword">echo</span>');
  });

  it("leaves a comment-inside-string alone (string wins)", () => {
    const html = highlightShell('echo "# not a comment"');
    expect(html).toContain('<span class="sh-string">"# not a comment"</span>');
    expect(html).not.toContain('sh-comment');
  });

  it("handles unterminated strings gracefully (wraps everything to EOF)", () => {
    const html = highlightShell('echo "unclosed');
    expect(html).toContain('<span class="sh-string">"unclosed</span>');
  });

  it("handles backslash-escaped quote inside a string", () => {
    const html = highlightShell('echo "a\\"b"');
    // The whole "a\"b" should be one string span
    expect(html).toContain('<span class="sh-string">"a\\"b"</span>');
  });

  it("treats # after a word character as not-a-comment (e.g. URL fragments)", () => {
    const html = highlightShell("curl https://example.com#anchor");
    expect(html).not.toContain('<span class="sh-comment">#anchor</span>');
  });
});
