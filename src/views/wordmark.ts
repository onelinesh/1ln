export function renderWordmark(): string {
  return `<a class="wm" href="/" aria-label="1ln home"><span class="wm-text">1ln</span></a>`;
}

export function renderHeader(): string {
  return `<header class="site-header">${renderWordmark()}</header>`;
}

export function renderFooter(): string {
  return `<footer class="site-footer">
  <span class="muted">1ln — curl-pipe-bash, but with a URL bar.</span>
  <span class="site-footer-links">
    <a href="https://www.npmjs.com/package/1ln-mcp" rel="noopener" target="_blank">npm</a>
    <span class="dot">·</span>
    <a href="mailto:abuse@1ln.sh">abuse</a>
  </span>
</footer>`;
}
