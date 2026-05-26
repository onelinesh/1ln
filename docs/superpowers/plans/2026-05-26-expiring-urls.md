# Plan 4 — Expiring + Single-Use URLs

> **For agentic workers:** Use superpowers:subagent-driven-development to execute. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Let API callers create scripts that expire after a duration (`"1h"`, `"24h"`) or after a single read (`"1run"`). 410 enforcement on read. Web UI behavior unchanged (still gets a 7-day TTL by default).

**Architecture:** Two pieces — a small `expires.ts` helper that normalises the `expires` string into `{expiresAt, singleUse}`, plus a new `single_use` column added via migration `0002`. The `raw` route enforces both TTL and single-use semantics; single-use enforcement uses an atomic `UPDATE ... WHERE consumed_at IS NULL` to win the race when two `curl`s hit at once.

**Tech stack:** unchanged.

---

## Decisions locked in

- API-only feature. The web form does not expose `expires` in this plan. Anonymous web posts keep the existing 7-day TTL (set in `createAnonymous`).
- API `expires` values: `"1h"` | `"24h"` | `"1run"` | `"never"`.
- For anonymous API callers, `"never"` is **clamped to 7 days** in this plan (true forever scripts wait for Plan 2's authed users).
- `"1run"` URLs default to a 7-day expires_at as a safety backstop, in addition to `single_use=1`.
- If `expires` is omitted on the API, default is `"24h"` (matches the spec's "agent default"). The web form's call to `createAnonymous` continues to pass nothing for `expires` but is explicitly forced to `"7d-web-default"` semantics inside the helper to keep web behaviour identical.
- Expired or already-consumed URLs return **HTTP 410 Gone** with a small text body.
- `?meta` continues to work for expired/consumed scripts (returns the existing metadata + `consumed_at`) — useful for agents auditing what happened.

---

## File structure (new + modified)

```
migrations/
└── 0002_single_use.sql        # NEW
src/
├── expires.ts                 # NEW — string → {expiresAt, singleUse}
├── repos/scripts.ts           # MOD — createHostedScript accepts singleUse; new markConsumed()
├── routes/
│   ├── api_scripts.ts         # MOD — parse `expires` body field; pass through
│   ├── raw.ts                 # MOD — enforce expires_at + single-use (atomic consume)
│   └── meta.ts                # MOD — include consumed_at + single_use in JSON
test/
├── expires.test.ts            # NEW
├── api_scripts.test.ts        # MOD — new tests for `expires` body field
├── raw.test.ts                # MOD — new tests for expired (410) + 1run (410 on 2nd read)
└── meta.test.ts               # MOD — verify new fields in JSON
```

---

## Task 1: Migration 0002 — add `single_use` column

**Files:** create `migrations/0002_single_use.sql`. Update `test/migration.test.ts` to assert the new column exists.

- [ ] **Step 1 — write `migrations/0002_single_use.sql`**

```sql
ALTER TABLE scripts ADD COLUMN single_use INTEGER NOT NULL DEFAULT 0;
CREATE INDEX scripts_single_use_unconsumed
  ON scripts(slug)
  WHERE single_use = 1 AND consumed_at IS NULL;
```

- [ ] **Step 2 — apply locally:** `npm run migrate:local`. Expected: "Migrations applied!" 1 migration.

- [ ] **Step 3 — extend `test/migration.test.ts`** to assert `single_use` is in the column list.

- [ ] **Step 4 — run tests:** `npm test`. Expected: 40/40 still passing.

- [ ] **Step 5 — commit:** `feat: migration 0002 — single_use column`

---

## Task 2: `src/expires.ts` helper

**Files:** create `src/expires.ts`, create `test/expires.test.ts`.

- [ ] **Step 1 — failing test `test/expires.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { parseExpires, MAX_ANON_TTL_MS } from "../src/expires";

const now = () => Date.now();

describe("parseExpires (anonymous)", () => {
  it("'1h' → +1 hour, not single-use", () => {
    const t = now();
    const r = parseExpires("1h", { authed: false, nowMs: t });
    expect(r.expiresAt).toBe(t + 60 * 60 * 1000);
    expect(r.singleUse).toBe(false);
  });

  it("'24h' → +24 hours", () => {
    const t = now();
    const r = parseExpires("24h", { authed: false, nowMs: t });
    expect(r.expiresAt).toBe(t + 24 * 60 * 60 * 1000);
  });

  it("'1run' → 7-day backstop + singleUse=true", () => {
    const t = now();
    const r = parseExpires("1run", { authed: false, nowMs: t });
    expect(r.expiresAt).toBe(t + MAX_ANON_TTL_MS);
    expect(r.singleUse).toBe(true);
  });

  it("'never' → clamped to 7 days (anonymous-only)", () => {
    const t = now();
    const r = parseExpires("never", { authed: false, nowMs: t });
    expect(r.expiresAt).toBe(t + MAX_ANON_TTL_MS);
    expect(r.singleUse).toBe(false);
  });

  it("undefined → defaults to 24h (API default)", () => {
    const t = now();
    const r = parseExpires(undefined, { authed: false, nowMs: t });
    expect(r.expiresAt).toBe(t + 24 * 60 * 60 * 1000);
  });

  it("'7d-web-default' → 7d, not single-use (matches existing anonymous-web behavior)", () => {
    const t = now();
    const r = parseExpires("7d-web-default", { authed: false, nowMs: t });
    expect(r.expiresAt).toBe(t + MAX_ANON_TTL_MS);
    expect(r.singleUse).toBe(false);
  });

  it("invalid string throws", () => {
    expect(() => parseExpires("forever", { authed: false, nowMs: now() })).toThrow();
  });
});
```

- [ ] **Step 2 — run test, expect FAIL**

- [ ] **Step 3 — implement `src/expires.ts`**

```ts
export const MAX_ANON_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export type ExpiresValue = "1h" | "24h" | "1run" | "never" | "7d-web-default";

export type ParsedExpires = {
  expiresAt: number;
  singleUse: boolean;
};

export type ParseOpts = {
  authed: boolean;
  nowMs: number;
};

const VALID: ReadonlySet<string> = new Set([
  "1h", "24h", "1run", "never", "7d-web-default",
]);

export function parseExpires(value: string | undefined, opts: ParseOpts): ParsedExpires {
  const v = value ?? "24h";
  if (!VALID.has(v)) {
    throw new Error(`invalid expires value: ${v}`);
  }
  const max = opts.authed ? Number.POSITIVE_INFINITY : MAX_ANON_TTL_MS;
  const clamp = (ms: number) => Math.min(ms, max);
  switch (v) {
    case "1h": return { expiresAt: opts.nowMs + clamp(HOUR_MS), singleUse: false };
    case "24h": return { expiresAt: opts.nowMs + clamp(DAY_MS), singleUse: false };
    case "1run": return { expiresAt: opts.nowMs + clamp(MAX_ANON_TTL_MS), singleUse: true };
    case "never":
    case "7d-web-default":
      return { expiresAt: opts.nowMs + clamp(MAX_ANON_TTL_MS), singleUse: false };
    default: throw new Error(`unreachable: ${v}`);
  }
}
```

- [ ] **Step 4 — run test, expect PASS (7/7)**

- [ ] **Step 5 — commit:** `feat: expires parser (1h | 24h | 1run | never)`

---

## Task 3: Repo accepts `singleUse`; add `markConsumed`

**Files:** modify `src/repos/scripts.ts`, modify `test/repos_scripts.test.ts`.

- [ ] **Step 1 — extend `CreateHostedInput` and the INSERT**

In `src/repos/scripts.ts`, change `CreateHostedInput`:

```ts
export type CreateHostedInput = {
  content: string;
  visibility: "public" | "private";
  deleteTokenHash: string | null;
  ownerId?: string | null;
  expiresAt?: number | null;
  singleUse?: boolean;
  name?: string | null;
};
```

Change the INSERT to include `single_use`:

```ts
await db
  .prepare(
    `INSERT INTO scripts (slug, kind, content, visibility, owner_id, delete_token_hash, name, expires_at, single_use, created_at, updated_at)
     VALUES (?, 'hosted', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  .bind(
    slug,
    input.content,
    input.visibility,
    input.ownerId ?? null,
    input.deleteTokenHash,
    input.name ?? null,
    input.expiresAt ?? null,
    input.singleUse ? 1 : 0,
    now,
    now
  )
  .run();
```

Also extend `ScriptRow` with `single_use: number` (SQLite returns INTEGER 0/1).

- [ ] **Step 2 — add `markConsumed`**

```ts
/**
 * Atomically marks a single-use script as consumed. Returns true if we won the race
 * (this caller is the one read), false if it was already consumed.
 */
export async function markConsumed(db: D1Database, slug: string): Promise<boolean> {
  const now = Date.now();
  const result = await db
    .prepare(
      `UPDATE scripts SET consumed_at = ?, updated_at = ?
       WHERE slug = ? AND single_use = 1 AND consumed_at IS NULL`
    )
    .bind(now, now, slug)
    .run();
  return (result.meta.changes ?? 0) > 0;
}
```

- [ ] **Step 3 — extend `test/repos_scripts.test.ts`**

```ts
it("createHostedScript persists singleUse=true", async () => {
  const row = await createHostedScript(env.DB, {
    content: "x",
    visibility: "public",
    deleteTokenHash: "h",
    singleUse: true,
  });
  expect(row.single_use).toBe(1);
});

it("markConsumed wins exactly once for the same slug", async () => {
  const row = await createHostedScript(env.DB, {
    content: "x",
    visibility: "public",
    deleteTokenHash: "h",
    singleUse: true,
  });
  expect(await markConsumed(env.DB, row.slug)).toBe(true);
  expect(await markConsumed(env.DB, row.slug)).toBe(false);
});

it("markConsumed returns false for non-single-use scripts", async () => {
  const row = await createHostedScript(env.DB, {
    content: "x",
    visibility: "public",
    deleteTokenHash: "h",
    singleUse: false,
  });
  expect(await markConsumed(env.DB, row.slug)).toBe(false);
});
```

(Add `markConsumed` to the import at the top.)

- [ ] **Step 4 — run tests, expect all green.**

- [ ] **Step 5 — commit:** `feat: scripts repo supports singleUse + markConsumed (atomic)`

---

## Task 4: Wire `expires` into `createAnonymous` and the API route

**Files:** modify `src/routes/api_scripts.ts`, modify `test/api_scripts.test.ts`.

- [ ] **Step 1 — failing tests** in `test/api_scripts.test.ts`

```ts
it("accepts expires=1h on API", async () => {
  const res = await post({ content: "x", visibility: "public", expires: "1h" });
  expect(res.status).toBe(201);
  const json: any = await res.json();
  expect(json.slug).toMatch(/^[0-9A-Za-z]{4,6}$/);
});

it("accepts expires=1run on API", async () => {
  const res = await post({ content: "x", visibility: "public", expires: "1run" });
  expect(res.status).toBe(201);
});

it("rejects invalid expires value with 400", async () => {
  const res = await post({ content: "x", visibility: "public", expires: "forever" });
  expect(res.status).toBe(400);
});
```

- [ ] **Step 2 — modify `createAnonymous`**

Import `parseExpires` at the top:
```ts
import { parseExpires } from "../expires";
```

Change the signature to accept `expires: unknown` and route it through the parser. Catch parser errors and return `{ ok:false, status: 400, error: ... }`. Pass `expiresAt` and `singleUse` into `createHostedScript`. Use `authed: false` for now (Plan 2 will switch this for owned scripts).

Updated body sketch:

```ts
export async function createAnonymous(
  env: Env,
  ip: string,
  content: unknown,
  visibility: unknown,
  expires: unknown
): Promise<CreateResult> {
  if (typeof content !== "string") return { ok: false, status: 400, error: "content required" };
  if (visibility !== "public" && visibility !== "private")
    return { ok: false, status: 400, error: "visibility must be 'public' or 'private'" };
  if (content.length > MAX_ANON_SIZE)
    return { ok: false, status: 413, error: "script too large" };
  if (!(await checkAnonymousLimit(env.SCRIPT_CACHE, ip)))
    return { ok: false, status: 429, error: "rate limit exceeded" };

  let parsed;
  try {
    parsed = parseExpires(
      typeof expires === "string" ? expires : undefined,
      { authed: false, nowMs: Date.now() }
    );
  } catch (e) {
    return { ok: false, status: 400, error: (e as Error).message };
  }

  const deleteToken = generateDeleteToken();
  const deleteTokenHash = await hashToken(deleteToken);
  const row = await createHostedScript(env.DB, {
    content,
    visibility,
    deleteTokenHash,
    expiresAt: parsed.expiresAt,
    singleUse: parsed.singleUse,
  });
  return { ok: true, slug: row.slug, deleteToken };
}
```

The API handler then passes `body?.expires` as the 5th arg. The home route passes `"7d-web-default"` to preserve current behavior:

```ts
// home.ts
const result = await createAnonymous(
  c.env,
  ip,
  form.get("content"),
  form.get("visibility"),
  "7d-web-default"
);
```

- [ ] **Step 3 — run tests, all green.**

- [ ] **Step 4 — commit:** `feat: API accepts expires (1h | 24h | 1run | never)`

---

## Task 5: Enforce expiry + single-use on read (raw + meta)

**Files:** modify `src/routes/raw.ts`, modify `src/routes/meta.ts`, modify `test/raw.test.ts`, modify `test/meta.test.ts`.

- [ ] **Step 1 — failing tests** in `test/raw.test.ts`

```ts
it("returns 410 for an expired script", async () => {
  // Create via API with 1h expires, then manually expire it by writing the DB.
  // Easiest path: create with 1h then warp time via direct DB update.
  const c: any = await (await SELF.fetch("http://x/api/scripts", {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": "192.0.2.40" },
    body: JSON.stringify({ content: "x", visibility: "public", expires: "1h" }),
  })).json();
  // Update expires_at to a past timestamp via env.DB.
  // (Import env from cloudflare:test at top of file.)
  await env.DB.prepare("UPDATE scripts SET expires_at = ? WHERE slug = ?")
    .bind(Date.now() - 1000, c.slug)
    .run();
  const res = await SELF.fetch(`http://x/${c.slug}`);
  expect(res.status).toBe(410);
});

it("1run URL: first read 200, second read 410", async () => {
  const c: any = await (await SELF.fetch("http://x/api/scripts", {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": "192.0.2.41" },
    body: JSON.stringify({ content: "once", visibility: "public", expires: "1run" }),
  })).json();
  const first = await SELF.fetch(`http://x/${c.slug}`);
  expect(first.status).toBe(200);
  expect(await first.text()).toBe("once");
  const second = await SELF.fetch(`http://x/${c.slug}`);
  expect(second.status).toBe(410);
});
```

Add `import { env } from "cloudflare:test";` to `test/raw.test.ts`.

- [ ] **Step 2 — modify `src/routes/raw.ts`**

Replace the handler body so it: (a) checks `expires_at < now` → 410; (b) checks `single_use && consumed_at` → 410; (c) for `single_use && !consumed_at`, run `markConsumed` and only serve if it returns true. **Stop using KV cache for single-use scripts** (they're inherently one-shot — caching makes no sense and breaks the atomic semantics).

```ts
import { Hono } from "hono";
import type { Env } from "../env";
import { getScriptBySlug, markConsumed } from "../repos/scripts";

export const raw = new Hono<{ Bindings: Env }>();

const CACHE_KEY = (slug: string) => `script:${slug}`;
const GONE = (msg: string) => new Response(msg, { status: 410, headers: { "content-type": "text/plain; charset=utf-8" } });

raw.get("/:slug", async (c) => {
  const slug = c.req.param("slug");
  if (slug === "health" || slug === "api") return c.notFound();

  const url = new URL(c.req.url);
  if (url.searchParams.has("view") || url.searchParams.has("meta")) {
    return c.notFound();
  }

  // Hot-path KV cache (non-single-use only).
  const cached = await c.env.SCRIPT_CACHE.get(CACHE_KEY(slug));
  if (cached !== null) {
    return new Response(cached, {
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const row = await getScriptBySlug(c.env.DB, slug);
  if (!row || row.kind !== "hosted" || !row.content) return c.notFound();

  const now = Date.now();
  if (row.expires_at !== null && row.expires_at < now) return GONE("expired");

  if (row.single_use === 1) {
    if (row.consumed_at !== null) return GONE("already consumed");
    const won = await markConsumed(c.env.DB, slug);
    if (!won) return GONE("already consumed");
    // Single-use: never cache.
    return new Response(row.content, {
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  await c.env.SCRIPT_CACHE.put(CACHE_KEY(slug), row.content, {
    expirationTtl: 300,
  });
  return new Response(row.content, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
});
```

- [ ] **Step 3 — modify `src/routes/meta.ts`**

Include `single_use` and `consumed_at` in the JSON response. Do **not** 410 on meta — agents inspecting consumed/expired URLs is a legitimate use case. Just expose the fields.

```ts
return c.json({
  content,
  size: new TextEncoder().encode(content).length,
  sha256: await sha256Hex(content),
  visibility: row.visibility,
  source: row.kind,
  pinned_ref: row.pinned_ref,
  expires_at: row.expires_at,
  consumed_at: row.consumed_at,
  single_use: row.single_use === 1,
  created_at: row.created_at,
});
```

- [ ] **Step 4 — update `test/meta.test.ts`** to assert `consumed_at` and `single_use` exist in the response (both null/false for default scripts).

- [ ] **Step 5 — run tests; all green, expect ~46 total.**

- [ ] **Step 6 — commit:** `feat: enforce expiry + single-use on read; expose in meta`

---

## Task 6: Verify tsc + commit any wrapping

- [ ] `npx tsc --noEmit` clean
- [ ] `npm test` full suite green
- [ ] If `home.ts` or `api_scripts.ts` need cleanup not already committed, commit as `chore: ...`

---

## Task 7: Deploy migration + worker to production

- [ ] **Step 1 — apply migration 0002 to remote:** `npm run migrate:remote`
- [ ] **Step 2 — deploy:** `npm run deploy`
- [ ] **Step 3 — smoke test**

```bash
# Create a 1run URL via API
RESP=$(curl -fsS -X POST https://1ln.sh/api/scripts \
  -H 'content-type: application/json' \
  -d '{"content":"echo single-use\n","visibility":"public","expires":"1run"}')
echo "$RESP"
SLUG=$(echo "$RESP" | python3 -c 'import sys,json; print(json.load(sys.stdin)["slug"])')

# First read: 200
curl -i "https://1ln.sh/$SLUG"
# Second read: 410
curl -i "https://1ln.sh/$SLUG"
# Meta still works
curl -fsS "https://1ln.sh/$SLUG?meta"
```

Expected: first read returns the script, second returns `410 already consumed`, meta returns JSON with `single_use:true, consumed_at:<number>`.

- [ ] **Step 4 — commit any wrangler.toml changes** (none expected).

---

## Self-Review checklist
- [ ] `expires.ts` covers all 5 string values + invalid + default.
- [ ] `single_use` is in migration AND `ScriptRow` AND INSERT AND `?meta` AND `markConsumed` AND raw enforcement.
- [ ] Web UI behavior unchanged (still 7d, no single-use option exposed).
- [ ] Single-use never cached in KV.
- [ ] 410 (not 404) for expired/consumed — agents need the distinction.
- [ ] No regressions: existing tests still pass; total test count climbs from 40 → ~50.
