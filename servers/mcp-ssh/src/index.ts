import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import express from 'express';
import cors from 'cors';
import { Client as SSH2Client } from 'ssh2';

const PORT = 3002;

interface Connection {
  client: SSH2Client;
  id: string;
  label: string;
}

const connections = new Map<string, Connection>();

function execCommand(client: SSH2Client, command: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    client.exec(command, (err, stream) => {
      if (err) return reject(err);
      let stdout = '';
      let stderr = '';
      stream.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
      stream.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
      stream.on('close', (code: number) => resolve({ stdout, stderr, exitCode: code ?? 0 }));
    });
  });
}

const app = express();
app.use(cors());
app.use(express.json());

const server = new Server(
  { name: 'mcp-ssh', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'ssh_connect',
      description: 'Connect to a remote host via SSH. Returns a connection ID for subsequent calls.',
      inputSchema: {
        type: 'object',
        properties: {
          host: { type: 'string' },
          port: { type: 'number', description: 'SSH port (default 22)' },
          username: { type: 'string' },
          password: { type: 'string' },
          privateKey: { type: 'string', description: 'PEM-encoded private key' },
        },
        required: ['host', 'username'],
      },
    },
    {
      name: 'ssh_execute',
      description: 'Execute a command on a connected SSH host.',
      inputSchema: {
        type: 'object',
        properties: {
          connectionId: { type: 'string' },
          command: { type: 'string' },
        },
        required: ['connectionId', 'command'],
      },
    },
    {
      name: 'ssh_disconnect',
      description: 'Close an SSH connection.',
      inputSchema: {
        type: 'object',
        properties: {
          connectionId: { type: 'string' },
        },
        required: ['connectionId'],
      },
    },
    {
      name: 'ssh_list_connections',
      description: 'List all active SSH connections.',
      inputSchema: { type: 'object', properties: {} },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'ssh_connect': {
        const { host, port = 22, username, password, privateKey } = args as {
          host: string;
          port?: number;
          username: string;
          password?: string;
          privateKey?: string;
        };

        const id = `${username}@${host}`;
        if (connections.has(id)) {
          return { content: [{ type: 'text', text: `Already connected. Connection ID: ${id}` }] };
        }

        await new Promise<void>((resolve, reject) => {
          const client = new SSH2Client();
          client.on('ready', () => {
            connections.set(id, { client, id, label: `${username}@${host}:${port}` });
            resolve();
          });
          client.on('error', reject);
          client.connect({
            host,
            port,
            username,
            ...(password ? { password } : {}),
            ...(privateKey ? { privateKey } : {}),
          });
        });

        return { content: [{ type: 'text', text: `Connected. Connection ID: ${id}` }] };
      }

      case 'ssh_execute': {
        const { connectionId, command } = args as { connectionId: string; command: string };
        const conn = connections.get(connectionId);
        if (!conn) {
          return { content: [{ type: 'text', text: `No connection found with ID: ${connectionId}` }], isError: true };
        }
        const result = await execCommand(conn.client, command);
        return {
          content: [
            {
              type: 'text',
              text: `Exit code: ${result.exitCode}\n\nSTDOUT:\n${result.stdout}\n\nSTDERR:\n${result.stderr}`,
            },
          ],
        };
      }

      case 'ssh_disconnect': {
        const { connectionId } = args as { connectionId: string };
        const conn = connections.get(connectionId);
        if (!conn) {
          return { content: [{ type: 'text', text: `No connection found with ID: ${connectionId}` }], isError: true };
        }
        conn.client.end();
        connections.delete(connectionId);
        return { content: [{ type: 'text', text: `Disconnected: ${connectionId}` }] };
      }

      case 'ssh_list_connections': {
        if (connections.size === 0) {
          return { content: [{ type: 'text', text: 'No active connections.' }] };
        }
        const list = Array.from(connections.values()).map((c) => `${c.id} (${c.label})`).join('\n');
        return { content: [{ type: 'text', text: `Active connections:\n${list}` }] };
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

app.listen(PORT, () => console.log(`mcp-ssh running on :${PORT}`));
