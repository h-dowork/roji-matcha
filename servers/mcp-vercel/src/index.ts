import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import express from 'express';
import cors from 'cors';

const PORT = 3003;
const VERCEL_API = 'https://api.vercel.com';

function vercelHeaders(): Record<string, string> {
  const token = process.env.VERCEL_TOKEN;
  if (!token) throw new Error('VERCEL_TOKEN environment variable is not set.');
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function vercelFetch(path: string, options: RequestInit = {}): Promise<unknown> {
  const res = await fetch(`${VERCEL_API}${path}`, {
    ...options,
    headers: { ...vercelHeaders(), ...(options.headers as Record<string, string> | undefined ?? {}) },
  });
  const body = await res.json();
  if (!res.ok) {
    const msg = (body as { error?: { message?: string } }).error?.message ?? res.statusText;
    throw new Error(`Vercel API error ${res.status}: ${msg}`);
  }
  return body;
}

const app = express();
app.use(cors());
app.use(express.json());

const server = new Server(
  { name: 'mcp-vercel', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'vercel_list_deployments',
      description: 'List recent Vercel deployments.',
      inputSchema: {
        type: 'object',
        properties: {
          teamId: { type: 'string', description: 'Team ID or slug (optional)' },
          limit: { type: 'number', description: 'Number of deployments to return (default 20)' },
        },
      },
    },
    {
      name: 'vercel_get_deployment',
      description: 'Get details of a specific deployment.',
      inputSchema: {
        type: 'object',
        properties: {
          deploymentId: { type: 'string' },
        },
        required: ['deploymentId'],
      },
    },
    {
      name: 'vercel_list_projects',
      description: 'List all Vercel projects.',
      inputSchema: {
        type: 'object',
        properties: {
          teamId: { type: 'string', description: 'Team ID or slug (optional)' },
        },
      },
    },
    {
      name: 'vercel_get_deployment_logs',
      description: 'Get logs/events for a deployment.',
      inputSchema: {
        type: 'object',
        properties: {
          deploymentId: { type: 'string' },
        },
        required: ['deploymentId'],
      },
    },
    {
      name: 'vercel_cancel_deployment',
      description: 'Cancel a running deployment.',
      inputSchema: {
        type: 'object',
        properties: {
          deploymentId: { type: 'string' },
        },
        required: ['deploymentId'],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'vercel_list_deployments': {
        const { teamId, limit = 20 } = (args ?? {}) as { teamId?: string; limit?: number };
        const params = new URLSearchParams({ limit: String(limit) });
        if (teamId) params.set('teamId', teamId);
        const data = await vercelFetch(`/v6/deployments?${params}`);
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }

      case 'vercel_get_deployment': {
        const { deploymentId } = args as { deploymentId: string };
        const data = await vercelFetch(`/v13/deployments/${deploymentId}`);
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }

      case 'vercel_list_projects': {
        const { teamId } = (args ?? {}) as { teamId?: string };
        const params = new URLSearchParams();
        if (teamId) params.set('teamId', teamId);
        const query = params.toString() ? `?${params}` : '';
        const data = await vercelFetch(`/v9/projects${query}`);
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }

      case 'vercel_get_deployment_logs': {
        const { deploymentId } = args as { deploymentId: string };
        const data = await vercelFetch(`/v2/deployments/${deploymentId}/events`);
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }

      case 'vercel_cancel_deployment': {
        const { deploymentId } = args as { deploymentId: string };
        const data = await vercelFetch(`/v12/deployments/${deploymentId}/cancel`, { method: 'PATCH' });
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }

      default:
        return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: [{ type: 'text', text: message }], isError: true };
  }
});

const transport = new StreamableHTTPServerTransport({
  sessionIdGenerator: () => Math.random().toString(36).slice(2),
});

app.post('/mcp', (req, res) => transport.handleRequest(req, res, req.body));
app.get('/mcp', (req, res) => transport.handleRequest(req, res));
app.delete('/mcp', (req, res) => transport.handleRequest(req, res));

await server.connect(transport);

app.listen(PORT, () => console.log(`mcp-vercel running on :${PORT}`));
