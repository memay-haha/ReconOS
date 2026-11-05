import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ENGINE, VARIABLE, VIGOLIUM } from '../system/fixtures';
import {
  dropEntry,
  dropSection,
  mockupMain,
  type OutlineEntry,
  outline,
  rename,
} from '../system/shape-outline';
import { json, page, renderScreen, stubApi } from '../system/test-api';
import OsmedeusPage from './page';

/** The mockup pruned to what S16 builds, each change with its rule from frontend/CLAUDE.md. */
function expected(): OutlineEntry[] {
  let e = outline(mockupMain('s16-osmedeus-settings.html'));
  e = rename(
    e,
    'h1',
    'Osmedeus Settings v4.5.1-core',
    'Osmedeus Settings',
    'M4: version from test',
  );
  e = dropEntry(e, 'h3', 'Cluster Resource Overhead', 'M3: no endpoint');
  e = rename(e, 'h2', 'Global Variables & Tokens', 'Engine Variables', 'M2: glossary');
  e = rename(e, 'th', 'Key Name', 'Key', 'M2: engine_variable.key');
  e = dropEntry(e, 'th', 'Source', 'M3: no source column');
  e = dropSection(e, 'h2', 'Scan Tactics & Intensity Presets', 'M1 debt 8');
  e = dropSection(e, 'h2', 'Installed Workflows Index (28 Total)', 'M3: link to S18 instead');
  return e;
}

function render() {
  stubApi('superadmin', (call) => {
    if (call.path === '/engines?limit=200') return json(page([ENGINE, VIGOLIUM]));
    if (call.path === '/engines/e1/variables') return json(page([VARIABLE]));
    return undefined;
  });
  return renderScreen(<OsmedeusPage />);
}

afterEach(() => vi.unstubAllGlobals());

describe('S16 against its mockup', () => {
  it('has the headings, tables and columns of the mockup, minus the dropped parts', async () => {
    const { container } = render();
    await screen.findByText('GITHUB_TOKEN');
    expect(outline(container.firstElementChild as Element)).toEqual(expected());
  });

  it('links the workflows to S18 instead of listing them', async () => {
    render();
    await screen.findByText('GITHUB_TOKEN');
    expect(screen.getByRole('link', { name: /tool modules/i })).toHaveAttribute('href', '/modules');
  });

  it('builds nothing from the dropped parts', async () => {
    const { container } = render();
    await screen.findByText('GITHUB_TOKEN');
    const words = container.textContent ?? '';
    for (const banned of [
      'Bearer Token',
      'Reveal',
      'Rotate',
      'Scan Tactics',
      'Environments',
      'Redis',
      'Schedules',
      'Worker Pool',
      'Daemon',
      'v4.5.1',
    ]) {
      expect(words).not.toContain(banned);
    }
  });
});
