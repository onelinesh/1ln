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
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="alternate icon" href="/favicon.ico">
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
.wm { font-weight: 700; font-size: clamp(1.4rem, 4vw, 1.75rem); letter-spacing: -0.04em; color: var(--text); }
.wm:hover { color: var(--text); text-decoration: none; }
.wm-dot { color: var(--accent); }

.site-footer { margin-top: 64px; padding-top: 16px; border-top: 1px solid var(--border); color: var(--text-muted); font-size: 12px; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.site-footer .dot { color: var(--text-muted); }
.site-footer .muted { color: var(--text-muted); }

h1 { font-size: clamp(1.5rem, 5vw, 2rem); font-weight: 700; letter-spacing: -0.02em; margin: 0 0 8px; color: var(--text); }
h2 { font-size: 1.05rem; font-weight: 700; letter-spacing: -0.01em; margin: 28px 0 10px; color: var(--text); }
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
