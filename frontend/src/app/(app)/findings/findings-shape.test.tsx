import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { finding, PROGRAM } from '../system/fixtures';
import { dropEntry, mockupMain, type OutlineEntry, outline, rename } from '../system/shape-outline';
import { json, page, renderScreen, stubApi } from '../system/test-api';
import FindingsPage from './page';

const ROW = finding('f1', { name: 'Spring Boot Actuator Environment Exposure' });

/** The mockup pruned to what S20 builds, each change with its rule from frontend/CLAUDE.md. */
function expected(): OutlineEntry[] {
  let e = outline(mockupMain('s20-global-findings-explorer.html'));
  e = rename(e, 'th', 'Matched At / Target', 'Matched At', 'M2: finding.matched_at');
  e = dropEntry(e, 'th', 'Matcher / Match', 'M3: no matcher column on finding');
  e = rename(e, 'th', 'Discovered', 'First Seen', 'M2: first_seen_at');
  e = rename(e, 'h3', 'Vulnerability Synopsis', 'Summary', 'M2: fields of finding');
  e = rename(e, 'h3', 'Proof of Concept Telemetry', 'Evidence', 'M2: no "telemetry"');
  return e;
}

function render() {
  stubApi('admin', (call) => {
    if (call.path.startsWith('/programs')) return json(page([PROGRAM]));
    if (call.path === '/findings/f1') return json(ROW);
    if (call.path.startsWith('/findings')) return json(page([ROW]));
    return undefined;
  });
  return renderScreen(<FindingsPage />);
}

afterEach(() => vi.unstubAllGlobals());

describe('S20 against its mockup', () => {
  it('has the table, columns and drawer of the mockup, minus the dropped parts', async () => {
    const { container } = render();
    await userEvent.click(await screen.findByRole('button', { name: `Open ${ROW.name}` }));
    await screen.findByText('Summary');
    expect(outline(container.firstElementChild as Element)).toEqual(expected());
  });

  it('builds nothing from the dropped parts', async () => {
    const { container } = render();
    await userEvent.click(await screen.findByRole('button', { name: `Open ${ROW.name}` }));
    await screen.findByText('Summary');
    const words = container.textContent ?? '';
    for (const banned of [
      'Push to Jira',
      'Sync Nuclei',
      'Nuclei v3',
      'Remediation',
      'Copy as Markdown',
      'Web Tier',
      'Mark Triaged',
      'Hide False Positives',
      'All Domains',
      '/ page',
    ]) {
      expect(words).not.toContain(banned);
    }
    expect(container.querySelector('input[type=search], input[type=text]')).toBeNull();
  });
});
