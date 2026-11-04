import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CurrentUser } from '@/lib/auth';
import { shapeOf, shapeOfMockup } from '@/test/dom-shape';

import { NAV_GROUPS } from './nav-items';
import { Sidebar } from './sidebar';

let mockPath = '/users';
const push = vi.fn();
vi.mock('next/navigation', () => ({
  usePathname: () => mockPath,
  useRouter: () => ({ push }),
}));

const MOCKUP = resolve(
  import.meta.dirname,
  '../../../docs/design/screens/s12-users-access-control.html',
);

const USER: CurrentUser = {
  id: '1',
  username: 'rootadmin',
  display_name: 'Root Admin',
  role: 'superadmin',
};

function wrap(user: CurrentUser | null = null, counts: Record<string, number> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Sidebar user={user} counts={counts} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  push.mockClear();
  mockPath = '/users';
});

function mockupDoc(): Document {
  return new DOMParser().parseFromString(readFileSync(MOCKUP, 'utf8'), 'text/html');
}

describe('Sidebar against the mockup', () => {
  it('is an aside holding a nav, then the account card, as the mockup is', () => {
    wrap(USER);
    const aside = document.querySelector('aside') as Element;
    const mine = shapeOf(aside, 0, { landmarks: true });
    const theirs = shapeOfMockup(MOCKUP, 'aside', 0, { landmarks: true });
    // Reduce both to the region skeleton: the aside, the nav one level in, and the
    // last landmark at that same level (the card's action).
    const regions = (lines: string[]) =>
      lines.filter((l) => /^( {0,2})(aside|nav|button)$/.test(l) && !l.startsWith('    '));
    expect(regions(mine).slice(0, 2)).toEqual(regions(theirs).slice(0, 2));
    expect(regions(mine).slice(0, 2)).toEqual(['aside', '  nav']);
    expect(mine.at(-1)).toBe('  button');
    expect(theirs.at(-1)).toBe('  button');
  });

  it('is fixed to the left edge, the full height, one sidebar wide, with a right border', () => {
    wrap(USER);
    const aside = document.querySelector('aside') as HTMLElement;
    for (const cls of ['fixed', 'left-0', 'top-0', 'h-screen', 'w-sidebar', 'border-r']) {
      expect(aside).toHaveClass(cls);
    }
  });

  it('gives the brand block a bottom border and the account card a top border', () => {
    wrap(USER);
    const aside = document.querySelector('aside') as HTMLElement;
    expect(aside.querySelector('.border-b')).not.toBeNull();
    expect(aside.querySelector('.border-t')).not.toBeNull();
  });

  it('has the groups the mockup has, in that order', () => {
    const headings = Array.from(
      mockupDoc().querySelectorAll('aside nav > div > div:first-child'),
    ).map((n) => (n.textContent ?? '').trim().replace(/\s*ROOT$/, ''));
    expect(NAV_GROUPS.map((g) => g.heading)).toEqual(headings);
  });

  it('lists every item the mockup lists, in order, plus the Raw Outputs and Audit Log screens', () => {
    const fromMockup = Array.from(mockupDoc().querySelectorAll('aside nav a')).map((a) =>
      (a.querySelector('span:not(.material-symbols-outlined)')?.textContent ?? '').trim(),
    );
    const mine = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.label)).filter(
      (l) => l !== 'Raw Outputs' && l !== 'Audit Log',
    );
    expect(mine).toEqual(fromMockup);
  });

  it('draws each icon with the ligature the mockup uses', () => {
    const fromMockup = Array.from(mockupDoc().querySelectorAll('aside nav a')).map((a) => [
      (a.querySelector('span:not(.material-symbols-outlined)')?.textContent ?? '').trim(),
      a.querySelector('.material-symbols-outlined')?.textContent,
    ]);
    const mine = new Map(NAV_GROUPS.flatMap((g) => g.items.map((i) => [i.label, i.icon])));
    for (const [label, icon] of fromMockup) expect(mine.get(label as string)).toBe(icon);
  });
});

describe('Sidebar behaviour', () => {
  it('leaves the three detail screens off the sidebar', () => {
    const labels = NAV_GROUPS.flatMap((g) => g.items).map((i) => i.label);
    for (const name of ['Domain Detail', 'Capture Detail', 'Program Detail'])
      expect(labels).not.toContain(name);
  });

  it('lets the reader reach only the screens part A builds', () => {
    wrap();
    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(hrefs.sort()).toEqual(['/audit-log', '/components', '/users']);
  });

  it('renders an unbuilt screen as plain text, not a control, and names its part', () => {
    wrap();
    const pending = screen.getByText('Dashboard').closest('li') as HTMLElement;
    expect(within(pending).queryByRole('link')).toBeNull();
    expect(within(pending).queryByRole('button')).toBeNull();
    expect(within(pending).getByText(/part d/i)).toBeInTheDocument();
  });

  it('marks the current screen, by whole path segment', () => {
    wrap();
    expect(screen.getByRole('link', { name: /^users/i })).toHaveAttribute('aria-current', 'page');
  });

  it('does not mark a path that merely shares the prefix', () => {
    mockPath = '/usersfoo';
    wrap();
    expect(screen.getByRole('link', { name: /^users/i })).not.toHaveAttribute('aria-current');
  });

  it('keeps a screen current on a nested path', () => {
    mockPath = '/users/42';
    wrap();
    expect(screen.getByRole('link', { name: /^users/i })).toHaveAttribute('aria-current', 'page');
  });

  it('shows a count beside a label when one is given', () => {
    wrap(null, { '/domains': 64 });
    const domains = screen.getByText('Domains').closest('li') as HTMLElement;
    expect(within(domains).getByText('64')).toBeInTheDocument();
  });

  it('shows no count when the number is not known yet', () => {
    wrap();
    const domains = screen.getByText('Domains').closest('li') as HTMLElement;
    expect(within(domains).queryByText(/^\d+$/)).toBeNull();
  });

  it('hides the icon ligature text from assistive technology', () => {
    wrap();
    const icons = document.querySelectorAll('.material-symbols-outlined');
    expect(icons.length).toBeGreaterThan(0);
    for (const icon of Array.from(icons)) expect(icon).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('Sidebar account card', () => {
  it('shows who is signed in and their role', () => {
    wrap(USER);
    expect(screen.getByText('Root Admin')).toBeInTheDocument();
    expect(screen.getByText('Superadmin')).toBeInTheDocument();
  });

  it('sends the reader to the sign in screen after signing out', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    wrap(USER);
    await userEvent.click(screen.getByRole('button', { name: /sign out/i }));
    expect(push).toHaveBeenCalledWith('/login');
  });

  it('tells the reader when signing out failed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network down')));
    wrap(USER);
    await userEvent.click(screen.getByRole('button', { name: /sign out/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not sign out/i);
    expect(push).not.toHaveBeenCalled();
  });
});
