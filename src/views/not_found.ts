import { layout, escapeHtml } from "./layout";

export function renderNotFound(path: string): string {
  return layout(
    `404 Not Found — 1ln.sh`,
    `<h1 class="danger">404</h1>
<p>No script at <code>${escapeHtml(path)}</code>.</p>
<p style="margin-top:24px;"><a href="/">← Back to home</a></p>`
  );
}
