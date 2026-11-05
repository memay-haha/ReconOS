import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { HEALTH, LOG, SETTING, WORKER } from './fixtures';
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
  e = rename(e, 'h2', 'Core Services Telemetry', 'Core Services', 'M2: no "telemetry"');
  e = rename(e, 'h2', 'Core Recon Binaries', 'Workers & Tool Modules', 'M1 debt 9: workers only');
  for (const column of [
    'Source',
    'Installed Version',
    'Latest Upstream',
    'Status',
    'Executable Path',
    'Actions',
  ]) {
    e = dropEntry(e, 'th', column, 'M1 debt 9: no binary version, path or Update');
  }
  e = rename(e, 'th', 'Tool Binary', 'Tool modules', 'M1 debt 9: tool modules from GET /workers');
  e = insertAfter(e, { tag: 'table', text: '' }, [{ tag: 'th', text: 'Worker' }], 'M6');
  e = insertAfter(
    e,
    { tag: 'th', text: 'Tool modules' },
    [{ tag: 'th', text: 'Last heartbeat' }],
    'M6',
  );
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
    if (call.path.startsWith('/workers')) return json(page([WORKER]));
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
    await screen.findByText('worker-recon-01');
    await screen.findByText('log_retention_days');
    await screen.findByText('parse_failed');
    expect(outline(container.firstElementChild as Element)).toEqual(expected());
  });

  it('shows the stat tiles of the mockup that have a source', async () => {
    const { container } = render();
    await screen.findByText('1,234');
    // Tools (versions, outdated) is dropped by M1 debt 9; Services, Workers, Queue remain.
    expect(container.querySelectorAll('[data-stat-tile]')).toHaveLength(3);
  });

  it('builds nothing from the dropped parts', async () => {
    const { container } = render();
    await screen.findByText('parse_failed');
    const words = container.textContent ?? '';
    for (const banned of [
      'BBRF',
      'CouchDB',
      'gowitness DB',
      'Run Diagnostics',
      'Export Report',
      'Recheck',
      'Dispatch Now',
      'fleet load',
      'Ingest Proxy',
    ]) {
      expect(words).not.toContain(banned);
    }
    expect(words).not.toMatch(/\bUpdate\b/);
  });
});
