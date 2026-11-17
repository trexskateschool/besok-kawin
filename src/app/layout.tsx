import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'BESOK KAWIN? — 18+ Relationship Card Game',
  description: 'Buka semua borok dan red flag sebelum terlanjur sebar undangan.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body className="bg-zinc-950 text-zinc-100 antialiased">{children}</body>
    </html>
  );
}
