import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { shapeOf } from '@/test/dom-shape';

import UsersPage from './page';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

const mockupFile = resolve(
  import.meta.dirname,
  '../../../../../docs/design/screens/s12-users-access-control.html',
);
const landmarks = { landmarks: true };

/** The mockup draws things the product must not or cannot build. Each is cut from the
 * mockup here, so the mockup stays the source of truth and the deviation is visible
 * in review. `cut` throws when its selector matches nothing: an exclusion that no
 * longer applies must be deleted, not left behind as a silent no-op. */
function cut(root: Element, selector: string, reason: string): void {
  const hits = Array.from(root.querySelectorAll(selector));
  if (hits.length === 0) throw new Error(`Exclusion matches nothing (${reason}): ${selector}`);
  hits.forEach((hit) => hit.remove());
}

function textOf(node: Element): string {
  return (node.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function cutByText(root: Element, selector: string, text: string, reason: string): void {
  const hits = Array.from(root.querySelectorAll(selector)).filter((e) => textOf(e) === text);
  if (hits.length === 0) throw new Error(`Exclusion matches nothing (${reason}): ${text}`);
  hits.forEach((hit) => hit.remove());
}

/** Columns the screen does not build, with the reason each is cut. */
const DROPPED_COLUMNS: { label: string; reason: string }[] = [
  { label: '', reason: 'select-all checkbox: no bulk action has an endpoint' },
  { label: 'Auth Method', reason: 'frontend/CLAUDE.md bans MFA, FIDO2, SSO SAML, mTLS on S12' },
  { label: 'MFA Policy', reason: 'frontend/CLAUDE.md bans MFA on S12; authentication.md has none' },
];

interface Mockup {
  /** `main > div` of the mockup, pruned to what the product builds. */
  root: Element;
  /** Header texts of the columns that remain, in order. */
  columns: string[];
  /** Number of body rows. */
  rowCount: number;
  /** Stat tiles that remain. */
  tileCount: number;
}

function prunedMockup(): Mockup {
  const doc = new DOMParser().parseFromString(readFileSync(mockupFile, 'utf8'), 'text/html');
  const root = doc.querySelector('main > div') as Element;

  // frontend/CLAUDE.md: no API Tokens, no Security Policy (MFA Enforced, NIST) on S12.
  const grid = root.querySelector('div.grid') as Element;
  const tilesBefore = grid.children.length;
  cutByText(grid, ':scope > div', textOf(grid.children[2] as Element), 'API Tokens tile');
  cutByText(grid, ':scope > div', textOf(grid.children[2] as Element), 'Security Policy tile');
  const tileCount = grid.children.length;
  expect(tileCount).toBe(tilesBefore - 2);

  // frontend/CLAUDE.md bans API keys and the Active Directory SSO line; no endpoint for the
  // Role Matrix. With those gone the tab bar holds one tab, so the bar goes.
  const tabs = Array.from(root.querySelectorAll('button'))
    .find((b) => textOf(b).includes('Accounts & Roles'))
    ?.closest('div.border-b');
  if (tabs == null) throw new Error('Tab bar not found in the mockup');
  tabs.remove();

  // No endpoint filters GET /users: it takes only limit and cursor.
  const filters = root
    .querySelector('input[placeholder^="Filter users"]')
    ?.closest('div.bg-surface');
  if (filters == null) throw new Error('Filter bar not found in the mockup');
  filters.remove();

  // Invented badge, not a fact the product knows.
  cutByText(root, 'h1 > span', 'RBAC v3.1', 'invented version badge');

  // The Audit Logs button navigates to S14: it is a link in the product, not a button.
  const audit = Array.from(root.querySelectorAll('button')).find((b) =>
    textOf(b).endsWith('Audit Logs'),
  );
  if (audit === undefined) throw new Error('Audit Logs button not found in the mockup');
  const link = audit.ownerDocument.createElement('a');
  link.append(...Array.from(audit.childNodes));
  audit.replaceWith(link);

  // Columns: find each dropped column by its header, then cut that cell in every row.
  const table = root.querySelector('table') as Element;
  const heads = Array.from(table.querySelectorAll('thead th'));
  const dropIndexes = DROPPED_COLUMNS.map(({ label, reason }) => {
    const at = heads.findIndex((th) =>
      label === '' ? th.querySelector('input[type=checkbox]') !== null : textOf(th) === label,
    );
    if (at === -1) throw new Error(`Dropped column not in the mockup (${reason}): ${label}`);
    return at;
  });
  const rows = Array.from(table.querySelectorAll('tr'));
  for (const tr of rows) {
    const cells = Array.from(tr.children);
    dropIndexes.forEach((i) => cells[i]?.remove());
  }
  const columns = Array.from(table.querySelectorAll('thead th')).map(textOf);

  // Session revoke lives in the selected-account panel, not in the row.
  cut(table, 'button[title="Revoke Sessions"]', 'revoke stays in the account panel');
  // The mockup's last row action is Delete (or Protected on a superadmin). The product has
  // no delete endpoint, and that slot is Lock/Unlock (disabled on your own row).

  // Footer: bulk actions have no endpoint. Pagination is a nav landmark for assistive
  // technology, which the mockup draws as a bare div.
  const footer = table.closest('div.bg-surface')?.querySelector(':scope > div.border-t');
  if (footer == null) throw new Error('Table footer not found in the mockup');
  const bulk = Array.from(footer.querySelectorAll('span')).find((e) =>
    textOf(e).startsWith('Bulk actions'),
  );
  if (bulk === undefined) throw new Error('Bulk actions not found in the mockup');
  bulk.remove();
  const pager = footer.querySelector('div.flex.items-center.gap-1') as Element;
  const nav = pager.ownerDocument.createElement('nav');
  nav.append(...Array.from(pager.querySelectorAll('button')));
  pager.replaceWith(nav);

  return { root, columns, rowCount: table.querySelectorAll('tbody tr').length, tileCount };
}

function userRows(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: String(i + 1),
    username: `user_${i + 1}`,
    display_name: `Name ${i + 1}`,
    role: (['superadmin', 'admin', 'user'] as const)[i % 3],
    is_locked: i === 2,
    created_at: '2026-11-04T08:00:00Z',
    last_login_at: i === 3 ? null : '2026-11-04T08:00:00Z',
    active_user_session_count: i,
  }));
}

function renderScreen(rows: number): ReturnType<typeof render> {
  vi.stubGlobal(
    'fetch',
    vi.fn((...[path]: [string, RequestInit?]) => {
      if (path === '/api/v1/users') {
        return Promise.resolve(
          Response.json({
            items: userRows(rows),
            next_cursor: 'c1',
            total: rows,
            total_is_estimate: false,
          }),
        );
      }
      if (path === '/api/v1/auth/me') {
        return Promise.resolve(
          Response.json({
            id: '1',
            username: 'user_1',
            display_name: 'Name 1',
            role: 'superadmin',
          }),
        );
      }
      return Promise.resolve(
        Response.json({ items: [], next_cursor: null, total: 4, total_is_estimate: false }),
      );
    }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <UsersPage />
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('S12 against its mockup', () => {
  it('lays out the same regions in the same order', async () => {
    const mockup = prunedMockup();
    const { container } = renderScreen(mockup.rowCount);
    await screen.findByRole('table');
    // Both roots are a div: shapeOf always keeps the root, so the comparison starts alike.
    const page = container.firstElementChild as Element;
    expect(shapeOf(page, 0, landmarks)).toEqual(shapeOf(mockup.root, 0, landmarks));
  });

  it('has the columns of the mockup minus the dropped ones, in order', async () => {
    const mockup = prunedMockup();
    renderScreen(mockup.rowCount);
    await screen.findByRole('table');
    expect(mockup.columns.length).toBeGreaterThan(0);
    expect(screen.getAllByRole('columnheader').map(textOf)).toEqual(mockup.columns);
  });

  it('shows the stat tiles of the mockup minus the dropped ones', async () => {
    const mockup = prunedMockup();
    const { container } = renderScreen(mockup.rowCount);
    await screen.findByRole('table');
    expect(container.querySelectorAll('[data-stat-tile]')).toHaveLength(mockup.tileCount);
  });

  it('points Audit Logs at the S14 route', async () => {
    renderScreen(1);
    await screen.findByRole('table');
    expect(screen.getByRole('link', { name: /Audit Logs/ })).toHaveAttribute('href', '/audit-log');
  });

  it('builds nothing from the dropped parts', async () => {
    const { container } = renderScreen(3);
    await screen.findByRole('table');
    expect(container.querySelector('input[type=checkbox]')).toBeNull();
    expect(container.querySelector('input[type=search], input[type=text]')).toBeNull();
    expect(container.querySelector('select')).toBeNull();
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    const words = textOf(container);
    for (const banned of [
      'MFA',
      'FIDO2',
      'WebAuthn',
      'SAML',
      'Active Directory',
      'mTLS',
      'API Tokens',
      'Security Policy',
      'Role Matrix',
      'RBAC v3.1',
      'Delete',
    ]) {
      expect(words).not.toContain(banned);
    }
  });
});
