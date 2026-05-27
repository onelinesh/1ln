const HEADER_MARK = `<svg class="wm-mark" viewBox="0 0 64 64" width="26" height="26" fill="none" aria-hidden="true">
  <rect x="12" y="30.5" width="30" height="3" fill="#e8e1d8"/>
  <circle cx="48" cy="32" r="5" fill="#f5a623"/>
</svg>`;

export function renderWordmark(): string {
  return `<a class="wm" href="/" aria-label="1ln.sh home">${HEADER_MARK}<span class="wm-text">1ln</span><span class="wm-dot">.sh</span></a>`;
}

export function renderHeader(): string {
  return `<header class="site-header">${renderWordmark()}</header>`;
}

export function renderFooter(): string {
  return `<footer class="site-footer">
  <span class="muted">1ln.sh — curl-pipe-bash, but with a URL bar.</span>
  <span class="dot">·</span>
  <a href="https://github.com/onelinesh/1ln" rel="noopener" target="_blank">github</a>
  <span class="dot">·</span>
  <a href="https://www.npmjs.com/package/1ln-mcp" rel="noopener" target="_blank">npm</a>
  <span class="dot">·</span>
  <a href="mailto:abuse@1ln.sh">abuse</a>
</footer>`;
}
