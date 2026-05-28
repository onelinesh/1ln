import { describe, it, expect } from "vitest";
import { SELF, env } from "cloudflare:test";

describe("POST /auth/cli/init", () => {
  it("returns session_id + login_url + poll_url + writes session to KV", async () => {
    const res = await SELF.fetch("http://x/auth/cli/init", { method: "POST" });
    expect(res.status).toBe(200);
    const j: any = await res.json();
    expect(j.session_id).toMatch(/^[0-9A-Za-z]{32}$/);
    expect(j.login_url).toBe(`http://x/auth/cli/login?session=${j.session_id}`);
    expect(j.poll_url).toBe(`http://x/auth/cli/poll?session=${j.session_id}`);
    expect(j.poll_interval_seconds).toBe(2);
    expect(j.expires_in_seconds).toBe(300);

    const raw = await env.SCRIPT_CACHE.get(`cli_session:${j.session_id}`);
    expect(raw).not.toBeNull();
    const session = JSON.parse(raw!);
    expect(session.status).toBe("pending");
  });

  it("rejects non-POST with 405", async () => {
    const res = await SELF.fetch("http://x/auth/cli/init");
    expect(res.status).toBe(405);
  });
});
