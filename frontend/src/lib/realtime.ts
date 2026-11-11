'use client';

import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { useEffect, useSyncExternalStore } from 'react';

/** Event types of `/api/v1/ws`: docs/api/architecture.md, section WebSocket. */
export type RealtimeEventType =
  | 'job.status_changed'
  | 'finding.created'
  | 'asset.discovered'
  | 'alert.created'
  | 'worker.status_changed';

export interface RealtimeEvent {
  readonly type: RealtimeEventType;
  readonly program_id: string | null;
  readonly data: Readonly<Record<string, unknown>>;
  readonly at: string;
}

/** `connecting` before the first open and while waiting to reconnect, `open` while events
 * flow, `closed` when the browser has no WebSocket. */
export type RealtimeStatus = 'connecting' | 'open' | 'closed';

const TYPES: ReadonlySet<string> = new Set<RealtimeEventType>([
  'job.status_changed',
  'finding.created',
  'asset.discovered',
  'alert.created',
  'worker.status_changed',
]);

/** Query roots each event makes stale, by the resource keys in src/lib. The sidebar counts
 * ('nav-count') follow jobs, findings and assets. */
export const INVALIDATES: Readonly<Record<RealtimeEventType, readonly string[]>> = {
  'job.status_changed': ['jobs', 'dashboard', 'dispatcher', 'nav-count', 'job-logs'],
  'finding.created': ['findings', 'dashboard', 'nav-count', 'programs'],
  'asset.discovered': [
    'domains',
    'ips',
    'urls',
    'services',
    'asset-events',
    'screenshots',
    'dashboard',
    'nav-count',
    'programs',
  ],
  'alert.created': ['alerts'],
  'worker.status_changed': ['workers', 'system', 'dispatcher'],
};

/** Events arriving within this window refresh each query once (frontend/CLAUDE.md). */
export const BATCH_MS = 500;
const RETRY_MIN_MS = 1_000;
const RETRY_MAX_MS = 30_000;

export function parseEvent(raw: unknown): RealtimeEvent | null {
  if (typeof raw !== 'string') return null;
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof body !== 'object' || body === null) return null;
  const event = body as Record<string, unknown>;
  if (typeof event.type !== 'string' || !TYPES.has(event.type)) return null;
  return {
    type: event.type as RealtimeEventType,
    program_id: typeof event.program_id === 'string' ? event.program_id : null,
    data:
      typeof event.data === 'object' && event.data !== null
        ? (event.data as Record<string, unknown>)
        : {},
    at: typeof event.at === 'string' ? event.at : new Date().toISOString(),
  };
}

type Listener = (event: RealtimeEvent) => void;

/** One connection per tab, shared by every hook. */
class RealtimeConnection {
  private socket: WebSocket | null = null;
  private status: RealtimeStatus = 'connecting';
  private users = 0;
  private retryMs = RETRY_MIN_MS;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private pending = new Set<string>();
  private client: QueryClient | null = null;
  private everOpened = false;
  private readonly statusListeners = new Set<() => void>();
  private readonly eventListeners = new Set<Listener>();

  getStatus = (): RealtimeStatus => this.status;

  subscribeStatus = (notify: () => void): (() => void) => {
    this.statusListeners.add(notify);
    return () => this.statusListeners.delete(notify);
  };

  subscribeEvents(listener: Listener): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  acquire(client: QueryClient): () => void {
    this.client = client;
    this.users += 1;
    if (this.users === 1) this.connect();
    return () => {
      this.users -= 1;
      if (this.users === 0) this.disconnect();
    };
  }

  private setStatus(status: RealtimeStatus): void {
    if (status === this.status) return;
    this.status = status;
    for (const notify of this.statusListeners) notify();
  }

  private connect(): void {
    if (typeof WebSocket === 'undefined') {
      this.setStatus('closed');
      return;
    }
    const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
    let socket: WebSocket;
    try {
      socket = new WebSocket(`${scheme}://${window.location.host}/api/v1/ws`);
    } catch {
      this.scheduleRetry();
      return;
    }
    this.socket = socket;
    this.setStatus('connecting');
    socket.onopen = () => {
      this.retryMs = RETRY_MIN_MS;
      this.setStatus('open');
      // Events may have been missed while the socket was down: refresh what is on screen.
      if (this.everOpened) void this.client?.invalidateQueries({ type: 'active' });
      this.everOpened = true;
    };
    socket.onmessage = (message: MessageEvent) => {
      const event = parseEvent(message.data);
      if (event === null) return;
      for (const key of INVALIDATES[event.type]) this.pending.add(key);
      this.flushTimer ??= setTimeout(() => this.flush(), BATCH_MS);
      for (const listener of this.eventListeners) listener(event);
    };
    socket.onclose = () => {
      this.socket = null;
      if (this.users > 0) this.scheduleRetry();
    };
  }

  private flush(): void {
    this.flushTimer = null;
    const keys = [...this.pending];
    this.pending.clear();
    for (const key of keys) void this.client?.invalidateQueries({ queryKey: [key] });
  }

  private scheduleRetry(): void {
    this.setStatus('connecting');
    if (this.retryTimer !== null) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (this.users > 0) this.connect();
    }, this.retryMs);
    this.retryMs = Math.min(this.retryMs * 2, RETRY_MAX_MS);
  }

  private disconnect(): void {
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    const socket = this.socket;
    this.socket = null;
    if (socket !== null) {
      socket.onclose = null;
      socket.close();
    }
    this.setStatus('connecting');
  }
}

const connection = new RealtimeConnection();

/** Keeps the tab's WebSocket open while mounted and refreshes the queries each event makes
 * stale. Mounted once, by the app shell. */
export function useRealtimeConnection(): void {
  const client = useQueryClient();
  // A subscription, not an API call: the socket only pushes, every read stays in a query.
  useEffect(() => connection.acquire(client), [client]);
}

export function useRealtimeStatus(): RealtimeStatus {
  return useSyncExternalStore(
    connection.subscribeStatus,
    connection.getStatus,
    () => 'connecting' as const,
  );
}

/** Calls `listener` for every event, as a live feed needs. Keep `listener` stable. */
export function useRealtimeEvents(listener: Listener): void {
  useEffect(() => connection.subscribeEvents(listener), [listener]);
}
