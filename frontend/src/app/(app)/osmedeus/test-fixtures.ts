import type { ScheduleRow } from '@/lib/schedules';

/** One row of `GET /schedules?engine_id=e1` (P4). */
export const SCHEDULE_ROW: ScheduleRow = {
  id: 's1',
  program_id: 'p1',
  program_name: 'acme-bb',
  tool_module_id: 'tm1',
  tool_module_name: 'osmedeus-domain-lite',
  target: ['*.example.com'],
  params: {},
  interval_minutes: 360,
  is_enabled: true,
  created_by: null,
  last_run_at: '2026-11-12T01:30:00Z',
  next_run_at: '2026-11-12T07:30:00Z',
  created_at: '2026-10-01T00:00:00Z',
};
