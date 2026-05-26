import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { env } from "cloudflare:test";
import { resolveGhContent, GhNotFoundError } from "../src/github";

// Build a lightweight fetch mock: a map from URL string → { status, body, etag }
type FakeFetchEntry = { status: number; body: string; etag?: string };
let fakeResponses: Map<string, FakeFetchEntry>;

function mockFetch(url: string | URL | Request, _init?: RequestInit): Promise<Response> {
  const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : (url as Request).url;
  const entry = fakeResponses.get(urlStr);
  if (!entry) {
    throw new Error(`[fetchMock] Unexpected fetch to: ${urlStr}`);
  }
  const headers: Record<string, string> = {};
  if (entry.etag) headers["etag"] = entry.etag;
  return Promise.resolve(new Response(entry.body, { status: entry.status, headers }));
}

function intercept(path: string, status: number, body: string, etag?: string) {
  const url = `https://raw.githubusercontent.com${path}`;
  fakeResponses.set(url, { status, body, etag });
}

beforeEach(() => {
  fakeResponses = new Map();
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolveGhContent", () => {
  it("fetches explicit path with explicit ref", async () => {
    // Use unique user/repo to avoid KV cross-test contamination
    intercept("/u1/r1/main/install.sh", 200, "echo hi", '"abc"');

    const r = await resolveGhContent(env, {
      user: "u1", repo: "r1", ref: "main", path: "install.sh",
    });
    expect(r.content).toBe("echo hi");
    expect(r.sourceUrl).toBe("https://raw.githubusercontent.com/u1/r1/main/install.sh");
  });

  it("probes install.sh → setup.sh when install.sh is 404", async () => {
    intercept("/u2/r2/main/install.sh", 404, "Not Found");
    intercept("/u2/r2/main/setup.sh", 200, "echo setup");

    const r = await resolveGhContent(env, {
      user: "u2", repo: "r2", ref: "main", path: null,
    });
    expect(r.content).toBe("echo setup");
  });

  it("falls back from main to master when main is 404", async () => {
    intercept("/u3/r3/main/install.sh", 404, "Not Found");
    intercept("/u3/r3/main/setup.sh", 404, "Not Found");
    intercept("/u3/r3/main/get.sh", 404, "Not Found");
    intercept("/u3/r3/master/install.sh", 200, "echo master-install");

    const r = await resolveGhContent(env, {
      user: "u3", repo: "r3", ref: null, path: null,
    });
    expect(r.content).toBe("echo master-install");
  });

  it("throws GhNotFoundError when nothing resolves", async () => {
    for (const ref of ["main", "master"]) {
      for (const path of ["install.sh", "setup.sh", "get.sh"]) {
        intercept(`/u4/r4/${ref}/${path}`, 404, "Not Found");
      }
    }
    await expect(
      resolveGhContent(env, { user: "u4", repo: "r4", ref: null, path: null })
    ).rejects.toBeInstanceOf(GhNotFoundError);
  });

  it("returns cached body on KV hit without calling fetch", async () => {
    // Pre-warm KV.
    const sourceUrl = "https://raw.githubusercontent.com/u5/r5/main/install.sh";
    const cacheKey = `gh:u5/r5/main/install.sh`;
    await env.SCRIPT_CACHE.put(cacheKey, JSON.stringify({
      content: "cached-content",
      sourceUrl,
      etag: '"cached-etag"',
    }));
    // No intercept registered → if fetch is called, test will throw "Unexpected fetch".
    const r = await resolveGhContent(env, {
      user: "u5", repo: "r5", ref: "main", path: "install.sh",
    });
    expect(r.content).toBe("cached-content");
    expect(r.cacheStatus).toBe("hit");
  });

  it("SHA ref triggers long TTL cache (1 year)", async () => {
    const sha = "a".repeat(40);
    intercept(`/u6/r6/${sha}/install.sh`, 200, "sha-pinned", '"sha-etag"');
    const r = await resolveGhContent(env, {
      user: "u6", repo: "r6", ref: sha, path: "install.sh",
    });
    expect(r.content).toBe("sha-pinned");
    // Spot-check KV stored a value (test the side effect via re-read).
    const stored = await env.SCRIPT_CACHE.get(`gh:u6/r6/${sha}/install.sh`);
    expect(stored).not.toBeNull();
  });
});
