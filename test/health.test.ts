import { describe, it, expect } from "vitest";
import { SELF } from "cloudflare:test";

describe("health", () => {
  it("returns ok at /health", async () => {
    const res = await SELF.fetch("http://x/health");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
  });
});
