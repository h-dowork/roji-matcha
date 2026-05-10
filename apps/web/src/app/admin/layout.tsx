import type { ReactNode } from 'react';
import Link from 'next/link';

export const metadata = { title: 'Roji Admin' };

const NAV = [
  { href: '/admin',    label: 'Dashboard',   icon: '▤' },
  { href: '/admin/chat', label: 'AI Operator', icon: '◈' },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#F6F2EA', color: '#1A2A1D', fontFamily: "'DM Sans', system-ui, sans-serif" }}>

      {/* Sidebar */}
      <aside style={{
        width: 220,
        background: '#2A5040',
        display: 'flex',
        flexDirection: 'column',
        padding: '28px 0',
        flexShrink: 0,
        position: 'sticky',
        top: 0,
        height: '100vh',
      }}>
        <div style={{ padding: '0 24px 28px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <Link href="/" style={{ display: 'block', textDecoration: 'none' }}>
            <span style={{ fontFamily: 'Georgia, serif', fontSize: 20, fontWeight: 600, color: '#F6F2EA', letterSpacing: '0.04em' }}>
              Roji
            </span>
            <span style={{ display: 'block', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(246,242,234,0.4)', marginTop: 2 }}>
              Admin
            </span>
          </Link>
        </div>

        <nav style={{ flex: 1, padding: '16px 12px' }}>
          {NAV.map(({ href, label, icon }) => (
            <Link key={href} href={href} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 12px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 400,
              color: 'rgba(246,242,234,0.75)',
              textDecoration: 'none',
              marginBottom: 2,
              transition: 'background 0.15s, color 0.15s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)'; (e.currentTarget as HTMLElement).style.color = '#F6F2EA'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'rgba(246,242,234,0.75)'; }}
            >
              <span style={{ fontSize: 15, opacity: 0.7 }}>{icon}</span>
              {label}
            </Link>
          ))}
        </nav>

        <div style={{ padding: '16px 24px', borderTop: '1px solid rgba(255,255,255,0.08)', fontSize: 11, color: 'rgba(246,242,234,0.3)', letterSpacing: '0.05em' }}>
          v0.4.0 · Roji Stack
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, overflowY: 'auto' }}>
        {children}
      </main>
    </div>
  );
}
