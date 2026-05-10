'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Message, { ChatMessage, ToolCallEvent, ToolResultEvent } from './Message';

interface ApiMessage {
  role: 'user' | 'assistant';
  content: string;
}

function parseSSELine(line: string): unknown | null {
  if (!line.startsWith('data: ')) return null;
  try {
    return JSON.parse(line.slice(6));
  } catch {
    return null;
  }
}

export default function ChatInterface() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const updateLastMessage = useCallback((updater: (msg: ChatMessage) => ChatMessage) => {
    setMessages((prev) => {
      if (prev.length === 0) return prev;
      const next = [...prev];
      next[next.length - 1] = updater(next[next.length - 1]);
      return next;
    });
  }, []);

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;

    setInput('');
    setLoading(true);

    const userMsg: ChatMessage = { role: 'user', content: text };
    const assistantMsg: ChatMessage = {
      role: 'assistant',
      content: '',
      toolCalls: [],
      toolResults: new Map(),
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);

    const apiHistory: ApiMessage[] = [
      ...messages.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: text },
    ];

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiHistory }),
      });

      if (!res.body) throw new Error('No response body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const event = parseSSELine(line);
          if (!event) continue;

          const ev = event as Record<string, unknown>;

          if (ev.type === 'content_block_delta') {
            const delta = ev.delta as Record<string, unknown>;
            if (delta.type === 'text_delta') {
              updateLastMessage((msg) => ({
                ...msg,
                content: msg.content + (delta.text as string),
              }));
            }
          } else if (ev.type === 'tool_call') {
            const call = ev as unknown as ToolCallEvent;
            updateLastMessage((msg) => ({
              ...msg,
              toolCalls: [...(msg.toolCalls ?? []), call],
            }));
          } else if (ev.type === 'tool_result') {
            const result = ev as unknown as ToolResultEvent;
            updateLastMessage((msg) => {
              const next = new Map(msg.toolResults);
              next.set(result.tool_use_id, result);
              return { ...msg, toolResults: next };
            });
          }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      updateLastMessage((msg) => ({ ...msg, content: msg.content + `\n\nError: ${message}` }));
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        background: 'var(--bg)',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '16px 24px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface-1)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: 'var(--purple)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 16,
          }}
        >
          C
        </div>
        <div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>Claude MCP Stack</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Playwright · SSH · Vercel · Supabase
          </div>
        </div>
      </div>

      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {messages.length === 0 && (
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-muted)',
              gap: 16,
            }}
          >
            <div style={{ fontSize: 48 }}>⬡</div>
            <div style={{ fontSize: 18, fontWeight: 500, color: 'var(--text)' }}>
              What can I help you with?
            </div>
            <div style={{ fontSize: 13, textAlign: 'center', maxWidth: 480, lineHeight: 1.7 }}>
              I have access to browser automation, SSH, Vercel deployments, and Supabase. Ask me to
              take a screenshot, run a command, check a deployment, or query your database.
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: 8,
                marginTop: 8,
              }}
            >
              {[
                'Take a screenshot of https://example.com',
                'List my Vercel deployments',
                'List Supabase tables',
                'Connect to my server via SSH',
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => setInput(suggestion)}
                  style={{
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    padding: '8px 12px',
                    color: 'var(--text)',
                    fontSize: 12,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <Message key={i} message={msg} />
        ))}

        {loading && messages[messages.length - 1]?.role === 'assistant' &&
          messages[messages.length - 1]?.content === '' && (
            <div style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>
              <span className="animate-pulse">Thinking…</span>
            </div>
          )}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div
        style={{
          padding: '16px 24px',
          borderTop: '1px solid var(--border)',
          background: 'var(--surface-1)',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: 10,
            alignItems: 'flex-end',
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: '10px 14px',
          }}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message Claude… (Shift+Enter for newline)"
            rows={1}
            style={{
              flex: 1,
              background: 'none',
              border: 'none',
              outline: 'none',
              color: 'var(--text)',
              fontSize: 14,
              resize: 'none',
              lineHeight: 1.6,
              maxHeight: 200,
              overflowY: 'auto',
              fontFamily: 'inherit',
            }}
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = 'auto';
              el.style.height = Math.min(el.scrollHeight, 200) + 'px';
            }}
          />
          <button
            onClick={sendMessage}
            disabled={loading || !input.trim()}
            style={{
              background: loading || !input.trim() ? 'var(--surface-3)' : 'var(--purple)',
              border: 'none',
              borderRadius: 8,
              width: 34,
              height: 34,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
              flexShrink: 0,
              transition: 'background 0.15s',
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke={loading || !input.trim() ? 'var(--text-muted)' : 'white'}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, textAlign: 'center' }}>
          Claude may make mistakes. Verify important information.
        </div>
      </div>
    </div>
  );
}
