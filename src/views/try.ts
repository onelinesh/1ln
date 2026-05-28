import { layout } from "./layout";

export function renderTry(): string {
  return layout(
    "1ln.sh — Try in the browser",
    `<h1>Try in the browser</h1>
<p class="subtitle">Paste a shell script. Get a one-line <code>curl &hellip; | sh</code> URL.</p>

<form method="post" action="/" class="paste-form">
  <textarea name="content" placeholder="#!/bin/sh&#10;echo &quot;your one-liner&quot;" required spellcheck="false" autocapitalize="off" autocorrect="off"></textarea>
  <div class="paste-actions">
    <button type="submit" name="visibility" value="public" class="btn-primary">Create public link</button>
    <button type="submit" name="visibility" value="private" class="btn-secondary">Create private link</button>
  </div>
</form>

<p class="back-link"><a href="/">&larr; back</a></p>`,
    {
      path: "/try",
      description:
        "Paste a shell script in the browser and get a one-line curl 1ln.sh/<slug> | sh URL. No signup needed.",
    }
  );
}
