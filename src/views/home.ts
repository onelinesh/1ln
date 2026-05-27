import { layout } from "./layout";

export function renderHome(): string {
  return layout(
    "1ln.sh — paste a script, get a curl URL",
    `<div class="hero-mark" aria-hidden="true">
  <svg viewBox="0 0 64 64" width="56" height="56" fill="none" role="img">
    <rect width="64" height="64" rx="10" fill="#0d0d0d"/>
    <rect x="12" y="30.5" width="30" height="3" fill="#e8e1d8"/>
    <circle cx="48" cy="32" r="5" fill="#f5a623"/>
  </svg>
</div>
<h1><span class="secondary">$</span> 1ln<span class="accent">.sh</span></h1>
<p class="subtitle">Paste a script, get a one-line <code>curl</code> URL. CLI + MCP for AI agents.</p>

<h2>Install the CLI</h2>
<pre>curl 1ln.sh/install | sh
1ln push script.sh</pre>

<h2>MCP for Claude Code</h2>
<pre>claude mcp add 1ln npx -- -y 1ln-mcp</pre>

<p class="home-links">
  <a href="https://github.com/onelinesh/1ln" rel="noopener" target="_blank">github</a>
  <span class="dot secondary">·</span>
  <a href="https://www.npmjs.com/package/1ln-mcp" rel="noopener" target="_blank">npm</a>
</p>

<details class="browser-try">
  <summary>Try it in the browser</summary>
  <form method="post" action="/" class="paste-form">
    <textarea name="content" placeholder="#!/bin/sh&#10;echo &quot;your one-liner&quot;" required spellcheck="false" autocapitalize="off" autocorrect="off"></textarea>
    <div class="paste-actions">
      <button type="submit" name="visibility" value="public" class="btn-primary">Create public link</button>
      <button type="submit" name="visibility" value="private" class="btn-secondary">Create private link</button>
    </div>
  </form>
</details>`
  );
}
