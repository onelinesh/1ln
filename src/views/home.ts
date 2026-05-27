import { layout, escapeHtml } from "./layout";
import { renderCopyButton, copyButtonScript } from "./copy_button";

const EXAMPLE_URL = "curl 1ln.sh/oGcP | sh";

const ICON_TERMINAL = `<svg class="sect-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><polyline points="7 9 10 12 7 15"/><line x1="12" y1="15" x2="17" y2="15"/></svg>`;
const ICON_EXTENSION = `<svg class="sect-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4.5a2 2 0 1 0-4 0V6H6a1.5 1.5 0 0 0-1.5 1.5V11h1.25a2 2 0 1 1 0 4H4.5v3.5A1.5 1.5 0 0 0 6 20h3.5v-1.25a2 2 0 1 1 4 0V20H17a1.5 1.5 0 0 0 1.5-1.5V15H20a2 2 0 1 0 0-4h-1.5V7.5A1.5 1.5 0 0 0 17 6h-3V4.5Z"/></svg>`;
const ICON_SCHEDULE = `<svg class="feat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg>`;
const ICON_BOLT = `<svg class="feat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="13 3 4 14 11 14 10 21 19 9 13 9 13 3"/></svg>`;

export function renderHome(): string {
  return layout(
    "1ln.sh — paste a script, get a curl URL",
    `<section class="hero">
  <img src="/favicon.svg" alt="1ln.sh" width="128" height="128" class="hero-mark" />
  <p class="hero-tagline">Paste a shell script. Get a one-line <code>curl &hellip; | sh</code> URL you can run on any server.</p>
  <div class="hero-example" aria-label="Example">
    <span class="hero-example-prompt secondary">$ 1ln push deploy.sh</span>
    <span class="hero-example-arrow secondary">&rarr;</span>
    <code class="hero-example-url accent">${escapeHtml(EXAMPLE_URL)}</code>
  </div>
</section>

<section>
  <h2 class="sect-h">${ICON_TERMINAL}<span>Install the CLI</span></h2>
  <div class="code-row">
    <pre id="install-cmd" data-copy-value="curl 1ln.sh/install | sh">curl 1ln.sh/install | sh</pre>
    ${renderCopyButton("install-cmd")}
  </div>
  <p class="step-label secondary">then push any script:</p>
  <div class="code-row">
    <pre id="push-cmd" data-copy-value="1ln push deploy.sh">1ln push deploy.sh</pre>
    ${renderCopyButton("push-cmd")}
  </div>
</section>

<section>
  <h2 class="sect-h">${ICON_EXTENSION}<span>MCP for Claude Code</span></h2>
  <div class="code-row">
    <pre id="mcp-cmd" data-copy-value="claude mcp add 1ln npx -- -y 1ln-mcp">claude mcp add 1ln npx -- -y 1ln-mcp</pre>
    ${renderCopyButton("mcp-cmd")}
  </div>
</section>

<ul class="features" aria-label="More features">
  <li>${ICON_SCHEDULE}<span>Expiring URLs (1h, 24h, never)</span></li>
  <li>${ICON_BOLT}<span>Single-use links</span></li>
</ul>

<details class="browser-try">
  <summary>Try it in the browser</summary>
  <form method="post" action="/" class="paste-form">
    <textarea name="content" placeholder="#!/bin/sh&#10;echo &quot;your one-liner&quot;" required spellcheck="false" autocapitalize="off" autocorrect="off"></textarea>
    <div class="paste-actions">
      <button type="submit" name="visibility" value="public" class="btn-primary">Create public link</button>
      <button type="submit" name="visibility" value="private" class="btn-secondary">Create private link</button>
    </div>
  </form>
</details>
${copyButtonScript()}`
  );
}
