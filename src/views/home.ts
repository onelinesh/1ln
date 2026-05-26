import { layout } from "./layout";

export function renderHome(): string {
  return layout(
    "1ln.sh — paste a script, get a one-liner",
    `
<h1>1ln.sh</h1>
<p>Paste a shell script. Get a one-line <code>curl … | sh</code> URL.</p>
<form method="post" action="/">
  <textarea name="content" placeholder="#!/bin/sh&#10;echo hello" required></textarea>
  <div style="margin-top:.5rem;">
    <button type="submit" name="visibility" value="public">Create public link</button>
    <button type="submit" name="visibility" value="private">Create private link</button>
  </div>
</form>
`
  );
}
