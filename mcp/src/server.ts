import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { publishScript, type Deps } from "./publish.js";
import { PublishInputSchema, MAX_CONTENT_LENGTH } from "./schema.js";

export const TOOLS = [
  {
    name: "publish_script",
    description:
      "Publishes a shell script to 1ln.sh and returns a one-line `curl … | sh` URL the user can run on any server. " +
      "Default visibility is 'private' (unguessable URL); pass 'public' for a short shareable URL. " +
      "Default expires is '24h'; pass '1run' for single-use. " +
      "Consumers can pass runtime parameters via the URL query string — e.g. `curl 1ln.sh/<slug>?port=8080&env=staging | sh` " +
      "exposes `ENV_1LN_PORT=8080` and `ENV_1LN_ENV=staging` to the executing script. " +
      "If you're writing a script that takes per-environment values, reference them as `$ENV_1LN_<KEY>` and tell the user how to invoke it.",
    inputSchema: {
      type: "object",
      properties: {
        content: { type: "string", description: "The shell script to publish.", maxLength: MAX_CONTENT_LENGTH },
        visibility: { type: "string", enum: ["public", "private"], description: "Default: private" },
        expires: { type: "string", enum: ["1h", "24h", "1run", "never"], description: "Default: 24h" },
      },
      required: ["content"],
    },
  },
] as const;

export function buildServer(deps: Deps) {
  const server = new Server(
    { name: "1ln-mcp", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    if (req.params.name !== "publish_script") {
      throw new Error(`unknown tool: ${req.params.name}`);
    }
    const input = PublishInputSchema.parse(req.params.arguments ?? {});
    const result = await publishScript(deps, input);
    return {
      content: [
        {
          type: "text",
          text:
            `Published to ${result.url}\n\n` +
            `Run this on any server:\n  ${result.one_liner}\n\n` +
            `Delete token (save it): ${result.delete_token}`,
        },
      ],
      structuredContent: result,
    };
  });

  return server;
}
