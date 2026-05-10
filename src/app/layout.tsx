import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Token Distributor',
  description:
    'Multi-chain token distribution platform — distribute tokens across Ethereum, BSC, and Solana',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
