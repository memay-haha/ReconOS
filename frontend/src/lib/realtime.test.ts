import { describe, expect, it } from 'vitest';

import { INVALIDATES, parseEvent } from './realtime';

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
