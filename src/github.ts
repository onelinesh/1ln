import type { Env } from "./env";
import { isSha } from "./gh_parse";

export class GhNotFoundError extends Error {}
export class GhUpstreamError extends Error {}

export const DEFAULT_PATHS = ["install.sh", "setup.sh", "get.sh"] as const;
export const DEFAULT_REFS = ["main", "master"] as const;
const BRANCH_TTL = 5 * 60;             // 5 min
const SHA_TTL = 365 * 24 * 60 * 60;    // 1 year

type Resolved = {
  content: string;
  sha: string | null;        // not yet populated; reserved for future
  sourceUrl: string;
  cacheStatus: "hit" | "miss" | "revalidated";
};

type GhInput = {
  user: string;
  repo: string;
  ref: string | null;
  path: string | null;
};

type CacheRecord = {
  content: string;
  sourceUrl: string;
  etag: string | null;
};

const cacheKey = (user: string, repo: string, ref: string, path: string) =>
  `gh:${user}/${repo}/${ref}/${path}`;

async function getCached(env: Env, key: string): Promise<CacheRecord | null> {
  const raw = await env.SCRIPT_CACHE.get(key);
  if (!raw) return null;
  try { return JSON.parse(raw) as CacheRecord; } catch { return null; }
}

async function putCached(env: Env, key: string, ref: string, rec: CacheRecord): Promise<void> {
  const ttl = isSha(ref) ? SHA_TTL : BRANCH_TTL;
  await env.SCRIPT_CACHE.put(key, JSON.stringify(rec), { expirationTtl: ttl });
}

/**
 * Fetches a single raw.githubusercontent.com URL. Returns:
 *   { status: 200, content, etag }
 *   { status: 404 }
 *   { status: other } for upstream errors
 */
async function fetchOne(
  user: string,
  repo: string,
  ref: string,
  path: string,
): Promise<{ status: number; content?: string; etag?: string | null }> {
  const url = `https://raw.githubusercontent.com/${user}/${repo}/${ref}/${path}`;
  const res = await fetch(url);
  if (res.status === 404) return { status: 404 };
  if (!res.ok) return { status: res.status };
  const content = await res.text();
  return { status: 200, content, etag: res.headers.get("etag") };
}

async function tryFetchWithCache(
  env: Env,
  input: { user: string; repo: string; ref: string; path: string }
): Promise<Resolved | null> {
  const key = cacheKey(input.user, input.repo, input.ref, input.path);
  const sourceUrl = `https://raw.githubusercontent.com/${input.user}/${input.repo}/${input.ref}/${input.path}`;
  const cached = await getCached(env, key);

  // KV handles TTL expiry — if we got a hit, the data is fresh enough.
  if (cached) {
    return { content: cached.content, sha: null, sourceUrl, cacheStatus: "hit" };
  }

  const r = await fetchOne(input.user, input.repo, input.ref, input.path);
  if (r.status === 404) return null;
  if (r.status === 200 && r.content !== undefined) {
    const rec: CacheRecord = { content: r.content, sourceUrl, etag: r.etag ?? null };
    await putCached(env, key, input.ref, rec);
    return { content: r.content, sha: null, sourceUrl, cacheStatus: "miss" };
  }
  throw new GhUpstreamError(`upstream returned ${r.status}`);
}

export async function resolveGhContent(env: Env, input: GhInput): Promise<Resolved> {
  const refs = input.ref ? [input.ref] : [...DEFAULT_REFS];
  const paths = input.path ? [input.path] : [...DEFAULT_PATHS];

  for (const ref of refs) {
    for (const path of paths) {
      const r = await tryFetchWithCache(env, { user: input.user, repo: input.repo, ref, path });
      if (r) return r;
    }
  }
  throw new GhNotFoundError(
    `no script found for ${input.user}/${input.repo}` +
    (input.ref ? `@${input.ref}` : "") +
    (input.path ? `/${input.path}` : "")
  );
}
