import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DIAGNOSTIC, HEALTH, LOG, SETTING, TOOL } from './fixtures';
import SystemPage from './page';
import {
  dropEntry,
  insertAfter,
  mockupMain,
  type OutlineEntry,
  outline,
  rename,
  section,
} from './shape-outline';
import { json, page, renderScreen, stubApi } from './test-api';

/** The mockup pruned to what S15 builds. Every change names its rule from frontend/CLAUDE.md
 * and its row in docs/superpowers/specs/2026-11-05-fe-shell-b-e-decisions.md. */
function expected(): OutlineEntry[] {
  let e = outline(mockupMain('s15-system-health-tools.html'));
  // D4: the tools of the tool modules from GET /tools; no upstream, path or Update.
  e = rename(e, 'h2', 'Core Recon Binaries', 'Tools', 'D4: tools of the tool modules');
  e = rename(e, 'th', 'Tool Binary', 'Tool', 'D4');
  e = rename(e, 'th', 'Source', 'Tool Modules', 'D4: the source is the tool module');
  for (const column of ['Latest Upstream', 'Executable Path']) {
    e = dropEntry(e, 'th', column, 'D4: no upstream feed, no paths');
  }
  // M6: thresholds and the application log are required by the documents, absent from the mockup.
  e = insertAfter(
    e,
    null,
    [
      ...section('Operating Thresholds', ['Setting', 'Value', 'Updated', 'Actions']),
      ...section('Application Log', ['Time', 'Level', 'Service', 'Event', 'Context']),
    ],
    'M6',
  );
  return e;
}

function render() {
  stubApi('superadmin', (call) => {
    if (call.path === '/system/health') return json(HEALTH);
    if (call.path.startsWith('/tools')) return json(page([TOOL]));
    if (call.path.startsWith('/system/diagnostics')) return json(DIAGNOSTIC);
    if (call.path.startsWith('/system-settings')) return json(page([SETTING]));
    if (call.path.startsWith('/logs')) return json(page([LOG]));
    return undefined;
  });
  return renderScreen(<SystemPage />);
}

afterEach(() => vi.unstubAllGlobals());

describe('S15 against its mockup', () => {
  it('has the headings, tables and columns of the mockup, minus the dropped parts', async () => {
    const { container } = render();
    await screen.findByText('v3.3.5');
    await screen.findByText('log_retention_days');
    await screen.findByText('parse_failed');
    expect(outline(container.firstElementChild as Element)).toEqual(expected());
  });

  it('shows the stat tiles of the mockup that have a source', async () => {
    const { container } = render();
    await screen.findByText('1,234');
    // D4: Services, Tools, Workers, Queue Depth, as the mockup draws them.
    expect(container.querySelectorAll('[data-stat-tile]')).toHaveLength(4);
  });

  it('builds nothing from the dropped parts', async () => {
    const { container } = render();
    await screen.findByText('parse_failed');
    const words = container.textContent ?? '';
    for (const banned of [
      'BBRF',
      'CouchDB',
      'gowitness DB',
      'Latest Upstream',
      'Outdated',
      'Executable Path',
      '/usr/',
      'PID',
      'Ingest Proxy',
    ]) {
      expect(words).not.toContain(banned);
    }
    expect(words).not.toMatch(/\bUpdate\b/);
  });
});
