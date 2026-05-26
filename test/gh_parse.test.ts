import { describe, it, expect } from "vitest";
import { parseGhPath, GhParseError } from "../src/gh_parse";

describe("parseGhPath", () => {
  it("plain repo → default ref/path", () => {
    expect(parseGhPath("gh/foo/bar")).toEqual({
      user: "foo", repo: "bar", ref: null, path: null,
    });
  });

  it("repo + explicit path", () => {
    expect(parseGhPath("gh/foo/bar/scripts/run.sh")).toEqual({
      user: "foo", repo: "bar", ref: null, path: "scripts/run.sh",
    });
  });

  it("repo + ref (branch)", () => {
    expect(parseGhPath("gh/foo/bar@develop")).toEqual({
      user: "foo", repo: "bar", ref: "develop", path: null,
    });
  });

  it("repo + ref (SHA) + path", () => {
    const sha = "a".repeat(40);
    expect(parseGhPath(`gh/foo/bar@${sha}/install.sh`)).toEqual({
      user: "foo", repo: "bar", ref: sha, path: "install.sh",
    });
  });

  it("repo + ref (tag) + path with slashes", () => {
    expect(parseGhPath("gh/foo/bar@v1.2.3/scripts/a/b.sh")).toEqual({
      user: "foo", repo: "bar", ref: "v1.2.3", path: "scripts/a/b.sh",
    });
  });

  it("rejects missing gh prefix", () => {
    expect(() => parseGhPath("not/gh/foo/bar")).toThrow(GhParseError);
  });

  it("rejects missing repo", () => {
    expect(() => parseGhPath("gh/foo")).toThrow(GhParseError);
  });

  it("rejects user with disallowed chars", () => {
    expect(() => parseGhPath("gh/../bar")).toThrow(GhParseError);
    expect(() => parseGhPath("gh/foo bar/baz")).toThrow(GhParseError);
  });

  it("rejects path traversal in path", () => {
    expect(() => parseGhPath("gh/foo/bar/../etc/passwd")).toThrow(GhParseError);
  });

  it("strips empty path segments (trailing slash)", () => {
    expect(parseGhPath("gh/foo/bar/")).toEqual({
      user: "foo", repo: "bar", ref: null, path: null,
    });
  });
});
