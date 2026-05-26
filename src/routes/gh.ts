import { Hono } from "hono";
import type { Env } from "../env";
import { parseGhPath, isSha, GhParseError } from "../gh_parse";
import { resolveGhContent, GhNotFoundError } from "../github";
import { renderGhPreview } from "../views/gh_preview";

export const gh = new Hono<{ Bindings: Env }>();

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

gh.get("/gh/*", async (c) => {
  const url = new URL(c.req.url);
  let parsed;
  try {
    parsed = parseGhPath(url.pathname);
  } catch (e) {
    if (e instanceof GhParseError) return c.text(e.message, 400);
    throw e;
  }

  let resolved;
  try {
    resolved = await resolveGhContent(c.env, parsed);
  } catch (e) {
    if (e instanceof GhNotFoundError) return c.text(e.message, 404);
    throw e;
  }

  const effectiveRef = parsed.ref ?? "main";
  const effectivePath = parsed.path ?? "install.sh"; // best-effort label; actual probe may have chosen a different one

  if (url.searchParams.has("meta")) {
    return c.json({
      content: resolved.content,
      size: new TextEncoder().encode(resolved.content).length,
      sha256: await sha256Hex(resolved.content),
      visibility: "public",
      source: "github_proxy",
      source_url: resolved.sourceUrl,
      pinned_ref: isSha(effectiveRef) ? effectiveRef : null,
      expires_at: null,
      consumed_at: null,
      single_use: false,
      created_at: null,
    });
  }

  if (url.searchParams.has("view")) {
    return c.html(
      renderGhPreview({
        user: parsed.user,
        repo: parsed.repo,
        ref: effectiveRef,
        path: effectivePath,
        sourceUrl: resolved.sourceUrl,
        content: resolved.content,
        pinned: isSha(effectiveRef),
      })
    );
  }

  return new Response(resolved.content, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
});
