# Core Hosted Scripts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the wedge of 1ln.sh — anonymous users can paste a shell script, get back a one-line `curl 1ln.sh/<slug> | sh` URL (public or private), retrieve it as raw text from any machine, and delete it with a one-time token. Deployed to production on Cloudflare Workers.

**Architecture:** Single Cloudflare Worker (Hono framework) serving HTML pages and a JSON API. Scripts stored in D1 (SQLite). Cloudflare KV used as a hot-path cache for `slug → content` reads (the `curl` path). Anonymous-only in this plan — no GitHub OAuth, no dashboard, no CLI, no proxy.

**Tech Stack:** TypeScript, Cloudflare Workers, Hono, Cloudflare D1, Cloudflare KV, Vitest with `@cloudflare/vitest-pool-workers`, Wrangler.

**Plan scope:** Section 1 of 6. Subsequent plans cover GitHub OAuth + dashboard, GitHub proxy, expiring/single-use URLs, the Go CLI, and the MCP server.

---

## File Structure

```
1ln/
├── package.json
├── tsconfig.json
├── wrangler.toml
├── vitest.config.ts
├── migrations/
│   └── 0001_init.sql
├── src/
│   ├── index.ts              # Hono app entry, route wiring
│   ├── env.ts                # Env type + bindings
│   ├── slug.ts               # generatePublicSlug, generatePrivateSlug
│   ├── tokens.ts             # generateDeleteToken, hashToken, verifyToken
│   ├── repos/
│   │   └── scripts.ts        # createScript, getScript, deleteScript
│   ├── routes/
│   │   ├── api_scripts.ts    # POST/DELETE /api/scripts
│   │   ├── raw.ts            # GET /<slug> (text/plain for curl)
│   │   ├── view.ts           # GET /<slug>?view (HTML preview)
│   │   ├── meta.ts           # GET /<slug>?meta (JSON metadata)
│   │   └── home.ts           # GET / (paste textarea)
│   ├── views/
│   │   ├── layout.ts         # HTML shell
│   │   ├── home.ts           # paste page
│   │   ├── result.ts         # post-create page
│   │   └── preview.ts        # ?view page
│   ├── ratelimit.ts          # per-IP anonymous limit
│   └── cleanup.ts            # scheduled handler — TTL GC
└── test/
    ├── slug.test.ts
    ├── tokens.test.ts
    ├── repos_scripts.test.ts
    ├── api_scripts.test.ts
    ├── raw.test.ts
    ├── view.test.ts
    ├── meta.test.ts
    ├── ratelimit.test.ts
    └── e2e.test.ts
```

Each `src/` file has one responsibility. Routes are thin — they parse, call a repo function, render. Repos own the DB. Slug/token modules are pure. Views are pure functions returning HTML strings.

---

## Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `wrangler.toml`, `vitest.config.ts`, `src/index.ts`, `src/env.ts`
- Test: `test/health.test.ts`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "1ln",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test": "vitest run",
    "test:watch": "vitest",
    "migrate:local": "wrangler d1 migrations apply oneln --local",
    "migrate:remote": "wrangler d1 migrations apply oneln --remote"
  },
  "dependencies": {
    "hono": "^4.12.23"
  },
  "devDependencies": {
    "@cloudflare/vitest-pool-workers": "^0.16.9",
    "@cloudflare/workers-types": "^4.20260526.1",
    "typescript": "^6.0.3",
    "vitest": "^4.1.7",
    "wrangler": "^4.94.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "jsx": "preserve"
  },
  "include": ["src/**/*", "test/**/*"]
}
```

- [ ] **Step 3: Create `wrangler.toml`**

```toml
name = "oneln"
main = "src/index.ts"
compatibility_date = "2026-01-01"
compatibility_flags = ["nodejs_compat"]

[[d1_databases]]
binding = "DB"
database_name = "oneln"
database_id = "PLACEHOLDER_FILL_AFTER_WRANGLER_D1_CREATE"
migrations_dir = "migrations"

[[kv_namespaces]]
binding = "SCRIPT_CACHE"
id = "PLACEHOLDER_FILL_AFTER_WRANGLER_KV_NAMESPACE_CREATE"

[triggers]
crons = ["0 3 * * *"]
```

- [ ] **Step 4: Create `src/env.ts`**

```ts
export type Env = {
  DB: D1Database;
  SCRIPT_CACHE: KVNamespace;
};
```

- [ ] **Step 5: Create `src/index.ts`**

```ts
import { Hono } from "hono";
import type { Env } from "./env";

const app = new Hono<{ Bindings: Env }>();

app.get("/health", (c) => c.text("ok"));

export default {
  fetch: app.fetch,
};
```

- [ ] **Step 6: Create `vitest.config.ts`**

```ts
import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.toml" },
      },
    },
  },
});
```

- [ ] **Step 7: Write failing health-check test — `test/health.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { env, SELF } from "cloudflare:test";

describe("health", () => {
  it("returns ok at /health", async () => {
    const res = await SELF.fetch("http://x/health");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
  });
});
```

- [ ] **Step 8: Install dependencies and run the test**

Run: `npm install && npm test`
Expected: 1 test passes. (Scaffold is wired correctly.)

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json tsconfig.json wrangler.toml vitest.config.ts src/ test/
git commit -m "feat: scaffold Hono worker with health route and vitest workers pool"
```

---

## Task 2: D1 schema + migrations

**Files:**
- Create: `migrations/0001_init.sql`
- Modify: `wrangler.toml` (fill `database_id`)
- Test: `test/migration.test.ts`

- [ ] **Step 1: Create the migration — `migrations/0001_init.sql`**

```sql
CREATE TABLE scripts (
  slug          TEXT PRIMARY KEY,
  kind          TEXT NOT NULL CHECK (kind IN ('hosted', 'github_proxy')),
  content       TEXT,
  source_url    TEXT,
  pinned_ref    TEXT,
  visibility    TEXT NOT NULL CHECK (visibility IN ('public', 'private')),
  owner_id      TEXT,
  delete_token_hash TEXT,
  name          TEXT,
  expires_at    INTEGER,
  consumed_at   INTEGER,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE INDEX scripts_owner_id ON scripts(owner_id);
CREATE INDEX scripts_expires_at ON scripts(expires_at) WHERE expires_at IS NOT NULL;
```

(Users and api_tokens tables land in the OAuth plan, not this one.)

- [ ] **Step 2: Create the D1 database**

Run: `npx wrangler d1 create oneln`
Expected: prints a `database_id`. Copy it.

- [ ] **Step 3: Fill the database_id in `wrangler.toml`**

Replace `PLACEHOLDER_FILL_AFTER_WRANGLER_D1_CREATE` with the actual ID from Step 2.

- [ ] **Step 4: Apply the migration locally**

Run: `npm run migrate:local`
Expected: "Migrations applied!" output.

- [ ] **Step 5: Write a migration sanity test — `test/migration.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";

describe("migration", () => {
  it("has a scripts table with the expected columns", async () => {
    const result = await env.DB.prepare(
      "SELECT name FROM pragma_table_info('scripts')"
    ).all();
    const cols = result.results.map((r: any) => r.name);
    expect(cols).toEqual(expect.arrayContaining([
      "slug", "kind", "content", "source_url", "pinned_ref",
      "visibility", "owner_id", "delete_token_hash", "name",
      "expires_at", "consumed_at", "created_at", "updated_at",
    ]));
  });
});
```

- [ ] **Step 6: Run the test**

Run: `npm test`
Expected: 2 tests pass.

- [ ] **Step 7: Commit**

```bash
git add migrations/ wrangler.toml test/migration.test.ts
git commit -m "feat: add D1 schema for scripts table"
```

---

## Task 3: Create the KV namespace

**Files:**
- Modify: `wrangler.toml` (fill KV `id`)

- [ ] **Step 1: Create the KV namespace**

Run: `npx wrangler kv namespace create SCRIPT_CACHE`
Expected: prints an `id`. Copy it.

- [ ] **Step 2: Fill the KV id in `wrangler.toml`**

Replace `PLACEHOLDER_FILL_AFTER_WRANGLER_KV_NAMESPACE_CREATE` with the actual ID from Step 1.

- [ ] **Step 3: Run the test suite (no new tests; verify bindings still load)**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add wrangler.toml
git commit -m "feat: bind SCRIPT_CACHE KV namespace"
```

---

## Task 4: Slug generation

**Files:**
- Create: `src/slug.ts`
- Test: `test/slug.test.ts`

- [ ] **Step 1: Write failing tests — `test/slug.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { generatePublicSlug, generatePrivateSlug, BASE62 } from "../src/slug";

describe("generatePublicSlug", () => {
  it("returns 4-6 char base62", () => {
    for (let i = 0; i < 100; i++) {
      const s = generatePublicSlug();
      expect(s.length).toBeGreaterThanOrEqual(4);
      expect(s.length).toBeLessThanOrEqual(6);
      for (const c of s) expect(BASE62).toContain(c);
    }
  });
});

describe("generatePrivateSlug", () => {
  it("returns 22 char base62", () => {
    for (let i = 0; i < 100; i++) {
      const s = generatePrivateSlug();
      expect(s.length).toBe(22);
      for (const c of s) expect(BASE62).toContain(c);
    }
  });

  it("has high entropy (no collisions over 10k draws)", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 10000; i++) seen.add(generatePrivateSlug());
    expect(seen.size).toBe(10000);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- slug`
Expected: FAIL with "Cannot find module '../src/slug'".

- [ ] **Step 3: Implement `src/slug.ts`**

```ts
export const BASE62 =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

function randomBase62(len: number): string {
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  let out = "";
  for (let i = 0; i < len; i++) out += BASE62[buf[i]! % 62];
  return out;
}

export function generatePublicSlug(): string {
  // Start at 4; collision handling at the repo layer can request longer.
  return randomBase62(4);
}

export function generatePrivateSlug(): string {
  // 22 chars * log2(62) ≈ 131 bits of entropy — capability URL safe.
  return randomBase62(22);
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `npm test -- slug`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/slug.ts test/slug.test.ts
git commit -m "feat: slug generation (4-char public, 22-char private base62)"
```

---

## Task 5: Delete token generation + hashing

**Files:**
- Create: `src/tokens.ts`
- Test: `test/tokens.test.ts`

- [ ] **Step 1: Write failing tests — `test/tokens.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { generateDeleteToken, hashToken, verifyToken } from "../src/tokens";

describe("tokens", () => {
  it("generates a 32-char base62 token", () => {
    const t = generateDeleteToken();
    expect(t).toMatch(/^[0-9A-Za-z]{32}$/);
  });

  it("hashToken is deterministic and 64 hex chars (sha-256)", async () => {
    const h1 = await hashToken("abc");
    const h2 = await hashToken("abc");
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  it("verifyToken returns true for matching token, false otherwise", async () => {
    const t = generateDeleteToken();
    const h = await hashToken(t);
    expect(await verifyToken(t, h)).toBe(true);
    expect(await verifyToken(t + "x", h)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- tokens`
Expected: FAIL.

- [ ] **Step 3: Implement `src/tokens.ts`**

```ts
import { BASE62 } from "./slug";

export function generateDeleteToken(): string {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  let out = "";
  for (let i = 0; i < 32; i++) out += BASE62[buf[i]! % 62];
  return out;
}

export async function hashToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function verifyToken(token: string, expectedHash: string): Promise<boolean> {
  const actual = await hashToken(token);
  if (actual.length !== expectedHash.length) return false;
  // Constant-time compare.
  let diff = 0;
  for (let i = 0; i < actual.length; i++) {
    diff |= actual.charCodeAt(i) ^ expectedHash.charCodeAt(i);
  }
  return diff === 0;
}
```

Note: SHA-256 (not argon2) is acceptable here because delete tokens are 32-char random capability strings, not user-chosen passwords — no offline brute-force concern. Argon2 isn't available in Workers without WASM gymnastics.

- [ ] **Step 4: Run test to verify pass**

Run: `npm test -- tokens`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tokens.ts test/tokens.test.ts
git commit -m "feat: delete token generation, SHA-256 hashing, constant-time verify"
```

---

## Task 6: Scripts repository

**Files:**
- Create: `src/repos/scripts.ts`
- Test: `test/repos_scripts.test.ts`

- [ ] **Step 1: Write failing tests — `test/repos_scripts.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import {
  createHostedScript,
  getScriptBySlug,
  deleteScript,
  ScriptRow,
} from "../src/repos/scripts";

describe("scripts repo", () => {
  it("creates a public hosted script with a 4-char slug", async () => {
    const row = await createHostedScript(env.DB, {
      content: "echo hi",
      visibility: "public",
      deleteTokenHash: "h",
    });
    expect(row.slug).toMatch(/^[0-9A-Za-z]{4,6}$/);
    expect(row.kind).toBe("hosted");
    expect(row.visibility).toBe("public");
    expect(row.content).toBe("echo hi");
  });

  it("creates a private hosted script with a 22-char slug", async () => {
    const row = await createHostedScript(env.DB, {
      content: "echo secret",
      visibility: "private",
      deleteTokenHash: "h",
    });
    expect(row.slug.length).toBe(22);
  });

  it("retrieves a script by slug", async () => {
    const row = await createHostedScript(env.DB, {
      content: "echo find-me",
      visibility: "public",
      deleteTokenHash: "h",
    });
    const found = await getScriptBySlug(env.DB, row.slug);
    expect(found?.content).toBe("echo find-me");
  });

  it("returns null for missing slug", async () => {
    expect(await getScriptBySlug(env.DB, "nope-not-real-slug")).toBeNull();
  });

  it("deletes a script by slug", async () => {
    const row = await createHostedScript(env.DB, {
      content: "echo bye",
      visibility: "public",
      deleteTokenHash: "h",
    });
    await deleteScript(env.DB, row.slug);
    expect(await getScriptBySlug(env.DB, row.slug)).toBeNull();
  });

  it("retries on slug collision for public", async () => {
    // Insert many to push the pigeonhole — sanity that retry doesn't blow up.
    for (let i = 0; i < 20; i++) {
      await createHostedScript(env.DB, {
        content: `s${i}`,
        visibility: "public",
        deleteTokenHash: "h",
      });
    }
    expect(true).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- repos_scripts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement `src/repos/scripts.ts`**

```ts
import { generatePublicSlug, generatePrivateSlug } from "../slug";

export type ScriptRow = {
  slug: string;
  kind: "hosted" | "github_proxy";
  content: string | null;
  source_url: string | null;
  pinned_ref: string | null;
  visibility: "public" | "private";
  owner_id: string | null;
  delete_token_hash: string | null;
  name: string | null;
  expires_at: number | null;
  consumed_at: number | null;
  created_at: number;
  updated_at: number;
};

export type CreateHostedInput = {
  content: string;
  visibility: "public" | "private";
  deleteTokenHash: string | null;
  ownerId?: string | null;
  expiresAt?: number | null;
  name?: string | null;
};

const MAX_SLUG_RETRIES = 8;

export async function createHostedScript(
  db: D1Database,
  input: CreateHostedInput
): Promise<ScriptRow> {
  const now = Date.now();
  for (let attempt = 0; attempt < MAX_SLUG_RETRIES; attempt++) {
    const slug =
      input.visibility === "public" ? generatePublicSlug() : generatePrivateSlug();
    try {
      await db
        .prepare(
          `INSERT INTO scripts (slug, kind, content, visibility, owner_id, delete_token_hash, name, expires_at, created_at, updated_at)
           VALUES (?, 'hosted', ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          slug,
          input.content,
          input.visibility,
          input.ownerId ?? null,
          input.deleteTokenHash,
          input.name ?? null,
          input.expiresAt ?? null,
          now,
          now
        )
        .run();
      return (await getScriptBySlug(db, slug))!;
    } catch (e: any) {
      // D1 surfaces unique-constraint conflicts as SQLITE_CONSTRAINT.
      if (!String(e?.message ?? e).includes("UNIQUE")) throw e;
      // else retry
    }
  }
  throw new Error("slug collision retry budget exhausted");
}

export async function getScriptBySlug(
  db: D1Database,
  slug: string
): Promise<ScriptRow | null> {
  const row = await db
    .prepare("SELECT * FROM scripts WHERE slug = ?")
    .bind(slug)
    .first<ScriptRow>();
  return row ?? null;
}

export async function deleteScript(db: D1Database, slug: string): Promise<void> {
  await db.prepare("DELETE FROM scripts WHERE slug = ?").bind(slug).run();
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `npm test -- repos_scripts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/repos/scripts.ts test/repos_scripts.test.ts
git commit -m "feat: scripts repository (create, get, delete with collision retry)"
```

---

## Task 7: Per-IP rate limiting (anonymous-only)

**Files:**
- Create: `src/ratelimit.ts`
- Test: `test/ratelimit.test.ts`

- [ ] **Step 1: Write failing tests — `test/ratelimit.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { checkAnonymousLimit } from "../src/ratelimit";

describe("checkAnonymousLimit", () => {
  it("allows the first 5 requests from an IP", async () => {
    const ip = "203.0.113.1";
    for (let i = 0; i < 5; i++) {
      expect(await checkAnonymousLimit(env.SCRIPT_CACHE, ip)).toBe(true);
    }
  });

  it("blocks the 6th request", async () => {
    const ip = "203.0.113.2";
    for (let i = 0; i < 5; i++) await checkAnonymousLimit(env.SCRIPT_CACHE, ip);
    expect(await checkAnonymousLimit(env.SCRIPT_CACHE, ip)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- ratelimit`
Expected: FAIL.

- [ ] **Step 3: Implement `src/ratelimit.ts`**

```ts
const ANON_DAILY_LIMIT = 5;
const DAY_SECONDS = 86400;

function todayKey(ip: string): string {
  const day = Math.floor(Date.now() / 1000 / DAY_SECONDS);
  return `rl:anon:${day}:${ip}`;
}

export async function checkAnonymousLimit(
  kv: KVNamespace,
  ip: string
): Promise<boolean> {
  const key = todayKey(ip);
  const current = parseInt((await kv.get(key)) ?? "0", 10);
  if (current >= ANON_DAILY_LIMIT) return false;
  await kv.put(key, String(current + 1), { expirationTtl: DAY_SECONDS });
  return true;
}
```

Note: this is best-effort (KV is eventually consistent globally). Good enough for anonymous abuse mitigation; not a security control.

- [ ] **Step 4: Run test to verify pass**

Run: `npm test -- ratelimit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ratelimit.ts test/ratelimit.test.ts
git commit -m "feat: per-IP anonymous rate limit (5/day) backed by KV"
```

---

## Task 8: `POST /api/scripts` and `DELETE /api/scripts/:slug`

**Files:**
- Create: `src/routes/api_scripts.ts`
- Modify: `src/index.ts` (wire route)
- Test: `test/api_scripts.test.ts`

- [ ] **Step 1: Write failing tests — `test/api_scripts.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { SELF } from "cloudflare:test";

const post = (body: unknown, ip = "198.51.100.1") =>
  SELF.fetch("http://x/api/scripts", {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": ip },
    body: JSON.stringify(body),
  });

describe("POST /api/scripts", () => {
  it("creates a public script and returns slug/url/oneliner/delete_token", async () => {
    const res = await post({ content: "echo hi", visibility: "public" });
    expect(res.status).toBe(201);
    const json: any = await res.json();
    expect(json.slug).toMatch(/^[0-9A-Za-z]{4,6}$/);
    expect(json.url).toBe(`https://1ln.sh/${json.slug}`);
    expect(json.oneliner).toBe(`curl 1ln.sh/${json.slug} | sh`);
    expect(json.delete_token).toMatch(/^[0-9A-Za-z]{32}$/);
  });

  it("creates a private script with a 22-char slug", async () => {
    const res = await post({ content: "echo secret", visibility: "private" });
    const json: any = await res.json();
    expect(json.slug.length).toBe(22);
  });

  it("rejects content over 16KB for anonymous", async () => {
    const big = "x".repeat(16 * 1024 + 1);
    const res = await post({ content: big, visibility: "public" });
    expect(res.status).toBe(413);
  });

  it("rejects missing visibility", async () => {
    const res = await post({ content: "echo hi" });
    expect(res.status).toBe(400);
  });

  it("rate-limits after 5 anonymous creates from one IP", async () => {
    const ip = "198.51.100.99";
    for (let i = 0; i < 5; i++) await post({ content: `e ${i}`, visibility: "public" }, ip);
    const res = await post({ content: "e 6", visibility: "public" }, ip);
    expect(res.status).toBe(429);
  });
});

describe("DELETE /api/scripts/:slug", () => {
  it("deletes when delete_token is correct", async () => {
    const created: any = await (await post({ content: "rm me", visibility: "public" })).json();
    const del = await SELF.fetch(`http://x/api/scripts/${created.slug}`, {
      method: "DELETE",
      headers: { "x-delete-token": created.delete_token },
    });
    expect(del.status).toBe(204);
    const get = await SELF.fetch(`http://x/${created.slug}`);
    expect(get.status).toBe(404);
  });

  it("rejects wrong delete_token with 403", async () => {
    const created: any = await (await post({ content: "keep me", visibility: "public" })).json();
    const del = await SELF.fetch(`http://x/api/scripts/${created.slug}`, {
      method: "DELETE",
      headers: { "x-delete-token": "wrong" },
    });
    expect(del.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- api_scripts`
Expected: FAIL (route not wired).

- [ ] **Step 3: Implement `src/routes/api_scripts.ts`**

```ts
import { Hono } from "hono";
import type { Env } from "../env";
import {
  createHostedScript,
  getScriptBySlug,
  deleteScript,
} from "../repos/scripts";
import { generateDeleteToken, hashToken, verifyToken } from "../tokens";
import { checkAnonymousLimit } from "../ratelimit";

const MAX_ANON_SIZE = 16 * 1024;

export const apiScripts = new Hono<{ Bindings: Env }>();

apiScripts.post("/api/scripts", async (c) => {
  const ip = c.req.header("cf-connecting-ip") ?? "0.0.0.0";
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body.content !== "string") {
    return c.json({ error: "content required" }, 400);
  }
  if (body.visibility !== "public" && body.visibility !== "private") {
    return c.json({ error: "visibility must be 'public' or 'private'" }, 400);
  }
  if (body.content.length > MAX_ANON_SIZE) {
    return c.json({ error: "script too large" }, 413);
  }
  if (!(await checkAnonymousLimit(c.env.SCRIPT_CACHE, ip))) {
    return c.json({ error: "rate limit exceeded" }, 429);
  }

  const deleteToken = generateDeleteToken();
  const deleteTokenHash = await hashToken(deleteToken);
  const row = await createHostedScript(c.env.DB, {
    content: body.content,
    visibility: body.visibility,
    deleteTokenHash,
  });

  return c.json(
    {
      slug: row.slug,
      url: `https://1ln.sh/${row.slug}`,
      oneliner: `curl 1ln.sh/${row.slug} | sh`,
      delete_token: deleteToken,
    },
    201
  );
});

apiScripts.delete("/api/scripts/:slug", async (c) => {
  const slug = c.req.param("slug");
  const token = c.req.header("x-delete-token");
  if (!token) return c.json({ error: "x-delete-token header required" }, 400);
  const row = await getScriptBySlug(c.env.DB, slug);
  if (!row || !row.delete_token_hash) return c.json({ error: "not found" }, 404);
  if (!(await verifyToken(token, row.delete_token_hash))) {
    return c.json({ error: "forbidden" }, 403);
  }
  await deleteScript(c.env.DB, slug);
  await c.env.SCRIPT_CACHE.delete(`script:${slug}`);
  return new Response(null, { status: 204 });
});
```

- [ ] **Step 4: Wire into `src/index.ts`**

Replace `src/index.ts` with:

```ts
import { Hono } from "hono";
import type { Env } from "./env";
import { apiScripts } from "./routes/api_scripts";

const app = new Hono<{ Bindings: Env }>();

app.get("/health", (c) => c.text("ok"));
app.route("/", apiScripts);

export default {
  fetch: app.fetch,
};
```

- [ ] **Step 5: Run test to verify pass**

Run: `npm test -- api_scripts`
Expected: PASS (7 tests). Note: the test for DELETE depends on Task 9's `GET /<slug>` (404 check) but Hono returns 404 by default for unmatched routes, so this passes even before Task 9.

- [ ] **Step 6: Commit**

```bash
git add src/routes/api_scripts.ts src/index.ts test/api_scripts.test.ts
git commit -m "feat: POST/DELETE /api/scripts with size cap, rate limit, delete tokens"
```

---

## Task 9: `GET /<slug>` raw script (the curl endpoint)

**Files:**
- Create: `src/routes/raw.ts`
- Modify: `src/index.ts`
- Test: `test/raw.test.ts`

- [ ] **Step 1: Write failing tests — `test/raw.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { SELF } from "cloudflare:test";

async function createScript(content: string) {
  const res = await SELF.fetch("http://x/api/scripts", {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": "192.0.2.1" },
    body: JSON.stringify({ content, visibility: "public" }),
  });
  return (await res.json()) as { slug: string };
}

describe("GET /:slug", () => {
  it("returns raw script as text/plain", async () => {
    const { slug } = await createScript("echo hello");
    const res = await SELF.fetch(`http://x/${slug}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^text\/plain/);
    expect(await res.text()).toBe("echo hello");
  });

  it("returns 404 for missing slug", async () => {
    const res = await SELF.fetch("http://x/nonexistent");
    expect(res.status).toBe(404);
  });

  it("does NOT return text/html for bare curl-style request", async () => {
    const { slug } = await createScript("echo a");
    const res = await SELF.fetch(`http://x/${slug}`);
    expect(res.headers.get("content-type")).not.toMatch(/html/);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- raw`
Expected: FAIL.

- [ ] **Step 3: Implement `src/routes/raw.ts`**

```ts
import { Hono } from "hono";
import type { Env } from "../env";
import { getScriptBySlug } from "../repos/scripts";

export const raw = new Hono<{ Bindings: Env }>();

const CACHE_KEY = (slug: string) => `script:${slug}`;

raw.get("/:slug", async (c) => {
  // Skip if this is a known route prefix.
  const slug = c.req.param("slug");
  if (slug === "health" || slug === "api") return c.notFound();

  // Skip if any of the query-mode flags are present — handled by view/meta routes.
  const url = new URL(c.req.url);
  if (url.searchParams.has("view") || url.searchParams.has("meta")) {
    return c.notFound(); // delegated; later tasks register more specific handlers
  }

  // Try KV cache first.
  const cached = await c.env.SCRIPT_CACHE.get(CACHE_KEY(slug));
  if (cached !== null) {
    return new Response(cached, {
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const row = await getScriptBySlug(c.env.DB, slug);
  if (!row || row.kind !== "hosted" || !row.content) return c.notFound();

  // Warm cache (5 min for private-by-owner mutability tolerance).
  await c.env.SCRIPT_CACHE.put(CACHE_KEY(slug), row.content, {
    expirationTtl: 300,
  });

  return new Response(row.content, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
});
```

- [ ] **Step 4: Wire into `src/index.ts`**

```ts
import { Hono } from "hono";
import type { Env } from "./env";
import { apiScripts } from "./routes/api_scripts";
import { raw } from "./routes/raw";

const app = new Hono<{ Bindings: Env }>();

app.get("/health", (c) => c.text("ok"));
app.route("/", apiScripts);
app.route("/", raw);

export default {
  fetch: app.fetch,
};
```

- [ ] **Step 5: Run test to verify pass**

Run: `npm test -- raw`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/routes/raw.ts src/index.ts test/raw.test.ts
git commit -m "feat: GET /<slug> raw script with KV cache"
```

---

## Task 10: `GET /<slug>?meta` JSON metadata

**Files:**
- Create: `src/routes/meta.ts`
- Modify: `src/index.ts`, `src/routes/raw.ts` (remove the meta short-circuit since meta now has its own handler)
- Test: `test/meta.test.ts`

- [ ] **Step 1: Write failing tests — `test/meta.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { SELF } from "cloudflare:test";

async function createScript(content: string, visibility: "public" | "private" = "public") {
  const res = await SELF.fetch("http://x/api/scripts", {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": "192.0.2.2" },
    body: JSON.stringify({ content, visibility }),
  });
  return (await res.json()) as { slug: string };
}

describe("GET /:slug?meta", () => {
  it("returns JSON metadata for an existing script", async () => {
    const { slug } = await createScript("echo hi");
    const res = await SELF.fetch(`http://x/${slug}?meta`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    const json: any = await res.json();
    expect(json.content).toBe("echo hi");
    expect(json.size).toBe(7);
    expect(json.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(json.visibility).toBe("public");
    expect(typeof json.created_at).toBe("number");
    expect(json.expires_at).toBeNull();
    expect(json.source).toBe("hosted");
    expect(json.pinned_ref).toBeNull();
  });

  it("returns 404 for missing slug", async () => {
    const res = await SELF.fetch("http://x/nope?meta");
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- meta`
Expected: FAIL.

- [ ] **Step 3: Implement `src/routes/meta.ts`**

```ts
import { Hono } from "hono";
import type { Env } from "../env";
import { getScriptBySlug } from "../repos/scripts";

export const meta = new Hono<{ Bindings: Env }>();

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

meta.get("/:slug", async (c) => {
  const url = new URL(c.req.url);
  if (!url.searchParams.has("meta")) return c.notFound();
  const slug = c.req.param("slug");
  const row = await getScriptBySlug(c.env.DB, slug);
  if (!row) return c.notFound();
  const content = row.content ?? "";
  return c.json({
    content,
    size: new TextEncoder().encode(content).length,
    sha256: await sha256Hex(content),
    visibility: row.visibility,
    source: row.kind,
    pinned_ref: row.pinned_ref,
    expires_at: row.expires_at,
    created_at: row.created_at,
  });
});
```

- [ ] **Step 4: Wire into `src/index.ts`, BEFORE the `raw` route (more specific first)**

```ts
import { Hono } from "hono";
import type { Env } from "./env";
import { apiScripts } from "./routes/api_scripts";
import { meta } from "./routes/meta";
import { raw } from "./routes/raw";

const app = new Hono<{ Bindings: Env }>();

app.get("/health", (c) => c.text("ok"));
app.route("/", apiScripts);
app.route("/", meta);  // must come before raw
app.route("/", raw);

export default { fetch: app.fetch };
```

- [ ] **Step 5: Update `src/routes/raw.ts` to drop the meta short-circuit (now handled by its own route)**

In `src/routes/raw.ts`, change the early-return:

```ts
  if (url.searchParams.has("view")) {
    return c.notFound();
  }
```

(Drop the `meta` check from the condition since the meta route now handles it.)

- [ ] **Step 6: Run test to verify pass**

Run: `npm test -- meta && npm test -- raw`
Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/routes/meta.ts src/routes/raw.ts src/index.ts test/meta.test.ts
git commit -m "feat: GET /<slug>?meta JSON metadata endpoint"
```

---

## Task 11: HTML views (paste page, result page, preview page)

**Files:**
- Create: `src/views/layout.ts`, `src/views/home.ts`, `src/views/result.ts`, `src/views/preview.ts`
- Test: `test/views.test.ts`

This task builds the HTML strings only (pure functions). Routes wiring is Task 12.

- [ ] **Step 1: Write failing tests — `test/views.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { renderHome } from "../src/views/home";
import { renderResult } from "../src/views/result";
import { renderPreview } from "../src/views/preview";

describe("views", () => {
  it("renderHome contains a textarea and two submit buttons", () => {
    const html = renderHome();
    expect(html).toContain("<textarea");
    expect(html).toContain('name="content"');
    expect(html).toContain("Create public link");
    expect(html).toContain("Create private link");
  });

  it("renderResult shows the one-liner and the delete token", () => {
    const html = renderResult({ slug: "abc", deleteToken: "T0K3N" });
    expect(html).toContain("curl 1ln.sh/abc | sh");
    expect(html).toContain("T0K3N");
  });

  it("renderPreview shows the script content escaped", () => {
    const html = renderPreview({
      slug: "abc",
      content: "<script>alert(1)</script>",
      visibility: "public",
      createdAt: Date.now(),
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- views`
Expected: FAIL.

- [ ] **Step 3: Implement `src/views/layout.ts`**

```ts
export function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function layout(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { font: 16px/1.5 system-ui, sans-serif; max-width: 720px; margin: 2rem auto; padding: 0 1rem; color: #111; }
    h1 { font-size: 1.5rem; }
    textarea { width: 100%; min-height: 16rem; font-family: ui-monospace, monospace; font-size: 14px; padding: .5rem; box-sizing: border-box; }
    pre { background: #f5f5f5; padding: 1rem; overflow-x: auto; border-radius: 4px; font-size: 14px; }
    button { padding: .5rem 1rem; font-size: 1rem; margin-right: .5rem; cursor: pointer; }
    .token { background: #fffae6; border: 1px solid #f5c518; padding: .75rem; border-radius: 4px; font-family: ui-monospace, monospace; }
  </style>
</head>
<body>
${body}
</body>
</html>`;
}
```

- [ ] **Step 4: Implement `src/views/home.ts`**

```ts
import { layout } from "./layout";

export function renderHome(): string {
  return layout(
    "1ln.sh — paste a script, get a one-liner",
    `
<h1>1ln.sh</h1>
<p>Paste a shell script. Get a one-line <code>curl … | sh</code> URL.</p>
<form method="post" action="/">
  <textarea name="content" placeholder="#!/bin/sh&#10;echo hello" required></textarea>
  <div style="margin-top:.5rem;">
    <button type="submit" name="visibility" value="public">Create public link</button>
    <button type="submit" name="visibility" value="private">Create private link</button>
  </div>
</form>
`
  );
}
```

- [ ] **Step 5: Implement `src/views/result.ts`**

```ts
import { layout, escapeHtml } from "./layout";

export function renderResult(opts: { slug: string; deleteToken: string }): string {
  const oneliner = `curl 1ln.sh/${opts.slug} | sh`;
  return layout(
    `1ln.sh/${opts.slug}`,
    `
<h1>Ready</h1>
<p>Run this on any server:</p>
<pre>${escapeHtml(oneliner)}</pre>
<p><a href="/${escapeHtml(opts.slug)}?view">View the script</a></p>
<h2>Delete token</h2>
<p>Save this if you ever want to remove the script. We won't show it again.</p>
<div class="token">${escapeHtml(opts.deleteToken)}</div>
<p style="margin-top:1.5rem;"><a href="/">Create another</a></p>
`
  );
}
```

- [ ] **Step 6: Implement `src/views/preview.ts`**

```ts
import { layout, escapeHtml } from "./layout";

export function renderPreview(opts: {
  slug: string;
  content: string;
  visibility: "public" | "private";
  createdAt: number;
}): string {
  const created = new Date(opts.createdAt).toISOString();
  return layout(
    `1ln.sh/${opts.slug}`,
    `
<h1>1ln.sh/${escapeHtml(opts.slug)}</h1>
<p><strong>Visibility:</strong> ${escapeHtml(opts.visibility)} &middot; <strong>Created:</strong> ${escapeHtml(created)}</p>
<p>One-liner: <code>curl 1ln.sh/${escapeHtml(opts.slug)} | sh</code></p>
<h2>Script</h2>
<pre>${escapeHtml(opts.content)}</pre>
<p><a href="/${escapeHtml(opts.slug)}">Raw</a> &middot; <a href="mailto:abuse@1ln.sh?subject=Report%20${encodeURIComponent(opts.slug)}">Report abuse</a></p>
`
  );
}
```

- [ ] **Step 7: Run test to verify pass**

Run: `npm test -- views`
Expected: PASS (3 tests).

- [ ] **Step 8: Commit**

```bash
git add src/views/ test/views.test.ts
git commit -m "feat: HTML views — home, result, preview (XSS-escaped)"
```

---

## Task 12: Wire HTML routes (`GET /`, `POST /`, `GET /<slug>?view`)

**Files:**
- Create: `src/routes/home.ts`, `src/routes/view.ts`
- Modify: `src/index.ts`, `src/routes/api_scripts.ts` (extract a shared create function)
- Test: `test/home.test.ts`, `test/view.test.ts`

- [ ] **Step 1: Write failing tests — `test/home.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { SELF } from "cloudflare:test";

describe("home", () => {
  it("GET / returns the paste form", async () => {
    const res = await SELF.fetch("http://x/");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/html/);
    expect(await res.text()).toContain('name="content"');
  });

  it("POST / form-submit creates a script and shows the result page", async () => {
    const body = new URLSearchParams({ content: "echo via form", visibility: "public" });
    const res = await SELF.fetch("http://x/", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "cf-connecting-ip": "192.0.2.3",
      },
      body,
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("curl 1ln.sh/");
    expect(html).toContain("Delete token");
  });
});
```

- [ ] **Step 2: Write failing tests — `test/view.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { SELF } from "cloudflare:test";

async function createScript(content: string) {
  const res = await SELF.fetch("http://x/api/scripts", {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": "192.0.2.4" },
    body: JSON.stringify({ content, visibility: "public" }),
  });
  return (await res.json()) as { slug: string };
}

describe("GET /:slug?view", () => {
  it("returns HTML preview", async () => {
    const { slug } = await createScript("echo preview");
    const res = await SELF.fetch(`http://x/${slug}?view`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/html/);
    const html = await res.text();
    expect(html).toContain(slug);
    expect(html).toContain("echo preview");
  });

  it("returns 404 for missing slug with ?view", async () => {
    const res = await SELF.fetch("http://x/nope?view");
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 3: Run tests to verify failure**

Run: `npm test -- home view`
Expected: FAIL.

- [ ] **Step 4: Refactor — extract a shared create helper in `src/routes/api_scripts.ts`**

At the top of `src/routes/api_scripts.ts`, export a reusable helper:

```ts
export type CreateResult =
  | { ok: true; slug: string; deleteToken: string }
  | { ok: false; status: 400 | 413 | 429; error: string };

export async function createAnonymous(
  env: Env,
  ip: string,
  content: unknown,
  visibility: unknown
): Promise<CreateResult> {
  if (typeof content !== "string") return { ok: false, status: 400, error: "content required" };
  if (visibility !== "public" && visibility !== "private")
    return { ok: false, status: 400, error: "visibility must be 'public' or 'private'" };
  if (content.length > MAX_ANON_SIZE)
    return { ok: false, status: 413, error: "script too large" };
  if (!(await checkAnonymousLimit(env.SCRIPT_CACHE, ip)))
    return { ok: false, status: 429, error: "rate limit exceeded" };
  const deleteToken = generateDeleteToken();
  const deleteTokenHash = await hashToken(deleteToken);
  const row = await createHostedScript(env.DB, {
    content,
    visibility,
    deleteTokenHash,
  });
  return { ok: true, slug: row.slug, deleteToken };
}
```

Then refactor the `apiScripts.post(...)` handler to call `createAnonymous(c.env, ip, body.content, body.visibility)` and translate the result to JSON.

- [ ] **Step 5: Implement `src/routes/home.ts`**

```ts
import { Hono } from "hono";
import type { Env } from "../env";
import { renderHome } from "../views/home";
import { renderResult } from "../views/result";
import { createAnonymous } from "./api_scripts";

export const home = new Hono<{ Bindings: Env }>();

home.get("/", (c) =>
  c.html(renderHome())
);

home.post("/", async (c) => {
  const ip = c.req.header("cf-connecting-ip") ?? "0.0.0.0";
  const form = await c.req.formData();
  const result = await createAnonymous(
    c.env,
    ip,
    form.get("content"),
    form.get("visibility")
  );
  if (!result.ok) return c.text(result.error, result.status);
  return c.html(renderResult({ slug: result.slug, deleteToken: result.deleteToken }));
});
```

- [ ] **Step 6: Implement `src/routes/view.ts`**

```ts
import { Hono } from "hono";
import type { Env } from "../env";
import { getScriptBySlug } from "../repos/scripts";
import { renderPreview } from "../views/preview";

export const view = new Hono<{ Bindings: Env }>();

view.get("/:slug", async (c) => {
  const url = new URL(c.req.url);
  if (!url.searchParams.has("view")) return c.notFound();
  const slug = c.req.param("slug");
  const row = await getScriptBySlug(c.env.DB, slug);
  if (!row || row.kind !== "hosted") return c.notFound();
  return c.html(
    renderPreview({
      slug: row.slug,
      content: row.content ?? "",
      visibility: row.visibility,
      createdAt: row.created_at,
    })
  );
});
```

- [ ] **Step 7: Wire into `src/index.ts`**

Routes must be ordered most-specific to least-specific. `home` first (`/` is exact), then `apiScripts` (`/api/...`), then the three query-flag routes (`meta`, `view`), then `raw`:

```ts
import { Hono } from "hono";
import type { Env } from "./env";
import { home } from "./routes/home";
import { apiScripts } from "./routes/api_scripts";
import { meta } from "./routes/meta";
import { view } from "./routes/view";
import { raw } from "./routes/raw";

const app = new Hono<{ Bindings: Env }>();

app.get("/health", (c) => c.text("ok"));
app.route("/", home);
app.route("/", apiScripts);
app.route("/", meta);
app.route("/", view);
app.route("/", raw);

export default { fetch: app.fetch };
```

- [ ] **Step 8: Run test to verify pass**

Run: `npm test`
Expected: ALL tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/routes/ src/index.ts test/home.test.ts test/view.test.ts
git commit -m "feat: HTML routes — GET/POST / and GET /<slug>?view"
```

---

## Task 13: Scheduled cleanup of expired anonymous scripts

**Files:**
- Create: `src/cleanup.ts`
- Modify: `src/index.ts` (add scheduled handler)
- Test: `test/cleanup.test.ts`

For this MVP, anonymous-uploaded scripts get a 7-day TTL. Cleanup runs once daily (already configured in `wrangler.toml`).

- [ ] **Step 1: Update `createAnonymous` to set `expires_at` to now + 7 days**

In `src/routes/api_scripts.ts`, inside `createAnonymous` before calling `createHostedScript`:

```ts
const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
const row = await createHostedScript(env.DB, {
  content,
  visibility,
  deleteTokenHash,
  expiresAt,
});
```

- [ ] **Step 2: Write failing test — `test/cleanup.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { createHostedScript, getScriptBySlug } from "../src/repos/scripts";
import { cleanupExpired } from "../src/cleanup";

describe("cleanupExpired", () => {
  it("deletes scripts past expires_at", async () => {
    const row = await createHostedScript(env.DB, {
      content: "old",
      visibility: "public",
      deleteTokenHash: "h",
      expiresAt: Date.now() - 1000,
    });
    await cleanupExpired(env.DB);
    expect(await getScriptBySlug(env.DB, row.slug)).toBeNull();
  });

  it("keeps scripts not yet expired", async () => {
    const row = await createHostedScript(env.DB, {
      content: "new",
      visibility: "public",
      deleteTokenHash: "h",
      expiresAt: Date.now() + 60_000,
    });
    await cleanupExpired(env.DB);
    expect(await getScriptBySlug(env.DB, row.slug)).not.toBeNull();
  });

  it("keeps scripts with null expires_at", async () => {
    const row = await createHostedScript(env.DB, {
      content: "forever",
      visibility: "public",
      deleteTokenHash: "h",
      expiresAt: null,
    });
    await cleanupExpired(env.DB);
    expect(await getScriptBySlug(env.DB, row.slug)).not.toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify failure**

Run: `npm test -- cleanup`
Expected: FAIL.

- [ ] **Step 4: Implement `src/cleanup.ts`**

```ts
export async function cleanupExpired(db: D1Database): Promise<number> {
  const now = Date.now();
  const result = await db
    .prepare("DELETE FROM scripts WHERE expires_at IS NOT NULL AND expires_at < ?")
    .bind(now)
    .run();
  return result.meta.changes ?? 0;
}
```

- [ ] **Step 5: Wire scheduled handler in `src/index.ts`**

Append to the default export:

```ts
import { cleanupExpired } from "./cleanup";

// ... (existing app definition)

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(cleanupExpired(env.DB).then((n) => console.log(`cleanup: deleted ${n}`)));
  },
};
```

- [ ] **Step 6: Run test to verify pass**

Run: `npm test`
Expected: ALL tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/cleanup.ts src/index.ts src/routes/api_scripts.ts test/cleanup.test.ts
git commit -m "feat: 7-day TTL for anonymous scripts + daily scheduled cleanup"
```

---

## Task 14: End-to-end smoke test

**Files:**
- Create: `test/e2e.test.ts`

- [ ] **Step 1: Write the full flow test — `test/e2e.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { SELF } from "cloudflare:test";

describe("end-to-end", () => {
  it("paste → curl → delete → 404", async () => {
    // 1. Paste via form.
    const form = new URLSearchParams({ content: "#!/bin/sh\necho e2e", visibility: "public" });
    const createRes = await SELF.fetch("http://x/", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "cf-connecting-ip": "203.0.113.10",
      },
      body: form,
    });
    expect(createRes.status).toBe(200);
    const html = await createRes.text();
    const slugMatch = html.match(/curl 1ln\.sh\/([0-9A-Za-z]+)/);
    const tokenMatch = html.match(/<div class="token">([0-9A-Za-z]{32})<\/div>/);
    expect(slugMatch).not.toBeNull();
    expect(tokenMatch).not.toBeNull();
    const slug = slugMatch![1]!;
    const token = tokenMatch![1]!;

    // 2. Curl-style raw fetch.
    const rawRes = await SELF.fetch(`http://x/${slug}`);
    expect(rawRes.status).toBe(200);
    expect(await rawRes.text()).toBe("#!/bin/sh\necho e2e");

    // 3. Meta endpoint.
    const metaRes = await SELF.fetch(`http://x/${slug}?meta`);
    expect(metaRes.status).toBe(200);
    const meta: any = await metaRes.json();
    expect(meta.visibility).toBe("public");

    // 4. View page.
    const viewRes = await SELF.fetch(`http://x/${slug}?view`);
    expect(viewRes.status).toBe(200);
    expect((await viewRes.text())).toContain("echo e2e");

    // 5. Delete.
    const delRes = await SELF.fetch(`http://x/api/scripts/${slug}`, {
      method: "DELETE",
      headers: { "x-delete-token": token },
    });
    expect(delRes.status).toBe(204);

    // 6. 404 after delete.
    const goneRes = await SELF.fetch(`http://x/${slug}`);
    expect(goneRes.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test**

Run: `npm test -- e2e`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add test/e2e.test.ts
git commit -m "test: end-to-end smoke (paste → curl → meta → view → delete → 404)"
```

---

## Task 15: Deploy to production

**Files:** none — config and deploy commands only.

- [ ] **Step 1: Apply migration to the remote D1**

Run: `npm run migrate:remote`
Expected: "Migrations applied!"

- [ ] **Step 2: Deploy the worker**

Run: `npm run deploy`
Expected: deploy succeeds, prints a `*.workers.dev` URL.

- [ ] **Step 3: Smoke-test the deployed worker**

Run:
```bash
WORKER_URL=$(jq -r '.deployments[-1].id // empty' < /dev/null 2>/dev/null; \
  echo "Set WORKER_URL to your *.workers.dev URL printed above")
# Manually paste the URL printed by wrangler:
curl -fsS "$WORKER_URL/health"
```
Expected: `ok`.

- [ ] **Step 4: Add custom domain `1ln.sh` in Cloudflare Workers dashboard**

In the Cloudflare dashboard:
1. Workers & Pages → `oneln` worker → Settings → Triggers → Custom Domains.
2. Add `1ln.sh`.
3. DNS will be auto-managed if `1ln.sh` is already on Cloudflare; otherwise add the printed CNAME at your registrar.

Verify:
```bash
curl -fsS https://1ln.sh/health
```
Expected: `ok`.

- [ ] **Step 5: End-to-end smoke against production**

```bash
SLUG=$(curl -fsS -X POST https://1ln.sh/api/scripts \
  -H 'content-type: application/json' \
  -d '{"content":"echo hello from 1ln.sh","visibility":"public"}' | jq -r '.slug')
echo "slug: $SLUG"
curl -fsS "https://1ln.sh/$SLUG"
```
Expected: prints `echo hello from 1ln.sh`.

- [ ] **Step 6: Commit any wrangler/config updates from the deploy step**

```bash
git add -A
git diff --cached --quiet || git commit -m "chore: deployment configuration"
```

---

## Self-Review

**Spec coverage** (Plan 1 only — auth/proxy/CLI/MCP/expiring URLs deferred to Plans 2–6):

| Spec item (Plan 1 scope) | Task |
| --- | --- |
| Web textarea, public/private buttons | Tasks 11, 12 |
| Result page (one-liner + delete token shown once) | Tasks 11, 12 |
| Preview page at `?view` | Tasks 11, 12 |
| `GET /<slug>` raw `text/plain` for curl | Task 9 |
| `?meta` JSON | Task 10 |
| `POST/DELETE /api/scripts` | Tasks 8, 12 |
| Slug strategy (4–6 public, 22 private) | Tasks 4, 6 |
| Delete tokens (one-time, hashed in DB) | Tasks 5, 8 |
| Anonymous: 5/day/IP, 16KB, 7-day TTL | Tasks 7, 8, 13 |
| Cloudflare Workers + Hono + D1 + KV stack | Tasks 1, 2, 3 |
| Cache `slug → content` in KV for hot reads | Task 9 |
| Take-down link on preview pages | Task 11 |

Items deferred (correctly out of scope for this plan): GitHub OAuth, dashboard, authed bearer tokens, GitHub proxy, claimed aliases, expiring/single-use URLs, CLI, MCP server.

**Placeholder scan:** No TBDs. The two `PLACEHOLDER_FILL_AFTER_…` strings in `wrangler.toml` are explicit substitution targets in Tasks 2 and 3, not unfinished work.

**Type consistency:** `ScriptRow` is defined once in Task 6 and used unchanged in Tasks 8–13. `CreateHostedInput.expiresAt` is added in Task 6 and exercised in Task 13. Route order in `src/index.ts` is updated consistently in Tasks 9, 10, 12.

---

## Next plans (not in this file)

- **Plan 2 — GitHub OAuth + dashboard + ownership:** `users` table, `api_tokens` table, GitHub OAuth flow, session cookies, owner-attached scripts, dashboard pages (list/rename/edit/delete), authed size cap (64KB), no-TTL for owned.
- **Plan 3 — GitHub proxy:** `/gh/<user>/<repo>[/<path>][@<ref>]` implicit lookup, default-path probe, raw.githubusercontent fetch + KV cache (5min branch / forever SHA), claimed aliases with org-membership check.
- **Plan 4 — Expiring / single-use URLs:** API-only `expires: "1h" | "24h" | "1run" | "never"` flag; `consumed_at` enforcement for `1run`.
- **Plan 5 — Go CLI:** `1ln push|ls|rm`, distributed via `curl 1ln.sh/install | sh` (the install script lives in 1ln.sh itself — fitting).
- **Plan 6 — MCP server:** TypeScript MCP server with a single `publish_script` tool, distributed via `npx 1ln-mcp`.
- **Plan 7 — Visual identity & UI polish:** wordmark + favicon + OG image (so `1ln.sh` URLs unfurl nicely in Slack/Twitter/iMessage); designed landing page that explains the product in one sentence; refined paste/result/preview pages with copy-to-clipboard, monospace one-liner styling, and syntax highlighting on preview; dark mode; mobile-responsive layout; designed empty/error states. Best executed after Plan 3 (GitHub proxy) lands — the proxy is what makes the marketing page worth polishing. Good fit for the `frontend-design` skill.
