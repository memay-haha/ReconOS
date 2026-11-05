'use client';

import { useSelectedLayoutSegment } from 'next/navigation';
import type { ReactNode } from 'react';

// The app's main is full-bleed under the topbar, as most mockups draw it; each screen's
// mockup then pads its own content. s11, s12 and s15 to s18 pad by gutter at the sides and
// gutter-dense at the bottom; s02, s04, s08, s10 and s20 pad by margin on every side.
const PAD = {
  gutter: 'px-gutter pb-gutter-dense',
  margin: 'p-margin',
} as const;

/** Pads a route's screens as its mockup does. With `listOnly`, a nested detail screen
 * (s05, s09: their mockups run full-bleed strips) is left unpadded to place its own. */
export function ScreenFrame({
  pad,
  listOnly = false,
  children,
}: {
  pad: keyof typeof PAD;
  listOnly?: boolean;
  children: ReactNode;
}) {
  const detail = useSelectedLayoutSegment() !== null;
  if (listOnly && detail) return <>{children}</>;
  return <div className={PAD[pad]}>{children}</div>;
}
