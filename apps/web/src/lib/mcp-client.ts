export interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ToolResult {
  content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
  isError?: boolean;
}

let requestId = 1;

function nextId(): number {
  return requestId++;
}

export class MCPClient {
  private sessionId: string | null = null;

  constructor(
    private baseUrl: string,
    private serverName: string,
  ) {}

  private get endpoint(): string {
    return `${this.baseUrl}/mcp`;
  }

  private async post(body: unknown): Promise<unknown> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.sessionId) headers['mcp-session-id'] = this.sessionId;

    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    const sid = res.headers.get('mcp-session-id');
    if (sid) this.sessionId = sid;

    if (!res.ok) {
      throw new Error(`MCP ${this.serverName}: HTTP ${res.status} ${res.statusText}`);
    }

    const text = await res.text();
    if (!text) return null;
    return JSON.parse(text);
  }

  async initialize(): Promise<void> {
    await this.post({
      jsonrpc: '2.0',
      id: nextId(),
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        clientInfo: { name: 'claude-mcp-web', version: '1.0.0' },
      },
    });

    await this.post({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    });
  }

  async listTools(): Promise<Tool[]> {
    await this.initialize();
    const response = (await this.post({
      jsonrpc: '2.0',
      id: nextId(),
      method: 'tools/list',
      params: {},
    })) as { result?: { tools?: Tool[] } };

    return response?.result?.tools ?? [];
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    if (!this.sessionId) await this.initialize();

    const response = (await this.post({
      jsonrpc: '2.0',
      id: nextId(),
      method: 'tools/call',
      params: { name, arguments: args },
    })) as { result?: ToolResult; error?: { message: string } };

    if (response?.error) {
      return {
        content: [{ type: 'text', text: response.error.message }],
        isError: true,
      };
    }

    return response?.result ?? { content: [{ type: 'text', text: 'No result returned.' }] };
  }
}
