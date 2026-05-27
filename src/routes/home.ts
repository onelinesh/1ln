import { Hono } from "hono";
import type { Env } from "../env";
import { renderHome } from "../views/home";
import { renderTry } from "../views/try";
import { renderResult } from "../views/result";
import { createAnonymous } from "./api_scripts";

export const home = new Hono<{ Bindings: Env }>();

home.get("/", (c) => c.html(renderHome()));

home.get("/try", (c) => c.html(renderTry()));

home.post("/", async (c) => {
  const ip = c.req.header("cf-connecting-ip") ?? "0.0.0.0";
  const form = await c.req.formData();
  const result = await createAnonymous(
    c.env,
    ip,
    form.get("content"),
    form.get("visibility"),
    "7d-web-default"
  );
  if (!result.ok) return c.text(result.error, result.status);
  return c.html(renderResult({ slug: result.slug, deleteToken: result.deleteToken }));
});
