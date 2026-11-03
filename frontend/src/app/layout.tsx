import type { Metadata } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';
import type { ReactNode } from 'react';

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
    <html lang="vi" className={`${ibmPlexSans.variable} ${ibmPlexMono.variable}`}>
      <body className="bg-bg text-fg font-body-default text-body-default antialiased">
        {children}
      </body>
    </html>
  );
}
