import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";

describe("static assets", () => {
  it("serves IBMPlexMono-Regular.woff2 with the right content-type", async () => {
    const res = await env.ASSETS.fetch("http://x/fonts/IBMPlexMono-Regular.woff2");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/font|woff2|octet-stream/i);
    const buf = await res.arrayBuffer();
    expect(buf.byteLength).toBeGreaterThan(14_000);
  });

  it("serves IBMPlexMono-Bold.woff2", async () => {
    const res = await env.ASSETS.fetch("http://x/fonts/IBMPlexMono-Bold.woff2");
    expect(res.status).toBe(200);
    const buf = await res.arrayBuffer();
    expect(buf.byteLength).toBeGreaterThan(14_000);
  });

  it("serves /favicon.svg as image/svg+xml", async () => {
    const res = await env.ASSETS.fetch("http://x/favicon.svg");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/image\/svg/);
    const text = await res.text();
    expect(text).toContain("<svg");
    expect(text).toContain("#f5a623");
  });

  it("serves /favicon.ico", async () => {
    const res = await env.ASSETS.fetch("http://x/favicon.ico");
    expect(res.status).toBe(200);
    const buf = await res.arrayBuffer();
    expect(buf.byteLength).toBeGreaterThan(200);
  });

  it("serves /og.png as image/png at 1200x630-ish bytes", async () => {
    const res = await env.ASSETS.fetch("http://x/og.png");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/image\/png/);
    const buf = await res.arrayBuffer();
    expect(buf.byteLength).toBeGreaterThan(10_000);
  });
});
