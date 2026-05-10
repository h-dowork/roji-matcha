'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

const SYSTEM_PROMPT = `You are the AI operator for Roji Matcha — a premium matcha brand.

You have access to tools that let you manage the store:
- supabase__supabase_select / supabase__supabase_insert / supabase__supabase_update / supabase__supabase_delete: manage the Supabase database
- supabase__supabase_list_tables: see what tables exist
- supabase__supabase_list_users: see auth users
- vercel__vercel_list_deployments / vercel__vercel_get_deployment: check deployments
- playwright__browser_navigate / playwright__browser_screenshot: visit and screenshot the live site

The main table is "subscribers" with columns: id (uuid), email (text), created_at (timestamptz).

Always be concise. Format lists as markdown tables. When showing emails, never truncate them.
If asked to check the live site, use playwright to navigate to it and take a screenshot.`;

interface Msg {
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: { id: string; name: string; args: unknown }[];
  toolResults?: Map<string, { result: string; isError?: boolean }>;
}

interface ApiMsg { role: 'user' | 'assistant'; content: string; }

function parseSSE(line: string): unknown | null {
  if (!line.startsWith('data: ')) return null;
  try { return JSON.parse(line.slice(6)); } catch { return null; }
}

function ToolBlock({ name, args, result, isError }: { name: string; args: unknown; result?: string; isError?: boolean }) {
  const [open, setOpen] = useState(false);
  const server = name.split('__')[0];
  const tool   = name.split('__')[1] ?? name;
  return (
    <div style={{ margin: '6px 0', borderRadius: 8, overflow: 'hidden', border: '1px solid #D5CEBD', fontSize: 12 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', background: '#EDE8DC', border: 'none', cursor: 'pointer', textAlign: 'left' }}
      >
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: result ? (isError ? '#dc2626' : '#3D6B52') : '#A67C3B', flexShrink: 0 }} />
        <span style={{ fontWeight: 500, color: '#2A5040' }}>{tool}</span>
        <span style={{ color: '#9aaa9b', fontSize: 11 }}>via {server}</span>
        <span style={{ marginLeft: 'auto', opacity: 0.4 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ padding: '10px 12px', background: '#faf9f6', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', color: '#4A5E4D', fontFamily: 'monospace', fontSize: 11 }}>{JSON.stringify(args, null, 2)}</pre>
          {result && <pre style={{ margin: 0, whiteSpace: 'pre-wrap', color: isError ? '#dc2626' : '#2A5040', fontFamily: 'monospace', fontSize: 11, borderTop: '1px solid #EDE8DC', paddingTop: 8 }}>{result}</pre>}
        </div>
      )}
    </div>
  );
}

function MessageBubble({ msg }: { msg: Msg }) {
  if (msg.role === 'user') {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <div style={{ background: '#2A5040', color: '#F6F2EA', borderRadius: '16px 16px 4px 16px', padding: '10px 16px', maxWidth: '72%', fontSize: 14, lineHeight: 1.6 }}>
          {msg.content}
        </div>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 16 }}>
      <div style={{ maxWidth: '80%' }}>
        <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#EDE8DC', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, marginBottom: 6, color: '#2A5040', fontWeight: 600 }}>R</div>
        {(msg.toolCalls ?? []).map(tc => (
          <ToolBlock
            key={tc.id}
            name={tc.name}
            args={tc.args}
            result={msg.toolResults?.get(tc.id)?.result}
            isError={msg.toolResults?.get(tc.id)?.isError}
          />
        ))}
        {msg.content && (
          <div style={{ background: '#fff', border: '1px solid #EDE8DC', borderRadius: '4px 16px 16px 16px', padding: '10px 16px', fontSize: 14, lineHeight: 1.7, color: '#1A2A1D', whiteSpace: 'pre-wrap' }}>
            {msg.content}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminChatInterface({ initialPrompt }: { initialPrompt?: string }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput]       = useState('');
  const [loading, setLoading]   = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const firedRef  = useRef(false);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const updateLast = useCallback((fn: (m: Msg) => Msg) => {
    setMessages(prev => { const n = [...prev]; n[n.length - 1] = fn(n[n.length - 1]); return n; });
  }, []);

  const send = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;
    setInput('');
    setLoading(true);

    const userMsg: Msg = { role: 'user', content: text };
    const asstMsg: Msg = { role: 'assistant', content: '', toolCalls: [], toolResults: new Map() };
    setMessages(prev => [...prev, userMsg, asstMsg]);

    const history: ApiMsg[] = [
      ...messages.map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: text },
    ];

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, systemPrompt: SYSTEM_PROMPT }),
      });

      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let buf = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';

        for (const line of lines) {
          const ev = parseSSE(line);
          if (!ev || typeof ev !== 'object') continue;
          const e = ev as Record<string, unknown>;

          if (e.type === 'content_block_delta' && typeof e.delta === 'object') {
            const d = e.delta as Record<string, unknown>;
            if (d.type === 'text_delta' && typeof d.text === 'string') {
              updateLast(m => ({ ...m, content: m.content + (d.text as string) }));
            }
          }

          if (e.type === 'tool_call') {
            updateLast(m => ({
              ...m,
              toolCalls: [...(m.toolCalls ?? []), { id: e.tool_use_id as string, name: e.tool_name as string, args: e.args }],
            }));
          }

          if (e.type === 'tool_result') {
            updateLast(m => {
              const map = new Map(m.toolResults);
              map.set(e.tool_use_id as string, { result: e.result as string, isError: e.isError as boolean });
              return { ...m, toolResults: map };
            });
          }
        }
      }
    } catch (err) {
      updateLast(m => ({ ...m, content: `Error: ${err instanceof Error ? err.message : String(err)}` }));
    } finally {
      setLoading(false);
    }
  }, [loading, messages, updateLast]);

  useEffect(() => {
    if (initialPrompt && !firedRef.current) {
      firedRef.current = true;
      void send(initialPrompt);
    }
  }, [initialPrompt, send]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>

      {/* Top bar */}
      <div style={{ padding: '20px 32px', borderBottom: '1px solid #EDE8DC', background: '#fff', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#3D6B52' }} />
        <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 18, fontWeight: 500, color: '#2A5040', margin: 0 }}>AI Operator</h1>
        <span style={{ fontSize: 12, color: '#9aaa9b', marginLeft: 4 }}>Claude + MCP tools</span>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
        {messages.length === 0 && !loading && (
          <div style={{ textAlign: 'center', paddingTop: 60 }}>
            <div style={{ fontFamily: 'Georgia, serif', fontSize: 22, color: '#2A5040', marginBottom: 8 }}>What can I help with?</div>
            <p style={{ fontSize: 13, color: '#9aaa9b', maxWidth: 380, margin: '0 auto' }}>
              Ask me to query subscribers, check deployments, test the live site, or anything else about your Roji store.
            </p>
          </div>
        )}
        {messages.map((m, i) => <MessageBubble key={i} msg={m} />)}
        {loading && messages[messages.length - 1]?.role === 'assistant' && !messages[messages.length - 1]?.content && (
          <div style={{ display: 'flex', gap: 5, padding: '8px 16px', alignItems: 'center' }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: '#3D6B52', animation: `pulse 1.2s ${i * 0.2}s ease-in-out infinite` }} />
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ padding: '16px 32px', borderTop: '1px solid #EDE8DC', background: '#fff', display: 'flex', gap: 10 }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(input); } }}
          placeholder="Ask about subscribers, deployments, the live site…"
          rows={1}
          disabled={loading}
          style={{
            flex: 1,
            resize: 'none',
            border: '1px solid #D5CEBD',
            borderRadius: 12,
            padding: '12px 16px',
            fontSize: 14,
            fontFamily: 'inherit',
            background: '#F6F2EA',
            color: '#1A2A1D',
            outline: 'none',
            lineHeight: 1.5,
          }}
        />
        <button
          onClick={() => void send(input)}
          disabled={loading || !input.trim()}
          style={{
            background: '#2A5040',
            color: '#F6F2EA',
            border: 'none',
            borderRadius: 12,
            padding: '0 22px',
            fontSize: 13,
            fontWeight: 500,
            cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
            opacity: loading || !input.trim() ? 0.5 : 1,
            transition: 'opacity 0.15s',
          }}
        >
          Send
        </button>
      </div>
      <style>{`@keyframes pulse { 0%,100%{opacity:.3;transform:scale(.9)} 50%{opacity:1;transform:scale(1)} }`}</style>
    </div>
  );
}
