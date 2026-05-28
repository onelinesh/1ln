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

  it("publish_script documents the parameter validation rules (key regex, caps, reserved)", () => {
    const t = TOOLS.find((x) => x.name === "publish_script");
    const d = t!.description;
    // Key charset regex visible so authoring agents can pick valid keys.
    expect(d).toMatch(/\[a-zA-Z\]\[a-zA-Z0-9_\]/);
    // Byte caps.
    expect(d).toMatch(/16 params/);
    expect(d).toMatch(/1 ?KB/i);
    expect(d).toMatch(/4 ?KB/i);
    // Reserved keys.
    expect(d.toLowerCase()).toContain("reserved");
    expect(d).toMatch(/view/);
    expect(d).toMatch(/meta/);
  });
});
