# Plan 7 — Visual Identity & UI Polish — Design

**Date:** 2026-05-26
**Status:** Design approved, ready for implementation plan
**Scope:** Replace the current generic CSS with a complete terminal-native visual identity. Polish all existing page surfaces. Add favicon and OG image. Add copy-to-clipboard. Make mobile sane. Add proper error/410 pages. Don't add new features.

---

## Summary

1ln.sh ships today with system-font HTML and a single inline `<style>` block. Functional, generic, forgettable. Plan 7 gives the product a coherent terminal-native visual identity, applies it consistently across all five rendered surfaces, ships a wordmark/favicon/OG-image set so links unfurl with character, and adds two interaction details (copy-to-clipboard, basic shell syntax highlighting on previews) that bring the polish up to "production product" rather than "weekend project."

No new features. No marketing landing page. No light-mode toggle. No analytics. Strictly visual.

---

## Locked decisions

Established during brainstorming:

| | |
| --- | --- |
| **Aesthetic** | Terminal-native (dark only, no light mode in v1) |
| **Background** | `#0d0d0d` (off-black, never pure black) |
| **Surface** | `#181818` (panels, code blocks, the textarea) |
| **Border** | `#232323` (panel borders, dividers) |
| **Text primary** | `#e8e1d8` (warm off-white, never `#fff`) |
| **Text secondary** | `#8a8a8a` (subtitles, metadata, prompts) |
| **Text muted** | `#5a5a5a` (placeholders, less-important detail) |
| **Accent** | `#f5a623` (amber — buttons, links, the `.sh` in the wordmark, the curl `→` arrow, the active prompt) |
| **Accent hover** | `#ffbb4d` (lighter amber for hover/focus states) |
| **Danger** | `#e85d4d` (warm red for `410 Gone`, `404`, error text — distinct from amber) |
| **Font** | `IBM Plex Mono` for everything, with `ui-monospace, SF Mono, Menlo, Consolas, monospace` fallback |
| **Wordmark** | `1ln<span class="accent">.sh</span>` — amber dot through TLD |
| **Page structure** | Tiny hero above the form on `/`; no separate landing page |
| **Mobile** | Single column already; fix textarea sizing, button widths, font scales |

These are non-negotiable in the implementation plan. The implementation may refine *within* these tokens (e.g., a slightly different border weight) but cannot replace them.

---

## Scope: surfaces to polish

### 1. `GET /` — home (paste form)

Add a tiny hero above the existing form:

```
1ln.sh                                              [terminal-aesthetic header bar]
─────────────────────────────────────────────
$ paste a script → get a curl URL.             [one-line tagline, amber prompt]

[ textarea ]                                    [the existing textarea, restyled]

[ Create public link ]  [ Create private link ] [restyled buttons]

`curl 1ln.sh/gh/<user>/<repo> | sh` also works. [a single muted line below the
                                                  form mentioning the proxy feature]
```

Hero is **two lines**: the wordmark and the tagline. That's the whole "marketing." A first-time visitor immediately sees what the product does without needing a separate landing page; a repeat user paste-and-goes in one beat.

The proxy mention at the bottom is a one-liner — no navigation, no sections, no scroll. Just discoverability.

### 2. `GET /<slug>?view=1` — paste preview

The current preview shows the script, the visibility, the created timestamp, the one-liner, and a "report abuse" link. Polish:

- Apply the new design tokens.
- The one-liner gets a **copy button** to its right (the killer interaction — see § Interactions).
- The script body uses **basic shell syntax highlighting** (see § Syntax highlighting).
- Add an at-a-glance **status row** at the top showing visibility, age, expires-in, single-use indicator (icons + short text — no chrome).
- "Report abuse" link goes in a small footer, not inline with the script.

### 3. `GET /<slug>?view=1` for an expired or consumed script — gone state

Currently the security fix returns a 410 with a one-line "This URL has expired." page. Polish:

- Use the full layout (wordmark header, dark background) so the gone page doesn't look broken.
- Big amber `410 Gone` heading.
- Sub-line explaining which thing happened ("This URL expired 3 hours ago" or "This URL was used at 14:23 UTC and is now empty").
- A subtle "Create a new one →" link back to `/`.

### 4. `GET /gh/<user>/<repo>...?view=1` — github proxy preview

Currently shows source URL, ref, content. Polish:

- Same design tokens as the paste preview.
- Replace the inline yellow-box warning with a **chip** ("Following branch: `main` — content can change") that sits in the status row, in amber.
- Pinned-SHA chip in a different style ("Pinned: `a1b2c3d` — immutable").
- Copy button on the one-liner.
- Syntax highlighting on the script.
- "Source" line shows the resolved `raw.githubusercontent.com` URL as a smaller, secondary link.

### 5. `GET /<slug>` — the result page after creating a script

This is the page a user lands on immediately after pasting. Currently shows the one-liner in a `<pre>` and the delete token in a yellow box. Polish:

- Wordmark header.
- Big amber `Ready.` heading (no exclamation point — restraint).
- The one-liner gets the **same copy button treatment** as the preview (consistency).
- A muted line: "Run this on any server."
- Delete token in its own panel with a clear "Save this — we won't show it again" label. Copy button on the token too.
- Two secondary links at the bottom: "View the script" and "Create another."

### 6. `GET /` 404 and worker errors

Currently any unmatched path falls through to Hono's default 404. Polish: a designed 404 page (same layout shell, big amber `404`, "no script at `/<path>`", link back to `/`).

### 7. Footer (every page)

A single muted bottom line: `1ln.sh · curl-pipe-bash, but with a URL bar. · github / abuse`. Three links. Quiet.

---

## Wordmark, favicon, OG image

### Wordmark

Inline HTML, no SVG required:

```html
<a href="/" class="wm">1ln<span class="wm-dot">.sh</span></a>
```

CSS: `font-weight: 700`, `letter-spacing: -0.04em`, `font-size: clamp(1.5rem, 4vw, 2rem)`. `.wm-dot` is `color: var(--accent)`.

### Favicon

Two assets:

1. **`favicon.svg`** (modern browsers) — 64×64 SVG showing `1ln.` with the dot in amber. Background `#0d0d0d`. Text in `#e8e1d8` IBM Plex Mono (embedded as SVG text — no font file dependency).
2. **`favicon.ico`** (fallback) — 32×32 raster generated from the SVG.

Both served from `/favicon.svg` and `/favicon.ico` as Worker-served static responses (no CDN needed — they're under 2KB each).

### OG image (`/og.png`)

1200×630 PNG (Twitter/Slack/iMessage unfurl standard). Composition:

```
┌────────────────────────────────────────────┐
│                                            │
│   $ 1ln.sh                                 │
│                                            │
│   paste a script.                          │
│   get a curl URL.                          │
│                                            │
│   curl 1ln.sh/oGcP | sh                    │  ← amber accent
│                                            │
└────────────────────────────────────────────┘
        background: #0d0d0d
        text:       #e8e1d8 (IBM Plex Mono)
        accent:     #f5a623
```

Generated **dynamically at the edge** using `@vercel/og`-style SVG-to-PNG in the Worker (Cloudflare's `workers-og` package or hand-rolled SVG + the satori/resvg pipeline). Single static OG image is fine for v1 — no per-script OG generation yet (that's an obvious follow-up but explicitly out of scope).

If `workers-og` adds too much weight (~200KB bundle), fall back to a **static pre-generated PNG** checked into the repo and served at `/og.png`. Decision lives in the implementation plan; the spec just requires the URL exists and looks right.

### `<head>` metadata on every page

```html
<meta name="description" content="Paste a shell script. Get a one-line curl URL you can run on any server. Or proxy any install script from GitHub.">
<meta property="og:title" content="1ln.sh">
<meta property="og:description" content="Paste a shell script. Get a one-line curl URL.">
<meta property="og:image" content="https://1ln.sh/og.png">
<meta property="og:url" content="https://1ln.sh">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#0d0d0d">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="alternate icon" href="/favicon.ico">
```

For per-script pages (preview/result/gh_preview), the title and og:title become `1ln.sh/<slug>` so unfurls in chat tell the recipient what they're getting.

---

## Interactions

### Copy-to-clipboard

The one-liner is the product. It needs a one-click copy. Treatment:

```
┌──────────────────────────────────────┬──────┐
│ curl 1ln.sh/oGcP | sh                │  ⧉   │   (amber border on hover)
└──────────────────────────────────────┴──────┘
```

The button:
- Same height as the code block, attached to its right edge.
- Icon-only (`⧉` or an inline SVG of two overlapping rectangles), tooltip "Copy."
- Click → `navigator.clipboard.writeText(...)` → swap icon to `✓` + change tooltip to "Copied" for 1.5 seconds.
- Works on the result page (one-liner + delete token), preview page (one-liner), and gh_preview page (one-liner).

Implemented as a tiny inline `<script>` in the page (no separate JS bundle, no framework). The script is the same three lines copy-pasted into each page that needs it. Acceptable duplication.

### Shell syntax highlighting

The script content on preview pages is currently a plain `<pre>`. Apply minimal client-side highlighting:

- Comments (`#...` to end of line): muted gray.
- Strings (single or double quoted): warm amber.
- Common shell keywords (`if`, `then`, `fi`, `for`, `do`, `done`, `while`, `case`, `esac`, `function`, `return`, `export`, `local`, `echo`, `printf`, `read`, `set`, `cd`, `cat`): bright off-white.
- Everything else: regular text color.

Don't pull in highlight.js or prism — they're 50KB+ each and overkill for a one-language preview. Hand-roll ~30 lines of regex-based highlighting inline. If it misses an edge case (e.g., heredoc, `$((...))`), the worst outcome is "no color" — graceful degradation.

### Hover/focus states

- All buttons and links: amber border on hover, slightly brighter amber on focus (`#ffbb4d`).
- The textarea: subtle amber outline on focus, no other border change.
- Selected text inside `<pre>` and the one-liner: amber background (`::selection { background: #f5a623; color: #0d0d0d; }`).

### Empty/loading states

- Empty textarea placeholder: `#!/bin/sh\necho "your one-liner"` in muted gray.
- After submit (the brief moment before the result page renders): no spinner needed — the post-redirect to the result page is fast enough that any loading state would just flash.
- If JS is disabled, every page still works (copy-to-clipboard fails gracefully — the user can still select and copy manually).

---

## Mobile

Current pages already render on mobile because they're plain HTML in a 720px-max container. Polish:

- `max-width: 720px` becomes `max-width: min(720px, 100vw - 32px)` — 16px padding on small screens.
- Heading `font-size` uses `clamp(...)` for fluid scaling.
- Buttons stack vertically below 480px (the two `Create public/private` buttons especially).
- The copy button stays at the right edge of the code block (no stacking — kept compact).
- Status row chips wrap to a new line if they don't fit.

No separate mobile breakpoint stylesheet — the layout is simple enough that container queries and `clamp()` carry all of it.

---

## Code organization

The current view layer is four files under `src/views/`. Plan 7 evolves them rather than rewriting:

| Existing | After |
| --- | --- |
| `src/views/layout.ts` — single `<style>` block, `escapeHtml`, `layout(title, body)` | Now exports the design tokens as CSS custom properties at the top of the `<style>` block. Adds the meta tags, favicon link, theme-color. Adds the wordmark header and footer markup that wraps every page. |
| `src/views/home.ts` — paste form | Add hero + tagline + proxy mention. Restyle form + buttons against the new tokens. |
| `src/views/result.ts` — one-liner + delete token | Add copy buttons to both the one-liner and the delete token. Restyle the token panel. |
| `src/views/preview.ts` — script + meta | Add status row. Add copy button. Add inline shell highlighter. |
| `src/views/gh_preview.ts` — github proxy preview | Same as preview, plus the branch/SHA chip. |

New files:

| New file | What it does |
| --- | --- |
| `src/views/tokens.ts` | Exports the design-token CSS string used by `layout.ts`. One source of truth for colors and the font stack. |
| `src/views/wordmark.ts` | Exports `renderWordmark()` and `renderHeader()` / `renderFooter()`. Used by `layout.ts`. |
| `src/views/copy_button.ts` | Exports `renderCopyButton(targetSelector)` and `copyButtonScript()`. Inlined per page. |
| `src/views/shell_highlight.ts` | Exports `highlightShell(code: string): string` (returns HTML). Used by preview and gh_preview. Server-side highlighting — no client JS. |
| `src/views/gone.ts` | Exports `renderGone({ reason: "expired" \| "consumed", at: number })`. Replaces the inline 410 layouts in view.ts / meta.ts (though meta still returns JSON, not HTML). |
| `src/views/not_found.ts` | Exports `renderNotFound(path: string)`. Designed 404 page. |

New routes/handlers:

| Route | Handler |
| --- | --- |
| `GET /favicon.svg` | Inline SVG response. `Cache-Control: public, max-age=86400`. |
| `GET /favicon.ico` | Either inlined raster (base64 in worker) or proxied from a checked-in static file. |
| `GET /og.png` | Static or dynamically-generated 1200×630 PNG. Cached at the edge. |
| Catch-all 404 | Wire `app.notFound(c => c.html(renderNotFound(c.req.path), 404))` in `src/index.ts`. |

All new files are < 100 LOC. No file in `src/views/` should exceed ~150 LOC after this work; if anything does, the split needs revisiting.

---

## Out of scope (explicit list to prevent creep)

- **Light mode toggle.** Dark only for v1.
- **Marketing landing page** with separate sections (features / how-it-works / pricing). The tiny hero is the entire marketing.
- **Per-script OG images** (a dynamically-generated OG image per slug showing the script content). Tempting but adds real complexity (`workers-og` runtime cost, abuse — a single OG endpoint that renders arbitrary attacker text is a small SSRF/DoS surface). Single global OG image only.
- **Animations beyond essential.** Copy-button icon swap and `:hover` transitions only. No page-load animations, no scroll effects.
- **Code beautification / formatter** for the pasted script. We render what the user pasted, with syntax highlighting only.
- **Themes or per-user customization.** Single theme.
- **A separate stylesheet file.** All CSS stays inline in `layout.ts` via the tokens module — keeps the Worker bundle one file and serves with no extra HTTP round-trip.
- **Web fonts loaded from Google Fonts CDN.** Self-host the IBM Plex Mono `.woff2` file in the Worker bundle (single ~50KB asset) — privacy, speed, and resilience. The implementation plan picks the exact file (regular + bold subset).
- **Dark theme system-color-scheme respect.** We're terminal-aesthetic; we set `color-scheme: dark` and don't bother with `prefers-color-scheme`.
- **Accessibility deep dive.** We will set sensible defaults (semantic HTML, focus-visible outlines in amber, ARIA labels on the copy buttons, contrast ratios verified for AA). A formal a11y audit is a separate later effort.

---

## Acceptance

This plan ships when:

1. Every page (`/`, `/<slug>`, `/<slug>?view`, `/gh/...`, `/gh/...?view`, expired/consumed 410, 404) is rendered with the new design tokens, the IBM Plex Mono webfont (self-hosted), the amber accent, the wordmark header, and the footer.
2. `/favicon.svg`, `/favicon.ico`, and `/og.png` all return 200 and look right when previewed.
3. The one-liner on the result, preview, and gh_preview pages has a working copy button.
4. The script body on preview and gh_preview pages is rendered with shell syntax highlighting.
5. The 410 gone state has its own designed page (not just `c.text(...)`).
6. The 404 has its own designed page.
7. The page works on a 360px-wide mobile viewport — buttons readable, no horizontal scroll, copy button still reachable.
8. Slack / Twitter / iMessage / Discord unfurls of any 1ln.sh URL show the OG image and the page title.
9. Existing 105/105 tests still green; new view-rendering snapshot or HTML-shape tests added for each polished surface.

---

## Future work (not in this plan)

- Per-script OG images that render the actual script preview.
- Optional light theme (would invert the token palette, not add a new one — same amber accent).
- A `1ln.sh/about` page with the actual story behind the tool.
- Real social sharing buttons on previews.
- "Popular scripts on 1ln.sh" discovery surface (would only make sense once we have meaningful usage and a tracking story).
