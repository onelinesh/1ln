import { layout, escapeHtml } from "./layout";

export function renderGhPreview(opts: {
  user: string;
  repo: string;
  ref: string;
  path: string;
  sourceUrl: string;
  content: string;
  pinned: boolean;
}): string {
  const title = `1ln.sh/gh/${opts.user}/${opts.repo}`;
  const warning = opts.pinned
    ? ""
    : `<p style="background:#fff3cd;border:1px solid #f5c518;padding:.5rem;border-radius:4px;">
        &#9888;&#65039; This URL follows the <code>${escapeHtml(opts.ref)}</code> branch. Contents can change.
        Pin to a commit SHA for stability: <code>${escapeHtml(opts.user)}/${escapeHtml(opts.repo)}@&lt;sha&gt;/${escapeHtml(opts.path)}</code>.
       </p>`;
  return layout(
    title,
    `
<h1>${escapeHtml(title)}</h1>
<p><strong>Source:</strong> <a href="${escapeHtml(opts.sourceUrl)}">${escapeHtml(opts.sourceUrl)}</a></p>
<p>One-liner: <code>curl 1ln.sh/gh/${escapeHtml(opts.user)}/${escapeHtml(opts.repo)}${opts.path !== "install.sh" ? "/" + escapeHtml(opts.path) : ""}${opts.pinned ? "@" + escapeHtml(opts.ref) : ""} | sh</code></p>
${warning}
<h2>Script</h2>
<pre>${escapeHtml(opts.content)}</pre>
<p><a href="/gh/${escapeHtml(opts.user)}/${escapeHtml(opts.repo)}${opts.ref !== "main" ? "@" + escapeHtml(opts.ref) : ""}${opts.path && opts.path !== "install.sh" ? "/" + escapeHtml(opts.path) : ""}">Raw</a> &middot; <a href="mailto:abuse@1ln.sh?subject=Report%20gh/${encodeURIComponent(opts.user + '/' + opts.repo)}">Report abuse</a></p>
`
  );
}
