'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from './api-client';
import { type Page, withQuery } from './page';

/** A row of `schedule`: docs/data/schema.md. The jobs it creates carry `created_by` null. */
export interface Schedule {
  readonly id: string;
  readonly program_id: string;
  readonly tool_module_id: string;
  readonly target: readonly string[];
  readonly params: Readonly<Record<string, unknown>>;
  readonly interval_minutes: number;
  readonly is_enabled: boolean;
  readonly created_by: string | null;
  readonly last_run_at: string | null;
  readonly next_run_at: string | null;
  readonly created_at: string;
}

export interface ScheduleBody {
  readonly tool_module_id: string;
  readonly target: readonly string[];
  readonly interval_minutes: number;
  readonly is_enabled?: boolean;
}

export const scheduleKeys = {
  all: ['schedules'] as const,
  list: (programId: string, cursor: string | null) =>
    ['schedules', 'list', programId, cursor] as const,
};

export function useSchedules(programId: string, cursor: string | null = null) {
  return useQuery({
    queryKey: scheduleKeys.list(programId, cursor),
    queryFn: () =>
      apiRequest<Page<Schedule>>(withQuery(`/programs/${programId}/schedules`, { cursor })),
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

/** Also turns a schedule on or off: `PATCH` with `is_enabled`. */
export function useUpdateSchedule() {
  return useScheduleMutation(({ id, body }: { id: string; body: Partial<ScheduleBody> }) =>
    apiRequest<Schedule>(`/schedules/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  );
}

export function useDeleteSchedule() {
  return useScheduleMutation((id: string) =>
    apiRequest<void>(`/schedules/${id}`, { method: 'DELETE' }),
  );
}
