# DisposableCheck MCP Server

MCP server for the DisposableCheck API. It lets MCP clients check disposable email addresses, inspect API key usage, read platform stats, and report disposable domains.

Hosted endpoint:

```text
https://disposablecheck.irensaltali.com/mcp
```

The hosted endpoint uses stateless Streamable HTTP over `POST`.

## Available Tools

| Tool | Description | Requires API key |
| --- | --- | --- |
| `check_email` | Check whether an email address uses a known disposable domain. Optional deep MX/SMTP verification is available with `check_reachable: true`. | Yes |
| `get_key_info` | Get daily usage and limit information for an API key account by email. | No |
| `get_stats` | Get aggregate platform stats. | No |
| `report_domain` | Submit a disposable-domain report for review. | No |

## Hosted HTTP Usage

Use the MCP endpoint with a client that supports Streamable HTTP.

For tools that require an API key, send either:

```http
Authorization: Bearer dk_live_YOUR_KEY
```

or:

```http
X-API-Key: dk_live_YOUR_KEY
```

Example raw MCP request:

```bash
curl -X POST https://disposablecheck.irensaltali.com/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H 'X-API-Key: dk_live_YOUR_KEY' \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "check_email",
      "arguments": {
        "email": "user@mailinator.com"
      }
    }
  }'
```

`GET /mcp` intentionally returns `405 Method Not Allowed`; use `POST /mcp`.

## MCP Client Setup

### Claude Code

```bash
claude mcp add disposable-check \
  --transport http \
  --header "X-API-Key: dk_live_YOUR_KEY" \
  https://disposablecheck.irensaltali.com/mcp
```

### Cursor

Create `~/.cursor/mcp.json` globally, or `.cursor/mcp.json` in one project:

```json
{
  "mcpServers": {
    "disposable-check": {
      "url": "https://disposablecheck.irensaltali.com/mcp",
      "headers": {
        "X-API-Key": "dk_live_YOUR_KEY"
      }
    }
  }
}
```

### VS Code

Create `.vscode/mcp.json` in your workspace:

```json
{
  "servers": {
    "disposable-check": {
      "type": "http",
      "url": "https://disposablecheck.irensaltali.com/mcp",
      "headers": {
        "X-API-Key": "${input:disposable-check-api-key}"
      }
    }
  },
  "inputs": [
    {
      "id": "disposable-check-api-key",
      "type": "promptString",
      "description": "DisposableCheck API key",
      "password": true
    }
  ]
}
```

### Postman

Create an MCP request with:

```text
URL: https://disposablecheck.irensaltali.com/mcp
Header: X-API-Key: dk_live_YOUR_KEY
```

### Claude Desktop and Claude.ai

Hosted remote MCP connectors are added from Settings → Connectors, not from `claude_desktop_config.json`. Use the hosted URL for public tools:

```text
https://disposablecheck.irensaltali.com/mcp
```

The hosted `check_email` tool requires a static API key header. Use Claude Code, VS Code, Cursor, Postman, or the Claude API when you need header-based auth.

## Local Stdio Usage

Install and run the stdio server with an API key:

```bash
npm install
npm run build
DISPOSABLE_CHECK_API_KEY=dk_live_YOUR_KEY npm start
```

Claude Desktop example:

```json
{
  "mcpServers": {
    "disposable-check": {
      "command": "npx",
      "args": ["-y", "disposable-check-mcp"],
      "env": {
        "DISPOSABLE_CHECK_API_KEY": "dk_live_YOUR_KEY"
      }
    }
  }
}
```

Claude Code example:

```bash
claude mcp add disposable-check \
  -e DISPOSABLE_CHECK_API_KEY=dk_live_YOUR_KEY \
  -- npx -y disposable-check-mcp
```

## Cloudflare Worker Deployment

This repo also includes a Cloudflare Worker entrypoint at `src/worker.ts`.

Build and deploy:

```bash
npm install
npm run build
npm run deploy
```

The Worker uses a service binding to call the DisposableCheck API Worker:

```jsonc
"services": [
  {
    "binding": "DISPOSABLE_CHECK_API",
    "service": "disposable-check-api"
  }
]
```

If you deploy this in another Cloudflare account, update `wrangler.jsonc`:

- `account_id`
- `routes`
- `zone_name`
- `services[0].service`
- `DISPOSABLE_CHECK_BASE_URL`

## Environment Variables

| Name | Used by | Description |
| --- | --- | --- |
| `DISPOSABLE_CHECK_API_KEY` | Stdio and Worker | Optional default API key. Hosted clients can also pass per-request `Authorization: Bearer ...` or `X-API-Key`. |
| `DISPOSABLE_CHECK_BASE_URL` | Stdio and Worker | API base URL. Defaults to `https://disposablecheck.irensaltali.com/api`. |

Do not commit `.env`, `.dev.vars`, Wrangler local state, generated `build/`, or `node_modules/`.

## Development

```bash
npm install
npm run build
npm run dev:worker
```

Run a deployment validation without publishing:

```bash
npm run deploy:dry-run
```
