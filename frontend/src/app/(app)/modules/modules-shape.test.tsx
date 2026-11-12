import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PROGRAM } from '../system/fixtures';
import { dropEntry, mockupMain, type OutlineEntry, outline, rename } from '../system/shape-outline';
import { json, page, renderScreen, stubApi } from '../system/test-api';
import ModulesPage from './page';
import { moduleList, moduleRow } from './test-fixtures';

const CAPABILITY_CARDS = [
  'Subdomain Enumeration',
  'DNS Resolve',
  'Port Scan',
  'HTTP Probe',
  'Content Discovery',
  'Screenshot Engine',
  'Tech Fingerprinting',
  'Vulnerability Assessment bolt',
  'OAST / Out-of-Band Listener',
];

/** The mockup's table view, pruned to what S18 builds, each change with its rule. */
function expectedTable(): OutlineEntry[] {
  let e = outline(mockupMain('s18-modules-recon-capabilities.html'));
  // The mockup keeps the cards and the hidden table in one DOM; the screen draws one view.
  for (const card of CAPABILITY_CARDS) e = dropEntry(e, 'h3', card, 'M7: Grid and Table swap');
  e = rename(e, 'th', 'Scan Type', 'Tool Module', 'M2: the column holds tool_module.name');
  e = rename(e, 'th', 'Phase', 'Group', 'M2: glossary, Recon, Scan, Exploit');
  e = dropEntry(e, 'th', 'Alternative', 'D7-A: one engine per tool module');
  const at = e.findIndex((x) => x.tag === 'th' && x.text === '24h Jobs');
  e = [
    ...e.slice(0, at + 1),
    ...['Concurrency', 'Rate limit', 'Timeout'].map((text) => ({ tag: 'th', text })),
    ...e.slice(at + 1),
  ]; // N47: the limits Configure edits stay in the Table view
  return e;
}

function render() {
  stubApi('superadmin', (call) => {
    if (call.path.startsWith('/tool-modules/stats'))
      return json({ jobs: 1, jobs_prev: 1, stalled: 0 });
    if (call.path.startsWith('/tool-modules'))
      return json(
        moduleList([
          moduleRow('t1', 'gowitness', 'recon', true, { title: 'Screenshot Engine' }),
          moduleRow('t2', 'sqlmap', 'exploit'),
        ]),
      );
    if (call.path.startsWith('/programs')) return json(page([PROGRAM]));
    return undefined;
  });
  return renderScreen(<ModulesPage />);
}

afterEach(() => vi.unstubAllGlobals());

describe('S18 against its mockup', () => {
  it('has the table and columns of the mockup, minus the dropped parts', async () => {
    const { container } = render();
    await screen.findByText('Screenshot Engine');
    await userEvent.click(screen.getByRole('button', { name: 'Table' }));
    await userEvent.click(screen.getByRole('button', { name: 'Run gowitness' }));
    expect(outline(container.firstElementChild as Element)).toEqual(expectedTable());
  });

  it('draws one h3 per card in the Grid view, as the mockup does', async () => {
    const { container } = render();
    await screen.findByText('Screenshot Engine');
    const headings = outline(container.firstElementChild as Element).filter((e) => e.tag === 'h3');
    expect(headings.map((h) => h.text)).toEqual(['Screenshot Engine', 'sqlmap title']);
  });

  it('builds nothing from the dropped parts', async () => {
    const { container } = render();
    await screen.findByText('Screenshot Engine');
    await userEvent.click(screen.getByRole('button', { name: 'Run gowitness' }));
    const words = container.textContent ?? '';
    for (const banned of [
      'New Module',
      'BBRF',
      'gowitness DB',
      'CATALOG',
      'Alternative',
      'Target Engine Override',
      'CORE ASSESSMENT',
    ]) {
      expect(words).not.toContain(banned);
    }
  });
});
