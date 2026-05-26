export function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function layout(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { font: 16px/1.5 system-ui, sans-serif; max-width: 720px; margin: 2rem auto; padding: 0 1rem; color: #111; }
    h1 { font-size: 1.5rem; }
    textarea { width: 100%; min-height: 16rem; font-family: ui-monospace, monospace; font-size: 14px; padding: .5rem; box-sizing: border-box; }
    pre { background: #f5f5f5; padding: 1rem; overflow-x: auto; border-radius: 4px; font-size: 14px; }
    button { padding: .5rem 1rem; font-size: 1rem; margin-right: .5rem; cursor: pointer; }
    .token { background: #fffae6; border: 1px solid #f5c518; padding: .75rem; border-radius: 4px; font-family: ui-monospace, monospace; }
  </style>
</head>
<body>
${body}
</body>
</html>`;
}
