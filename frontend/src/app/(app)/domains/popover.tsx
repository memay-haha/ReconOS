'use client';

import { type ReactElement, type ReactNode, useEffect, useRef } from 'react';

/** A panel under its button that closes on Escape or a click outside. The caller owns the
 * open state and draws the button, so the button keeps its own look. */
export function Popover({
  open,
  onClose,
  label,
  align = 'right',
  button,
  children,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  align?: 'left' | 'right';
  button: ReactNode;
  children: ReactNode;
}): ReactElement {
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (boxRef.current !== null && !boxRef.current.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  return (
    <div ref={boxRef} className="relative">
      {button}
      {open && (
        <div
          role="group"
          aria-label={label}
          className={`absolute top-full z-40 mt-1 w-72 rounded-lg border border-border bg-surface-container p-space-sm shadow-modal ${align === 'right' ? 'right-0' : 'left-0'}`}
        >
          {children}
        </div>
      )}
    </div>
  );
}
