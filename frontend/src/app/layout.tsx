import type { Metadata } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';
import type { ReactNode } from 'react';

import { ThemeToggle } from '@/components/theme-toggle';
import { THEME_INIT_SCRIPT } from '@/lib/theme-init-script';
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
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="bg-bg text-fg font-body-default text-body-default antialiased">
        <header className="flex justify-end px-margin py-2">
          <ThemeToggle />
        </header>
        {children}
      </body>
    </html>
  );
}
