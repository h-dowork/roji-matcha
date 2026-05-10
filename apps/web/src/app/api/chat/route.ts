import Anthropic from '@anthropic-ai/sdk';
import { NextRequest } from 'next/server';
import { MCPClient } from '@/lib/mcp-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type AnthropicMessage = Anthropic.MessageParam;
type AnthropicTool = Anthropic.Tool;
type ContentBlock = Anthropic.ContentBlock;
type ToolUseBlock = Anthropic.ToolUseBlock;
type StreamEvent = Anthropic.MessageStreamEvent;

interface ServerDef {
  name: string;
  envKey: string;
  defaultUrl: string;
}

const SERVER_DEFS: ServerDef[] = [
  { name: 'playwright', envKey: 'MCP_PLAYWRIGHT_URL', defaultUrl: 'http://localhost:3001' },
  { name: 'ssh', envKey: 'MCP_SSH_URL', defaultUrl: 'http://localhost:3002' },
  { name: 'vercel', envKey: 'MCP_VERCEL_URL', defaultUrl: 'http://localhost:3003' },
  { name: 'supabase', envKey: 'MCP_SUPABASE_URL', defaultUrl: 'http://localhost:3004' },
];

function encode(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

function errorStream(message: string): Response {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(
        new TextEncoder().encode(
          encode({ type: 'content_block_delta', delta: { type: 'text_delta', text: message } }),
        ),
      );
      controller.enqueue(new TextEncoder().encode(encode({ type: 'message_stop' })));
      controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

export async function POST(req: NextRequest): Promise<Response> {
  const { messages, mcpServers: enabledServers } = (await req.json()) as {
    messages: AnthropicMessage[];
    mcpServers?: string[];
  };

  if (!process.env.ANTHROPIC_API_KEY) {
    return errorStream(
      "ANTHROPIC_API_KEY is not set. To enable Claude, add your API key to apps/web/.env.local:\n\nANTHROPIC_API_KEY=sk-ant-...\n\nGet a key at https://console.anthropic.com",
    );
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const activeDefs = enabledServers
    ? SERVER_DEFS.filter((s) => enabledServers.includes(s.name))
    : SERVER_DEFS;

  const clients = new Map<string, MCPClient>();
  const toolToServer = new Map<string, string>();
  const anthropicTools: AnthropicTool[] = [];

  for (const def of activeDefs) {
    const url = process.env[def.envKey] ?? def.defaultUrl;
    const client = new MCPClient(url, def.name);
    try {
      const tools = await client.listTools();
      clients.set(def.name, client);
      for (const tool of tools) {
        const prefixed = `${def.name}__${tool.name}`;
        toolToServer.set(prefixed, def.name);
        anthropicTools.push({
          name: prefixed,
          description: `[${def.name}] ${tool.description}`,
          input_schema: tool.inputSchema as Anthropic.Tool['input_schema'],
        });
      }
    } catch {
      // Server unreachable — skip without crashing
    }
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(data: unknown) {
        controller.enqueue(encoder.encode(encode(data)));
      }

      try {
        const conversationMessages: AnthropicMessage[] = [...messages];

        while (true) {
          const streamParams: Anthropic.MessageCreateParamsStreaming = {
            model: 'claude-sonnet-4-5',
            max_tokens: 4096,
            messages: conversationMessages,
            stream: true,
            ...(anthropicTools.length > 0 ? { tools: anthropicTools } : {}),
          };

          const apiStream = await anthropic.messages.create(streamParams);

          let stopReason: string | null = null;
          const assistantContent: ContentBlock[] = [];
          let currentToolUse: Partial<ToolUseBlock> & { input_raw?: string } | null = null;

          for await (const event of apiStream as AsyncIterable<StreamEvent>) {
            switch (event.type) {
              case 'message_start':
                send(event);
                break;

              case 'content_block_start':
                send(event);
                if (event.content_block.type === 'tool_use') {
                  currentToolUse = { ...event.content_block, input_raw: '' };
                }
                break;

              case 'content_block_delta':
                send(event);
                if (event.delta.type === 'input_json_delta' && currentToolUse) {
                  currentToolUse.input_raw = (currentToolUse.input_raw ?? '') + event.delta.partial_json;
                }
                break;

              case 'content_block_stop':
                send(event);
                if (currentToolUse) {
                  const parsed = JSON.parse(currentToolUse.input_raw ?? '{}') as Record<string, unknown>;
                  assistantContent.push({
                    type: 'tool_use',
                    id: currentToolUse.id!,
                    name: currentToolUse.name!,
                    input: parsed,
                  } as ToolUseBlock);
                  currentToolUse = null;
                }
                break;

              case 'message_delta':
                send(event);
                if (event.delta.stop_reason) stopReason = event.delta.stop_reason;
                break;

              case 'message_stop':
                send(event);
                break;

              default:
                if ((event as { type: string }).type === 'message') {
                  stopReason = (event as { stop_reason?: string }).stop_reason ?? stopReason;
                  const msg = event as unknown as { content: ContentBlock[] };
                  for (const block of msg.content ?? []) {
                    if (block.type === 'text') assistantContent.push(block);
                  }
                }
            }
          }

          if (assistantContent.length === 0 && stopReason !== 'tool_use') break;

          conversationMessages.push({ role: 'assistant', content: assistantContent });

          if (stopReason !== 'tool_use') break;

          const toolResults: Anthropic.ToolResultBlockParam[] = [];

          for (const block of assistantContent) {
            if (block.type !== 'tool_use') continue;

            const { id, name, input } = block;
            const serverName = toolToServer.get(name);

            if (!serverName) {
              toolResults.push({
                type: 'tool_result',
                tool_use_id: id,
                content: `Unknown tool server for: ${name}`,
                is_error: true,
              });
              continue;
            }

            const client = clients.get(serverName);
            if (!client) {
              toolResults.push({
                type: 'tool_result',
                tool_use_id: id,
                content: `MCP server "${serverName}" is not connected.`,
                is_error: true,
              });
              continue;
            }

            const toolName = name.slice(serverName.length + 2);

            send({
              type: 'tool_call',
              tool_use_id: id,
              tool_name: name,
              server: serverName,
              args: input,
            });

            try {
              const result = await client.callTool(toolName, input as Record<string, unknown>);
              const textContent = result.content
                .map((c) => (c.type === 'text' ? c.text : `[${c.type}]`))
                .join('\n');

              send({
                type: 'tool_result',
                tool_use_id: id,
                tool_name: name,
                result: textContent,
                isError: result.isError,
              });

              toolResults.push({
                type: 'tool_result',
                tool_use_id: id,
                content: textContent,
                is_error: result.isError,
              });
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              send({ type: 'tool_result', tool_use_id: id, tool_name: name, result: message, isError: true });
              toolResults.push({
                type: 'tool_result',
                tool_use_id: id,
                content: message,
                is_error: true,
              });
            }
          }

          conversationMessages.push({ role: 'user', content: toolResults });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        send({ type: 'content_block_delta', delta: { type: 'text_delta', text: `\n\nError: ${message}` } });
        send({ type: 'message_stop' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
