import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { toolModule } from '../system/fixtures';
import {
  dropEntry,
  dropSection,
  insertAfter,
  mockupMain,
  type OutlineEntry,
  outline,
  rename,
} from '../system/shape-outline';
import { json, page, renderScreen, stubApi } from '../system/test-api';
import ModulesPage from './page';

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

/** The mockup pruned to what S18 builds, each change with its rule from frontend/CLAUDE.md. */
function expected(): OutlineEntry[] {
  let e = outline(mockupMain('s18-modules-recon-capabilities.html'));
  // Each card is a lone heading in the outline; dropSection would also take the table below.
  for (const card of CAPABILITY_CARDS) e = dropEntry(e, 'h3', card, 'M1 debt 5: capability');
  e = rename(e, 'th', 'Scan Type', 'Tool module', 'M1 debt 5: one row per tool module');
  e = dropEntry(e, 'th', 'Capability', 'M1 debt 5');
  e = rename(e, 'th', 'Phase', 'Group', 'M2: Recon, Scan, Exploit');
  e = dropEntry(e, 'th', 'Primary Engine', 'M1 debt 5');
  e = dropEntry(e, 'th', 'Alternative', 'M1 debt 5');
  e = dropEntry(e, 'th', 'Output Contract', 'M3: GET /tool-modules has no output field');
  e = dropEntry(e, 'th', '24h Jobs', 'M3: no source');
  e = insertAfter(
    e,
    { tag: 'th', text: 'Group' },
    ['Concurrency', 'Rate limit', 'Timeout'].map((text) => ({ tag: 'th', text })),
    'M6: the tool_module columns the Configure form edits',
  );
  e = dropSection(e, 'h2', 'Dispatch Capability', 'M7: the Run drawer opens as a dialog');
  return e;
}

function render() {
  stubApi('superadmin', (call) =>
    call.path === '/tool-modules?limit=200'
      ? json(page([toolModule('t1', 'gowitness', 'recon'), toolModule('t2', 'sqlmap', 'exploit')]))
      : undefined,
  );
  return renderScreen(<ModulesPage />);
}

afterEach(() => vi.unstubAllGlobals());

describe('S18 against its mockup', () => {
  it('has the headings, table and columns of the mockup, minus the dropped parts', async () => {
    const { container } = render();
    await screen.findByText('gowitness');
    // The mockup keeps its table in the DOM behind the Table switch; the screen renders it on demand.
    await userEvent.click(screen.getByRole('button', { name: 'Table' }));
    expect(outline(container.firstElementChild as Element)).toEqual(expected());
  });

  it('builds nothing from the dropped parts', async () => {
    const { container } = render();
    await screen.findByText('gowitness');
    const words = container.textContent ?? '';
    for (const banned of [
      'New Module',
      'BBRF',
      'gowitness DB',
      'CATALOG',
      'ENGINES',
      'Threads',
      'Primary Engine',
      'listener',
    ]) {
      expect(words).not.toContain(banned);
    }
    expect(container.querySelector('input[type=search], input[type=text]')).toBeNull();
  });
});
