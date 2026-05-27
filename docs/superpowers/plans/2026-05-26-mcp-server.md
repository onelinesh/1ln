# Plan 6 — MCP Server (`1ln-mcp`)

> **For agentic workers:** Use superpowers:subagent-driven-development.

**Goal:** Ship `1ln-mcp` — a standards-compliant MCP server that exposes a single tool, `publish_script`, so any MCP-compatible client (Claude Desktop, Cursor, Claude Code, Continue, etc.) can publish to 1ln.sh and hand the user back a one-liner inline in conversation.

**Architecture:** Small Node.js (TypeScript) package living at `mcp/` inside this monorepo. Uses `@modelcontextprotocol/sdk` v1.29 with `StdioServerTransport` (the universal transport). The tool handler POSTs to `https://1ln.sh/api/scripts` and returns the result. Configurable base URL via `ONELN_BASE_URL` env var (for testing against staging/local).

**Tech stack:** TypeScript, `@modelcontextprotocol/sdk@^1.29.0`, `zod` for the tool input schema, `tsup` for the bin build (single self-contained `dist/index.js` with a shebang), `vitest` for tests.

**Distribution:** local-installable via `npx 1ln-mcp` once published. **This plan does NOT publish to npm** — that's a one-shot manual step (`npm publish --access public`) the user runs when they're ready. Plan 6 ships the working server, the build, and the docs.

---

## File structure

```
mcp/
├── package.json           # name: 1ln-mcp, bin entry
├── tsconfig.json
├── tsup.config.ts
├── README.md              # install + config instructions
├── src/
│   ├── index.ts           # entry: starts the MCP server
│   ├── server.ts          # buildServer({fetch, baseUrl}) → Server
│   └── publish.ts         # publishScript({fetch, baseUrl}, input) → result
└── test/
    └── publish.test.ts    # unit tests of the tool handler against a mocked fetch
```

The `mcp/` directory has its own `package.json` and `node_modules` — it's a completely standalone npm package. The root project is unaffected.

---

## Task 1: Scaffold `mcp/` package

**Files:** create `mcp/package.json`, `mcp/tsconfig.json`, `mcp/tsup.config.ts`, `mcp/src/index.ts` (skeleton), `mcp/test/publish.test.ts` (empty placeholder).

- [ ] **Step 1 — `mcp/package.json`**

```json
{
  "name": "1ln-mcp",
  "version": "0.1.0",
  "description": "MCP server for 1ln.sh — publish shell scripts and return a one-line curl URL.",
  "type": "module",
  "bin": {
    "1ln-mcp": "./dist/index.js"
  },
  "main": "./dist/index.js",
  "files": ["dist", "README.md"],
  "scripts": {
    "build": "tsup",
    "dev": "tsx src/index.ts",
    "start": "node dist/index.js",
    "test": "vitest run",
    "prepublishOnly": "npm run build"
  },
  "engines": {
    "node": ">=18"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.29.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "tsup": "^8.5.0",
    "tsx": "^4.20.0",
    "typescript": "^6.0.3",
    "vitest": "^4.1.7"
  },
  "publishConfig": {
    "access": "public"
  },
  "repository": {
    "type": "git",
    "url": "git+https://github.com/onelinesh/1ln.git",
    "directory": "mcp"
  },
  "license": "MIT"
}
```

Use the actual latest versions found via `npm view <pkg> version` if any of the above are stale.

- [ ] **Step 2 — `mcp/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "types": ["node"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*", "test/**/*"]
}
```

- [ ] **Step 3 — `mcp/tsup.config.ts`** (builds a single ESM file with a shebang so it runs as a bin)

```ts
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node18",
  outDir: "dist",
  clean: true,
  banner: { js: "#!/usr/bin/env node" },
  dts: false,
  sourcemap: false,
});
```

- [ ] **Step 4 — install in `mcp/`**: `cd mcp && npm install`. Expected: `node_modules/` created, no errors.

- [ ] **Step 5 — verify a stub builds**: temporarily create `mcp/src/index.ts` with `console.log("1ln-mcp ready")`. Run `cd mcp && npm run build`. Verify `mcp/dist/index.js` exists and starts with `#!/usr/bin/env node`. Then run `node mcp/dist/index.js` — should print `1ln-mcp ready` and exit.

- [ ] **Step 6 — `.gitignore` update**: add `mcp/node_modules/` and `mcp/dist/` to the project-root `.gitignore` if `node_modules/` and `dist/` aren't already broad enough (`node_modules/` matches anywhere, same with `dist/`). Verify by running `git status` and confirming nothing under `mcp/node_modules` or `mcp/dist` is staged.

- [ ] **Step 7 — commit**: `git add mcp/package.json mcp/package-lock.json mcp/tsconfig.json mcp/tsup.config.ts mcp/src/index.ts mcp/test/.gitkeep && git commit -m "feat(mcp): scaffold 1ln-mcp package"`

---

## Task 2: Implement `publishScript` (pure function, fully unit-tested)

**Files:** create `mcp/src/publish.ts`, write tests in `mcp/test/publish.test.ts`.

- [ ] **Step 1 — failing tests `mcp/test/publish.test.ts`**

```ts
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
```

- [ ] **Step 2 — run test, expect FAIL.**

- [ ] **Step 3 — implement `mcp/src/publish.ts`**

```ts
export type PublishInput = {
  content: string;
  visibility?: "public" | "private";
  expires?: "1h" | "24h" | "1run" | "never";
};

export type PublishResult = {
  one_liner: string;
  url: string;
  slug: string;
  delete_token: string;
};

export type Deps = {
  fetch: typeof fetch;
  baseUrl: string;
};

export async function publishScript(deps: Deps, input: PublishInput): Promise<PublishResult> {
  const body = {
    content: input.content,
    visibility: input.visibility ?? "private",
    expires: input.expires ?? "24h",
  };
  const res = await deps.fetch(`${deps.baseUrl}/api/scripts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status !== 201) {
    const text = await res.text();
    throw new Error(`1ln.sh returned ${res.status}: ${text}`);
  }
  const json = (await res.json()) as {
    slug: string; url: string; oneliner: string; delete_token: string;
  };
  return {
    one_liner: json.oneliner,
    url: json.url,
    slug: json.slug,
    delete_token: json.delete_token,
  };
}
```

- [ ] **Step 4 — run tests, expect 4/4 PASS.**

- [ ] **Step 5 — commit**: `feat(mcp): publishScript handler with tests`

---

## Task 3: MCP server entry + tool registration

**Files:** create `mcp/src/server.ts`, replace `mcp/src/index.ts`.

- [ ] **Step 1 — `mcp/src/server.ts`**

```ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { publishScript, type Deps } from "./publish";

const PublishInputSchema = z.object({
  content: z.string().min(1).describe("The shell script to publish."),
  visibility: z.enum(["public", "private"]).optional()
    .describe("'private' (default) for an unguessable 22-char URL; 'public' for a short 4-char URL."),
  expires: z.enum(["1h", "24h", "1run", "never"]).optional()
    .describe("'24h' default. '1run' makes the URL work exactly once."),
});

export function buildServer(deps: Deps) {
  const server = new Server(
    { name: "1ln-mcp", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "publish_script",
        description:
          "Publishes a shell script to 1ln.sh and returns a one-line `curl … | sh` URL the user can run on any server. " +
          "Default visibility is 'private' (unguessable URL); pass 'public' for a short shareable URL. " +
          "Default expires is '24h'; pass '1run' for single-use.",
        inputSchema: {
          type: "object",
          properties: {
            content: { type: "string", description: "The shell script to publish." },
            visibility: { type: "string", enum: ["public", "private"], description: "Default: private" },
            expires: { type: "string", enum: ["1h", "24h", "1run", "never"], description: "Default: 24h" },
          },
          required: ["content"],
        },
      },
    ],
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

- [ ] **Step 2 — `mcp/src/index.ts`** (replace the stub)

```ts
#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildServer } from "./server";

const baseUrl = process.env.ONELN_BASE_URL ?? "https://1ln.sh";
const server = buildServer({ fetch: globalThis.fetch, baseUrl });
const transport = new StdioServerTransport();
await server.connect(transport);
```

- [ ] **Step 3 — verify the build still works**: `cd mcp && npm run build`. Inspect `dist/index.js` for the shebang at the top.

- [ ] **Step 4 — quick smoke test**: pipe an MCP initialize request into the binary and verify it responds. Run from `mcp/`:

```bash
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized","params":{}}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' \
  | node dist/index.js 2>&1 | head -30
```

Expected: at least two JSON responses on stdout — the initialize result and the tools/list result containing `publish_script`. (Process won't exit because stdio MCP stays connected; that's fine — kill it after you see the responses.)

- [ ] **Step 5 — commit**: `feat(mcp): MCP server wiring with publish_script tool over stdio`

---

## Task 4: README + manual end-to-end check

**Files:** create `mcp/README.md`.

- [ ] **Step 1 — write `mcp/README.md`**

````markdown
# 1ln-mcp

MCP server for [1ln.sh](https://1ln.sh) — publishes shell scripts and returns a one-line `curl … | sh` URL inline in conversation.

## Tool

### `publish_script`

| Argument | Type | Default | Notes |
| --- | --- | --- | --- |
| `content` | string | required | The shell script. |
| `visibility` | `"public"` \| `"private"` | `"private"` | Public gets a 4-char URL; private gets a 22-char capability URL. |
| `expires` | `"1h"` \| `"24h"` \| `"1run"` \| `"never"` | `"24h"` | `1run` URLs work exactly once. |

Returns: `{ one_liner, url, slug, delete_token }`.

## Install

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "1ln": {
      "command": "npx",
      "args": ["-y", "1ln-mcp"]
    }
  }
}
```

Restart Claude Desktop. The `publish_script` tool will appear in the tools menu.

### Claude Code

```bash
claude mcp add 1ln npx -- -y 1ln-mcp
```

### Cursor / Continue / any other MCP client

Use the same stdio command: `npx -y 1ln-mcp`. Optionally set `ONELN_BASE_URL` to point at a different deployment.

## Use it

> "Write me a deploy script for my static site and publish it."

The model will generate the script, call `publish_script`, and reply with the one-liner — paste it on your server and run.

## Development

```bash
cd mcp
npm install
npm test
npm run dev   # runs against https://1ln.sh
ONELN_BASE_URL=http://localhost:8787 npm run dev   # against local wrangler dev
```

## License

MIT
````

- [ ] **Step 2 — commit**: `docs(mcp): README with install instructions for Claude Desktop, Cursor, Claude Code`

- [ ] **Step 3 — optional: real end-to-end test against production**. Manually run:

```bash
cd mcp
# Send an actual tool call.
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized","params":{}}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"publish_script","arguments":{"content":"echo from MCP","expires":"1h"}}}' \
  | node dist/index.js 2>&1 | head -50
```

Expected: the third response contains `Run this on any server:` and a real `curl 1ln.sh/<slug> | sh` line that resolves against production. Capture the slug from the output and verify it with `curl https://1ln.sh/<slug>`.

If that works, the package is ready to publish.

- [ ] **Step 4 — DO NOT `npm publish`**. The plan stops here. The user runs `cd mcp && npm publish --access public` when they're ready.

---

## Self-Review checklist
- [ ] `mcp/` is a fully standalone npm package — `cd mcp && npm install && npm test && npm run build` all work without touching root.
- [ ] `mcp/dist/index.js` starts with `#!/usr/bin/env node` so it's executable as a bin.
- [ ] Tool defaults: visibility=private, expires=24h. Matches what the spec promised for agent-published scripts.
- [ ] Manual stdio smoke test produces a real 1ln.sh URL.
- [ ] README covers Claude Desktop, Claude Code, and Cursor install paths.
- [ ] No `mcp/node_modules` or `mcp/dist` committed.
- [ ] Root project (`src/`, `test/`) is untouched.

---

## Next steps (post-Plan-6, not in this plan)
- Publish to npm: `cd mcp && npm publish --access public`. After that, `npx 1ln-mcp` works for everyone.
- Future tools to add: `list_my_scripts`, `delete_script`, `inspect_url` (fetches `?meta` and shows the script before any user is asked to run it).
