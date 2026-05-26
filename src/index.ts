import { Hono } from "hono";
import type { Env } from "./env";
import { apiScripts } from "./routes/api_scripts";
import { raw } from "./routes/raw";

const app = new Hono<{ Bindings: Env }>();

app.get("/health", (c) => c.text("ok"));
app.route("/", apiScripts);
app.route("/", raw);

export default {
  fetch: app.fetch,
};
