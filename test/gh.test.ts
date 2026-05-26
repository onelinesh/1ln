import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { SELF } from "cloudflare:test";

// Build a lightweight fetch mock for outbound calls made by the Worker
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

function intercept(ghPath: string, status: number, body: string, etag?: string) {
  const url = `https://raw.githubusercontent.com${ghPath}`;
  fakeResponses.set(url, { status, body, etag });
}

beforeEach(() => {
  fakeResponses = new Map();
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GET /gh/...", () => {
  it("serves raw script as text/plain for explicit path + ref", async () => {
    intercept("/cli/cli/main/install.sh", 200, "echo gh install");
    const res = await SELF.fetch("http://x/gh/cli/cli@main/install.sh");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/plain/);
    expect(await res.text()).toBe("echo gh install");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("default repo (no ref, no path) resolves to main/install.sh", async () => {
    intercept("/gh1/bar1/main/install.sh", 200, "default");
    const res = await SELF.fetch("http://x/gh/gh1/bar1");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("default");
  });

  it("returns 400 for invalid gh path", async () => {
    const res = await SELF.fetch("http://x/gh/foo");
    expect(res.status).toBe(400);
  });

  it("returns 404 when nothing on GitHub matches", async () => {
    for (const ref of ["main", "master"]) {
      for (const path of ["install.sh", "setup.sh", "get.sh"]) {
        intercept(`/missing/repo404/${ref}/${path}`, 404, "Not Found");
      }
    }
    const res = await SELF.fetch("http://x/gh/missing/repo404");
    expect(res.status).toBe(404);
  });

  it("?meta returns JSON with source=github_proxy", async () => {
    intercept("/gh2/bar2/main/install.sh", 200, "echo meta");
    const res = await SELF.fetch("http://x/gh/gh2/bar2?meta");
    expect(res.status).toBe(200);
    const json: any = await res.json();
    expect(json.source).toBe("github_proxy");
    expect(json.source_url).toBe("https://raw.githubusercontent.com/gh2/bar2/main/install.sh");
    expect(json.content).toBe("echo meta");
  });

  it("?view returns HTML preview with source link + branch warning", async () => {
    intercept("/gh3/bar3/main/install.sh", 200, "echo preview");
    const res = await SELF.fetch("http://x/gh/gh3/bar3?view");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/html/);
    const html = await res.text();
    expect(html).toContain("preview");
    expect(html).toContain("raw.githubusercontent.com/gh3/bar3/main/install.sh");
    expect(html).toContain("can change"); // the branch-ref warning (in title attribute)
  });

  it("?view with SHA ref shows no warning", async () => {
    const sha = "a".repeat(40);
    intercept(`/gh4/bar4/${sha}/install.sh`, 200, "echo sha");
    const res = await SELF.fetch(`http://x/gh/gh4/bar4@${sha}?view`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).not.toContain("can change");
  });

  it("?view on a branch ref shows an amber 'Following: <ref>' chip", async () => {
    intercept("/foo/bar/main/install.sh", 200, "echo polished");
    const res = await SELF.fetch("http://x/gh/foo/bar?view");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('class="chip accent"');
    expect(html).toMatch(/Following/i);
    expect(html).toContain("main");
    expect(html).toContain('class="copy-btn"');
    expect(html).toContain('class="sh-keyword"');
  });

  it("?view on a SHA ref shows a 'Pinned' chip and no branch warning", async () => {
    const sha = "a".repeat(40);
    intercept(`/foo/bar/${sha}/install.sh`, 200, "echo sha");
    const res = await SELF.fetch(`http://x/gh/foo/bar@${sha}?view`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toMatch(/Pinned/);
    expect(html).not.toMatch(/Following/);
  });
});
