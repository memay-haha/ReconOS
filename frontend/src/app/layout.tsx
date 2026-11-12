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
  description: 'Orchestrates security tools and stores their output in one place',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${ibmPlexSans.variable} ${ibmPlexMono.variable}`}
    >
      <head>
        {/* Blocking classic script on purpose: it must set data-theme before the first
            paint, so async, defer and type="module" are all wrong here. The file is
            static; .claude/rules/security.md forbids inlining it. */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="/theme-init.js"></script>
        {/* Icon font the mockups draw their icons with; the page reads fine without it. */}
        {/* display=block: with swap the ligature names (grid_view, menu) show as words
            until the font arrives. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font, @next/next/google-font-display */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=block"
        />
      </head>
      <body className="bg-bg text-fg font-body-default text-body-default antialiased">
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
