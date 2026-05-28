import { layout, escapeHtml } from "./layout";

export type GoneOpts = {
  reason: "expired" | "consumed";
  at: number;
};

export function renderGone(opts: GoneOpts): string {
  const when = new Date(opts.at).toISOString();
  const headline = opts.reason === "expired" ? "This URL expired." : "This URL was used.";
  const detail =
    opts.reason === "expired"
      ? `Expiration: ${when}.`
      : `Consumed: ${when}. Single-use URLs work exactly once.`;
  return layout(
    `410 Gone — 1ln.sh`,
    `<h1 class="danger">410 Gone</h1>
<p>${escapeHtml(headline)}</p>
<p class="secondary">${escapeHtml(detail)}</p>
<p style="margin-top:24px;"><a href="/">Create a new one →</a></p>`,
    { noindex: true }
  );
}
