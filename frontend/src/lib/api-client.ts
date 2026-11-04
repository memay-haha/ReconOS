/** The only place the frontend talks to Backend API.
 *
 * Requests go to the Next origin and Next forwards /api/* to the backend, so
 * Origin always matches RECONOS_PUBLIC_ORIGIN and the SameSite=Lax session
 * cookie travels with them: docs/api/architecture.md.
 */

const API_PREFIX = '/api/v1';

interface ProblemDetails {
  readonly title?: string;
  readonly status?: number;
  readonly code?: string;
  readonly detail?: string;
  readonly errors?: ReadonlyArray<{ readonly field: string; readonly code: string }>;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly title: string;
  readonly detail?: string;
  readonly fieldErrors: Record<string, string>;
  readonly retryAfterSeconds?: number;

  constructor(status: number, problem: ProblemDetails, retryAfter: string | null) {
    const title = problem.title ?? 'Yêu cầu không thành công';
    super(title);
    this.name = 'ApiError';
    this.status = status;
    this.code = problem.code ?? 'unknown';
    this.title = title;
    this.detail = problem.detail;
    const items = Array.isArray(problem.errors) ? problem.errors : [];
    this.fieldErrors = Object.fromEntries(items.map((item) => [item.field, item.code]));
    const seconds = retryAfter === null ? Number.NaN : Number.parseInt(retryAfter, 10);
    if (Number.isFinite(seconds)) this.retryAfterSeconds = seconds;
  }
}

async function readProblem(response: Response): Promise<ProblemDetails> {
  try {
    const body: unknown = await response.json();
    return typeof body === 'object' && body !== null ? (body as ProblemDetails) : {};
  } catch {
    // A proxy or gateway can answer with HTML. The status still matters.
    return {};
  }
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && init.body !== null && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  // A rejected fetch (network failure) propagates as is: it is not an ApiError.
  const response = await fetch(`${API_PREFIX}${path}`, {
    ...init,
    credentials: 'same-origin',
    headers,
  });

  if (!response.ok) {
    throw new ApiError(
      response.status,
      await readProblem(response),
      response.headers.get('retry-after'),
    );
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function fieldErrorsOf(error: unknown): Record<string, string> {
  return error instanceof ApiError ? error.fieldErrors : {};
}
