'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from './api-client';
import { type Page, withQuery } from './page';

/** A row of `GET /programs/{id}/schedules` and `GET /schedules`: the `schedule` table
 * (docs/data/schema.md) with both names joined. The jobs Celery Beat creates carry
 * `created_by` null. */
export interface Schedule {
  readonly id: string;
  readonly program_id: string;
  readonly program_name: string;
  readonly tool_module_id: string;
  readonly tool_module_name: string;
  readonly target: readonly string[];
  readonly params: Readonly<Record<string, unknown>>;
  readonly interval_minutes: number;
  readonly is_enabled: boolean;
  readonly created_by: string | null;
  readonly last_run_at: string | null;
  readonly next_run_at: string;
  readonly created_at: string;
}

/** Bounds of `interval_minutes`, checked again by the backend: docs/data/schema.md. */
export const MIN_INTERVAL_MINUTES = 15;
export const MAX_INTERVAL_MINUTES = 525_600;

export interface ScheduleBody {
  readonly tool_module_id: string;
  readonly target: readonly string[];
  readonly params?: Readonly<Record<string, unknown>>;
  readonly interval_minutes: number;
  readonly is_enabled?: boolean;
}

const COUNT = new Intl.NumberFormat('en-US');

/** "6 h", "1 d", "45 min" from `interval_minutes`. */
export function formatInterval(minutes: number): string {
  if (minutes % 1440 === 0) return `${COUNT.format(minutes / 1440)} d`;
  if (minutes % 60 === 0) return `${COUNT.format(minutes / 60)} h`;
  return `${COUNT.format(minutes)} min`;
}

/** Kept for the S16 tab, which reads the same row. */
export type ScheduleRow = Schedule;

/** One program's schedules, or every schedule whose tool module runs on an engine (S16). */
export type ScheduleFilter = { readonly programId: string } | { readonly engineId: string };

export const scheduleKeys = {
  all: ['schedules'] as const,
  list: (filter: ScheduleFilter | null, cursor: string | null) =>
    ['schedules', 'list', filter, cursor] as const,
};

function schedulesPath(filter: ScheduleFilter, cursor: string | null): string {
  return 'programId' in filter
    ? withQuery(`/programs/${filter.programId}/schedules`, { cursor })
    : withQuery('/schedules', { engine_id: filter.engineId, cursor });
}

/** `null` waits: S16 knows its engine id only after `GET /engines`. */
export function useSchedules(filter: ScheduleFilter | null, cursor: string | null = null) {
  return useQuery({
    queryKey: scheduleKeys.list(filter, cursor),
    queryFn: () =>
      filter === null
        ? Promise.reject(new Error('No schedule filter'))
        : apiRequest<Page<ScheduleRow>>(schedulesPath(filter, cursor)),
    enabled: filter !== null,
  });
}

function useScheduleMutation<TArg>(send: (arg: TArg) => Promise<unknown>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: send,
    onSuccess: () => client.invalidateQueries({ queryKey: scheduleKeys.all }),
  });
}

export function useCreateSchedule(programId: string) {
  return useScheduleMutation((body: ScheduleBody) =>
    apiRequest<Schedule>(`/programs/${programId}/schedules`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  );
}

/** Also turns a schedule on or off: `PATCH` with `is_enabled`. The tool module stays. */
export function useUpdateSchedule() {
  return useScheduleMutation(
    ({ id, body }: { id: string; body: Partial<Omit<ScheduleBody, 'tool_module_id'>> }) =>
      apiRequest<Schedule>(`/schedules/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  );
}

export function useDeleteSchedule() {
  return useScheduleMutation((id: string) =>
    apiRequest<void>(`/schedules/${id}`, { method: 'DELETE' }),
  );
}

/** Trigger on S09: `POST /schedules/{id}/run` creates one job now, scope-checked, without
 * moving `next_run_at` (N28, Superadmin and Admin). Jobs refetch, the key spelled out. */
export function useRunSchedule() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiRequest<unknown>(`/schedules/${id}/run`, { method: 'POST' }),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: scheduleKeys.all }),
        client.invalidateQueries({ queryKey: ['jobs'] }),
      ]);
    },
  });
}
