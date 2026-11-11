'use client';

import { useSyncExternalStore } from 'react';

import { useHealth } from '@/lib/health';

/** The S01 header pill (decision D6-B): online while `GET /health` answers 204. */
export function DispatcherPill() {
  const health = useHealth();
  if (health.isPending) return null;
  const online = health.isSuccess;
  return (
    <div className="hidden items-center gap-space-xs pl-space-md sm:flex">
      <span
        aria-hidden="true"
        className={`inline-block h-2 w-2 rounded-full ${online ? 'bg-good' : 'bg-crit'}`}
      />
      <span
        className={`font-label-caps text-label-caps uppercase ${online ? 'text-good' : 'text-crit'}`}
      >
        {online ? 'Dispatcher online' : 'Dispatcher offline'}
      </span>
    </div>
  );
}

const noSubscribe = () => () => undefined;

/** Decision N4: the footer claims encryption only when the page itself came over HTTPS. */
export function EncryptedNote() {
  const https = useSyncExternalStore(
    noSubscribe,
    () => window.location.protocol === 'https:',
    () => false,
  );
  return https ? <span>All connections encrypted</span> : null;
}
