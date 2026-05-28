import { layout, escapeHtml } from "./layout";
import { renderCopyButton, copyButtonScript } from "./copy_button";

export function renderResult(opts: { slug: string; deleteToken: string }): string {
  const oneliner = `curl 1ln.sh/${opts.slug} | sh`;
  return layout(
    `1ln.sh/${opts.slug}`,
    `<h1><span class="accent">Ready.</span></h1>
<p class="subtitle">Run this on any server.</p>

<div class="code-row">
  <pre id="oneliner" data-copy-value="${escapeHtml(oneliner)}">${escapeHtml(oneliner)}</pre>
  ${renderCopyButton("oneliner")}
</div>

<p><a href="/${escapeHtml(opts.slug)}?view">View the script</a></p>

<h2>Delete token</h2>
<p class="subtitle">Save this — we won't show it again.</p>
<div class="code-row">
  <pre id="delete-token" class="token">${escapeHtml(opts.deleteToken)}</pre>
  ${renderCopyButton("delete-token")}
</div>

<p style="margin-top:24px;"><a href="/">Create another</a></p>
${copyButtonScript()}`,
    { path: `/${opts.slug}`, noindex: true }
  );
}
