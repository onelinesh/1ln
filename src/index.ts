import { Hono } from "hono";
import type { Env } from "./env";
import { gh } from "./routes/gh";
import { home } from "./routes/home";
import { apiScripts } from "./routes/api_scripts";
import { meta } from "./routes/meta";
import { view } from "./routes/view";
import { raw } from "./routes/raw";
import { cleanupExpired } from "./cleanup";

const app = new Hono<{ Bindings: Env }>();

app.get("/health", (c) => c.text("ok"));
app.route("/", gh);
app.route("/", home);
app.route("/", apiScripts);
app.route("/", meta);
app.route("/", view);
app.route("/", raw);

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      cleanupExpired(env.DB).then((n) => console.log(`cleanup: deleted ${n}`))
    );
  },
};
