import { layout, escapeHtml } from "./layout";
import { renderCopyButton, copyButtonScript } from "./copy_button";

const EXAMPLE_URL = "curl 1ln.sh/oGcP | sh";
const EXAMPLE_SCRIPT = `#!/bin/sh
echo "hello from $(hostname)"`;

const CLAUDE_DESKTOP_JSON = `{
  "mcpServers": {
    "1ln": {
      "command": "npx",
      "args": ["-y", "1ln-mcp"]
    }
  }
}`;

export function renderHome(): string {
  return layout(
    "1ln.sh — paste a script, get a curl URL",
    `<section class="hero">
  <p class="hero-tagline">Push a shell script. Get a short URL you can run on any server.</p>
  <div class="code-row">
    <pre id="install-cmd" data-copy-value="curl 1ln.sh/install | sh">curl 1ln.sh/install | sh</pre>
    ${renderCopyButton("install-cmd")}
  </div>
</section>

<section class="example">
  <p class="block-label">How it works</p>
  <div class="hero-example" aria-label="How it works">
    <div class="hero-example-comment"># 1. write a shell script</div>
    <div class="hero-example-line">
      <span class="hero-example-prompt">$</span>
      <span class="hero-example-cmd">cat hello.sh</span>
    </div>
    <pre class="hero-example-out">${escapeHtml(EXAMPLE_SCRIPT)}</pre>

    <div class="hero-example-comment"># 2. publish it — get a short URL back</div>
    <div class="hero-example-line">
      <span class="hero-example-prompt">$</span>
      <span class="hero-example-cmd">1ln push hello.sh</span>
    </div>
    <div class="hero-example-line">
      <span class="hero-example-arrow">&rarr;</span>
      <code class="hero-example-url">${escapeHtml(EXAMPLE_URL)}</code>
    </div>

    <div class="hero-example-comment"># 3. run it on any server</div>
    <div class="hero-example-line">
      <span class="hero-example-prompt server">prod $</span>
      <span class="hero-example-cmd">curl 1ln.sh/oGcP | sh</span>
    </div>
    <pre class="hero-example-out">hello from prod-web-01</pre>
  </div>
</section>

<section class="mcp">
  <p class="block-label">MCP server</p>
  <p class="code-label">Claude Code</p>
  <div class="code-row">
    <pre id="mcp-claude-code" data-copy-value="claude mcp add 1ln npx -- -y 1ln-mcp">claude mcp add 1ln npx -- -y 1ln-mcp</pre>
    ${renderCopyButton("mcp-claude-code")}
  </div>
  <p class="code-label">Cursor / Windsurf / Continue / other stdio client</p>
  <div class="code-row">
    <pre id="mcp-stdio" data-copy-value="npx -y 1ln-mcp">npx -y 1ln-mcp</pre>
    ${renderCopyButton("mcp-stdio")}
  </div>
  <details class="mcp-details">
    <summary>Claude Desktop config</summary>
    <p class="code-label secondary">Add to <code>claude_desktop_config.json</code>:</p>
    <div class="code-row">
      <pre id="mcp-desktop" data-copy-value="${escapeHtml(CLAUDE_DESKTOP_JSON)}">${escapeHtml(CLAUDE_DESKTOP_JSON)}</pre>
      ${renderCopyButton("mcp-desktop")}
    </div>
  </details>
</section>

<p class="try-link"><a href="/try">Try it in the browser &rarr;</a></p>
${copyButtonScript()}`
  );
}
