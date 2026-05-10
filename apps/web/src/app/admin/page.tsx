'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Stats {
  total: number;
  week: number;
  month: number;
  today: number;
  recent: { email: string; created_at: string }[];
  error?: string;
}

const QUICK_ACTIONS = [
  { label: 'Show all subscribers', prompt: 'Query the subscribers table and show me every email with the date they signed up, formatted as a table.' },
  { label: 'Count by month', prompt: 'Query the subscribers table and group sign-ups by month. Show me the count per month as a table.' },
  { label: 'Check live site', prompt: 'Navigate to https://ruqpqizuqcfnpajkysgt.supabase.co with the browser tool and take a screenshot to confirm it\'s reachable.' },
  { label: 'Latest 5 sign-ups', prompt: 'Fetch the 5 most recent subscribers from the database, ordered by created_at descending.' },
];

function StatCard({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div style={{
      background: '#fff',
      borderRadius: 14,
      padding: '24px 28px',
      boxShadow: '0 1px 3px rgba(42,80,64,0.06), 0 4px 16px rgba(42,80,64,0.06)',
    }}>
      <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#6E9B7B', marginBottom: 10 }}>{label}</div>
      <div style={{ fontFamily: 'Georgia, serif', fontSize: 40, fontWeight: 600, color: '#2A5040', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: '#9aaa9b', marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function AdminPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  async function fetchStats() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/stats');
      const data = await res.json() as Stats;
      setStats(data);
    } catch {
      setStats({ total: 0, week: 0, month: 0, today: 0, recent: [], error: 'Could not reach Supabase. Make sure the SELECT policy is added.' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchStats(); }, []);

  return (
    <div style={{ padding: '40px 48px', maxWidth: 1100 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 36 }}>
        <div>
          <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 32, fontWeight: 500, color: '#2A5040', margin: 0, lineHeight: 1.1 }}>
            Good morning.
          </h1>
          <p style={{ fontSize: 14, color: '#6E9B7B', marginTop: 6 }}>
            Here&rsquo;s what&rsquo;s happening with Roji today.
          </p>
        </div>
        <button
          onClick={fetchStats}
          disabled={loading}
          style={{
            background: '#2A5040',
            color: '#F6F2EA',
            border: 'none',
            borderRadius: 999,
            padding: '10px 22px',
            fontSize: 13,
            fontWeight: 500,
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.6 : 1,
            transition: 'opacity 0.15s',
          }}
        >
          {loading ? 'Loading…' : '↻ Refresh'}
        </button>
      </div>

      {/* Error banner */}
      {stats?.error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 10, padding: '12px 18px', marginBottom: 28, fontSize: 13, color: '#b91c1c' }}>
          {stats.error}
          <span style={{ marginLeft: 8, opacity: 0.7 }}>— run <code>supabase/schema.sql</code> in Supabase SQL Editor to add the SELECT policy.</span>
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 40 }}>
        <StatCard label="Total Subscribers" value={loading ? '—' : stats?.total ?? 0} />
        <StatCard label="This Month"        value={loading ? '—' : stats?.month ?? 0} />
        <StatCard label="This Week"         value={loading ? '—' : stats?.week  ?? 0} />
        <StatCard label="Today"             value={loading ? '—' : stats?.today ?? 0} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>

        {/* Recent sign-ups */}
        <div style={{ background: '#fff', borderRadius: 14, padding: '24px 28px', boxShadow: '0 1px 3px rgba(42,80,64,0.06), 0 4px 16px rgba(42,80,64,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 18, fontWeight: 500, color: '#2A5040', margin: 0 }}>Recent sign-ups</h2>
            <span style={{ fontSize: 11, color: '#9aaa9b', letterSpacing: '0.08em' }}>Latest 8</span>
          </div>
          {loading ? (
            <p style={{ fontSize: 13, color: '#9aaa9b' }}>Loading…</p>
          ) : (stats?.recent ?? []).length === 0 ? (
            <p style={{ fontSize: 13, color: '#9aaa9b' }}>No subscribers yet.</p>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 1 }}>
              {stats!.recent.map(({ email, created_at }) => (
                <li key={email} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f0ede6' }}>
                  <span style={{ fontSize: 13, color: '#2A5040', fontWeight: 400 }}>{email}</span>
                  <span style={{ fontSize: 11, color: '#9aaa9b', whiteSpace: 'nowrap', marginLeft: 12 }}>{timeAgo(created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Quick actions */}
        <div style={{ background: '#fff', borderRadius: 14, padding: '24px 28px', boxShadow: '0 1px 3px rgba(42,80,64,0.06), 0 4px 16px rgba(42,80,64,0.06)' }}>
          <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 18, fontWeight: 500, color: '#2A5040', margin: '0 0 8px' }}>Ask the AI operator</h2>
          <p style={{ fontSize: 13, color: '#9aaa9b', marginBottom: 20 }}>One-click prompts for common tasks.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {QUICK_ACTIONS.map(({ label, prompt }) => (
              <Link
                key={label}
                href={`/admin/chat?q=${encodeURIComponent(prompt)}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '13px 16px',
                  background: '#F6F2EA',
                  borderRadius: 10,
                  fontSize: 13,
                  color: '#2A5040',
                  fontWeight: 500,
                  textDecoration: 'none',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#EDE8DC'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#F6F2EA'; }}
              >
                {label}
                <span style={{ fontSize: 16, opacity: 0.4 }}>→</span>
              </Link>
            ))}
          </div>
          <Link
            href="/admin/chat"
            style={{
              display: 'block',
              marginTop: 16,
              textAlign: 'center',
              padding: '12px',
              background: '#2A5040',
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 500,
              color: '#F6F2EA',
              textDecoration: 'none',
            }}
          >
            Open AI Operator →
          </Link>
        </div>
      </div>
    </div>
  );
}
