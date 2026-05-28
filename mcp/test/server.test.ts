import { describe, it, expect } from "vitest";
import { TOOLS } from "../src/server";

describe("MCP tool descriptions", () => {
  it("publish_script description mentions URL parameters and ENV_1LN_ prefix", () => {
    const t = TOOLS.find((x) => x.name === "publish_script");
    expect(t).toBeDefined();
    expect(t!.description).toMatch(/ENV_1LN_/);
    expect(t!.description.toLowerCase()).toContain("parameter");
  });

  it("publish_script still documents visibility and expires defaults", () => {
    const t = TOOLS.find((x) => x.name === "publish_script");
    expect(t!.description).toMatch(/private/);
    expect(t!.description).toMatch(/24h/);
  });
});
