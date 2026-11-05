import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import ProgramsPage from './page';
import {
  calls,
  ME_ADMIN,
  ME_USER,
  page,
  problem,
  programRow,
  renderWithClient,
  stubApi,
} from './test-api';

afterEach(() => vi.unstubAllGlobals());

describe('S08 programs', () => {
  it('reads the list sorted by name and the three totals', async () => {
    const fetchMock = stubApi({
      '/programs?sort=name': page([programRow(1)]),
      '/programs?limit=1': page([programRow(1)], { total: 12 }),
      '/domains?limit=1': page([], { total: 4321 }),
      '/findings?limit=1': page([], { total: 56 }),
    });
    renderWithClient(<ProgramsPage />);
    expect(await screen.findByRole('heading', { name: 'program-1' })).toBeInTheDocument();
    expect(await screen.findByText('4,321')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(calls(fetchMock)).toEqual(
      expect.arrayContaining([
        'GET /programs?sort=name',
        'GET /programs?limit=1',
        'GET /domains?limit=1',
        'GET /findings?limit=1',
      ]),
    );
  });

  it('shows the computed counts and links to the detail screen', async () => {
    stubApi({ '/programs?sort=name': page([programRow(1)]) });
    renderWithClient(<ProgramsPage />);
    const card = (await screen.findByRole('heading', { name: 'program-1' })).closest(
      '[data-program-card]',
    ) as HTMLElement;
    expect(within(card).getByText('3 In-Scope')).toBeInTheDocument();
    expect(within(card).getByText('1 Out-of-Scope')).toBeInTheDocument();
    expect(within(card).getByText('1 Critical')).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: /view details/i })).toHaveAttribute(
      'href',
      '/programs/p1',
    );
  });

  it('never links a platform URL that is not http or https', async () => {
    stubApi({
      '/programs?sort=name': page([programRow(1, { platform_url: 'javascript:alert(1)' })]),
    });
    renderWithClient(<ProgramsPage />);
    await screen.findByRole('heading', { name: 'program-1' });
    expect(screen.queryByRole('link', { name: 'HackerOne' })).toBeNull();
    expect(screen.getByText('HackerOne')).toBeInTheDocument();
  });

  it('filters by status and sorts, starting from the first page again', async () => {
    const fetchMock = stubApi({ '/programs?sort=name': page([programRow(1)]) });
    renderWithClient(<ProgramsPage />);
    await screen.findByRole('heading', { name: 'program-1' });
    await userEvent.click(screen.getByRole('button', { name: 'Paused' }));
    expect(calls(fetchMock)).toContain('GET /programs?status=paused&sort=name');
    await userEvent.selectOptions(screen.getByLabelText(/sort by/i), '-created_at');
    expect(calls(fetchMock)).toContain('GET /programs?status=paused&sort=-created_at');
  });

  it('hides New Program from User', async () => {
    stubApi({ '/programs?sort=name': page([]) }, ME_USER);
    renderWithClient(<ProgramsPage />);
    expect(await screen.findByText(/no programs match/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /new program/i })).toBeNull();
  });

  it('creates a program from the form', async () => {
    const fetchMock = stubApi(
      {
        '/programs?sort=name': page([]),
        'POST /programs': programRow(9),
      },
      ME_ADMIN,
    );
    renderWithClient(<ProgramsPage />);
    await userEvent.click(await screen.findByRole('button', { name: /new program/i }));
    const dialog = screen.getByRole('dialog', { name: 'New Program' });
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Example');
    await userEvent.click(within(dialog).getByRole('button', { name: /create program/i }));
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({
      name: 'Example',
      platform: null,
      platform_url: null,
      bounty_type: 'bounty',
      description: null,
    });
  });

  it('shows the field error the backend reports, not its title', async () => {
    stubApi({
      '/programs?sort=name': page([]),
      'POST /programs': () =>
        new Response(
          JSON.stringify({
            title: 'Validation error',
            status: 422,
            code: 'validation_error',
            errors: [{ field: 'name', code: 'missing' }],
          }),
          { status: 422, headers: { 'content-type': 'application/problem+json' } },
        ),
    });
    renderWithClient(<ProgramsPage />);
    await userEvent.click(await screen.findByRole('button', { name: /new program/i }));
    await userEvent.click(screen.getByRole('button', { name: /create program/i }));
    expect(await screen.findByText('This field is required.')).toBeInTheDocument();
    expect(screen.queryByText('Validation error')).toBeNull();
  });

  it('says the list failed without the backend title', async () => {
    stubApi({ '/programs?sort=name': () => problem(500, 'internal_error') });
    renderWithClient(<ProgramsPage />);
    expect(await screen.findByText('Could not load the program list.')).toBeInTheDocument();
    expect(screen.queryByText('Backend title')).toBeNull();
  });

  it('moves the cursor with Next', async () => {
    const fetchMock = stubApi({
      '/programs?sort=name': page([programRow(1)], { next_cursor: 'c2', total: 2 }),
      '/programs?sort=name&cursor=c2': page([programRow(2)]),
    });
    renderWithClient(<ProgramsPage />);
    await screen.findByRole('heading', { name: 'program-1' });
    await userEvent.click(screen.getByRole('button', { name: /^next/i }));
    expect(await screen.findByRole('heading', { name: 'program-2' })).toBeInTheDocument();
    expect(calls(fetchMock)).toContain('GET /programs?sort=name&cursor=c2');
  });
});
