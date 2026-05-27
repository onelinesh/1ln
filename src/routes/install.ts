import { Hono } from "hono";
import type { Env } from "../env";
import { renderInstall } from "../views/install";

export const install = new Hono<{ Bindings: Env }>();

install.get("/install", () => {
  return new Response(renderInstall(), {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
});
