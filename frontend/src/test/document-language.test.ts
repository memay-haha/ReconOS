// @vitest-environment node
import { globSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * `no-vietnamese.test.ts` reads the strings; this reads the attribute that tells a screen
 * reader how to pronounce them. Setting `lang="vi"` on the root layout left the whole
 * suite green, so a reader would have heard English words with Vietnamese phonetics and
 * no test would have said a word.
 */
const srcRoot = fileURLToPath(new URL('../', import.meta.url));
const LANG = /\blang=(?:"([^"]*)"|\{'([^']*)'\}|\{"([^"]*)"\})/g;

describe('document language', () => {
  it('is English on the root layout', () => {
    const layout = readFileSync(`${srcRoot}app/layout.tsx`, 'utf8');
    const declared = [...layout.matchAll(LANG)].map((match) => match[1] ?? match[2] ?? match[3]);
    expect(declared, 'app/layout.tsx must declare <html lang="en">').toEqual(['en']);
  });

  it('is English everywhere any element declares one', () => {
    const offenders: string[] = [];
    for (const file of globSync('**/*.tsx', { cwd: srcRoot })) {
      const code = readFileSync(`${srcRoot}${file}`, 'utf8');
      code.split('\n').forEach((line, index) => {
        for (const match of line.matchAll(LANG)) {
          const value = match[1] ?? match[2] ?? match[3];
          if (value !== 'en') offenders.push(`${file}:${index + 1}: lang="${value}"`);
        }
      });
    }
    expect(offenders, `The interface is English:\n${offenders.join('\n')}`).toEqual([]);
  });
});
