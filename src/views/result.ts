import { layout, escapeHtml } from "./layout";

export function renderResult(opts: { slug: string; deleteToken: string }): string {
  const oneliner = `curl 1ln.sh/${opts.slug} | sh`;
  return layout(
    `1ln.sh/${opts.slug}`,
    `
<h1>Ready</h1>
<p>Run this on any server:</p>
<pre>${escapeHtml(oneliner)}</pre>
<p><a href="/${escapeHtml(opts.slug)}?view">View the script</a></p>
<h2>Delete token</h2>
<p>Save this if you ever want to remove the script. We won't show it again.</p>
<div class="token">${escapeHtml(opts.deleteToken)}</div>
<p style="margin-top:1.5rem;"><a href="/">Create another</a></p>
`
  );
}
