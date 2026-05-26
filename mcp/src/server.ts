import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { publishScript, type Deps } from "./publish.js";

const PublishInputSchema = z.object({
  content: z.string().min(1).describe("The shell script to publish."),
  visibility: z.enum(["public", "private"]).optional()
    .describe("'private' (default) for an unguessable 22-char URL; 'public' for a short 4-char URL."),
  expires: z.enum(["1h", "24h", "1run", "never"]).optional()
    .describe("'24h' default. '1run' makes the URL work exactly once."),
});

export function buildServer(deps: Deps) {
  const server = new Server(
    { name: "1ln-mcp", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "publish_script",
        description:
          "Publishes a shell script to 1ln.sh and returns a one-line `curl … | sh` URL the user can run on any server. " +
          "Default visibility is 'private' (unguessable URL); pass 'public' for a short shareable URL. " +
          "Default expires is '24h'; pass '1run' for single-use.",
        inputSchema: {
          type: "object",
          properties: {
            content: { type: "string", description: "The shell script to publish." },
            visibility: { type: "string", enum: ["public", "private"], description: "Default: private" },
            expires: { type: "string", enum: ["1h", "24h", "1run", "never"], description: "Default: 24h" },
          },
          required: ["content"],
        },
      },
    ],
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
