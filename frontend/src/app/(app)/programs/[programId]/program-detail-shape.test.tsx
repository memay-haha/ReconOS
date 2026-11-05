import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { cutAround, mockupDocument, regionsOf, textOf } from '../shape-helpers';
import { jobRow, page, programRow, renderWithClient, stubApi } from '../test-api';
import ProgramDetailPage from './page';

vi.mock('next/navigation', () => ({
  useParams: () => ({ programId: 'p1' }),
  useRouter: () => ({ push: vi.fn() }),
}));

/** Mockup headers renamed by the decision log, part B (M2). */
const RENAMED: Readonly<Record<string, string>> = {
  'Target Scope': 'Target',
  'Scan Type': 'Tool module',
  'Triggered By': 'Created by',
  Completed: 'Finished',
};

function prunedMockup() {
  const doc = mockupDocument('s09-program-detail.html');
  const root = doc.querySelector('main') as Element;
  const historyColumns = Array.from(root.querySelectorAll('table thead th')).map(
    (th) => RENAMED[textOf(th)] ?? textOf(th),
  );
  // Seed Targets becomes the Schedules tab and the history table the Jobs tab; the Scope
  // tab, open by default, holds the two scope panels only.
  cutAround(root, 'h2', /^Seed Targets/, 'div.bg-surface.rounded', 'moved to the Schedules tab');
  cutAround(root, 'h2', /^Recent Scan Trigger History/, 'div.bg-surface.rounded', 'Jobs tab');
  // Each add form gains the rule_type select of the four rule forms (M2, M6).
  for (const form of Array.from(root.querySelectorAll('form'))) {
    form.prepend(doc.createElement('select'));
  }
  return { root, historyColumns };
}

function renderScreen() {
  stubApi({
    '/programs/p1': programRow(1),
    '/programs/p1/scope-rules?limit=200': page([]),
    '/jobs?program_id=p1&sort=-created_at': page([jobRow(1)]),
  });
  return renderWithClient(<ProgramDetailPage />);
}

afterEach(() => vi.unstubAllGlobals());

describe('S09 against its mockup', () => {
  it('lays out the same regions in the same order on the Scope tab', async () => {
    const mockup = prunedMockup();
    const { container } = renderScreen();
    await screen.findByRole('heading', { name: 'In-Scope' });
    expect(regionsOf(container.firstElementChild as Element)).toEqual(regionsOf(mockup.root));
  });

  it('gives the Jobs tab the history columns, renamed by the decision log', async () => {
    const mockup = prunedMockup();
    renderScreen();
    await userEvent.click(await screen.findByRole('tab', { name: 'Jobs' }));
    await screen.findByRole('table');
    expect(screen.getAllByRole('columnheader').map(textOf)).toEqual(mockup.historyColumns);
  });

  it('builds nothing from the dropped parts', async () => {
    const { container } = renderScreen();
    await screen.findByRole('heading', { name: 'In-Scope' });
    const words = textOf(container);
    for (const banned of [
      'BBRF',
      'HackerOne ID',
      'Maintained by',
      'Scope coverage',
      'VERIFIED',
      'Trigger',
      'automatically staged',
      'Copy Name',
    ]) {
      expect(words).not.toContain(banned);
    }
  });
});
