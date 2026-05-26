import { Hono } from "hono";
import type { Env } from "./env";
import { home } from "./routes/home";
import { apiScripts } from "./routes/api_scripts";
import { meta } from "./routes/meta";
import { view } from "./routes/view";
import { raw } from "./routes/raw";

const app = new Hono<{ Bindings: Env }>();

app.get("/health", (c) => c.text("ok"));
app.route("/", home);
app.route("/", apiScripts);
app.route("/", meta);
app.route("/", view);
app.route("/", raw);

export default { fetch: app.fetch };
