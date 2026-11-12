import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import ReportDetailPage from './[reportId]/page';
import { DETAIL, ROW } from './fixtures';
import ReportsPage from './page';

const push = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useParams: () => ({ reportId: 'r1' }),
}));

interface Call {
  readonly method: string;
  readonly path: string;
  readonly body: unknown;
}

function stub(answer: (call: Call) => Response) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((path: string, init?: RequestInit) => {
      const call = {
        method: init?.method ?? 'GET',
        path: path.replace('/api/v1', ''),
        body: typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : null,
      };
      calls.push(call);
      return Promise.resolve(answer(call));
    }),
  );
  return calls;
}

function page(items: unknown[]) {
  return { items, next_cursor: null, total: items.length, total_is_estimate: false };
}

function problem(status: number, errors: { field: string; code: string }[] = []): Response {
  return new Response(
    JSON.stringify({ title: 'Backend title', status, code: 'conflict', errors }),
    {
      status,
      headers: { 'content-type': 'application/problem+json' },
    },
  );
}

function show(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

afterEach(() => vi.unstubAllGlobals());

describe('Reports list', () => {
  it('lists reports and narrows by status', async () => {
    const calls = stub((call) =>
      call.path.startsWith('/reports') ? Response.json(page([ROW])) : Response.json(page([])),
    );
    show(<ReportsPage />);
    expect(await screen.findByRole('link', { name: 'Exposed git config' })).toHaveAttribute(
      'href',
      '/reports/r1',
    );
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'submitted');
    expect(calls.map((c) => c.path)).toContain('/reports?status=submitted');
  });

  it('says when there is no report', async () => {
    stub(() => Response.json(page([])));
    show(<ReportsPage />);
    expect(await screen.findByText(/No reports match/)).toBeInTheDocument();
  });
});

describe('Report detail', () => {
  it('shows raw output text as text and links the evidence file', async () => {
    stub(() => Response.json(DETAIL));
    const { container } = show(<ReportDetailPage />);
    expect(await screen.findByText('<script>alert(1)</script>')).toBeInTheDocument();
    expect(container.querySelector('script')).toBeNull();
    const evidence = screen.getAllByRole('link', { name: 'nuclei.jsonl' })[0];
    expect(evidence).toHaveAttribute('href', '/api/v1/raw-outputs/ro1/content');
    expect(screen.getByRole('link', { name: /CSV/ })).toHaveAttribute(
      'href',
      '/api/v1/reports/r1/export?format=csv',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(screen.getByRole('heading', { name: 'Impact' })).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
  });

  it('submits with the platform report id kept, and says why a submit was refused', async () => {
    const calls = stub((call) =>
      call.method === 'POST'
        ? problem(409, [{ field: 'finding_ids', code: 'not_confirmed' }])
        : Response.json({ ...DETAIL, platform_report_ref: 'H1-1' }),
    );
    show(<ReportDetailPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Mark Submitted' }));
    expect(
      await screen.findByText(/Every finding in the report must be confirmed/),
    ).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'POST')).toEqual({
      method: 'POST',
      path: '/reports/r1/submit',
      body: { platform_report_ref: 'H1-1' },
    });
  });

  it('removes one finding by sending the rest', async () => {
    const calls = stub((call) =>
      call.method === 'PATCH'
        ? Response.json({ ...DETAIL, findings: DETAIL.findings.slice(1), finding_count: 1 })
        : Response.json(DETAIL),
    );
    show(<ReportDetailPage />);
    await userEvent.click(
      await screen.findByRole('button', {
        name: 'Remove <script>alert(1)</script> from the report',
      }),
    );
    await vi.waitFor(() =>
      expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ finding_ids: ['f2'] }),
    );
  });

  it('keeps only the platform report id editable once submitted', async () => {
    stub(() =>
      Response.json({ ...DETAIL, status: 'submitted', submitted_at: '2026-11-13T02:00:00Z' }),
    );
    show(<ReportDetailPage />);
    expect(await screen.findByLabelText('Platform Report ID')).toBeInTheDocument();
    expect(screen.queryByLabelText('Title')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Mark Submitted' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Remove/ })).toBeNull();
  });
});
