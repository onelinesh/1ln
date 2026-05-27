import { cssTokens } from "./tokens";
import { renderHeader, renderFooter } from "./wordmark";

export function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const META = `
<meta property="og:title" content="1ln.sh">
<meta property="og:description" content="Paste a shell script. Get a one-line curl URL.">
<meta property="og:image" content="https://1ln.sh/og.png">
<meta property="og:url" content="https://1ln.sh">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#0d0d0d">
<meta name="application-name" content="1ln">
<meta name="apple-mobile-web-app-title" content="1ln">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="alternate icon" href="/favicon.ico">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="manifest" href="/manifest.webmanifest">
`.trim();

const STYLES = `
${cssTokens()}

* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: var(--bg); color: var(--text); font-family: var(--font); font-size: 15px; line-height: 1.55; }
::selection { background: var(--accent); color: var(--bg); }
a { color: var(--accent); text-decoration: none; }
a:hover { color: var(--accent-hover); text-decoration: underline; }

.wrap { max-width: min(760px, 100vw - 32px); margin: 0 auto; padding: 28px 16px 48px; }

.site-header { display: flex; align-items: center; justify-content: space-between; padding-bottom: 18px; border-bottom: 1px solid var(--border); margin-bottom: 28px; }
.wm { display: inline-flex; align-items: center; gap: 12px; line-height: 1; }
.wm:hover { text-decoration: none; }
.wm-logo { display: block; height: clamp(26px, 4vw, 32px); width: auto; flex-shrink: 0; }
.wm-text { font-weight: 700; font-size: clamp(1.4rem, 4vw, 1.75rem); letter-spacing: -0.04em; color: var(--text); }
.wm-dot { color: var(--accent); }

.site-footer { margin-top: 64px; padding-top: 16px; border-top: 1px solid var(--border); color: var(--text-muted); font-size: 12px; display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between; }
.site-footer .dot { color: var(--text-muted); }
.site-footer .muted { color: var(--text-muted); }
.site-footer-links { display: inline-flex; gap: 8px; align-items: center; }

h1 { font-size: clamp(1.5rem, 5vw, 2rem); font-weight: 700; letter-spacing: -0.02em; margin: 0 0 8px; color: var(--text); }
h2 { font-size: 1.05rem; font-weight: 700; letter-spacing: -0.01em; margin: 28px 0 10px; color: var(--text); }

.hero { margin: 8px 0 28px; }
.hero-tagline { font-size: clamp(1.05rem, 2.4vw, 1.2rem); font-weight: 400; letter-spacing: -0.01em; margin: 0 0 18px; color: var(--text); max-width: 38em; }

.hero-example { display: flex; flex-direction: column; gap: 2px; padding: 14px 18px; background: var(--surface); border: 1px solid var(--border); border-radius: 6px; font-size: 13px; line-height: 1.6; overflow-x: auto; }
.hero-example-line { display: flex; align-items: baseline; gap: 10px; white-space: nowrap; }
.hero-example-prompt { color: var(--text-muted); user-select: none; }
.hero-example-prompt.server { color: var(--accent); }
.hero-example-cmd { color: var(--text); }
.hero-example-arrow { color: var(--text-muted); user-select: none; }
.hero-example-url { color: var(--accent); font-weight: 700; background: none; border: none; padding: 0; }
.hero-example-comment { color: var(--text-muted); font-style: italic; margin-top: 10px; }
.hero-example-comment:first-child { margin-top: 0; }
.hero-example-out { margin: 0 0 0 18px; padding: 0; background: none; border: none; color: var(--text-secondary); font-family: var(--font); font-size: 13px; line-height: 1.6; white-space: pre; overflow: visible; border-radius: 0; }

section + section { margin-top: 28px; }
.block-label { font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-muted); margin: 0 0 12px; }
.code-label { font-size: 12px; color: var(--text-secondary); margin: 0 0 6px; }
.code-label code { background: var(--surface); border: 1px solid var(--border); padding: 0 4px; border-radius: 3px; font-size: 11px; color: var(--text-secondary); }

.mcp-details { margin-top: 4px; }
.mcp-details > summary { font-size: 12px; color: var(--text-secondary); cursor: pointer; padding: 4px 0; list-style: none; user-select: none; }
.mcp-details > summary::-webkit-details-marker { display: none; }
.mcp-details > summary::before { content: "▸ "; color: var(--text-muted); }
.mcp-details[open] > summary::before { content: "▾ "; }
.mcp-details > summary:hover { color: var(--text); }
.mcp-details[open] > summary { margin-bottom: 8px; color: var(--text); }
.mcp-details .code-row pre { white-space: pre; }

.try-link { margin: 32px 0 0; font-size: 13px; }
.try-link a { color: var(--text-secondary); }
.try-link a:hover { color: var(--accent); }

.back-link { margin-top: 28px; font-size: 13px; }
.back-link a { color: var(--text-secondary); }
.back-link a:hover { color: var(--accent); }
p { margin: 0 0 12px; }
.subtitle { color: var(--text-secondary); }

pre, code { font-family: var(--font); }
pre { background: var(--surface); border: 1px solid var(--border); padding: 14px; border-radius: 6px; overflow-x: auto; font-size: 13px; color: var(--text); margin: 0 0 14px; }

.muted { color: var(--text-muted); }
.secondary { color: var(--text-secondary); }
.accent { color: var(--accent); }
.danger { color: var(--danger); }

@media (max-width: 480px) {
  .wrap { padding: 20px 14px 36px; }
}

.code-row { display: flex; align-items: stretch; gap: 0; margin: 0 0 14px; }
.code-row pre { flex: 1; margin: 0; border-radius: 6px 0 0 6px; border-right: none; }
.copy-btn { display: inline-flex; align-items: center; justify-content: center; width: 44px; background: var(--surface); border: 1px solid var(--border); border-radius: 0 6px 6px 0; color: var(--text-secondary); cursor: pointer; font-family: var(--font); transition: color .12s, border-color .12s; }
.copy-btn:hover { color: var(--accent); border-color: var(--accent); }
.copy-btn.copied { color: var(--accent); border-color: var(--accent); }

.sh-comment { color: var(--text-muted); font-style: italic; }
.sh-string { color: var(--accent); }
.sh-keyword { color: var(--text); font-weight: 700; }

.paste-form textarea { width: 100%; min-height: 14rem; background: var(--surface); border: 1px solid var(--border); border-radius: 6px; padding: 12px 14px; color: var(--text); font-family: var(--font); font-size: 14px; line-height: 1.55; resize: vertical; }
.paste-form textarea:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
.paste-form textarea::placeholder { color: var(--text-muted); }
.paste-actions { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
.btn-primary, .btn-secondary { padding: 9px 16px; font-family: var(--font); font-size: 14px; font-weight: 700; cursor: pointer; border-radius: 6px; transition: background .12s, border-color .12s, color .12s; }
.btn-primary { background: var(--accent); color: var(--bg); border: 1px solid var(--accent); }
.btn-primary:hover { background: var(--accent-hover); border-color: var(--accent-hover); }
.btn-secondary { background: var(--surface); color: var(--text); border: 1px solid var(--border); }
.btn-secondary:hover { border-color: var(--accent); color: var(--accent); }

@media (max-width: 480px) {
  .paste-actions .btn-primary, .paste-actions .btn-secondary { flex: 1 1 100%; }
}

.token { background: rgba(245, 166, 35, 0.06); border-color: rgba(245, 166, 35, 0.3); color: var(--accent); }

.status-row { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 18px; }
.chip { display: inline-flex; align-items: center; padding: 4px 10px; background: var(--surface); border: 1px solid var(--border); border-radius: 4px; font-size: 12px; color: var(--text); }
.chip.muted { color: var(--text-muted); }
.chip.accent { color: var(--accent); border-color: rgba(245, 166, 35, 0.4); background: rgba(245, 166, 35, 0.06); }
.chip.danger { color: var(--danger); border-color: rgba(232, 93, 77, 0.4); background: rgba(232, 93, 77, 0.06); }
`.trim();

export function layout(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="Paste a shell script. Get a one-line curl URL you can run on any server. Or proxy any install script from GitHub.">
${META}
<style>${STYLES}</style>
</head>
<body>
<div class="wrap">
${renderHeader()}
${body}
${renderFooter()}
</div>
</body>
</html>`;
}
