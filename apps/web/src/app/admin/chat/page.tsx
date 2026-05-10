'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import AdminChatInterface from '@/components/AdminChatInterface';

function AdminChatInner() {
  const params = useSearchParams();
  const initialPrompt = params.get('q') ?? undefined;
  return <AdminChatInterface initialPrompt={initialPrompt} />;
}

export default function AdminChatPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, color: '#6E9B7B' }}>Loading…</div>}>
      <AdminChatInner />
    </Suspense>
  );
}
