import { describe, it, expect, vi } from "vitest";
import { publishScript } from "../src/publish";

describe("publishScript", () => {
  it("posts to /api/scripts and returns one-liner + url + slug + delete_token", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe("https://1ln.sh/api/scripts");
      expect(init?.method).toBe("POST");
      const body = JSON.parse(String(init?.body ?? "{}"));
      expect(body).toEqual({ content: "echo hi", visibility: "private", expires: "24h" });
      return new Response(JSON.stringify({
        slug: "abc",
        url: "https://1ln.sh/abc",
        oneliner: "curl 1ln.sh/abc | sh",
        delete_token: "T0K3N",
      }), { status: 201, headers: { "content-type": "application/json" } });
    });

    const result = await publishScript(
      { fetch: fetchMock as any, baseUrl: "https://1ln.sh" },
      { content: "echo hi", visibility: "private", expires: "24h" }
    );
    expect(result.one_liner).toBe("curl 1ln.sh/abc | sh");
    expect(result.url).toBe("https://1ln.sh/abc");
    expect(result.slug).toBe("abc");
    expect(result.delete_token).toBe("T0K3N");
  });

  it("defaults visibility to private and expires to 24h", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}"));
      expect(body.visibility).toBe("private");
      expect(body.expires).toBe("24h");
      return new Response(JSON.stringify({
        slug: "xyz",
        url: "https://1ln.sh/xyz",
        oneliner: "curl 1ln.sh/xyz | sh",
        delete_token: "tok",
      }), { status: 201 });
    });
    await publishScript({ fetch: fetchMock as any, baseUrl: "https://1ln.sh" }, { content: "x" });
  });

  it("uses custom baseUrl", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe("http://localhost:8787/api/scripts");
      return new Response(JSON.stringify({
        slug: "a", url: "http://localhost:8787/a", oneliner: "curl localhost:8787/a | sh", delete_token: "t",
      }), { status: 201 });
    });
    await publishScript({ fetch: fetchMock as any, baseUrl: "http://localhost:8787" }, { content: "x" });
  });

  it("throws on non-201 response with status + body", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ error: "rate limit exceeded" }), { status: 429 })
    );
    await expect(
      publishScript({ fetch: fetchMock as any, baseUrl: "https://1ln.sh" }, { content: "x" })
    ).rejects.toThrow(/429.*rate limit/);
  });
});
