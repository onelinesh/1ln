export function renderWordmark(): string {
  return `<a class="wm" href="/" aria-label="1ln.sh home"><span>1ln</span><span class="wm-dot">.sh</span></a>`;
}

export function renderHeader(): string {
  return `<header class="site-header">${renderWordmark()}</header>`;
}

export function renderFooter(): string {
  return `<footer class="site-footer">
  <span class="muted">1ln.sh — curl-pipe-bash, but with a URL bar.</span>
  <span class="dot">·</span>
  <a href="https://github.com/YairEtzion/1ln" rel="noopener">github</a>
  <span class="dot">·</span>
  <a href="mailto:abuse@1ln.sh">abuse</a>
</footer>`;
}
