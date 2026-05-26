import { layout, escapeHtml } from "./layout";

export function renderPreview(opts: {
  slug: string;
  content: string;
  visibility: "public" | "private";
  createdAt: number;
}): string {
  const created = new Date(opts.createdAt).toISOString();
  return layout(
    `1ln.sh/${opts.slug}`,
    `
<h1>1ln.sh/${escapeHtml(opts.slug)}</h1>
<p><strong>Visibility:</strong> ${escapeHtml(opts.visibility)} &middot; <strong>Created:</strong> ${escapeHtml(created)}</p>
<p>One-liner: <code>curl 1ln.sh/${escapeHtml(opts.slug)} | sh</code></p>
<h2>Script</h2>
<pre>${escapeHtml(opts.content)}</pre>
<p><a href="/${escapeHtml(opts.slug)}">Raw</a> &middot; <a href="mailto:abuse@1ln.sh?subject=Report%20${encodeURIComponent(opts.slug)}">Report abuse</a></p>
`
  );
}
