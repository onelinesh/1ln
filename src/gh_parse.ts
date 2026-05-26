export class GhParseError extends Error {}

const NAME_OK = /^[a-zA-Z0-9_.-]+$/;
const PATH_SEG_OK = /^[a-zA-Z0-9_.-]+$/;

export type GhPath = {
  user: string;
  repo: string;
  ref: string | null;     // null = default branch
  path: string | null;    // null = probe default install script
};

export function parseGhPath(pathname: string): GhPath {
  const parts = pathname.replace(/^\/+/, "").split("/").filter(Boolean);
  if (parts.length < 3 || parts[0] !== "gh") {
    throw new GhParseError("path must start with /gh/<user>/<repo>");
  }
  const user = parts[1]!;
  let repoToken = parts[2]!;
  let ref: string | null = null;
  const atIdx = repoToken.indexOf("@");
  if (atIdx > 0) {
    ref = repoToken.slice(atIdx + 1);
    repoToken = repoToken.slice(0, atIdx);
    if (!ref) throw new GhParseError("ref cannot be empty after '@'");
    if (!/^[a-zA-Z0-9_./-]+$/.test(ref)) {
      throw new GhParseError("ref contains invalid characters");
    }
    if (ref.includes("..")) throw new GhParseError("ref cannot contain '..'");
  }
  if (!NAME_OK.test(user) || user === "..") throw new GhParseError("invalid user");
  if (!NAME_OK.test(repoToken) || repoToken === "..") throw new GhParseError("invalid repo");

  const rest = parts.slice(3);
  for (const seg of rest) {
    if (seg === "..") throw new GhParseError("path traversal not allowed");
    if (!PATH_SEG_OK.test(seg)) throw new GhParseError(`invalid path segment: ${seg}`);
  }
  const path = rest.length > 0 ? rest.join("/") : null;

  return { user, repo: repoToken, ref, path };
}

export function isSha(ref: string): boolean {
  return /^[a-f0-9]{40}$/i.test(ref);
}
