'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from './api-client';
import { type Page, withQuery } from './page';

/** `app_log.level` and `app_log.service`: docs/data/schema.md, section on the log database. */
export const LOG_LEVELS = ['info', 'warning', 'error', 'critical'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export const LOG_SERVICES = ['api', 'dispatcher', 'background', 'beat', 'worker'] as const;

export interface AppLog {
  readonly id: string;
  readonly logged_at: string;
  readonly level: LogLevel;
  readonly service: string;
  readonly event: string;
  readonly request_id: string | null;
  readonly job_id: string | null;
  readonly program_id: string | null;
  readonly worker_id: string | null;
  /** Untrusted: render as text only. */
  readonly context: Readonly<Record<string, unknown>> | null;
}

export interface LogFilter {
  readonly level?: LogLevel | null;
  readonly service?: string | null;
  /** ISO 8601 instants, inclusive. */
  readonly loggedFrom?: string | null;
  readonly loggedTo?: string | null;
  /** N41: event name, and the engine whose calls the log is about. */
  readonly event?: string | null;
  readonly engine?: 'osmedeus' | 'vigolium' | null;
  readonly limit?: number;
}

export const logKeys = {
  all: ['logs'] as const,
  list: (filter: LogFilter, cursor: string | null) =>
    [
      'logs',
      'list',
      filter.level ?? null,
      filter.service ?? null,
      filter.loggedFrom ?? null,
      filter.loggedTo ?? null,
      filter.event ?? null,
      filter.engine ?? null,
      filter.limit ?? null,
      cursor,
    ] as const,
};

export function useLogs(filter: LogFilter, cursor: string | null, poll: number | false = false) {
  return useQuery({
    refetchInterval: poll,
    queryKey: logKeys.list(filter, cursor),
    queryFn: () =>
      apiRequest<Page<AppLog>>(
        withQuery('/logs', {
          level: filter.level,
          service: filter.service,
          logged_at_from: filter.loggedFrom,
          logged_at_to: filter.loggedTo,
          event: filter.event,
          engine: filter.engine,
          limit: filter.limit,
          cursor,
        }),
      ),
  });
}

/** Deletes the log partitions of every day before `before` (YYYY-MM-DD). Superadmin only. */
export function useDeleteLogs() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (before: string) =>
      apiRequest<void>(withQuery('/logs', { before }), { method: 'DELETE' }),
    onSuccess: () => client.invalidateQueries({ queryKey: logKeys.all }),
  });
}
