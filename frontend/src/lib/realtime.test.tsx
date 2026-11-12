import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  INVALIDATES,
  parseEvent,
  SESSION_ENDED_CLOSE_CODE,
  useRealtimeConnection,
} from './realtime';

describe('parseEvent', () => {
  it('reads an event of the documented shape', () => {
    const event = parseEvent(
      JSON.stringify({
        type: 'job.status_changed',
        program_id: 'p1',
        data: { job_id: 'j1', status: 'running' },
        at: '2026-11-01T08:00:00Z',
      }),
    );
    expect(event).toEqual({
      type: 'job.status_changed',
      program_id: 'p1',
      data: { job_id: 'j1', status: 'running' },
      at: '2026-11-01T08:00:00Z',
    });
  });

  it.each(['not json', '42', JSON.stringify({ type: 'unknown.type' }), JSON.stringify(null)])(
    'drops %s',
    (raw) => {
      expect(parseEvent(raw)).toBeNull();
    },
  );

  it('refreshes the bell on alert.created and the dashboard on job changes', () => {
    expect(INVALIDATES['alert.created']).toContain('alerts');
    expect(INVALIDATES['job.status_changed']).toContain('dashboard');
  });
});

class FakeSocket {
  static opened: FakeSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((message: MessageEvent) => void) | null = null;
  onclose: ((closed: CloseEvent) => void) | null = null;
  readonly url: string;

  constructor(url: string) {
    this.url = url;
    FakeSocket.opened.push(this);
  }

  close(): void {}
}

describe('useRealtimeConnection', () => {
  beforeEach(() => {
    FakeSocket.opened = [];
    vi.useFakeTimers();
    vi.stubGlobal('WebSocket', FakeSocket);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function mount(): { client: QueryClient; unmount: () => void } {
    const client = new QueryClient();
    const { unmount } = renderHook(() => useRealtimeConnection(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });
    return { client, unmount };
  }

  it('connects to the one documented endpoint', () => {
    const { unmount } = mount();
    expect(FakeSocket.opened[0]?.url).toMatch(/\/api\/v1\/ws$/);
    unmount();
  });

  it('stops reconnecting and refetches when the server ends the session', () => {
    const { client, unmount } = mount();
    const refetch = vi.spyOn(client, 'invalidateQueries');

    act(() => {
      FakeSocket.opened[0]?.onclose?.({ code: SESSION_ENDED_CLOSE_CODE } as CloseEvent);
      vi.advanceTimersByTime(60_000);
    });

    expect(refetch).toHaveBeenCalledWith({ type: 'active' });
    expect(FakeSocket.opened).toHaveLength(1);
    unmount();
  });

  it('reconnects after any other close', () => {
    const { unmount } = mount();

    act(() => {
      FakeSocket.opened[0]?.onclose?.({ code: 1006 } as CloseEvent);
      vi.advanceTimersByTime(1_000);
    });

    expect(FakeSocket.opened).toHaveLength(2);
    unmount();
  });
});
