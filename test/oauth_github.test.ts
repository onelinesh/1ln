import { describe, it, expect } from "vitest";
import {
  buildAuthorizeUrl,
  exchangeCode,
  fetchGithubUserId,
} from "../src/oauth_github";

describe("buildAuthorizeUrl", () => {
  it("builds a github.com authorize URL with read:user scope and state", () => {
    const u = new URL(
      buildAuthorizeUrl({
        clientId: "abc",
        redirectUri: "https://1ln.sh/auth/github/callback",
        state: "STATE123",
      })
    );
    expect(u.origin).toBe("https://github.com");
    expect(u.pathname).toBe("/login/oauth/authorize");
    expect(u.searchParams.get("client_id")).toBe("abc");
    expect(u.searchParams.get("redirect_uri")).toBe("https://1ln.sh/auth/github/callback");
    expect(u.searchParams.get("scope")).toBe("read:user");
    expect(u.searchParams.get("state")).toBe("STATE123");
    expect(u.searchParams.get("allow_signup")).toBe("true");
  });
});

describe("exchangeCode", () => {
  it("POSTs to github with form body and Accept: application/json", async () => {
    let seenUrl = "";
    let seenInit: RequestInit | undefined;
    const fakeFetch: typeof fetch = async (input: any, init?: RequestInit) => {
      seenUrl = typeof input === "string" ? input : input.url;
      seenInit = init;
      return new Response(JSON.stringify({ access_token: "ghu_x" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    const t = await exchangeCode({
      clientId: "abc",
      clientSecret: "shh",
      code: "CODE",
      redirectUri: "https://1ln.sh/auth/github/callback",
      fetch: fakeFetch,
    });
    expect(t).toBe("ghu_x");
    expect(seenUrl).toBe("https://github.com/login/oauth/access_token");
    expect((seenInit?.headers as any).accept).toBe("application/json");
    const body = seenInit?.body as string;
    expect(body).toContain("client_id=abc");
    expect(body).toContain("client_secret=shh");
    expect(body).toContain("code=CODE");
  });

  it("throws on non-200", async () => {
    const fakeFetch: typeof fetch = async () =>
      new Response("nope", { status: 400 });
    await expect(
      exchangeCode({
        clientId: "", clientSecret: "", code: "", redirectUri: "",
        fetch: fakeFetch,
      })
    ).rejects.toThrow(/github exchange.*400/i);
  });

  it("throws when github returns an error body (200)", async () => {
    const fakeFetch: typeof fetch = async () =>
      new Response(JSON.stringify({ error: "bad_verification_code" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    await expect(
      exchangeCode({
        clientId: "", clientSecret: "", code: "", redirectUri: "",
        fetch: fakeFetch,
      })
    ).rejects.toThrow(/bad_verification_code/);
  });
});

describe("fetchGithubUserId", () => {
  it("calls /user with bearer and returns the numeric id as string", async () => {
    let seenAuth = "";
    let seenUA = "";
    const fakeFetch: typeof fetch = async (_input, init) => {
      seenAuth = ((init?.headers as any) ?? {}).authorization;
      seenUA = ((init?.headers as any) ?? {})["user-agent"];
      return new Response(JSON.stringify({ id: 42 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    const id = await fetchGithubUserId({ accessToken: "ghu_x", fetch: fakeFetch });
    expect(id).toBe("42");
    expect(seenAuth).toBe("Bearer ghu_x");
    expect(seenUA).toBe("1ln.sh");
  });

  it("throws when /user does not return a numeric id", async () => {
    const fakeFetch: typeof fetch = async () =>
      new Response(JSON.stringify({}), { status: 200 });
    await expect(
      fetchGithubUserId({ accessToken: "x", fetch: fakeFetch })
    ).rejects.toThrow(/no id/i);
  });
});
