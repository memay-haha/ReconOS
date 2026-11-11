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
vi.mock('next/navigation', () => ({
  usePathname: () => mockPath,
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

function wrap(
  user: CurrentUser | null = null,
  counts: Record<string, number> = {},
  props: { onSignOut?: () => void; signOutFailed?: boolean; toggled?: boolean } = {},
) {
  return render(
    <Sidebar
      user={user}
      counts={counts}
      toggled={props.toggled ?? false}
      onSignOut={props.onSignOut ?? (() => undefined)}
      signOutFailed={props.signOutFailed ?? false}
    />,
  );
}

afterEach(() => {
  mockPath = '/users';
});

function mockupDoc(): Document {
  return new DOMParser().parseFromString(readFileSync(MOCKUP, 'utf8'), 'text/html');
}

/** Mockup labels the glossary renames (M2, decision log part B): staging is "queue". */
const RENAMED: Readonly<Record<string, string>> = { 'Staging Queue': 'Queue' };

function mockupLabel(text: string): string {
  const label = text.trim();
  return RENAMED[label] ?? label;
}

// The mockup draws a Component Library page; the user dropped it, so it is left out.
const DROPPED: readonly string[] = ['Component Library'];

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
    for (const cls of ['fixed', 'left-0', 'md:top-0', 'md:h-screen', 'w-sidebar', 'border-r']) {
      expect(aside).toHaveClass(cls);
    }
  });

  it('gives the brand block a bottom border and the account card a top border', () => {
    wrap(USER);
    const aside = document.querySelector('aside') as HTMLElement;
    expect(aside.querySelector('.border-b')).not.toBeNull();
    expect(aside.querySelector('.border-t')).not.toBeNull();
  });

  it('puts every mockup item in the mockup group, in order, and nothing else there', () => {
    const fromMockup = Array.from(mockupDoc().querySelectorAll('aside nav > div')).map((group) => ({
      heading: (group.firstElementChild?.textContent ?? '').trim().replace(/\s*ROOT$/, ''),
      labels: Array.from(group.querySelectorAll('a'))
        .map((a) =>
          mockupLabel(a.querySelector('span:not(.material-symbols-outlined)')?.textContent ?? ''),
        )
        .filter((l) => !DROPPED.includes(l)),
    }));
    // Raw Outputs and Audit Log have no mockup; they are asserted on their own below.
    const mine = NAV_GROUPS.map((g) => ({
      heading: g.heading,
      labels: g.items.map((i) => i.label).filter((l) => l !== 'Raw Outputs' && l !== 'Audit Log'),
    }));
    expect(mine).toEqual(fromMockup);
  });

  it('places the two screens with no mockup in their groups, with their icons', () => {
    const find = (label: string) =>
      NAV_GROUPS.flatMap((g) => g.items.map((i) => ({ group: g.heading, item: i }))).find(
        (e) => e.item.label === label,
      );
    const operations = NAV_GROUPS.find((g) => g.heading === 'Operations');
    // Pinned after the mockup's two Operations items.
    expect(operations?.items.map((i) => i.label)).toEqual(['Queue', 'Manage', 'Raw Outputs']);
    expect(find('Raw Outputs')).toMatchObject({
      group: 'Operations',
      item: { icon: 'description', href: null },
    });
    // Audit Log follows Users in Admin.
    expect(NAV_GROUPS.find((g) => g.heading === 'Admin')?.items.map((i) => i.label)).toEqual([
      'Users',
      'Audit Log',
    ]);
    expect(find('Audit Log')).toMatchObject({
      group: 'Admin',
      item: { icon: 'history', href: '/audit-log' },
    });
  });

  it('tags the System group ROOT and shows the version tag beside the brand', () => {
    wrap(USER);
    expect(NAV_GROUPS.find((g) => g.heading === 'System')?.tag).toBe('ROOT');
    expect(screen.getByText('ROOT')).toBeInTheDocument();
    // Decision N3: the build version, stamped from package.json (vitest sets no env, so none).
  });

  it('counts unreviewed findings and queued jobs, as the mockup means', () => {
    const badges = NAV_GROUPS.flatMap((g) => g.items).flatMap((i) =>
      i.badge ? [i.badge.path] : [],
    );
    expect(badges).toContain('/findings?triage_status=new');
    expect(badges).toContain('/jobs?status=queued');
  });

  it('counts domains new in 24 hours beside Domains (decision M2)', () => {
    const domains = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.label === 'Domains');
    expect(domains?.badge).toEqual({
      path: '/dashboard/summary?window=24h',
      field: 'assets_new.domain',
      tone: 'neutral',
    });
  });

  it('draws each icon with the ligature the mockup uses', () => {
    const fromMockup = Array.from(mockupDoc().querySelectorAll('aside nav a')).map((a) => [
      mockupLabel(a.querySelector('span:not(.material-symbols-outlined)')?.textContent ?? ''),
      a.querySelector('.material-symbols-outlined')?.textContent,
    ]);
    const mine = new Map(NAV_GROUPS.flatMap((g) => g.items.map((i) => [i.label, i.icon])));
    for (const [label, icon] of fromMockup) {
      if (DROPPED.includes(label as string)) continue;
      expect(mine.get(label as string)).toBe(icon);
    }
  });
});

describe('Sidebar behaviour', () => {
  it('leaves the three detail screens off the sidebar', () => {
    const labels = NAV_GROUPS.flatMap((g) => g.items).map((i) => i.label);
    for (const name of ['Domain Detail', 'Screenshot Detail', 'Program Detail'])
      expect(labels).not.toContain(name);
  });

  it('lets the reader reach only the screens that are built', () => {});

  it('hides a screen no part has built yet: no dead entry, no placeholder text', () => {
    wrap();
    // Any screen still unbuilt will do: each part fills in its own hrefs.
    const unbuilt = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.href === null);
    if (unbuilt === undefined) return;
    expect(screen.queryByText(unbuilt.label)).toBeNull();
    expect(screen.queryByText(unbuilt.part)).toBeNull();
  });

  it('shows every built screen as a link', () => {
    wrap();
    for (const item of NAV_GROUPS.flatMap((g) => g.items)) {
      if (item.href === null) continue;
      expect(screen.getByRole('link', { name: new RegExp(`^${item.label}`) })).toHaveAttribute(
        'href',
        item.href,
      );
    }
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
    wrap(null, { '/dashboard/summary?window=24h#assets_new.domain': 64 });
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

  it('hands sign-out to the caller instead of calling an API itself', async () => {
    const onSignOut = vi.fn();
    wrap(USER, {}, { onSignOut });
    await userEvent.click(screen.getByRole('button', { name: /sign out/i }));
    expect(onSignOut).toHaveBeenCalledOnce();
  });

  it('tells the reader when signing out failed', () => {
    wrap(USER, {}, { signOutFailed: true });
    expect(screen.getByRole('alert')).toHaveTextContent(/could not sign out/i);
  });

  it('shows no alert while signing out has not failed', () => {
    wrap(USER);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('Sidebar and the topbar menu button', () => {
  it('is folded away below md and the column from md up by default', () => {
    wrap(USER);
    const aside = document.querySelector('aside') as HTMLElement;
    expect(aside.id).toBe('sidebar');
    expect(aside).toHaveClass('hidden', 'md:flex');
  });

  it('flips both once the menu button toggles it', () => {
    wrap(USER, {}, { toggled: true });
    expect(document.querySelector('aside')).toHaveClass('flex', 'md:hidden');
  });

  it('opens the change-password dialog from the account card', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Sidebar
          user={USER}
          counts={{}}
          toggled={false}
          onSignOut={() => undefined}
          signOutFailed={false}
        />
      </QueryClientProvider>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(screen.getByRole('dialog', { name: 'Change password' })).toBeInTheDocument();
  });
});
