import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ENGINE, VARIABLE, VIGOLIUM } from '../system/fixtures';
import { dropEntry, mockupMain, type OutlineEntry, outline, rename } from '../system/shape-outline';
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
    'N3: no version in tests',
  );
  e = rename(e, 'h2', 'Global Variables & Tokens', 'Engine Variables', 'M2: glossary');
  e = rename(e, 'th', 'Key Name', 'Key', 'M2: engine_variable.key');
  e = dropEntry(e, 'th', 'Source', 'N42: no variable source');
  e = rename(
    e,
    'h2',
    'Installed Workflows Index (28 Total)',
    'Installed Workflows Index (1 Total)',
    'D3-B: count from the engine',
  );
  // D3-B: Cluster Resource Overhead sits under the connection panel, as the mockup draws it.
  return e;
}

function render() {
  stubApi('superadmin', (call) => {
    if (call.path === '/engines?limit=200') return json(page([ENGINE, VIGOLIUM]));
    if (call.path === '/engines/e1/variables') return json(page([VARIABLE]));
    if (call.path.startsWith('/engines/e1/workflows'))
      return json(
        page([{ name: 'general', kind: 'flow', step_count: 1, description: null, tags: [] }]),
      );
    return undefined;
  });
  return renderScreen(<OsmedeusPage />);
}

afterEach(() => vi.unstubAllGlobals());

describe('S16 against its mockup', () => {
  it('has the headings, tables and columns of the mockup, minus the dropped parts', async () => {
    const { container } = render();
    await screen.findByText('GITHUB_TOKEN');
    await screen.findByText('general');
    expect(outline(container.firstElementChild as Element)).toEqual(expected());
  });

  it('builds nothing from the dropped parts', async () => {
    const { container } = render();
    await screen.findByText('GITHUB_TOKEN');
    const words = container.textContent ?? '';
    for (const banned of [
      'Bearer Token',
      'Reveal',
      'Rotate',
      'Environments',
      'Database & Redis',
      'Cloud & LLM',
      'Schedules',
      'Open Folder',
      '/root/',
      'v4.5.1',
    ]) {
      expect(words).not.toContain(banned);
    }
  });
});
