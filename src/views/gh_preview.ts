import { layout, escapeHtml } from "./layout";
import { renderCopyButton, copyButtonScript } from "./copy_button";
import { highlightShell } from "./shell_highlight";

export function renderGhPreview(opts: {
  user: string;
  repo: string;
  ref: string;
  path: string;
  sourceUrl: string;
  content: string;
  pinned: boolean;
}): string {
  const oneliner = opts.pinned
    ? `curl 1ln.sh/gh/${opts.user}/${opts.repo}@${opts.ref}${opts.path !== "install.sh" ? "/" + opts.path : ""} | sh`
    : `curl 1ln.sh/gh/${opts.user}/${opts.repo}${opts.path !== "install.sh" ? "/" + opts.path : ""} | sh`;

  return layout(
    `1ln.sh/gh/${opts.user}/${opts.repo}`,
    `<h1>1ln.sh/gh/<span class="accent">${escapeHtml(opts.user)}/${escapeHtml(opts.repo)}</span></h1>

<div class="status-row">
  ${opts.pinned
    ? `<span class="chip accent" title="Pinned — content cannot change">Pinned: ${escapeHtml(opts.ref).slice(0, 7)}</span>`
    : `<span class="chip accent" title="This URL follows the branch; content can change">Following: ${escapeHtml(opts.ref)}</span>`}
  <span class="chip muted">${escapeHtml(opts.path)}</span>
</div>

<div class="code-row">
  <pre id="oneliner" data-copy-value="${escapeHtml(oneliner)}">${escapeHtml(oneliner)}</pre>
  ${renderCopyButton("oneliner")}
</div>

<h2>Script</h2>
<pre>${highlightShell(opts.content)}</pre>

<p class="secondary" style="font-size:12px;">
  Source: <a href="${escapeHtml(opts.sourceUrl)}" rel="noopener">${escapeHtml(opts.sourceUrl)}</a> ·
  <a href="mailto:abuse@1ln.sh?subject=Report%20gh/${encodeURIComponent(opts.user + "/" + opts.repo)}">Report abuse</a>
</p>
${copyButtonScript()}`
  );
}
