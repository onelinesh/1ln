import { describe, it, expect } from "vitest";
import { cssTokens } from "../src/views/tokens";

describe("cssTokens", () => {
  it("emits every token from the design spec as a CSS custom property", () => {
    const css = cssTokens();
    for (const v of [
      "--bg: #0d0d0d",
      "--surface: #181818",
      "--border: #232323",
      "--text: #e8e1d8",
      "--text-secondary: #8a8a8a",
      "--text-muted: #5a5a5a",
      "--accent: #f5a623",
      "--accent-hover: #ffbb4d",
      "--danger: #e85d4d",
    ]) {
      expect(css).toContain(v);
    }
  });

  it("includes the font stack with IBM Plex Mono first", () => {
    expect(cssTokens()).toMatch(/--font:\s*'IBM Plex Mono',[^;]*monospace/);
  });

  it("emits @font-face for IBM Plex Mono regular and bold pointing at /fonts/...", () => {
    const css = cssTokens();
    expect(css).toContain("@font-face");
    expect(css).toContain("/fonts/IBMPlexMono-Regular.woff2");
    expect(css).toContain("/fonts/IBMPlexMono-Bold.woff2");
    expect(css).toMatch(/font-weight:\s*400/);
    expect(css).toMatch(/font-weight:\s*700/);
  });

  it("declares color-scheme: dark", () => {
    expect(cssTokens()).toContain("color-scheme: dark");
  });
});
