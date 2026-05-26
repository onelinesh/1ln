# 1ln-mcp

MCP server for [1ln.sh](https://1ln.sh) — publishes shell scripts and returns a one-line `curl … | sh` URL inline in conversation.

## Tool

### `publish_script`

| Argument | Type | Default | Notes |
| --- | --- | --- | --- |
| `content` | string | required | The shell script. |
| `visibility` | `"public"` \| `"private"` | `"private"` | Public gets a 4-char URL; private gets a 22-char capability URL. |
| `expires` | `"1h"` \| `"24h"` \| `"1run"` \| `"never"` | `"24h"` | `1run` URLs work exactly once. |

Returns: `{ one_liner, url, slug, delete_token }`.

## Install

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "1ln": {
      "command": "npx",
      "args": ["-y", "1ln-mcp"]
    }
  }
}
```

Restart Claude Desktop. The `publish_script` tool will appear in the tools menu.

### Claude Code

```bash
claude mcp add 1ln npx -- -y 1ln-mcp
```

### Cursor / Continue / any other MCP client

Use the same stdio command: `npx -y 1ln-mcp`. Optionally set `ONELN_BASE_URL` to point at a different deployment.

## Use it

> "Write me a deploy script for my static site and publish it."

The model will generate the script, call `publish_script`, and reply with the one-liner — paste it on your server and run.

## Development

```bash
cd mcp
npm install
npm test
npm run dev   # runs against https://1ln.sh
ONELN_BASE_URL=http://localhost:8787 npm run dev   # against local wrangler dev
```

## License

MIT
