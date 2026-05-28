import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { SELF, env } from "cloudflare:test";

const realFetch = globalThis.fetch;
function stubGithub(handler: (url: string, init?: RequestInit) => Promise<Response> | Response) {
  globalThis.fetch = (async (input: any, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.url;
    if (url.startsWith("https://github.com/") || url.startsWith("https://api.github.com/")) {
      return handler(url, init);
    }
    return realFetch(input, init);
  }) as typeof fetch;
}
beforeAll(() => {
  stubGithub((url) => {
    if (url.startsWith("https://github.com/login/oauth/access_token")) {
      return new Response(JSON.stringify({ access_token: "ghu_e2e" }), {
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ id: 88_888 }), {
      headers: { "content-type": "application/json" },
    });
  });
});
afterAll(() => {
  globalThis.fetch = realFetch;
});

describe("auth e2e (init → login → callback → poll → push → list → edit → rm → logout)", () => {
  it("walks the full owner lifecycle", async () => {
    const init = await (await SELF.fetch("http://x/auth/cli/init", { method: "POST" })).json() as any;
    expect(init.session_id).toBeDefined();
    const loginRes = await SELF.fetch(`http://x/auth/cli/login?session=${init.session_id}`, { redirect: "manual" });
    expect(loginRes.status).toBe(302);
    const cb = await SELF.fetch(`http://x/auth/github/callback?code=CODE&state=${init.session_id}`);
    expect(cb.status).toBe(200);
    const poll = await (await SELF.fetch(`http://x/auth/cli/poll?session=${init.session_id}`)).json() as any;
    expect(poll.status).toBe("complete");
    const token = poll.token;

    const push = await SELF.fetch("http://x/api/scripts", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ content: "echo e2e", visibility: "private", expires: "never" }),
    });
    expect(push.status).toBe(201);
    const slug = ((await push.json()) as any).slug;

    const list = await (await SELF.fetch("http://x/api/scripts", {
      headers: { authorization: `Bearer ${token}` },
    })).json() as any;
    expect(list.scripts.map((s: any) => s.slug)).toContain(slug);

    const edit = await SELF.fetch(`http://x/api/scripts/${slug}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ content: "echo edited" }),
    });
    expect(edit.status).toBe(200);
    const raw = await (await SELF.fetch(`http://x/${slug}`)).text();
    expect(raw).toBe("echo edited");

    const rm = await SELF.fetch(`http://x/api/scripts/${slug}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(rm.status).toBe(204);

    const lo = await SELF.fetch("http://x/auth/logout", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(lo.status).toBe(204);

    const after = await SELF.fetch("http://x/api/scripts", {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(after.status).toBe(401);
  });
});
