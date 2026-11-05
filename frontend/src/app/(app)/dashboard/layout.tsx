import type { ReactNode } from 'react';

import { ScreenFrame } from '@/components/screen-frame';

export default function Layout({ children }: { children: ReactNode }) {
  return <ScreenFrame pad="margin">{children}</ScreenFrame>;
}
