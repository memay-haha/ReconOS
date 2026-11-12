import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PROGRAM } from '../system/fixtures';
import { mockupMain, type OutlineEntry, outline } from '../system/shape-outline';
import { json, page, renderScreen, stubApi } from '../system/test-api';
import FindingsPage from './page';
import { findingDetail, findingRow, SUMMARY } from './test-fixtures';

const NAME = 'Spring Boot Actuator Environment Exposure';
const ROW = findingRow('f1', { name: NAME });

/** The mockup with its finding dialog open. Nothing is dropped: the matcher column and the
 * dialog's synopsis and telemetry blocks come from the D2 keys of `GET /findings/{id}`. */
function expected(): OutlineEntry[] {
  return outline(mockupMain('s20-global-findings-explorer.html'));
}

function render() {
  stubApi('admin', (call) => {
    if (call.path.startsWith('/programs')) return json(page([PROGRAM]));
    if (call.path.startsWith('/tool-modules')) return json(page([]));
    if (call.path.startsWith('/findings/summary')) return json(SUMMARY);
    if (call.path === '/findings/f1') return json(findingDetail('f1', { name: NAME }));
    if (call.path.startsWith('/findings')) return json(page([ROW]));
    return undefined;
  });
  return renderScreen(<FindingsPage />);
}

afterEach(() => vi.unstubAllGlobals());

describe('S20 against its mockup', () => {
  it('has the table, columns and finding dialog of the mockup', async () => {
    const { container } = render();
    await userEvent.click(await screen.findByRole('button', { name: `Open ${NAME}` }));
    await screen.findByText('Vulnerability Synopsis');
    expect(outline(container.firstElementChild as Element)).toEqual(expected());
  });

  it('builds nothing from the dropped parts', async () => {
    const { container } = render();
    await userEvent.click(await screen.findByRole('button', { name: `Open ${NAME}` }));
    await screen.findByText('Vulnerability Synopsis');
    const words = container.textContent ?? '';
    // Push to Jira: stay-out list. Sync Nuclei became Re-scan (P2). Triaged is no triage status
    // (debt 7). Nuclei v3: N13 waits on job.tool_version (D4).
    // Page numbers: cursor pagination only.
    for (const banned of [
      'Push to Jira',
      'Sync Nuclei',
      'Triaged',
      'Nuclei v3',
      'Web Tier',
      '« First',
      'Last »',
    ]) {
      expect(words).not.toContain(banned);
    }
  });
});
