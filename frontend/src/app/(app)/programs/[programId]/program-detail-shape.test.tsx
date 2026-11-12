import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { mockupDocument, regionsOf, textOf } from '../shape-helpers';
import { jobRow, page, programRow, renderWithClient, stubApi } from '../test-api';
import ProgramDetailPage from './page';

vi.mock('next/navigation', () => ({
  useParams: () => ({ programId: 'p1' }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/programs/p1',
  useSearchParams: () => new URLSearchParams(),
}));

/** Mockup headers renamed to glossary terms (M2). */
const RENAMED: Readonly<Record<string, string>> = {
  'Target Scope': 'Target',
  'Scan Type': 'Tool module',
};

function prunedMockup() {
  const doc = mockupDocument('s09-program-detail.html');
  const root = doc.querySelector('main') as Element;
  const historyColumns = Array.from(root.querySelectorAll('table thead th')).map(
    (th) => RENAMED[textOf(th)] ?? textOf(th),
  );
  // Each add form gains the rule_type select of the four rule forms (M2, M6).
  for (const form of Array.from(root.querySelectorAll('form'))) {
    form.prepend(doc.createElement('select'));
  }
  return { root, historyColumns };
}

function renderScreen() {
  stubApi({
    '/programs/p1': programRow(1, {
      platform_handle: 'example',
      created_by_username: 'ops',
      scope_coverage: 0.984,
    }),
    '/programs/p1/scope-rules?limit=200': page([]),
    '/jobs?program_id=p1&sort=-created_at&limit=10': page([jobRow(1)]),
  });
  return renderWithClient(<ProgramDetailPage />);
}

afterEach(() => vi.unstubAllGlobals());

describe('S09 against its mockup', () => {
  it('lays out the same regions in the same order on the Overview tab', async () => {
    const mockup = prunedMockup();
    const { container } = renderScreen();
    await screen.findByRole('table');
    expect(regionsOf(container.firstElementChild as Element)).toEqual(regionsOf(mockup.root));
  });

  it('gives the history table the mockup columns', async () => {
    const mockup = prunedMockup();
    renderScreen();
    await screen.findByRole('table');
    expect(screen.getAllByRole('columnheader').map(textOf)).toEqual(mockup.historyColumns);
  });

  it('builds the header facts and nothing from the dropped parts', async () => {
    const { container } = renderScreen();
    await screen.findByRole('table');
    const words = textOf(container);
    for (const shown of ['ID example', 'Maintained by ops', 'Scope coverage: 98.4%', 'Copy Name']) {
      expect(words).toContain(shown);
    }
    // BBRF is out of scope; N27 keeps the rule-type badge only; M5 rewrites the caption.
    for (const banned of ['BBRF', 'VERIFIED', 'MANUAL', 'automatically staged', 'daemon']) {
      expect(words).not.toContain(banned);
    }
  });
});
