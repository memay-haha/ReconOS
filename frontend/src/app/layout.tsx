import type { Metadata } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';
import type { ReactNode } from 'react';

import { QueryProvider } from '@/lib/query-provider';
import '@/styles/globals.css';

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '600', '700'],
  variable: '--font-ibm-plex-sans',
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '600'],
  variable: '--font-ibm-plex-mono',
});

export const metadata: Metadata = {
  title: 'ReconOS',
  description: 'Điều phối công cụ bảo mật và lưu output tập trung',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="vi"
      suppressHydrationWarning
      className={`${ibmPlexSans.variable} ${ibmPlexMono.variable}`}
    >
      <head>
        {/* Blocking classic script on purpose: it must set data-theme before the first
            paint, so async, defer and type="module" are all wrong here. The file is
            static; .claude/rules/security.md forbids inlining it. */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="/theme-init.js"></script>
      </head>
      <body className="bg-bg text-fg font-body-default text-body-default antialiased">
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
