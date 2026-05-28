# Dynamic Parameters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let consumers pass parameters via the URL — `curl 1ln.sh/<slug>?port=8080&env=staging | sh` — and have those parameters exposed to the executing script as `ENV_1LN_PORT=8080`, `ENV_1LN_ENV=staging`. Pure additive feature: URLs with no query string serve identical bytes to today.

**Architecture:** The Worker prepends a small shell preamble (`# 1ln.sh runtime parameters\nexport ENV_1LN_PORT='8080'\n…\n`) to the served script body. Param parsing is a pure function with strict charset/length limits and POSIX-safe single-quote shell escaping. The HMAC contract is unchanged (preamble is URL-derived, never stored); the KV cache continues to cache the bare script content (cheap to rebuild the preamble per request). `view` mode shows the same preamble so users can see what gets exported.

**Tech Stack:** TypeScript + Hono on Cloudflare Workers. Vitest + `@cloudflare/vitest-pool-workers` for tests. No new dependencies, no schema migrations.

**Key design decisions (locked):**
- **Key regex:** `^[a-zA-Z][a-zA-Z0-9_]{0,31}$` (must start with a letter; alphanumeric + underscore; max 32 chars).
- **Reserved keys silently dropped:** `view`, `meta`, and any key starting with `_` (underscore reserved for future system flags).
- **Value cap:** 1024 bytes per value (UTF-8, after URL decode).
- **Global caps:** max 16 params, max 4096 bytes summed value length per request.
- **Duplicate keys:** last-write-wins (matches "override previous" mental model).
- **Output env var name:** `ENV_1LN_<KEY_UPPERCASE>` — uppercase the validated key, prepend `ENV_1LN_`. The prefix prevents clobbering ambient env vars; uppercase matches shell convention.
- **Shell quoting:** POSIX single-quote with embedded-quote escape — replace `'` with `'\''`, then wrap in `'…'`. Bash treats single-quoted strings as fully literal (no expansion, no command substitution, no globbing), so this is safe against all shell injection vectors regardless of the value's contents.
- **Order of exports in preamble:** sorted alphabetically by the validated key (deterministic, helps debugging and snapshot tests).
- **Invalid keys/values:** silently dropped (not 400). Best-effort delivery — a typo in a param shouldn't break a deploy script.
- **Caching:** KV cache stays keyed on slug-only and stores bare content; preamble is rebuilt per request. Hot path stays sub-millisecond.

**Out of scope (follow-up plans, do not add here):**
- Manifest-declared parameter schemas (typed enums, patterns, defaults). v1 accepts any well-formed key.
- CLI changes. The consumer just appends `?key=value` to their curl URL.
- MCP server *behavior* changes (no new tool, no parameter-declaration arg on `publish_script`). Docs-only updates to the MCP tool description + README are in scope (Task 5).
- GH-proxy endpoint param passing. `/gh/<user>/<repo>` is a different code path; this plan only touches the hosted-script path.

---

## File Structure

**New files:**
- `src/params.ts` — pure parameter parser and preamble builder. Two exports: `parseParams(url: URL): Record<string, string>` and `buildPreamble(params: Record<string, string>): string`.
- `test/params.test.ts` — unit tests for both functions (charset, limits, quoting, reserved keys, ordering).
- `test/raw_params.test.ts` — integration test: parameterized request to `/<slug>` returns preamble + content.
- `test/view_params.test.ts` — integration test: `?view&port=8080` shows the preamble in the browser preview.

**Modified files:**
- `src/routes/raw.ts` — read params from the URL, call `parseParams` + `buildPreamble`, prepend preamble to the served body (both the KV-cached path and the D1-fallback path). HMAC verification is unchanged.
- `src/routes/view.ts` — same param parsing; pass the params through to `renderPreview`.
- `src/views/preview.ts` — add an optional `params` arg; if non-empty, render a "Runtime parameters" section above the script body showing the preamble lines.
- `src/views/home.ts` — add a small "Pass parameters" docs section under the existing install section.
- `mcp/src/server.ts` — export TOOLS as a const; extend the `publish_script` description so MCP agents know about consumer-side parameter passing.
- `mcp/README.md` — add a "Runtime parameters" subsection under `## Tool`.

**MCP test file (new):**
- `mcp/test/server.test.ts` — locks in the parameter mention in the tool description so it can't silently regress.

**Not touched:**
- `src/integrity.ts` — HMAC contract is content-only; preamble is URL-derived.
- `src/routes/meta.ts` — `?meta` returns metadata about the stored row; params are runtime overlays and don't affect metadata.
- `migrations/` — no schema changes.
- `src/repos/scripts.ts` — no repo changes.
- `cli/` — CLI does not push or consume params; users add `?key=val` to their curl URL manually.

---

## Task 1: `src/params.ts` — pure parser and preamble builder

**Files:**
- Create: `src/params.ts`
- Create: `test/params.test.ts`

- [ ] **Step 1: Write the failing tests**

`test/params.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseParams, buildPreamble } from "../src/params";

function urlFor(qs: string): URL {
  return new URL(`https://1ln.sh/abc${qs}`);
}

describe("parseParams", () => {
  it("returns {} when there's no query string", () => {
    expect(parseParams(urlFor(""))).toEqual({});
  });

  it("accepts a simple key=value pair and uppercases the key", () => {
    expect(parseParams(urlFor("?port=8080"))).toEqual({ PORT: "8080" });
  });

  it("accepts multiple pairs", () => {
    expect(parseParams(urlFor("?port=8080&env=staging"))).toEqual({
      PORT: "8080",
      ENV: "staging",
    });
  });

  it("accepts an empty value", () => {
    expect(parseParams(urlFor("?port="))).toEqual({ PORT: "" });
  });

  it("silently drops the reserved keys view and meta", () => {
    expect(parseParams(urlFor("?view=1&meta=1&port=8080"))).toEqual({
      PORT: "8080",
    });
  });

  it("silently drops underscore-prefixed keys (reserved for future system flags)", () => {
    expect(parseParams(urlFor("?_format=raw&port=8080"))).toEqual({
      PORT: "8080",
    });
  });

  it("silently drops keys that don't match the charset", () => {
    // starts with digit
    expect(parseParams(urlFor("?1port=x&port=y"))).toEqual({ PORT: "y" });
    // contains dash
    expect(parseParams(urlFor("?port-name=x&port=y"))).toEqual({ PORT: "y" });
    // contains dot
    expect(parseParams(urlFor("?port.name=x&port=y"))).toEqual({ PORT: "y" });
  });

  it("silently drops keys longer than 32 chars", () => {
    const long = "a".repeat(33);
    expect(parseParams(urlFor(`?${long}=x&port=y`))).toEqual({ PORT: "y" });
  });

  it("accepts a key of exactly 32 chars", () => {
    const k = "a".repeat(32);
    const out = parseParams(urlFor(`?${k}=x`));
    expect(out).toEqual({ [k.toUpperCase()]: "x" });
  });

  it("silently drops values longer than 1024 bytes", () => {
    const big = "x".repeat(1025);
    expect(parseParams(urlFor(`?port=${big}&env=ok`))).toEqual({ ENV: "ok" });
  });

  it("accepts a value of exactly 1024 bytes", () => {
    const v = "x".repeat(1024);
    expect(parseParams(urlFor(`?port=${v}`))).toEqual({ PORT: v });
  });

  it("counts bytes (not chars) for the value cap — multi-byte unicode", () => {
    // "é" is 2 bytes in UTF-8. 513 of them = 1026 bytes, over the cap.
    const v = "é".repeat(513);
    expect(parseParams(urlFor(`?port=${encodeURIComponent(v)}`))).toEqual({});
  });

  it("caps at 16 params (drops extras in iteration order)", () => {
    const pairs = Array.from({ length: 20 }, (_, i) => `k${i}=v${i}`).join("&");
    const out = parseParams(urlFor(`?${pairs}`));
    expect(Object.keys(out)).toHaveLength(16);
    // First 16 are kept.
    expect(out.K0).toBe("v0");
    expect(out.K15).toBe("v15");
    expect(out.K16).toBeUndefined();
  });

  it("caps the total value size at 4096 bytes (drops the param that would overflow and beyond)", () => {
    // 4 params of 1024 bytes each = 4096 — fits exactly.
    // A 5th param of any size overflows and is dropped.
    const big = "x".repeat(1024);
    const out = parseParams(
      urlFor(`?a=${big}&b=${big}&c=${big}&d=${big}&e=tiny`)
    );
    expect(out.A).toBe(big);
    expect(out.B).toBe(big);
    expect(out.C).toBe(big);
    expect(out.D).toBe(big);
    expect(out.E).toBeUndefined();
  });

  it("last-write-wins on duplicate keys", () => {
    expect(parseParams(urlFor("?port=8080&port=9090"))).toEqual({ PORT: "9090" });
  });

  it("decodes percent-encoding in values", () => {
    expect(parseParams(urlFor("?msg=hello%20world"))).toEqual({ MSG: "hello world" });
  });
});

describe("buildPreamble", () => {
  it("returns empty string for empty params", () => {
    expect(buildPreamble({})).toBe("");
  });

  it("emits a single export with single-quote wrapping", () => {
    expect(buildPreamble({ PORT: "8080" })).toBe(
      "# 1ln.sh runtime parameters\nexport ENV_1LN_PORT='8080'\n\n"
    );
  });

  it("emits multiple exports sorted alphabetically by key", () => {
    expect(buildPreamble({ PORT: "8080", ENV: "staging" })).toBe(
      "# 1ln.sh runtime parameters\nexport ENV_1LN_ENV='staging'\nexport ENV_1LN_PORT='8080'\n\n"
    );
  });

  it("escapes embedded single quotes (POSIX style: '\\'' )", () => {
    // value contains a single quote: it'll
    expect(buildPreamble({ MSG: "it's" })).toBe(
      "# 1ln.sh runtime parameters\nexport ENV_1LN_MSG='it'\\''s'\n\n"
    );
  });

  it("does NOT expand $ or backticks inside the quoted value", () => {
    // The whole point: the value is literal. We just wrap it.
    expect(buildPreamble({ V: "$(rm -rf /)" })).toBe(
      "# 1ln.sh runtime parameters\nexport ENV_1LN_V='$(rm -rf /)'\n\n"
    );
  });

  it("handles newlines and tabs inside values (single quotes preserve them)", () => {
    expect(buildPreamble({ V: "a\nb\tc" })).toBe(
      "# 1ln.sh runtime parameters\nexport ENV_1LN_V='a\nb\tc'\n\n"
    );
  });

  it("emits a trailing blank line so the user script body starts on its own line", () => {
    const out = buildPreamble({ PORT: "8080" });
    expect(out.endsWith("\n\n")).toBe(true);
  });

  it("handles empty-string values", () => {
    expect(buildPreamble({ PORT: "" })).toBe(
      "# 1ln.sh runtime parameters\nexport ENV_1LN_PORT=''\n\n"
    );
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```
npx vitest run test/params.test.ts
```

Expected: FAIL — `Cannot find module '../src/params'`.

- [ ] **Step 3: Implement `src/params.ts`**

`src/params.ts`:

```ts
/**
 * Pure parser + shell-preamble builder for URL-based script parameters.
 *
 * Threat model: a value can contain ANY byte sequence (URL-decoded). Shell
 * injection is prevented by wrapping the value in single quotes — POSIX
 * single-quoted strings are fully literal (no $, no `, no globs, no escapes
 * other than the close-quote terminator). The only character we have to escape
 * is the single quote itself, via the standard idiom: '\''.
 */

const KEY_RE = /^[a-zA-Z][a-zA-Z0-9_]{0,31}$/;
const RESERVED_KEYS = new Set(["view", "meta"]);
const MAX_PARAMS = 16;
const MAX_VALUE_BYTES = 1024;
const MAX_TOTAL_VALUE_BYTES = 4096;

const encoder = new TextEncoder();

/**
 * Parse and validate URL query parameters into a normalized {KEY_UPPERCASE: value}
 * map. Invalid keys and over-cap values are silently dropped — a typo in a
 * parameter should not break the consumer's curl pipeline. Reserved keys (view,
 * meta, _*) are dropped to keep the namespace clean for future system flags.
 *
 * Caps are enforced in iteration order: we walk URLSearchParams.entries() and
 * stop adding once a cap would be exceeded.
 */
export function parseParams(url: URL): Record<string, string> {
  const out: Record<string, string> = {};
  let totalBytes = 0;
  let count = 0;

  for (const [rawKey, value] of url.searchParams.entries()) {
    if (count >= MAX_PARAMS) break;
    if (rawKey.length === 0 || rawKey.startsWith("_")) continue;
    if (RESERVED_KEYS.has(rawKey)) continue;
    if (!KEY_RE.test(rawKey)) continue;

    const valueBytes = encoder.encode(value).length;
    if (valueBytes > MAX_VALUE_BYTES) continue;

    // The output key replaces a previous entry on duplicates, so we should
    // refund the old value's bytes before charging the new one.
    const upperKey = rawKey.toUpperCase();
    const prev = out[upperKey];
    if (prev !== undefined) {
      totalBytes -= encoder.encode(prev).length;
    } else {
      count += 1;
    }

    if (totalBytes + valueBytes > MAX_TOTAL_VALUE_BYTES) {
      // Refund the count bump if we just registered a new key but can't keep it.
      if (prev === undefined) count -= 1;
      else out[upperKey] = prev; // (no-op; prev is still in map)
      continue;
    }

    out[upperKey] = value;
    totalBytes += valueBytes;
  }

  return out;
}

/**
 * POSIX-safe single-quote wrapping. The only metacharacter inside a
 * single-quoted string in POSIX shells is the single quote itself, which closes
 * the literal. The standard idiom to embed one is: close the literal, emit an
 * escaped quote, reopen the literal. Hence: `'` → `'\''`.
 *
 * This works for ALL byte sequences (including newlines, tabs, $, `, *, and
 * arbitrary unicode) because nothing else is special inside single quotes.
 */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * Build the shell preamble that gets prepended to the served script body.
 * Returns "" when there are no params (keeps the no-param hot path byte-for-byte
 * identical to today's behavior).
 *
 * Exports are emitted sorted by key for determinism (helps tests and debugging).
 */
export function buildPreamble(params: Record<string, string>): string {
  const keys = Object.keys(params).sort();
  if (keys.length === 0) return "";
  const lines = ["# 1ln.sh runtime parameters"];
  for (const k of keys) {
    lines.push(`export ENV_1LN_${k}=${shellQuote(params[k])}`);
  }
  // Trailing blank line so the user script body starts on its own line.
  return lines.join("\n") + "\n\n";
}
```

- [ ] **Step 4: Run tests to verify pass**

```
npx vitest run test/params.test.ts
```

Expected: PASS (all 21 tests).

- [ ] **Step 5: Run the full suite to confirm no regressions**

```
npx vitest run
```

Expected: 480 + 21 = 501/501 green.

- [ ] **Step 6: Commit**

```
git add src/params.ts test/params.test.ts
git commit -m "feat(params): pure parser + shell-safe preamble builder"
```

---

## Task 2: Wire params into the raw route

**Files:**
- Modify: `src/routes/raw.ts`
- Create: `test/raw_params.test.ts`

- [ ] **Step 1: Write the failing integration test**

`test/raw_params.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { SELF } from "cloudflare:test";

// Use the real API to create scripts — this matches the convention in raw.test.ts /
// view.test.ts / meta.test.ts and exercises the same code path users will hit.
// Each test uses a unique IP to stay clear of the 5/day anonymous rate limit.
async function createScript(
  content: string,
  ip: string,
  opts: { singleUse?: boolean } = {}
): Promise<{ slug: string }> {
  const res = await SELF.fetch("http://x/api/scripts", {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": ip },
    body: JSON.stringify({
      content,
      visibility: "public",
      ...(opts.singleUse ? { expires: "1run" } : {}),
    }),
  });
  if (res.status !== 201) {
    throw new Error(`createScript failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as { slug: string };
}

describe("GET /:slug with query params", () => {
  it("serves identical bytes to today when there are no params", async () => {
    const { slug } = await createScript("echo hi\n", "192.0.2.110");
    const res = await SELF.fetch(`http://x/${slug}`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("echo hi\n");
  });

  it("prepends a shell preamble when params are present", async () => {
    const { slug } = await createScript("echo hi\n", "192.0.2.111");
    const res = await SELF.fetch(`http://x/${slug}?port=8080&env=staging`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(
      "# 1ln.sh runtime parameters\n" +
        "export ENV_1LN_ENV='staging'\n" +
        "export ENV_1LN_PORT='8080'\n" +
        "\n" +
        "echo hi\n"
    );
  });

  it("safely quotes shell-metacharacter values without expanding them", async () => {
    const { slug } = await createScript("echo done\n", "192.0.2.112");
    const evil = encodeURIComponent("$(rm -rf /); echo 'gotcha'");
    const res = await SELF.fetch(`http://x/${slug}?cmd=${evil}`);
    const body = await res.text();
    // The dangerous bytes appear, but inside single quotes — the embedded single
    // quote is escaped via the '\\''  idiom, so the shell sees a literal string.
    expect(body).toContain(
      `export ENV_1LN_CMD='$(rm -rf /); echo '\\''gotcha'\\'''`
    );
    expect(body).toContain("\necho done\n");
  });

  it("caches the bare content (no params) and rebuilds the preamble per request", async () => {
    const { slug } = await createScript("echo body\n", "192.0.2.113");
    // First hit: no params → populates the bare-content KV cache.
    const r1 = await SELF.fetch(`http://x/${slug}`);
    expect(await r1.text()).toBe("echo body\n");

    // Second hit: with params → must rebuild preamble, not serve raw cached bytes.
    const r2 = await SELF.fetch(`http://x/${slug}?port=8080`);
    expect(await r2.text()).toBe(
      "# 1ln.sh runtime parameters\nexport ENV_1LN_PORT='8080'\n\necho body\n"
    );

    // Third hit: params again, different value → fresh preamble.
    const r3 = await SELF.fetch(`http://x/${slug}?port=9090`);
    expect(await r3.text()).toBe(
      "# 1ln.sh runtime parameters\nexport ENV_1LN_PORT='9090'\n\necho body\n"
    );
  });

  it("works with single-use scripts (preamble + content delivered atomically once)", async () => {
    const { slug } = await createScript("echo once\n", "192.0.2.114", {
      singleUse: true,
    });
    const r1 = await SELF.fetch(`http://x/${slug}?flag=on`);
    expect(r1.status).toBe(200);
    expect(await r1.text()).toBe(
      "# 1ln.sh runtime parameters\nexport ENV_1LN_FLAG='on'\n\necho once\n"
    );
    const r2 = await SELF.fetch(`http://x/${slug}?flag=on`);
    expect(r2.status).toBe(410); // already consumed
  });

  it("invalid params are silently dropped (no preamble emitted)", async () => {
    const { slug } = await createScript("echo hi\n", "192.0.2.115");
    // 1port is invalid (starts with digit); _format is reserved.
    // Note: `view` and `meta` are NOT just dropped — they route to other handlers,
    // so we test those via params.test.ts unit tests rather than here.
    const res = await SELF.fetch(`http://x/${slug}?1port=8080&_format=raw`);
    expect(await res.text()).toBe("echo hi\n");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```
npx vitest run test/raw_params.test.ts
```

Expected: FAIL — the parameterized requests come back with no preamble (just the bare content).

- [ ] **Step 3: Wire params into `src/routes/raw.ts`**

Replace the contents of `src/routes/raw.ts` with:

```ts
import { Hono } from "hono";
import type { Env } from "../env";
import { getScriptBySlug, markConsumed } from "../repos/scripts";
import { verifyContentHmac } from "../integrity";
import { parseParams, buildPreamble } from "../params";

export const raw = new Hono<{ Bindings: Env }>();

const CACHE_KEY = (slug: string) => `script:${slug}`;
const GONE = (msg: string) =>
  new Response(msg, {
    status: 410,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });

const TAMPER_BODY = "Script content failed integrity check";

function serveScript(body: string): Response {
  return new Response(body, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

raw.get("/:slug", async (c) => {
  const slug = c.req.param("slug");
  if (slug === "health" || slug === "api") return c.notFound();

  const url = new URL(c.req.url);
  // The view/meta query flags get handled by their own routes (registered first).
  // If we got here with one of those flags it's because no specific route matched — treat as not found.
  if (url.searchParams.has("view") || url.searchParams.has("meta")) {
    return c.notFound();
  }

  // Parse runtime params from the URL. Empty preamble when there are no params
  // means no-param requests return byte-identical bodies to before this feature.
  const preamble = buildPreamble(parseParams(url));

  // Hot-path KV cache (non-single-use only). The cache stores the bare script
  // content (HMAC-verified at write time); we rebuild the preamble per request.
  const cached = await c.env.SCRIPT_CACHE.get(CACHE_KEY(slug));
  if (cached !== null) {
    return serveScript(preamble + cached);
  }

  const row = await getScriptBySlug(c.env.DB, slug);
  if (!row || row.kind !== "hosted" || !row.content) return c.notFound();

  const now = Date.now();
  if (row.expires_at !== null && row.expires_at < now) return GONE("expired");

  // Tamper detection: verify the stored HMAC before serving. NULL = legacy row
  // pre-dating the migration; accept those for now (a backfill will tighten this).
  if (row.content_hmac !== null) {
    const ok = await verifyContentHmac(
      c.env.SCRIPT_HMAC_SECRET,
      row.slug,
      row.content,
      row.content_hmac
    );
    if (!ok) {
      console.warn(`integrity check failed for slug=${row.slug}`);
      return GONE(TAMPER_BODY);
    }
  }

  if (row.single_use === 1) {
    if (row.consumed_at !== null) return GONE("already consumed");
    const won = await markConsumed(c.env.DB, slug);
    if (!won) return GONE("already consumed");
    // Single-use: never cache.
    return serveScript(preamble + row.content);
  }

  await c.env.SCRIPT_CACHE.put(CACHE_KEY(slug), row.content, {
    expirationTtl: 300,
  });
  return serveScript(preamble + row.content);
});
```

- [ ] **Step 4: Run the integration test**

```
npx vitest run test/raw_params.test.ts
```

Expected: PASS (all 6 tests).

- [ ] **Step 5: Run the full suite**

```
npx vitest run
```

Expected: 480 (existing) + 21 (params) + 6 (raw_params) = 507/507 green. If any existing `raw` tests fail, the most likely cause is that they assumed no preamble — but since we only emit a preamble when params are present, this should not regress any existing tests. If it does, investigate before continuing.

- [ ] **Step 6: Commit**

```
git add src/routes/raw.ts test/raw_params.test.ts
git commit -m "feat(params): prepend runtime params as ENV_1LN_* exports in raw route"
```

---

## Task 3: Wire params into the view route + preview renderer

**Files:**
- Modify: `src/routes/view.ts`
- Modify: `src/views/preview.ts`
- Create: `test/view_params.test.ts`

- [ ] **Step 1: Write the failing integration test**

`test/view_params.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { SELF } from "cloudflare:test";

async function createScript(content: string, ip: string): Promise<{ slug: string }> {
  const res = await SELF.fetch("http://x/api/scripts", {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": ip },
    body: JSON.stringify({ content, visibility: "public" }),
  });
  if (res.status !== 201) {
    throw new Error(`createScript failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as { slug: string };
}

describe("GET /:slug?view with query params", () => {
  it("renders the preview with no preamble section when there are no params", async () => {
    const { slug } = await createScript("echo hi\n", "192.0.2.120");
    const res = await SELF.fetch(`http://x/${slug}?view`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).not.toContain("Runtime parameters");
    expect(html).not.toContain("ENV_1LN_");
  });

  it("renders a Runtime parameters section showing the preamble exports", async () => {
    const { slug } = await createScript("echo hi\n", "192.0.2.121");
    const res = await SELF.fetch(`http://x/${slug}?view&port=8080&env=staging`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Runtime parameters");
    expect(html).toContain("export ENV_1LN_ENV=&#39;staging&#39;");
    expect(html).toContain("export ENV_1LN_PORT=&#39;8080&#39;");
  });

  it("escapes HTML metacharacters in param values", async () => {
    const { slug } = await createScript("echo hi\n", "192.0.2.122");
    // Value: <script>alert(1)</script>
    const evil = encodeURIComponent("<script>alert(1)</script>");
    const res = await SELF.fetch(`http://x/${slug}?view&xss=${evil}`);
    const html = await res.text();
    // The literal <script> bytes must NOT appear unescaped in the rendered HTML.
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("silently drops invalid params (no preamble section)", async () => {
    const { slug } = await createScript("echo hi\n", "192.0.2.123");
    const res = await SELF.fetch(`http://x/${slug}?view&1port=8080&_x=y`);
    const html = await res.text();
    expect(html).not.toContain("Runtime parameters");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```
npx vitest run test/view_params.test.ts
```

Expected: FAIL — the "Runtime parameters" section isn't rendered.

- [ ] **Step 3: Update `src/views/preview.ts` to accept and render params**

Replace the contents of `src/views/preview.ts` with:

```ts
import { layout, escapeHtml } from "./layout";
import { renderCopyButton, copyButtonScript } from "./copy_button";
import { highlightShell } from "./shell_highlight";
import { buildPreamble } from "../params";

function relativeAge(createdAt: number, nowMs = Date.now()): string {
  const diff = Math.max(0, nowMs - createdAt);
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function renderParamsSection(params: Record<string, string>): string {
  const preamble = buildPreamble(params);
  if (preamble === "") return "";
  // Strip the trailing blank line for display (it exists for shell-parse cleanliness,
  // not for visual rendering).
  const display = preamble.replace(/\n\n$/, "");
  return `<h2>Runtime parameters</h2>
<pre>${escapeHtml(display)}</pre>`;
}

export function renderPreview(opts: {
  slug: string;
  content: string;
  visibility: "public" | "private";
  createdAt: number;
  params?: Record<string, string>;
}): string {
  const oneliner = `curl 1ln.sh/${opts.slug} | sh`;
  const created = new Date(opts.createdAt).toISOString();
  const paramsSection = renderParamsSection(opts.params ?? {});
  return layout(
    `1ln.sh/${opts.slug}`,
    `<h1>1ln.sh/<span class="accent">${escapeHtml(opts.slug)}</span></h1>

<div class="status-row">
  <span class="chip">${escapeHtml(opts.visibility)}</span>
  <span class="chip muted" title="${escapeHtml(created)}">${relativeAge(opts.createdAt)}</span>
</div>

<div class="code-row">
  <pre id="oneliner" data-copy-value="${escapeHtml(oneliner)}">${escapeHtml(oneliner)}</pre>
  ${renderCopyButton("oneliner")}
</div>

${paramsSection}

<h2>Script</h2>
<pre>${highlightShell(opts.content)}</pre>

<p class="secondary" style="font-size:12px;">
  <a href="/${escapeHtml(opts.slug)}">Raw</a> ·
  <a href="mailto:abuse@1ln.sh?subject=Report%20${encodeURIComponent(opts.slug)}">Report abuse</a>
</p>
${copyButtonScript()}`
  );
}
```

- [ ] **Step 4: Update `src/routes/view.ts` to parse params and pass them through**

Replace the contents of `src/routes/view.ts` with:

```ts
import { Hono } from "hono";
import type { Env } from "../env";
import { getScriptBySlug } from "../repos/scripts";
import { verifyContentHmac } from "../integrity";
import { renderPreview } from "../views/preview";
import { renderGone } from "../views/gone";
import { parseParams } from "../params";

export const view = new Hono<{ Bindings: Env }>();

view.get("/:slug", async (c, next) => {
  const url = new URL(c.req.url);
  if (!url.searchParams.has("view")) return next();
  const slug = c.req.param("slug");
  if (slug === "health" || slug === "api") return c.notFound();
  const row = await getScriptBySlug(c.env.DB, slug);
  if (!row || row.kind !== "hosted") return c.notFound();
  if (row.expires_at !== null && row.expires_at < Date.now()) {
    return c.html(renderGone({ reason: "expired", at: row.expires_at }), 410);
  }
  if (row.single_use === 1 && row.consumed_at !== null) {
    return c.html(renderGone({ reason: "consumed", at: row.consumed_at }), 410);
  }
  // Tamper detection — see raw.ts for rationale. NULL hmac = legacy, accept.
  if (row.content !== null && row.content_hmac !== null) {
    const ok = await verifyContentHmac(
      c.env.SCRIPT_HMAC_SECRET,
      row.slug,
      row.content,
      row.content_hmac
    );
    if (!ok) {
      console.warn(`integrity check failed for slug=${row.slug}`);
      return new Response("Script content failed integrity check", {
        status: 410,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }
  }
  return c.html(
    renderPreview({
      slug: row.slug,
      content: row.content ?? "",
      visibility: row.visibility,
      createdAt: row.created_at,
      params: parseParams(url),
    })
  );
});
```

- [ ] **Step 5: Run the integration test**

```
npx vitest run test/view_params.test.ts
```

Expected: PASS (all 4 tests).

- [ ] **Step 6: Run the full suite**

```
npx vitest run
```

Expected: 480 (existing) + 21 (params) + 6 (raw_params) + 4 (view_params) = 511/511 green.

- [ ] **Step 7: Type check**

```
npx tsc --noEmit
```

Expected: clean (no errors).

- [ ] **Step 8: Commit**

```
git add src/routes/view.ts src/views/preview.ts test/view_params.test.ts
git commit -m "feat(params): show ENV_1LN_* preamble in browser preview"
```

---

## Task 4: Document parameters on the homepage

**Files:**
- Modify: `src/views/home.ts`
- Create: `test/home_params_docs.test.ts`

The homepage already leads with install commands for CLI + MCP. Add a short third section explaining the URL-parameter feature so users discover it without having to read the source.

- [ ] **Step 1: Write the failing test**

`test/home_params_docs.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { SELF } from "cloudflare:test";

describe("homepage parameter docs", () => {
  it("mentions URL parameters and the ENV_1LN_ prefix", async () => {
    const res = await SELF.fetch("http://x/");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("ENV_1LN_");
    // The example shows the canonical ?port=…&env=… form.
    expect(html).toMatch(/curl 1ln\.sh\/[^?]+\?port=/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```
npx vitest run test/home_params_docs.test.ts
```

Expected: FAIL — the homepage doesn't contain `ENV_1LN_`.

- [ ] **Step 3: Read the current homepage and find the insertion point**

```
cat src/views/home.ts
```

Locate the section ending with the install copy block (the `<pre id="install-cmd">…</pre>` element near line 23). The new "Pass parameters" section will be added as a new `<section>` immediately after the section that contains that `<pre>` (i.e., after the closing `</section>` that follows the install copy block).

- [ ] **Step 4: Add the new section**

Edit `src/views/home.ts`. After the closing `</section>` that contains the `install-cmd` pre, insert this block (preserve the file's existing indentation style):

```html
<section>
  <h2>Pass parameters at runtime</h2>
  <p class="secondary">
    Append URL query parameters and they show up in the executing script as
    <code>ENV_1LN_*</code> environment variables. Useful for per-environment
    deploy scripts.
  </p>
  <pre>curl 1ln.sh/&lt;slug&gt;?port=8080&amp;env=staging | sh</pre>
  <p class="secondary" style="font-size:12px;">
    Keys must match <code>[a-zA-Z][a-zA-Z0-9_]{0,31}</code>; values are POSIX
    single-quote escaped before injection (safe against shell metacharacters).
    Max 16 params, 1KB per value, 4KB total. Invalid params are silently dropped.
  </p>
</section>
```

If unsure exactly where to place it, use Grep to find the line: `grep -n 'install-cmd' src/views/home.ts` — insert the new `<section>` block immediately after the next `</section>` closing tag that appears below that match.

- [ ] **Step 5: Run the test**

```
npx vitest run test/home_params_docs.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run the full suite**

```
npx vitest run
```

Expected: 511 + 1 = 512/512 green.

- [ ] **Step 7: Type check**

```
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 8: Commit**

```
git add src/views/home.ts test/home_params_docs.test.ts
git commit -m "docs(params): document ENV_1LN_* URL parameters on the homepage"
```

---

## Task 5: MCP server — tool description + README mention params

The MCP server publishes scripts via `publish_script`. Agents that call this tool will not know about consumer-side parameter passing unless we put it in the tool description. We extend the description and the package README so agents can tell users *"you can pass `?port=8080` and it'll show up as `ENV_1LN_PORT`"*.

This task does NOT add a new MCP tool or parameter-schema declaration at publish time (those are out of scope per the header). It only updates documentation surfaces.

**Files:**
- Modify: `mcp/src/server.ts`
- Modify: `mcp/README.md`
- Create: `mcp/test/server.test.ts`

- [ ] **Step 1: Write the failing test**

`mcp/test/server.test.ts`:

```ts
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
});
```

- [ ] **Step 2: Run to verify it fails**

```
cd mcp && npx vitest run test/server.test.ts
```

Expected: FAIL — `TOOLS` is not exported from `server.ts`.

- [ ] **Step 3: Refactor `mcp/src/server.ts` to export TOOLS and extend the description**

Replace the contents of `mcp/src/server.ts` with:

```ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { publishScript, type Deps } from "./publish.js";
import { PublishInputSchema, MAX_CONTENT_LENGTH } from "./schema.js";

export const TOOLS = [
  {
    name: "publish_script",
    description:
      "Publishes a shell script to 1ln.sh and returns a one-line `curl … | sh` URL the user can run on any server. " +
      "Default visibility is 'private' (unguessable URL); pass 'public' for a short shareable URL. " +
      "Default expires is '24h'; pass '1run' for single-use. " +
      "Consumers can pass runtime parameters via the URL query string — e.g. `curl 1ln.sh/<slug>?port=8080&env=staging | sh` " +
      "exposes `ENV_1LN_PORT=8080` and `ENV_1LN_ENV=staging` to the executing script. " +
      "If you're writing a script that takes per-environment values, reference them as `$ENV_1LN_<KEY>` and tell the user how to invoke it.",
    inputSchema: {
      type: "object",
      properties: {
        content: { type: "string", description: "The shell script to publish.", maxLength: MAX_CONTENT_LENGTH },
        visibility: { type: "string", enum: ["public", "private"], description: "Default: private" },
        expires: { type: "string", enum: ["1h", "24h", "1run", "never"], description: "Default: 24h" },
      },
      required: ["content"],
    },
  },
] as const;

export function buildServer(deps: Deps) {
  const server = new Server(
    { name: "1ln-mcp", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    if (req.params.name !== "publish_script") {
      throw new Error(`unknown tool: ${req.params.name}`);
    }
    const input = PublishInputSchema.parse(req.params.arguments ?? {});
    const result = await publishScript(deps, input);
    return {
      content: [
        {
          type: "text",
          text:
            `Published to ${result.url}\n\n` +
            `Run this on any server:\n  ${result.one_liner}\n\n` +
            `Delete token (save it): ${result.delete_token}`,
        },
      ],
      structuredContent: result,
    };
  });

  return server;
}
```

- [ ] **Step 4: Run the MCP test suite**

```
cd mcp && npx vitest run
```

Expected: all existing MCP tests still pass + the 2 new tests pass.

- [ ] **Step 5: Type check the MCP package**

```
cd mcp && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 6: Update `mcp/README.md`**

Edit `mcp/README.md`. After the `## Tool` section's table and the "Returns:" line, before the `## Install` heading, insert this new subsection:

```markdown
### Runtime parameters

Scripts published via this tool can receive parameters from the consumer's curl URL. Append query string pairs and they're exposed as `ENV_1LN_*` environment variables inside the executing script:

```
curl 1ln.sh/<slug>?port=8080&env=staging | sh
# Inside the script: $ENV_1LN_PORT="8080", $ENV_1LN_ENV="staging"
```

Keys are uppercased and prefixed; values are POSIX-safe single-quoted. Max 16 params, 1KB per value, 4KB total. Invalid keys are silently dropped. Useful for per-environment deploy scripts where you don't want to fork the script for each target.

```

- [ ] **Step 7: Commit**

```
git add mcp/src/server.ts mcp/test/server.test.ts mcp/README.md
git commit -m "feat(mcp): document URL parameters in publish_script + README"
```

---

## Self-Review Checklist (after all tasks complete)

Before requesting review or merging:

- [ ] Worker suite: `npx vitest run` — 512/512 green (480 existing + 21 params unit + 6 raw integration + 4 view integration + 1 home docs)
- [ ] Worker typecheck: `npx tsc --noEmit` — clean
- [ ] MCP suite: `cd mcp && npx vitest run` — all existing + 2 new green
- [ ] MCP typecheck: `cd mcp && npx tsc --noEmit` — clean
- [ ] Manually exercise the feature against `npx wrangler dev`:
  - `curl http://localhost:8787/<slug>?port=8080&env=staging` — should return preamble + content
  - `curl http://localhost:8787/<slug>` — should return content with no preamble (byte-identical to before)
  - Visit `http://localhost:8787/<slug>?view&port=8080` in a browser — should show "Runtime parameters" section
- [ ] Check homepage at `http://localhost:8787/` — "Pass parameters at runtime" section visible under the install block
- [ ] Skim the updated MCP tool description by running `cd mcp && node dist/index.js` and inspecting `tools/list` output (or just re-read `mcp/src/server.ts`).
- [ ] Do not deploy. Per Yair's standing rule: PR to main, await explicit "deploy" before shipping to prod. The MCP package is published separately to npm — also do not `npm publish` from `mcp/` without explicit go-ahead.
