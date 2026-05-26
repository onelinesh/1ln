import { Hono } from "hono";
import type { Env } from "./env";
import { gh } from "./routes/gh";
import { home } from "./routes/home";
import { apiScripts } from "./routes/api_scripts";
import { meta } from "./routes/meta";
import { view } from "./routes/view";
import { raw } from "./routes/raw";
import { cleanupExpired } from "./cleanup";
import { renderNotFound } from "./views/not_found";

const app = new Hono<{ Bindings: Env }>();

app.use("*", async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
});

app.get("/health", (c) => c.text("ok"));
app.route("/", gh);
app.route("/", home);
app.route("/", apiScripts);
app.route("/", meta);
app.route("/", view);
app.route("/", raw);

app.notFound((c) => {
  const url = new URL(c.req.url);
  return c.html(renderNotFound(url.pathname), 404);
});

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      cleanupExpired(env.DB).then((n) => console.log(`cleanup: deleted ${n}`))
    );
  },
};
