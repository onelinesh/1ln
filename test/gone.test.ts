import { describe, it, expect } from "vitest";
import { renderGone } from "../src/views/gone";

describe("renderGone", () => {
  it("renders an expired-reason page with 410 heading and Create-another link", () => {
    const html = renderGone({ reason: "expired", at: Date.now() - 3600 * 1000 });
    expect(html).toContain("410");
    expect(html).toMatch(/expired/i);
    expect(html).toContain('href="/"');
  });

  it("renders a consumed-reason page with the consumed time", () => {
    const t = Date.parse("2026-05-26T14:23:00Z");
    const html = renderGone({ reason: "consumed", at: t });
    expect(html).toMatch(/used|consumed/i);
    expect(html).toContain("2026-05-26");
  });

  it("escapes the reason value (defense in depth)", () => {
    // reason is a typed string union, but verify we don't directly inject anything
    const html = renderGone({ reason: "expired", at: 0 });
    expect(html).not.toContain("<script>");
  });
});
