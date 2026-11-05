import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  calls,
  ME_ADMIN,
  ME_SUPERADMIN,
  ME_USER,
  page,
  problem,
  programRow,
  renderWithClient,
  stubApi,
} from '../programs/test-api';
import ManagePage from './page';

const LIST = '/programs?sort=name';

afterEach(() => vi.unstubAllGlobals());

function rowOf(name: string): HTMLElement {
  return screen.getByRole('link', { name }).closest('tr') as HTMLElement;
}

describe('S11 manage', () => {
  it('reads the table and the three totals', async () => {
    const fetchMock = stubApi({
      [LIST]: page([programRow(1)]),
      '/programs?limit=1': page([], { total: 24 }),
      '/programs?status=active&limit=1': page([], { total: 18 }),
      '/domains?limit=1': page([], { total: 4321 }),
    });
    renderWithClient(<ManagePage />);
    expect(await screen.findByRole('link', { name: 'program-1' })).toHaveAttribute(
      'href',
      '/programs/p1',
    );
    expect(await screen.findByText('4,321')).toBeInTheDocument();
    expect(screen.getByText('24')).toBeInTheDocument();
    expect(screen.getByText('18')).toBeInTheDocument();
    expect(screen.getByText('04/11/2026 08:05')).toBeInTheDocument();
    expect(calls(fetchMock)).toEqual(
      expect.arrayContaining([
        `GET ${LIST}`,
        'GET /programs?limit=1',
        'GET /programs?status=active&limit=1',
        'GET /domains?limit=1',
      ]),
    );
  });

  it('pauses an active program and resumes a paused one', async () => {
    const fetchMock = stubApi({
      [LIST]: page([programRow(1), programRow(2, { status: 'paused' })]),
    });
    renderWithClient(<ManagePage />);
    await screen.findByRole('table');
    await userEvent.click(screen.getByRole('button', { name: 'Pause program-1' }));
    await userEvent.click(screen.getByRole('button', { name: 'Resume program-2' }));
    expect(calls(fetchMock)).toEqual(
      expect.arrayContaining(['POST /programs/p1/pause', 'POST /programs/p2/resume']),
    );
  });

  it('opens the scope of a program in place', async () => {
    const fetchMock = stubApi({ [LIST]: page([programRow(1)]) });
    renderWithClient(<ManagePage />);
    await screen.findByRole('table');
    const toggle = screen.getByRole('button', { name: 'Scope of program-1' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(within(rowOf('program-1')).getByRole('button', { name: /add scope/i }));
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(await screen.findByRole('heading', { name: 'In-Scope' })).toBeInTheDocument();
    expect(calls(fetchMock)).toContain('GET /programs/p1/scope-rules?limit=200');
  });

  it('shows Delete to Superadmin only, and Archive to Admin too', async () => {
    stubApi({ [LIST]: page([programRow(1)]) }, ME_ADMIN);
    const { unmount } = renderWithClient(<ManagePage />);
    await screen.findByRole('button', { name: 'Archive program-1' });
    expect(screen.queryByRole('button', { name: 'Delete program-1' })).toBeNull();
    unmount();
    stubApi({ [LIST]: page([programRow(1)]) }, ME_SUPERADMIN);
    renderWithClient(<ManagePage />);
    expect(await screen.findByRole('button', { name: 'Delete program-1' })).toBeInTheDocument();
  });

  it('asks before a hard delete, and reports a refusal in its own words', async () => {
    const fetchMock = stubApi(
      {
        [LIST]: page([programRow(1)]),
        'DELETE /programs/p1': () => problem(409, 'conflict'),
      },
      ME_SUPERADMIN,
    );
    renderWithClient(<ManagePage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Delete program-1' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete program' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(calls(fetchMock)).toContain('DELETE /programs/p1');
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/conflicts/);
    expect(screen.queryByText('Backend title')).toBeNull();
  });

  it('gives User a read-only table', async () => {
    stubApi({ [LIST]: page([programRow(1)]) }, ME_USER);
    renderWithClient(<ManagePage />);
    await screen.findByRole('table');
    expect(screen.queryByRole('button', { name: /new program/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^(pause|resume|archive|delete) /i })).toBeNull();
    expect(screen.queryByRole('columnheader', { name: 'Actions' })).toBeNull();
  });

  it('filters by status from the first page', async () => {
    const fetchMock = stubApi({ [LIST]: page([programRow(1)]) });
    renderWithClient(<ManagePage />);
    await screen.findByRole('table');
    await userEvent.click(screen.getByRole('button', { name: 'Active' }));
    expect(calls(fetchMock)).toContain('GET /programs?status=active&sort=name');
  });

  it('says the table is empty, and says when it failed', async () => {
    stubApi({ [LIST]: page([]) });
    const { unmount } = renderWithClient(<ManagePage />);
    expect(await screen.findByText(/no programs match/i)).toBeInTheDocument();
    unmount();
    stubApi({ [LIST]: () => problem(500, 'internal_error') });
    renderWithClient(<ManagePage />);
    expect(await screen.findByText('Could not load the program list.')).toBeInTheDocument();
  });
});
