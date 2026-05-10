'use client';

import { useState } from 'react';

export interface ToolCallEvent {
  type: 'tool_call';
  tool_use_id: string;
  tool_name: string;
  server: string;
  args: Record<string, unknown>;
}

export interface ToolResultEvent {
  type: 'tool_result';
  tool_use_id: string;
  tool_name: string;
  result: string;
  isError?: boolean;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ToolCallEvent[];
  toolResults?: Map<string, ToolResultEvent>;
}

function ToolBlock({
  call,
  result,
}: {
  call: ToolCallEvent;
  result?: ToolResultEvent;
}) {
  const [open, setOpen] = useState(false);
  const toolShort = call.tool_name.split('__')[1] ?? call.tool_name;

  return (
    <div
      style={{
        background: 'var(--surface-3)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        marginTop: 8,
        fontSize: 12,
        fontFamily: 'monospace',
      }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%',
          background: 'none',
          border: 'none',
          color: 'var(--purple-light)',
          padding: '6px 10px',
          textAlign: 'left',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span style={{ fontSize: 10 }}>{open ? '▼' : '▶'}</span>
        <span style={{ color: 'var(--text-muted)' }}>[{call.server}]</span>
        <span>{toolShort}</span>
        {result?.isError && <span style={{ color: '#f87171', marginLeft: 'auto' }}>error</span>}
        {result && !result.isError && (
          <span style={{ color: '#4ade80', marginLeft: 'auto' }}>done</span>
        )}
        {!result && <span style={{ color: '#facc15', marginLeft: 'auto' }}>running…</span>}
      </button>

      {open && (
        <div style={{ padding: '0 10px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div>
            <div style={{ color: 'var(--text-muted)', marginBottom: 2 }}>args</div>
            <pre
              style={{
                margin: 0,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                color: 'var(--text)',
                background: 'var(--surface-2)',
                padding: '6px 8px',
                borderRadius: 4,
              }}
            >
              {JSON.stringify(call.args, null, 2)}
            </pre>
          </div>
          {result && (
            <div>
              <div style={{ color: 'var(--text-muted)', marginBottom: 2 }}>result</div>
              <pre
                style={{
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  color: result.isError ? '#f87171' : 'var(--text)',
                  background: 'var(--surface-2)',
                  padding: '6px 8px',
                  borderRadius: 4,
                  maxHeight: 300,
                  overflowY: 'auto',
                }}
              >
                {result.result}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Message({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: isUser ? 'flex-end' : 'flex-start',
        marginBottom: 16,
        maxWidth: '100%',
      }}
    >
      <div
        style={{
          maxWidth: '75%',
          minWidth: 60,
          padding: '10px 14px',
          borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
          background: isUser ? 'var(--purple)' : 'var(--surface-2)',
          color: 'var(--text)',
          fontSize: 14,
          lineHeight: 1.6,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {message.content}
      </div>

      {message.toolCalls && message.toolCalls.length > 0 && (
        <div style={{ maxWidth: '85%', width: '100%', marginTop: 4 }}>
          {message.toolCalls.map((call) => (
            <ToolBlock
              key={call.tool_use_id}
              call={call}
              result={message.toolResults?.get(call.tool_use_id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
