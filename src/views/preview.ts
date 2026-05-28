import { layout, escapeHtml } from "./layout";
import { renderCopyButton, copyButtonScript } from "./copy_button";
import { highlightShell } from "./shell_highlight";
import { buildPreamble } from "../params";

function relativeAge(createdAt: number, nowMs = Date.now()): string {
  const diff = Math.max(0, nowMs - createdAt);
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function renderParamsSection(params: Record<string, string>): string {
  const preamble = buildPreamble(params);
  if (preamble === "") return "";
  // Strip the trailing blank line for display (it exists for shell-parse cleanliness,
  // not for visual rendering).
  const display = preamble.replace(/\n\n$/, "");
  return `<h2>Runtime parameters</h2>
<pre>${escapeHtml(display)}</pre>

`;
}

export function renderPreview(opts: {
  slug: string;
  content: string;
  visibility: "public" | "private";
  createdAt: number;
  params?: Record<string, string>;
}): string {
  const oneliner = `curl 1ln.sh/${opts.slug} | sh`;
  const created = new Date(opts.createdAt).toISOString();
  const paramsSection = renderParamsSection(opts.params ?? {});
  return layout(
    `1ln.sh/${opts.slug} — shell script`,
    `<h1>1ln.sh/<span class="accent">${escapeHtml(opts.slug)}</span></h1>

<div class="status-row">
  <span class="chip">${escapeHtml(opts.visibility)}</span>
  <span class="chip muted" title="${escapeHtml(created)}">${relativeAge(opts.createdAt)}</span>
</div>

<div class="code-row">
  <pre id="oneliner" data-copy-value="${escapeHtml(oneliner)}">${escapeHtml(oneliner)}</pre>
  ${renderCopyButton("oneliner")}
</div>

${paramsSection}<h2>Script</h2>
<pre>${highlightShell(opts.content)}</pre>

<p class="secondary" style="font-size:12px;">
  <a href="/${escapeHtml(opts.slug)}">Raw</a> ·
  <a href="mailto:abuse@1ln.sh?subject=Report%20${encodeURIComponent(opts.slug)}">Report abuse</a>
</p>
${copyButtonScript()}`,
    {
      path: `/${opts.slug}?view`,
      description: `Shell script hosted on 1ln.sh. Run with curl 1ln.sh/${opts.slug} | sh.`,
      noindex: true,
    }
  );
}
