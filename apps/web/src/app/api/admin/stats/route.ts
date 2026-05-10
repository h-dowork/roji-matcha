import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const SUPABASE_URL = 'https://ruqpqizuqcfnpajkysgt.supabase.co';
const SUPABASE_KEY = 'sb_publishable_f8B5Ro1eBl1kyC11I-fcZw_1zARwhkU';

const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
};

async function query(path: string, prefer?: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: prefer ? { ...headers, Prefer: prefer } : headers,
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return res;
}

export async function GET() {
  try {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [totalRes, weekRes, monthRes, todayRes, recentRes] = await Promise.all([
      query('subscribers?select=count', 'count=exact'),
      query(`subscribers?select=count&created_at=gte.${startOfWeek.toISOString()}`, 'count=exact'),
      query(`subscribers?select=count&created_at=gte.${startOfMonth.toISOString()}`, 'count=exact'),
      query(`subscribers?select=count&created_at=gte.${startOfToday.toISOString()}`, 'count=exact'),
      query('subscribers?select=email,created_at&order=created_at.desc&limit=8'),
    ]);

    const total   = parseInt(totalRes.headers.get('content-range')?.split('/')[1] ?? '0');
    const week    = parseInt(weekRes.headers.get('content-range')?.split('/')[1] ?? '0');
    const month   = parseInt(monthRes.headers.get('content-range')?.split('/')[1] ?? '0');
    const today   = parseInt(todayRes.headers.get('content-range')?.split('/')[1] ?? '0');
    const recent  = await recentRes.json() as { email: string; created_at: string }[];

    return NextResponse.json({ total, week, month, today, recent });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
