import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Claude MCP Stack',
  description: 'Claude AI with Playwright, SSH, Vercel, and Supabase tools',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
