# 1ln.sh — Design

**Date:** 2026-05-26
**Status:** Design approved, ready for implementation plan
**Domain:** `1ln.sh`

## Summary

`1ln.sh` is a service that turns any shell script into a one-line `curl … | sh` URL. Users paste or push a script (or point at a GitHub-hosted script), get back a short URL, and run it on as many servers as they want. The product is positioned as the **default URL shape for executable shell scripts** — used by humans for fleet alignment and install scripts, and by AI tools for any "you should run this command" flow.

## Goals

- Remove the SSH + long-bash ceremony for running a script across multiple servers a user already controls.
- Be the cleanest possible short URL for shell scripts — `curl 1ln.sh/<slug> | sh`.
- Cover both user-uploaded scripts and existing scripts on GitHub, with no opt-in required from the GitHub script's author.
- Be programmatically usable from day one (public API + MCP server) so AI tools can publish and recommend scripts inline.
- Ship the MVP at near-zero infrastructure cost.

## Non-goals (for MVP)

- Output capture, run dashboards, fleet observability — v2.
- Push-based execution / remote control plane — out of scope.
- Per-server revocable tokens / fine-grained auth — v2.
- Versioning / pinned-version URLs for hosted scripts — v2.
- Custom namespaced slugs for hosted scripts (`1ln.sh/<user>/<name>`) — v2 (claimed aliases for GitHub proxy DO exist; see below).
- Scheduled runs, push triggers, team accounts.
- Active malware scanning.

## Primary use cases

1. **Fleet alignment (the wedge).** User has a script and N servers they own. They want to run the same script on each box without SSHing in, copying the file, and executing — and without standing up Ansible for a one-off. Flow: push script → get one-liner → paste on each box.
2. **Install scripts on GitHub.** Existing `curl raw.githubusercontent.com/…/install.sh | bash` URLs become `curl 1ln.sh/gh/<user>/<repo> | sh`. No maintainer cooperation needed.
3. **AI-published scripts.** An agent (Claude, ChatGPT, internal agent) generates a script for a user, publishes it via API or MCP, and hands the user a one-liner inline.

## Product surface

### Web (`1ln.sh`)

- Landing page: large textarea + two buttons (**Create public link**, **Create private link**).
- Result page: rendered script + copy-able one-liner + one-time delete token ("save this if you want to remove it later").
- Preview page at `1ln.sh/<slug>?view`: human-readable view of any script (hosted or GitHub-proxied), with source link, last-modified, commit SHA (for proxied scripts), and a "report abuse" link.
- Optional GitHub OAuth → minimal dashboard listing user's scripts (rename, edit-if-private, delete).

### CLI (`1ln`)

- `1ln push <file>` → prints `curl 1ln.sh/<slug> | sh` (private by default).
- `1ln push --public <file>` → short slug.
- `1ln ls` / `1ln rm <slug>` (requires login).
- Installable via `curl 1ln.sh/install | sh`. (Dogfooded — the install script is itself a 1ln.sh-served script.)
- Single static Go binary per platform.

### API

- `POST /api/scripts` body `{content, visibility, name?, expires?}` → `{slug, url, oneliner, delete_token}`.
- `GET /<slug>` → raw script as `text/plain` (the endpoint `curl` hits).
- `GET /<slug>?view` or `Accept: text/html` → preview page.
- `GET /<slug>?meta` or `Accept: application/json` → `{content, sha256, size, created_at, source, pinned_ref, expires_at, visibility}`.
- `DELETE /api/scripts/<slug>` with delete token or bearer auth.
- Bearer tokens minted from the dashboard.

### MCP server (`1ln-mcp`)

- Single tool: `publish_script(content, visibility) -> {one_liner, slug, expires_at}`.
- Drops into any MCP-compatible client (Claude Code, Cursor, Claude Desktop).
- Defaults agent-published scripts to private + `expires: 24h`.

## URL & slug strategy

- **Hosted public**: 4–6 char base62 slug, claimed first-come, collision retried. Example: `1ln.sh/abc`.
- **Hosted private**: 18–22 char base62 slug, ~128 bits of entropy — capability URL, the slug IS the secret. Example: `1ln.sh/aB3xK9pQmZjLm2nQzP`.
- **GitHub proxy implicit**: `1ln.sh/gh/<user>/<repo>[/<path>][@<ref>]`. Defaults to repo-root `install.sh` / `setup.sh` / `get.sh` (first one that exists) and `main` branch.
  - Pinning: `@<sha>` or `@<tag>` — pinned URLs cannot change.
- **GitHub proxy claimed alias**: `1ln.sh/<alias>` → points at a GitHub URL chosen by the alias owner. Requires login.
  - Anti-impersonation: aliases under a name matching a GitHub org require OAuth proof of org membership; otherwise the slug is reserved.
- Resolution order on `GET /<path>`:
  1. If `<path>` starts with `gh/`, it's parsed as an implicit GitHub proxy lookup (no DB row required — proxied + KV-cached).
  2. Otherwise look up `<path>` as a `slug` in the `scripts` table. A row of `kind='hosted'` serves its `content`; a row of `kind='github_proxy'` (a claimed alias) resolves to `source_url` and proxies the same way as the implicit form.
  3. Miss → 404.

## Data model

```
scripts
  slug            text  primary key
  kind            text  not null     -- 'hosted' | 'github_proxy'
  content         text  nullable     -- populated for 'hosted'
  source_url      text  nullable     -- raw.githubusercontent URL for 'github_proxy'
  pinned_ref      text  nullable     -- commit SHA or tag if pinned; null = follows branch
  visibility      text  not null     -- 'public' | 'private'
  owner_id        uuid  nullable     -- null = anonymous upload
  delete_token    text  nullable     -- argon2 hash; shown plaintext exactly once at create time
  name            text  nullable     -- dashboard label
  expires_at      timestamptz nullable
  consumed_at     timestamptz nullable -- for single-use ("1run") URLs
  created_at      timestamptz not null
  updated_at      timestamptz not null

users
  id              uuid  primary key
  github_id       text  unique           -- numeric GitHub user id only (e.g. "12345"); not username
  created_at      timestamptz not null

api_tokens
  id              uuid  primary key
  user_id         uuid  not null references users(id)
  token_hash      text  not null
  name            text  nullable
  created_at      timestamptz not null
  last_used_at    timestamptz nullable
```

That's it for MVP. No versions table, no runs table, no per-server tokens.

### Data minimization (locked)

- **No email, no username, no avatar.** Plan 2 stores only the numeric GitHub user id. Username can be re-fetched from GitHub on demand if ever needed for display; do not persist it.
- **No IPs in D1.** Request IPs only appear in transient KV rate-limit keys.
- This is a hard constraint on Plan 2 — do not relax it for convenience features.

### Mutation policy

- **Hosted private**: mutable by owner. This is the fleet use case — fix a bug, re-run `curl` on each box, no new URL.
- **Hosted public**: **immutable**. Edit = delete + republish (new slug). Avoids the phishing footgun where `curl 1ln.sh/abc | sh` from a blog post silently changes meaning.
- **Hosted anonymous**: immutable (no auth to verify).
- **GitHub proxy claimed alias**: alias owner can repoint the alias to a new GitHub URL. Preview page surfaces the current `source_url` and `pinned_ref` (no historical log in MVP).

## Auth & access control

- **Anonymous upload**: paste → get URL + delete token (shown once, then argon2-hashed in DB). No account. Lose the token = the script lives until TTL GC.
- **Owned upload**: GitHub OAuth → script attached to `owner_id`. Editable (if private), listable, deletable via the `1ln` CLI (`1ln login`/`ls`/`rm`/`edit`/`rename`). **No web dashboard** — owner management is CLI-only (see [[1ln-no-ui-decision]]).
- **API / CLI bearer tokens**: scoped to one user. The server enforces ownership on every mutation — a token can only read/edit/delete scripts whose `owner_id` matches the token's user. No admin scope, no list-all, no edit-by-slug bypass. The CLI is an HTTP client with no privileged trust; a stolen token only exposes that user's scripts.
- **Capability URL model**: for private hosted scripts, the URL slug itself is the only secret. No additional token or header required. Revocation = delete the script.

## GitHub proxy

- Lookup: `GET 1ln.sh/gh/<user>/<repo>[/<path>][@<ref>]` resolves to `https://raw.githubusercontent.com/<user>/<repo>/<ref-or-main>/<path-or-default>`.
- Default-path resolution: if `<path>` omitted, probe repo root for `install.sh`, `setup.sh`, `get.sh` in that order. Cache the resolution.
- Caching: KV with TTL — 5 minutes for branch refs (`main`, etc.); effectively forever for SHA refs and tags (they're immutable on GitHub by convention).
- ETag-respecting fetches to avoid GitHub raw rate limit issues.
- GitHub-only at launch. Arbitrary-URL proxy is too easy to abuse.
- Preview page shows currently-served SHA, last-modified, file size, and a warning when serving a branch ref.

## Rate limits, caps, abuse

- **Anonymous upload**: 5 scripts/day/IP, 16 KB max, 7-day TTL.
- **Authed upload**: 100 scripts/day, 64 KB max, no TTL.
- **GitHub proxy reads**: cached aggressively; per-IP rate limit on cache-miss path only.
- **Take-down**: "report abuse" link on every preview page → manual review workflow.
- **Malware scanning**: not in MVP.

## AI-native features

1. **Public API from day one** — agents can publish without UI.
2. **MCP server (`1ln-mcp`)** — inline publishing from any MCP-compatible AI client.
3. **Expiring / single-use URLs** — `POST /api/scripts` accepts `expires: "1h" | "24h" | "1run" | "never"`. `1run` URLs return 410 after first read. Agent-published scripts default to `24h`; web-published default to `never`.
4. **Machine-readable metadata** — `?meta` returns JSON `{content, sha256, size, source, pinned_ref, expires_at, visibility}` so an agent can verify what it's about to recommend or audit a prior publication.

## Tech stack

- **Runtime**: Cloudflare Workers + Hono.
- **Storage**: Cloudflare D1 (SQLite) for relational data; Cloudflare KV as hot-path cache for `slug → content` and GitHub-proxy fetches.
- **Auth**: GitHub OAuth via `@hono/oauth-providers`; session cookies + bearer tokens.
- **Frontend**: server-rendered HTML from the Worker; vanilla JS for textarea/copy interactions. No SPA framework.
- **CLI**: single static Go binary per platform, served from `/install` via a dogfooded install script.
- **MCP server**: TypeScript, distributed via npm + `npx 1ln-mcp`.

Estimated cost: ~$0/month at MVP traffic; ~$5–20/month at meaningful scale.

## MVP scope

### In

- Web: paste textarea, public/private buttons, result page with one-liner + delete token, preview page at `?view`.
- GitHub OAuth + minimal dashboard (list, rename, edit-if-private, delete).
- `GET /<slug>` raw content with correct content-type.
- `?meta` JSON metadata endpoint.
- `POST/DELETE /api/scripts` with bearer tokens.
- GitHub proxy: implicit `/gh/<user>/<repo>[/<path>][@<ref>]` lookup with branch and SHA refs; default-path resolution; aggressive caching.
- GitHub proxy: claimed aliases under owner's namespace with org-membership check for org-matching aliases.
- Expiring / single-use URLs via API flag.
- Go CLI (`1ln push|ls|rm`) installable via `curl 1ln.sh/install | sh`.
- MCP server (`1ln-mcp`) with single `publish_script` tool.
- Rate limits + size caps + anonymous TTL.
- Take-down link on every preview page.

### Out (v2+)

- Output / result capture and run dashboards.
- Per-server revocable tokens.
- Versioning / `@v1` pinning for hosted scripts.
- Custom namespaced slugs for hosted scripts.
- Args / env passing helpers.
- Scheduled runs, push triggers, team accounts.
- Active malware scanning.
- Non-GitHub source proxies (GitLab, Bitbucket, arbitrary URL).

## Open questions

- Exact default-path probe order for GitHub proxy (`install.sh` / `setup.sh` / `get.sh` — anything else worth probing?).
- Whether to display run-count on preview pages (cheap nudge toward "popular scripts" discovery, but adds tracking surface).
- Whether the CLI install script should pin to a SHA by default (yes for security; no for "always-latest" UX). Recommend pin-by-default with a `--latest` override.

## Future work (not blocking MVP)

- **v2 — Output capture**: tiny `1ln run` wrapper or opt-in bootstrap shim that streams stdout/stderr + exit code back to a run record. Dashboard shows per-host outcomes for fleet runs. This is the killer follow-up.
- **v2 — Per-server tokens**: revocable, attributable execution credentials per host.
- **v2 — Version pinning**: `1ln.sh/<slug>@v1` for hosted scripts (parallel to GitHub `@ref` semantics).
- **v3 — Agentic loop**: agent publishes → user runs → agent reads results via `?meta` extended with run data → agent publishes a fix. The substrate for "AI fixes my infra."
