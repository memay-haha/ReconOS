import type { ReactElement, ReactNode } from 'react';

/** Panels as the S16 mockup draws them: no outer border, a coloured bar before the title. */
export const ENGINE_PANEL =
  'flex flex-col gap-space-md rounded-sm border border-border bg-surface p-space-lg';

/** The bar colour before each panel title in the S16 mockup. */
const BAR = { primary: 'bg-primary', ip: 'bg-asset-ip' } as const;

export function PanelTitle({
  bar,
  title,
  subtitle,
  children,
}: {
  bar: keyof typeof BAR;
  title: string;
  subtitle: string;
  children?: ReactNode;
}): ReactElement {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-col">
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className={`h-3.5 w-1.5 rounded-full ${BAR[bar]}`} />
          <h2 className="text-panel-title text-fg">{title}</h2>
        </div>
        <p className="text-caption text-fg-faint">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}
