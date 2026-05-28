import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { Hono } from "hono";
import type { Env } from "../src/env";
import { requireBearer, optionalBearer, type AuthVars } from "../src/auth";
import { upsertByGithubId } from "../src/repos/users";
import { createApiToken } from "../src/repos/api_tokens";

function appWithBearerRoute() {
  const app = new Hono<{ Bindings: Env; Variables: AuthVars }>();
  app.get("/needs", requireBearer, (c) => {
    const u = c.get("authUser");
    return c.json({ user_id: u.user_id, token_id: u.token_id });
  });
  app.get("/optional", optionalBearer, (c) => {
    const u = c.get("authUser");
    return c.json({ user_id: u?.user_id ?? null });
  });
  return app;
}

describe("requireBearer", () => {
  it("401 when no Authorization header", async () => {
    const res = await appWithBearerRoute().request("/needs", {}, env);
    expect(res.status).toBe(401);
  });

  it("401 on malformed Authorization", async () => {
    const res = await appWithBearerRoute().request(
      "/needs",
      { headers: { authorization: "Token abc" } },
      env
    );
    expect(res.status).toBe(401);
  });

  it("401 on unknown bearer", async () => {
    const res = await appWithBearerRoute().request(
      "/needs",
      { headers: { authorization: "Bearer doesnotexist" } },
      env
    );
    expect(res.status).toBe(401);
  });

  it("200 + attaches authUser on valid bearer", async () => {
    const u = await upsertByGithubId(env.DB, "2001");
    const { token, id } = await createApiToken(env.DB, u.id, "cli");
    const res = await appWithBearerRoute().request(
      "/needs",
      { headers: { authorization: `Bearer ${token}` } },
      env
    );
    expect(res.status).toBe(200);
    const j: any = await res.json();
    expect(j.user_id).toBe(u.id);
    expect(j.token_id).toBe(id);
  });
});

describe("optionalBearer", () => {
  it("200 + null authUser when no header", async () => {
    const res = await appWithBearerRoute().request("/optional", {}, env);
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).user_id).toBeNull();
  });

  it("attaches authUser when header is valid", async () => {
    const u = await upsertByGithubId(env.DB, "2002");
    const { token } = await createApiToken(env.DB, u.id, null);
    const res = await appWithBearerRoute().request(
      "/optional",
      { headers: { authorization: `Bearer ${token}` } },
      env
    );
    expect(((await res.json()) as any).user_id).toBe(u.id);
  });

  it("returns 401 if the header is present but invalid", async () => {
    const res = await appWithBearerRoute().request(
      "/optional",
      { headers: { authorization: "Bearer bad" } },
      env
    );
    expect(res.status).toBe(401);
  });
});
