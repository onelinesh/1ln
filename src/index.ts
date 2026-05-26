import { Hono } from "hono";
import type { Env } from "./env";
import { apiScripts } from "./routes/api_scripts";

const app = new Hono<{ Bindings: Env }>();

app.get("/health", (c) => c.text("ok"));
app.route("/", apiScripts);

export default {
  fetch: app.fetch,
};
