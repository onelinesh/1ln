import { Hono } from "hono";
import type { Env } from "./env";
import { apiScripts } from "./routes/api_scripts";
import { meta } from "./routes/meta";
import { raw } from "./routes/raw";

const app = new Hono<{ Bindings: Env }>();

app.get("/health", (c) => c.text("ok"));
app.route("/", apiScripts);
app.route("/", meta);   // must come before raw
app.route("/", raw);

export default { fetch: app.fetch };
