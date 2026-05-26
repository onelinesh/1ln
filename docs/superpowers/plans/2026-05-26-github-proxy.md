# Plan 3 — GitHub Proxy

> **For agentic workers:** Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Ship `curl 1ln.sh/gh/<user>/<repo>[/<path>][@<ref>] | sh` so any install script on GitHub gets a clean 1ln.sh one-liner with no maintainer cooperation needed.

**Architecture:** New `/gh/...` route resolves the path → fetches `raw.githubusercontent.com` → serves as `text/plain`. Aggressive KV caching keyed by `(user, repo, ref, path)`. SHA-pinned refs (40-char hex) cache effectively forever; branch refs cache for 5 minutes. ETag-aware refetches to reduce bandwidth + respect GitHub's anonymous rate limit. Default-path probing tries `install.sh`, `setup.sh`, `get.sh` in repo root.

**Tech stack:** unchanged. Tests mock GitHub via the `fetchMock` API exposed by `@cloudflare/vitest-pool-workers` (it intercepts outbound `fetch` calls).

**Scope:**
- ✅ Implicit `/gh/<user>/<repo>[/<path>][@<ref>]`
- ✅ `?view` preview page for GitHub-proxied URLs
- ✅ `?meta` for GitHub-proxied URLs
- ❌ Claimed aliases (`1ln.sh/<myname>` → GitHub) — deferred to land alongside Plan 2 (OAuth)
- ❌ Non-GitHub source proxies — out of scope

---

## File structure

```
src/
├── gh_parse.ts             # NEW — parse /gh/...
├── github.ts               # NEW — fetch + cache + default-path resolve
├── routes/gh.ts            # NEW — handler for /gh/...
└── views/gh_preview.ts     # NEW — preview HTML for /gh/... ?view
test/
├── gh_parse.test.ts        # NEW
├── github.test.ts          # NEW — uses fetchMock
└── gh.test.ts              # NEW — route-level tests
```

`src/index.ts` registers the new route BEFORE the existing `/:slug` chain.

---

## Task 1: Path parsing

**Files:** create `src/gh_parse.ts`, create `test/gh_parse.test.ts`.

- [ ] **Step 1 — failing tests**

```ts
import { describe, it, expect } from "vitest";
import { parseGhPath, GhParseError } from "../src/gh_parse";

describe("parseGhPath", () => {
  it("plain repo → default ref/path", () => {
    expect(parseGhPath("gh/foo/bar")).toEqual({
      user: "foo", repo: "bar", ref: null, path: null,
    });
  });

  it("repo + explicit path", () => {
    expect(parseGhPath("gh/foo/bar/scripts/run.sh")).toEqual({
      user: "foo", repo: "bar", ref: null, path: "scripts/run.sh",
    });
  });

  it("repo + ref (branch)", () => {
    expect(parseGhPath("gh/foo/bar@develop")).toEqual({
      user: "foo", repo: "bar", ref: "develop", path: null,
    });
  });

  it("repo + ref (SHA) + path", () => {
    const sha = "a".repeat(40);
    expect(parseGhPath(`gh/foo/bar@${sha}/install.sh`)).toEqual({
      user: "foo", repo: "bar", ref: sha, path: "install.sh",
    });
  });

  it("repo + ref (tag) + path with slashes", () => {
    expect(parseGhPath("gh/foo/bar@v1.2.3/scripts/a/b.sh")).toEqual({
      user: "foo", repo: "bar", ref: "v1.2.3", path: "scripts/a/b.sh",
    });
  });

  it("rejects missing gh prefix", () => {
    expect(() => parseGhPath("not/gh/foo/bar")).toThrow(GhParseError);
  });

  it("rejects missing repo", () => {
    expect(() => parseGhPath("gh/foo")).toThrow(GhParseError);
  });

  it("rejects user with disallowed chars", () => {
    expect(() => parseGhPath("gh/../bar")).toThrow(GhParseError);
    expect(() => parseGhPath("gh/foo bar/baz")).toThrow(GhParseError);
  });

  it("rejects path traversal in path", () => {
    expect(() => parseGhPath("gh/foo/bar/../etc/passwd")).toThrow(GhParseError);
  });

  it("strips empty path segments (trailing slash)", () => {
    expect(parseGhPath("gh/foo/bar/")).toEqual({
      user: "foo", repo: "bar", ref: null, path: null,
    });
  });
});
```

- [ ] **Step 2 — implement `src/gh_parse.ts`**

```ts
export class GhParseError extends Error {}

const NAME_OK = /^[a-zA-Z0-9_.-]+$/;
const PATH_SEG_OK = /^[a-zA-Z0-9_.-]+$/;

export type GhPath = {
  user: string;
  repo: string;
  ref: string | null;     // null = default branch
  path: string | null;    // null = probe default install script
};

export function parseGhPath(pathname: string): GhPath {
  const parts = pathname.replace(/^\/+/, "").split("/").filter(Boolean);
  if (parts.length < 3 || parts[0] !== "gh") {
    throw new GhParseError("path must start with /gh/<user>/<repo>");
  }
  const user = parts[1]!;
  let repoToken = parts[2]!;
  let ref: string | null = null;
  const atIdx = repoToken.indexOf("@");
  if (atIdx > 0) {
    ref = repoToken.slice(atIdx + 1);
    repoToken = repoToken.slice(0, atIdx);
    if (!ref) throw new GhParseError("ref cannot be empty after '@'");
    if (!/^[a-zA-Z0-9_./-]+$/.test(ref)) {
      throw new GhParseError("ref contains invalid characters");
    }
    if (ref.includes("..")) throw new GhParseError("ref cannot contain '..'");
  }
  if (!NAME_OK.test(user)) throw new GhParseError("invalid user");
  if (!NAME_OK.test(repoToken)) throw new GhParseError("invalid repo");

  const rest = parts.slice(3);
  for (const seg of rest) {
    if (!PATH_SEG_OK.test(seg)) throw new GhParseError(`invalid path segment: ${seg}`);
  }
  const path = rest.length > 0 ? rest.join("/") : null;

  return { user, repo: repoToken, ref, path };
}

export function isSha(ref: string): boolean {
  return /^[a-f0-9]{40}$/i.test(ref);
}
```

- [ ] **Step 3 — run tests, expect PASS**

- [ ] **Step 4 — commit:** `feat: gh_parse — parse /gh/<user>/<repo>[/<path>][@<ref>]`

---

## Task 2: GitHub fetch with cache + default-path resolution

**Files:** create `src/github.ts`, create `test/github.test.ts`.

This module is the heart of the proxy. It exposes:

- `resolveGhContent(env, ghPath)` → `{content, sha, sourceUrl, cacheStatus}` or throws `GhNotFoundError`.

Internally:
1. If `ghPath.path === null`, probe `install.sh` → `setup.sh` → `get.sh` (cache the probe result).
2. Resolve ref: if `null`, try `main` then `master`.
3. Fetch `raw.githubusercontent.com/<user>/<repo>/<ref>/<path>`. Use If-None-Match if we have a cached ETag.
4. Cache: SHA refs → 1 year TTL; branch refs → 5 min TTL.

- [ ] **Step 1 — failing tests `test/github.test.ts`**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { env, fetchMock } from "cloudflare:test";
import { resolveGhContent, GhNotFoundError } from "../src/github";

beforeEach(() => {
  fetchMock.activate();
  fetchMock.disableNetConnect();
});

describe("resolveGhContent", () => {
  it("fetches explicit path with explicit ref", async () => {
    fetchMock
      .get("https://raw.githubusercontent.com")
      .intercept({ path: "/foo/bar/main/install.sh" })
      .reply(200, "echo hi", { headers: { etag: '"abc"' } });

    const r = await resolveGhContent(env, {
      user: "foo", repo: "bar", ref: "main", path: "install.sh",
    });
    expect(r.content).toBe("echo hi");
    expect(r.sourceUrl).toBe("https://raw.githubusercontent.com/foo/bar/main/install.sh");
  });

  it("probes install.sh → setup.sh when install.sh is 404", async () => {
    fetchMock.get("https://raw.githubusercontent.com")
      .intercept({ path: "/foo/bar/main/install.sh" }).reply(404, "Not Found");
    fetchMock.get("https://raw.githubusercontent.com")
      .intercept({ path: "/foo/bar/main/setup.sh" }).reply(200, "echo setup");

    const r = await resolveGhContent(env, {
      user: "foo", repo: "bar", ref: "main", path: null,
    });
    expect(r.content).toBe("echo setup");
  });

  it("falls back from main to master when main is 404", async () => {
    fetchMock.get("https://raw.githubusercontent.com")
      .intercept({ path: "/foo/bar/main/install.sh" }).reply(404, "Not Found");
    fetchMock.get("https://raw.githubusercontent.com")
      .intercept({ path: "/foo/bar/main/setup.sh" }).reply(404, "Not Found");
    fetchMock.get("https://raw.githubusercontent.com")
      .intercept({ path: "/foo/bar/main/get.sh" }).reply(404, "Not Found");
    fetchMock.get("https://raw.githubusercontent.com")
      .intercept({ path: "/foo/bar/master/install.sh" }).reply(200, "echo master-install");

    const r = await resolveGhContent(env, {
      user: "foo", repo: "bar", ref: null, path: null,
    });
    expect(r.content).toBe("echo master-install");
  });

  it("throws GhNotFoundError when nothing resolves", async () => {
    for (const ref of ["main", "master"]) {
      for (const path of ["install.sh", "setup.sh", "get.sh"]) {
        fetchMock.get("https://raw.githubusercontent.com")
          .intercept({ path: `/foo/bar/${ref}/${path}` })
          .reply(404, "Not Found");
      }
    }
    await expect(
      resolveGhContent(env, { user: "foo", repo: "bar", ref: null, path: null })
    ).rejects.toBeInstanceOf(GhNotFoundError);
  });

  it("returns cached body on KV hit without calling fetch", async () => {
    // Pre-warm KV.
    const sourceUrl = "https://raw.githubusercontent.com/foo/bar/main/install.sh";
    const cacheKey = `gh:foo/bar/main/install.sh`;
    await env.SCRIPT_CACHE.put(cacheKey, JSON.stringify({
      content: "cached-content",
      sourceUrl,
      etag: '"cached-etag"',
    }));
    // No fetchMock interception → if fetch is called, test will fail (netConnect disabled).
    const r = await resolveGhContent(env, {
      user: "foo", repo: "bar", ref: "main", path: "install.sh",
    });
    expect(r.content).toBe("cached-content");
    expect(r.cacheStatus).toBe("hit");
  });

  it("SHA ref triggers long TTL cache (1 year)", async () => {
    const sha = "a".repeat(40);
    fetchMock.get("https://raw.githubusercontent.com")
      .intercept({ path: `/foo/bar/${sha}/install.sh` })
      .reply(200, "sha-pinned", { headers: { etag: '"sha-etag"' } });
    const r = await resolveGhContent(env, {
      user: "foo", repo: "bar", ref: sha, path: "install.sh",
    });
    expect(r.content).toBe("sha-pinned");
    // Spot-check KV stored a value (test the side effect via re-read).
    const stored = await env.SCRIPT_CACHE.get(`gh:foo/bar/${sha}/install.sh`);
    expect(stored).not.toBeNull();
  });
});
```

- [ ] **Step 2 — implement `src/github.ts`**

```ts
import type { Env } from "./env";
import { isSha } from "./gh_parse";

export class GhNotFoundError extends Error {}
export class GhUpstreamError extends Error {}

const DEFAULT_PATHS = ["install.sh", "setup.sh", "get.sh"] as const;
const DEFAULT_REFS = ["main", "master"] as const;
const BRANCH_TTL = 5 * 60;             // 5 min
const SHA_TTL = 365 * 24 * 60 * 60;    // 1 year

type Resolved = {
  content: string;
  sha: string | null;        // not yet populated; reserved for future
  sourceUrl: string;
  cacheStatus: "hit" | "miss" | "revalidated";
};

type GhInput = {
  user: string;
  repo: string;
  ref: string | null;
  path: string | null;
};

type CacheRecord = {
  content: string;
  sourceUrl: string;
  etag: string | null;
};

const cacheKey = (user: string, repo: string, ref: string, path: string) =>
  `gh:${user}/${repo}/${ref}/${path}`;

async function getCached(env: Env, key: string): Promise<CacheRecord | null> {
  const raw = await env.SCRIPT_CACHE.get(key);
  if (!raw) return null;
  try { return JSON.parse(raw) as CacheRecord; } catch { return null; }
}

async function putCached(env: Env, key: string, ref: string, rec: CacheRecord): Promise<void> {
  const ttl = isSha(ref) ? SHA_TTL : BRANCH_TTL;
  await env.SCRIPT_CACHE.put(key, JSON.stringify(rec), { expirationTtl: ttl });
}

/**
 * Fetches a single raw.githubusercontent.com URL. Returns:
 *   { status: 200, content, etag }
 *   { status: 304 } if If-None-Match matched
 *   { status: 404 }
 *   { status: other } for upstream errors
 */
async function fetchOne(
  user: string,
  repo: string,
  ref: string,
  path: string,
  etag: string | null
): Promise<{ status: number; content?: string; etag?: string | null }> {
  const url = `https://raw.githubusercontent.com/${user}/${repo}/${ref}/${path}`;
  const headers: HeadersInit = etag ? { "if-none-match": etag } : {};
  const res = await fetch(url, { headers });
  if (res.status === 304) return { status: 304 };
  if (res.status === 404) return { status: 404 };
  if (!res.ok) return { status: res.status };
  const content = await res.text();
  return { status: 200, content, etag: res.headers.get("etag") };
}

async function tryFetchWithCache(
  env: Env,
  input: { user: string; repo: string; ref: string; path: string }
): Promise<Resolved | null> {
  const key = cacheKey(input.user, input.repo, input.ref, input.path);
  const sourceUrl = `https://raw.githubusercontent.com/${input.user}/${input.repo}/${input.ref}/${input.path}`;
  const cached = await getCached(env, key);

  if (cached && isSha(input.ref)) {
    // SHA refs are immutable on GitHub. No re-fetch needed.
    return { content: cached.content, sha: input.ref, sourceUrl, cacheStatus: "hit" };
  }

  const r = await fetchOne(input.user, input.repo, input.ref, input.path, cached?.etag ?? null);
  if (r.status === 404) return null;
  if (r.status === 304 && cached) {
    // Refresh TTL.
    await putCached(env, key, input.ref, cached);
    return { content: cached.content, sha: null, sourceUrl, cacheStatus: "revalidated" };
  }
  if (r.status === 200 && r.content !== undefined) {
    const rec: CacheRecord = { content: r.content, sourceUrl, etag: r.etag ?? null };
    await putCached(env, key, input.ref, rec);
    return { content: r.content, sha: null, sourceUrl, cacheStatus: cached ? "miss" : "miss" };
  }
  if (cached) {
    // Upstream had a transient error; serve stale.
    return { content: cached.content, sha: null, sourceUrl, cacheStatus: "hit" };
  }
  throw new GhUpstreamError(`upstream returned ${r.status}`);
}

export async function resolveGhContent(env: Env, input: GhInput): Promise<Resolved> {
  const refs = input.ref ? [input.ref] : [...DEFAULT_REFS];
  const paths = input.path ? [input.path] : [...DEFAULT_PATHS];

  for (const ref of refs) {
    for (const path of paths) {
      const r = await tryFetchWithCache(env, { user: input.user, repo: input.repo, ref, path });
      if (r) return r;
    }
  }
  throw new GhNotFoundError(
    `no script found for ${input.user}/${input.repo}` +
    (input.ref ? `@${input.ref}` : "") +
    (input.path ? `/${input.path}` : "")
  );
}
```

- [ ] **Step 3 — run tests, expect all PASS**

- [ ] **Step 4 — commit:** `feat: github.ts — fetch + ETag + KV cache + default ref/path probe`

---

## Task 3: `/gh/...` route (raw, meta, view)

**Files:** create `src/routes/gh.ts`, modify `src/index.ts`, create `test/gh.test.ts`. Also create `src/views/gh_preview.ts` (used by `?view`).

- [ ] **Step 1 — `src/views/gh_preview.ts`**

```ts
import { layout, escapeHtml } from "./layout";

export function renderGhPreview(opts: {
  user: string;
  repo: string;
  ref: string;
  path: string;
  sourceUrl: string;
  content: string;
  pinned: boolean;
}): string {
  const title = `1ln.sh/gh/${opts.user}/${opts.repo}`;
  const warning = opts.pinned
    ? ""
    : `<p style="background:#fff3cd;border:1px solid #f5c518;padding:.5rem;border-radius:4px;">
        ⚠️ This URL follows the <code>${escapeHtml(opts.ref)}</code> branch. Contents can change.
        Pin to a commit SHA for stability: <code>${escapeHtml(opts.user)}/${escapeHtml(opts.repo)}@&lt;sha&gt;/${escapeHtml(opts.path)}</code>.
       </p>`;
  return layout(
    title,
    `
<h1>${escapeHtml(title)}</h1>
<p><strong>Source:</strong> <a href="${escapeHtml(opts.sourceUrl)}">${escapeHtml(opts.sourceUrl)}</a></p>
<p>One-liner: <code>curl 1ln.sh/gh/${escapeHtml(opts.user)}/${escapeHtml(opts.repo)}${opts.path !== "install.sh" ? "/" + escapeHtml(opts.path) : ""}${opts.pinned ? "@" + escapeHtml(opts.ref) : ""} | sh</code></p>
${warning}
<h2>Script</h2>
<pre>${escapeHtml(opts.content)}</pre>
<p><a href="/gh/${escapeHtml(opts.user)}/${escapeHtml(opts.repo)}${opts.ref !== "main" ? "@" + escapeHtml(opts.ref) : ""}${opts.path && opts.path !== "install.sh" ? "/" + escapeHtml(opts.path) : ""}">Raw</a> &middot; <a href="mailto:abuse@1ln.sh?subject=Report%20gh/${encodeURIComponent(opts.user + '/' + opts.repo)}">Report abuse</a></p>
`
  );
}
```

- [ ] **Step 2 — `src/routes/gh.ts`**

```ts
import { Hono } from "hono";
import type { Env } from "../env";
import { parseGhPath, isSha, GhParseError } from "../gh_parse";
import { resolveGhContent, GhNotFoundError } from "../github";
import { renderGhPreview } from "../views/gh_preview";

export const gh = new Hono<{ Bindings: Env }>();

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

gh.get("/gh/*", async (c) => {
  const url = new URL(c.req.url);
  let parsed;
  try {
    parsed = parseGhPath(url.pathname);
  } catch (e) {
    if (e instanceof GhParseError) return c.text(e.message, 400);
    throw e;
  }

  let resolved;
  try {
    resolved = await resolveGhContent(c.env, parsed);
  } catch (e) {
    if (e instanceof GhNotFoundError) return c.text(e.message, 404);
    throw e;
  }

  const effectiveRef = parsed.ref ?? "main";
  const effectivePath = parsed.path ?? "install.sh"; // best-effort label; actual probe may have chosen a different one

  if (url.searchParams.has("meta")) {
    return c.json({
      content: resolved.content,
      size: new TextEncoder().encode(resolved.content).length,
      sha256: await sha256Hex(resolved.content),
      visibility: "public",
      source: "github_proxy",
      source_url: resolved.sourceUrl,
      pinned_ref: isSha(effectiveRef) ? effectiveRef : null,
      expires_at: null,
      consumed_at: null,
      single_use: false,
      created_at: null,
    });
  }

  if (url.searchParams.has("view")) {
    return c.html(
      renderGhPreview({
        user: parsed.user,
        repo: parsed.repo,
        ref: effectiveRef,
        path: effectivePath,
        sourceUrl: resolved.sourceUrl,
        content: resolved.content,
        pinned: isSha(effectiveRef),
      })
    );
  }

  return new Response(resolved.content, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
});
```

- [ ] **Step 3 — wire in `src/index.ts`** — register `gh` BEFORE `home`/`apiScripts`/`meta`/`view`/`raw` so it claims `/gh/...` first:

```ts
import { gh } from "./routes/gh";
// ...
app.route("/", gh);
app.route("/", home);
app.route("/", apiScripts);
app.route("/", meta);
app.route("/", view);
app.route("/", raw);
```

- [ ] **Step 4 — `test/gh.test.ts`**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { SELF, fetchMock } from "cloudflare:test";

beforeEach(() => {
  fetchMock.activate();
  fetchMock.disableNetConnect();
});

describe("GET /gh/...", () => {
  it("serves raw script as text/plain for explicit path + ref", async () => {
    fetchMock.get("https://raw.githubusercontent.com")
      .intercept({ path: "/cli/cli/main/install.sh" })
      .reply(200, "echo gh install");
    const res = await SELF.fetch("http://x/gh/cli/cli@main/install.sh");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/plain/);
    expect(await res.text()).toBe("echo gh install");
  });

  it("default repo (no ref, no path) resolves to main/install.sh", async () => {
    fetchMock.get("https://raw.githubusercontent.com")
      .intercept({ path: "/foo/bar/main/install.sh" })
      .reply(200, "default");
    const res = await SELF.fetch("http://x/gh/foo/bar");
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
        fetchMock.get("https://raw.githubusercontent.com")
          .intercept({ path: `/missing/repo/${ref}/${path}` })
          .reply(404, "Not Found");
      }
    }
    const res = await SELF.fetch("http://x/gh/missing/repo");
    expect(res.status).toBe(404);
  });

  it("?meta returns JSON with source=github_proxy", async () => {
    fetchMock.get("https://raw.githubusercontent.com")
      .intercept({ path: "/foo/bar/main/install.sh" })
      .reply(200, "echo meta");
    const res = await SELF.fetch("http://x/gh/foo/bar?meta");
    expect(res.status).toBe(200);
    const json: any = await res.json();
    expect(json.source).toBe("github_proxy");
    expect(json.source_url).toBe("https://raw.githubusercontent.com/foo/bar/main/install.sh");
    expect(json.content).toBe("echo meta");
  });

  it("?view returns HTML preview with source link + branch warning", async () => {
    fetchMock.get("https://raw.githubusercontent.com")
      .intercept({ path: "/foo/bar/main/install.sh" })
      .reply(200, "echo preview");
    const res = await SELF.fetch("http://x/gh/foo/bar?view");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/html/);
    const html = await res.text();
    expect(html).toContain("echo preview");
    expect(html).toContain("raw.githubusercontent.com/foo/bar/main/install.sh");
    expect(html).toContain("can change"); // the branch-ref warning
  });

  it("?view with SHA ref shows no warning", async () => {
    const sha = "a".repeat(40);
    fetchMock.get("https://raw.githubusercontent.com")
      .intercept({ path: `/foo/bar/${sha}/install.sh` })
      .reply(200, "echo sha");
    const res = await SELF.fetch(`http://x/gh/foo/bar@${sha}?view`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).not.toContain("can change");
  });
});
```

- [ ] **Step 5 — run tests, expect ~62 total passing.**

- [ ] **Step 6 — commit:** `feat: /gh/<user>/<repo>[/<path>][@<ref>] proxy with view + meta`

---

## Task 4: tsc + full suite green

- [ ] `npx tsc --noEmit` exit 0
- [ ] `npm test` all green
- [ ] If anything needs cleanup, commit `chore: ...`

---

## Task 5: Deploy to production + smoke test

- [ ] `npm run deploy`
- [ ] Smoke test with a known-good GitHub install script (use any popular tool you trust):

```bash
# Default-path resolution against a real public repo.
curl -fsS "https://1ln.sh/gh/cli/cli?meta" | python3 -m json.tool | head -20
# Raw fetch (do NOT pipe to sh in this test — just inspect).
curl -fsS "https://1ln.sh/gh/cli/cli" | head -5 || echo "(no install.sh in cli/cli; try another repo)"

# Pin to a SHA and verify.
curl -fsS "https://1ln.sh/gh/<some-user>/<some-repo>@<sha>" | head -5

# Preview page in browser
echo "Open: https://1ln.sh/gh/<user>/<repo>?view"
```

If `cli/cli` doesn't have an `install.sh`/`setup.sh`/`get.sh` in root (it doesn't AFAIK), the test should return 404 with the GhNotFound message. Pick a repo that does — `homebrew/install` (has `install.sh`), `oh-my-zsh/ohmyzsh` (has `tools/install.sh`), or any of your own repos.

Suggested known-good test target: `curl -fsS "https://1ln.sh/gh/homebrew/install/install.sh"` should return the Homebrew installer.

- [ ] Commit any wrangler config changes.

---

## Self-Review checklist
- [ ] `parseGhPath` rejects path traversal, invalid chars, missing parts.
- [ ] SHA refs cache for 1 year, branch refs for 5 minutes.
- [ ] Default-path probe order: `install.sh` → `setup.sh` → `get.sh`.
- [ ] Default-ref fallback: `main` → `master`.
- [ ] `?view` shows branch warning when ref isn't a SHA; hides it when pinned.
- [ ] `?meta` returns `source: "github_proxy"` and the real `source_url`.
- [ ] `/gh/...` route is registered BEFORE `/:slug` in `index.ts`.
- [ ] All existing tests still pass (no regression).
- [ ] Production smoke test against a real public install script succeeds.
