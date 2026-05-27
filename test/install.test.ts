import { describe, it, expect } from "vitest";
import { SELF } from "cloudflare:test";
import { renderInstall, LATEST_TAG } from "../src/views/install";

describe("renderInstall (unit)", () => {
  it("starts with a POSIX sh shebang", () => {
    expect(renderInstall().startsWith("#!/bin/sh\n")).toBe(true);
  });

  it("uses set -eu for strict mode", () => {
    expect(renderInstall()).toContain("\nset -eu\n");
  });

  it("embeds the pinned LATEST_TAG and allows ONELN_VERSION override", () => {
    const script = renderInstall();
    expect(LATEST_TAG).toMatch(/^cli-v\d+\.\d+\.\d+$/);
    expect(script).toContain(`RAW="\${ONELN_VERSION:-${LATEST_TAG}}"`);
  });

  it("accepts ONELN_VERSION with or without the cli- prefix", () => {
    const script = renderInstall();
    expect(script).toContain('cli-*) TAG="$RAW" ;;');
    expect(script).toContain('*) TAG="cli-$RAW" ;;');
    expect(script).toContain('VERSION="${TAG#cli-}"');
  });

  it("detects OS and arch from uname", () => {
    const script = renderInstall();
    expect(script).toContain('case "$(uname -s)"');
    expect(script).toContain('case "$(uname -m)"');
    expect(script).toContain("Darwin) OS=darwin");
    expect(script).toContain("Linux)  OS=linux");
    expect(script).toContain("x86_64|amd64) ARCH=amd64");
    expect(script).toContain("arm64|aarch64) ARCH=arm64");
  });

  it("downloads from the onelinesh/1ln GitHub release using the cli- tag", () => {
    expect(renderInstall()).toContain(
      "https://github.com/onelinesh/1ln/releases/download/$TAG/1ln-$OS-$ARCH.tar.gz"
    );
  });

  it("falls back to sudo when PREFIX/bin is not writable", () => {
    const script = renderInstall();
    expect(script).toContain('if [ -w "$PREFIX/bin" ]; then');
    expect(script).toContain('sudo mv');
  });
});

describe("GET /install (integration)", () => {
  it("serves the installer as text/plain", async () => {
    const res = await SELF.fetch("http://x/install");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/plain/);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    const body = await res.text();
    expect(body.startsWith("#!/bin/sh\n")).toBe(true);
    expect(body).toContain("1ln-$OS-$ARCH.tar.gz");
  });
});
