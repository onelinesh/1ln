import { layout } from "./layout";

export function renderHome(): string {
  return layout(
    "1ln.sh — paste a script, get a curl URL",
    `<h1><span class="secondary">$</span> paste a script.</h1>
<p class="subtitle">Get a one-line <code>curl … | sh</code> URL you can run on any server.</p>

<form method="post" action="/" class="paste-form">
  <textarea name="content" placeholder="#!/bin/sh&#10;echo &quot;your one-liner&quot;" required spellcheck="false" autocapitalize="off" autocorrect="off"></textarea>
  <div class="paste-actions">
    <button type="submit" name="visibility" value="public" class="btn-primary">Create public link</button>
    <button type="submit" name="visibility" value="private" class="btn-secondary">Create private link</button>
  </div>
</form>

<p class="proxy-mention secondary"><code>curl 1ln.sh/gh/&lt;user&gt;/&lt;repo&gt; | sh</code> also works for any install script on GitHub.</p>`
  );
}
