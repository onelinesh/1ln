import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildServer } from "./server.js";

const baseUrl = process.env.ONELN_BASE_URL ?? "https://1ln.sh";
const server = buildServer({ fetch: globalThis.fetch, baseUrl });
const transport = new StdioServerTransport();
await server.connect(transport);
