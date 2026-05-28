import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { SELF, env } from "cloudflare:test";

// We override globalThis.fetch ONLY for github.com and api.github.com URLs.
// Internal SELF.fetch traffic still hits the worker normally.
const realFetch = globalThis.fetch;
function installGithubFetchStub(
  handler: (url: string, init?: RequestInit) => Promise<Response> | Response
) {
  globalThis.fetch = (async (input: any, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.url;
    if (url.startsWith("https://github.com/") || url.startsWith("https://api.github.com/")) {
      return handler(url, init);
    }
    return realFetch(input, init);
  }) as typeof fetch;
}

beforeAll(() => {
  installGithubFetchStub(() => {
    throw new Error("github stub not configured for this test");
  });
});
afterAll(() => {
  globalThis.fetch = realFetch;
});

async function openSession(): Promise<string> {
  const r = await SELF.fetch("http://x/auth/cli/init", { method: "POST" });
  return ((await r.json()) as any).session_id;
}

describe("GET /auth/cli/login?session=...", () => {
  it("302s to github authorize url with state=session_id", async () => {
    const session = await openSession();
    const res = await SELF.fetch(`http://x/auth/cli/login?session=${session}`, {
      redirect: "manual",
    });
    expect(res.status).toBe(302);
    const loc = res.headers.get("location")!;
    const u = new URL(loc);
    expect(u.origin).toBe("https://github.com");
    expect(u.pathname).toBe("/login/oauth/authorize");
    expect(u.searchParams.get("state")).toBe(session);
    expect(u.searchParams.get("scope")).toBe("read:user");
  });

  it("400 when session is missing", async () => {
    const res = await SELF.fetch("http://x/auth/cli/login");
    expect(res.status).toBe(400);
  });

  it("400 when session is unknown", async () => {
    const res = await SELF.fetch("http://x/auth/cli/login?session=nope");
    expect(res.status).toBe(400);
  });
});

describe("GET /auth/github/callback", () => {
  it("exchanges code, fetches user id, stores token in session KV, shows success HTML", async () => {
    const session = await openSession();
    installGithubFetchStub((url) => {
      if (url.startsWith("https://github.com/login/oauth/access_token")) {
        return new Response(JSON.stringify({ access_token: "ghu_demo" }), {
          headers: { "content-type": "application/json" },
        });
      }
      if (url === "https://api.github.com/user") {
        return new Response(JSON.stringify({ id: 7777 }), {
          headers: { "content-type": "application/json" },
        });
      }
      throw new Error(`unexpected github url: ${url}`);
    });

    const res = await SELF.fetch(
      `http://x/auth/github/callback?code=CODE&state=${session}`
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/html/);
    const html = await res.text();
    expect(html).toMatch(/you can close this window/i);

    // Token is now in the session under "complete".
    const raw = await env.SCRIPT_CACHE.get(`cli_session:${session}`);
    expect(raw).not.toBeNull();
    const session_obj = JSON.parse(raw!);
    expect(session_obj.status).toBe("complete");
    expect(session_obj.token).toMatch(/^[0-9A-Za-z]{32}$/);

    // The token resolves to a user whose github_id is "7777".
    const u = await env.DB
      .prepare("SELECT github_id FROM users WHERE id = (SELECT user_id FROM api_tokens WHERE token_hash = ?)")
      .bind(await crypto.subtle
        .digest("SHA-256", new TextEncoder().encode(session_obj.token))
        .then((b) =>
          [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("")
        ))
      .first<{ github_id: string }>();
    expect(u?.github_id).toBe("7777");
  });

  it("400 on unknown session", async () => {
    installGithubFetchStub((url) => {
      if (url.startsWith("https://github.com/login/oauth/access_token")) {
        return new Response(JSON.stringify({ access_token: "x" }), {
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ id: 1 }), {
        headers: { "content-type": "application/json" },
      });
    });
    const res = await SELF.fetch(
      "http://x/auth/github/callback?code=CODE&state=nope"
    );
    expect(res.status).toBe(400);
  });

  it("400 when code is missing", async () => {
    const session = await openSession();
    const res = await SELF.fetch(
      `http://x/auth/github/callback?state=${session}`
    );
    expect(res.status).toBe(400);
  });
});
