import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { shapeOf } from '@/test/dom-shape';

import UsersPage from './page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/users',
  useSearchParams: () => new URLSearchParams(),
}));

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

/** Columns the screen does not build, with the reason each is cut. */
const DROPPED_COLUMNS: { label: string; reason: string }[] = [
  { label: 'Auth Method', reason: 'frontend/CLAUDE.md bans MFA, FIDO2, SSO SAML, mTLS on S12' },
  { label: 'MFA Policy', reason: 'frontend/CLAUDE.md bans MFA on S12; authentication.md has none' },
];

/** Stat tiles the screen does not build, matched by the label the tile shows. The Security
 * Policy tile stays: N39 turns it into Locked accounts. */
const DROPPED_TILES: { label: string; reason: string }[] = [
  { label: 'API Tokens', reason: 'frontend/CLAUDE.md bans API Tokens on S12' },
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

  // Cut by label, never by position: a reordered or inserted tile must not move the cut.
  const grid = root.querySelector('div.grid') as Element;
  const tilesBefore = grid.children.length;
  for (const { label, reason } of DROPPED_TILES) {
    const tile = Array.from(grid.children).find(
      (t) =>
        t.querySelector('span') !== null && textOf(t.querySelector('span') as Element) === label,
    );
    if (tile === undefined) throw new Error(`Dropped tile not in the mockup (${reason}): ${label}`);
    tile.remove();
  }
  const tileCount = grid.children.length;
  expect(tileCount).toBe(tilesBefore - DROPPED_TILES.length);

  // Tab bar: the API Keys tab and the Active Directory SSO line are banned. The remaining
  // tabs are real tabs (N36), so the product marks them with ARIA tab roles (M6).
  const keysTab = Array.from(root.querySelectorAll('button')).find((b) =>
    textOf(b).includes('API Keys'),
  );
  if (keysTab === undefined) throw new Error('API Keys tab not found in the mockup');
  const tabList = keysTab.parentElement as Element;
  keysTab.remove();
  tabList.setAttribute('role', 'tablist');
  Array.from(tabList.children).forEach((tab) => tab.setAttribute('role', 'tab'));
  cut(root, 'div.hidden.lg\\:flex', 'Active Directory SSO is banned on S12');

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
    const at = heads.findIndex((th) => textOf(th) === label);
    if (at === -1) throw new Error(`Dropped column not in the mockup (${reason}): ${label}`);
    return at;
  });
  const rows = Array.from(table.querySelectorAll('tr'));
  for (const tr of rows) {
    const cells = Array.from(tr.children);
    dropIndexes.forEach((i) => cells[i]?.remove());
  }
  const columns = Array.from(table.querySelectorAll('thead th')).map(textOf);

  // N38: the product keeps Lock as a fourth row action after the mockup's three.
  for (const actions of Array.from(table.querySelectorAll('tbody td:last-child > div'))) {
    actions.append(actions.ownerDocument.createElement('button'));
  }

  // Footer: Export CSV downloads a file, so it is a link. The mockup's page number is
  // numbered pagination (banned), so it is not a button here.
  const footer = table.closest('div.bg-surface')?.querySelector(':scope > div.border-t');
  if (footer == null) throw new Error('Table footer not found in the mockup');
  const exportButton = Array.from(footer.querySelectorAll('button')).find(
    (b) => textOf(b) === 'Export CSV',
  );
  if (exportButton === undefined) throw new Error('Export CSV not found in the mockup');
  const anchor = exportButton.ownerDocument.createElement('a');
  anchor.append(...Array.from(exportButton.childNodes));
  exportButton.replaceWith(anchor);
  // The product's pager is one nav landmark: the count with the bulk actions beside it, as
  // the mockup groups them, then Previous/Next.
  const nav = footer.ownerDocument.createElement('nav');
  nav.append(...Array.from(footer.querySelectorAll('a, button')));
  footer.replaceChildren(nav);

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
    // Visible text and every accessible-name attribute: an icon-only button is named by
    // aria-label or title, which textContent never sees.
    const names = Array.from(container.querySelectorAll('*'))
      .flatMap((e) => ['aria-label', 'title', 'aria-description'].map((a) => e.getAttribute(a)))
      .filter((v): v is string => v !== null);
    const words = [textOf(container), ...names].join(' ');
    for (const banned of [
      'MFA',
      'FIDO2',
      'WebAuthn',
      'SAML',
      'Active Directory',
      'mTLS',
      'API Tokens',
      'API Keys',
      'Security Policy',
      'RBAC v3.1',
    ]) {
      expect(words).not.toContain(banned);
    }
  });

  it('offers Delete on every row but your own, which reads Protected (D5)', async () => {
    renderScreen(3);
    const table = await screen.findByRole('table');
    expect(
      within(table).getByRole('button', { name: 'You cannot delete your own account' }),
    ).toBeDisabled();
    expect(within(table).queryByRole('button', { name: 'Delete user_1' })).toBeNull();
    expect(within(table).getByRole('button', { name: 'Delete user_2' })).toBeEnabled();
  });
});
