# claude-mcp-stack

A Claude AI orchestrator with a Next.js chat UI connected to 4 custom MCP servers over HTTP. Each MCP server exposes real automation capabilities (browser control, SSH, Vercel API, Supabase) that Claude can invoke as tools during a conversation.

## Architecture

```
Browser
  └── Next.js app (port 3000)
        └── /api/chat  ─── Anthropic Claude API (streaming)
              ├── MCPClient → mcp-playwright (port 3001)  # Browser automation
              ├── MCPClient → mcp-ssh        (port 3002)  # SSH remote execution
              ├── MCPClient → mcp-vercel     (port 3003)  # Vercel deployments
              └── MCPClient → mcp-supabase   (port 3004)  # Supabase database
```

All MCP servers expose a Streamable HTTP transport at `/mcp`. In production, the servers run on a machine accessible via Tailscale and the Next.js app reaches them by Tailscale hostname.

## Prerequisites

- Node.js 20+
- npm 10+
- Tailscale installed and authenticated (for production remote access)
- An Anthropic API key (optional to get started; the app shows a placeholder if absent)

## Setup

```bash
git clone <repo-url> claude-mcp-stack
cd claude-mcp-stack

# Install all workspace dependencies
npm install

# Copy env files
cp .env.example .env
cp apps/web/.env.local.example apps/web/.env.local
```

Edit `.env` and `apps/web/.env.local` and fill in the values described below.

## Environment Variables

| Variable | Where used | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | `apps/web` | Claude API key from console.anthropic.com |
| `MCP_PLAYWRIGHT_URL` | `apps/web` | Base URL of mcp-playwright server |
| `MCP_SSH_URL` | `apps/web` | Base URL of mcp-ssh server |
| `MCP_VERCEL_URL` | `apps/web` | Base URL of mcp-vercel server |
| `MCP_SUPABASE_URL` | `apps/web` | Base URL of mcp-supabase server |
| `VERCEL_TOKEN` | `servers/mcp-vercel` | Vercel personal access token |
| `SUPABASE_URL` | `servers/mcp-supabase` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | `servers/mcp-supabase` | Supabase service role key (bypasses RLS) |

## Running

**Terminal 1 — MCP servers:**
```bash
npm run servers
```

**Terminal 2 — Next.js web app:**
```bash
npm run dev -w apps/web
```

Open http://localhost:3000.

To start everything in one terminal:
```bash
npm run dev
```

## Port Map

| Service | Port |
|---|---|
| Next.js web | 3000 |
| mcp-playwright | 3001 |
| mcp-ssh | 3002 |
| mcp-vercel | 3003 |
| mcp-supabase | 3004 |

## Tailscale Setup (Production)

1. Install Tailscale on the machine running the MCP servers: https://tailscale.com/download
2. Run `tailscale up` and authenticate.
3. Find your machine's Tailscale hostname:
   ```bash
   tailscale status
   # or
   tailscale ip -4
   ```
4. Update the MCP URL variables to use the Tailscale hostname:
   ```
   MCP_PLAYWRIGHT_URL=http://my-machine.tail1234.ts.net:3001
   MCP_SSH_URL=http://my-machine.tail1234.ts.net:3002
   MCP_VERCEL_URL=http://my-machine.tail1234.ts.net:3003
   MCP_SUPABASE_URL=http://my-machine.tail1234.ts.net:3004
   ```
5. Make sure the MCP server ports (3001–3004) are not blocked by a firewall on that machine.

## Adding Your Anthropic API Key

1. Go to https://console.anthropic.com and create an API key.
2. Add it to `apps/web/.env.local`:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ```
3. Restart the Next.js dev server.

The chat UI will show a helpful message if the key is missing — you can still explore the UI and MCP tool listings without it.

## MCP Tool Reference

### mcp-playwright
| Tool | Description |
|---|---|
| `browser_navigate` | Navigate to a URL, returns page title |
| `browser_screenshot` | Take a screenshot (returns base64 PNG) |
| `browser_click` | Click a CSS selector |
| `browser_type` | Type text into an element |
| `browser_evaluate` | Run arbitrary JavaScript on the page |
| `browser_close` | Close the browser |

### mcp-ssh
| Tool | Description |
|---|---|
| `ssh_connect` | Connect to a remote host, returns connection ID |
| `ssh_execute` | Run a command over SSH |
| `ssh_disconnect` | Close a connection |
| `ssh_list_connections` | List active SSH connections |

### mcp-vercel
| Tool | Description |
|---|---|
| `vercel_list_deployments` | List recent deployments |
| `vercel_get_deployment` | Get a single deployment |
| `vercel_list_projects` | List projects |
| `vercel_get_deployment_logs` | Stream deployment logs |
| `vercel_cancel_deployment` | Cancel a running deployment |

### mcp-supabase
| Tool | Description |
|---|---|
| `supabase_query` | Run raw SQL via RPC |
| `supabase_list_tables` | List all tables |
| `supabase_select` | Select rows with optional filters |
| `supabase_insert` | Insert one or more rows |
| `supabase_update` | Update matching rows |
| `supabase_delete` | Delete matching rows |
| `supabase_list_users` | List auth users |
| `storage_list_buckets` | List storage buckets |
| `storage_list_files` | List files in a bucket |
