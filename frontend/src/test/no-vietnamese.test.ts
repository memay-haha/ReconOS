// @vitest-environment node
import { globSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const srcRoot = fileURLToPath(new URL('../', import.meta.url));
const e2eRoot = fileURLToPath(new URL('../../e2e/', import.meta.url));
const ROOTS = [srcRoot, e2eRoot];

/** Vietnamese letters that no English string contains. Plain ASCII words that
 * happen to be Vietnamese are not worth chasing; the diacritics are. */
const VIETNAMESE = /[ăâđêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/iu;

/** Comments stay in English by convention; a stray word there is not a build failure. */
function stripComments(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ''))
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/(\s)\/\/\s.*$/gm, '$1');
}

describe('user-facing text', () => {
  it('is English everywhere in src and e2e', () => {
    const offenders: string[] = [];
    for (const root of ROOTS) {
      const files = globSync('**/*.{ts,tsx}', { cwd: root })
        .filter((f) => !f.endsWith('no-vietnamese.test.ts'))
        .map((f) => `${root}${f}`);
      for (const file of files) {
        const code = stripComments(readFileSync(file, 'utf8'));
        code.split('\n').forEach((line, i) => {
          if (VIETNAMESE.test(line)) {
            offenders.push(
              `${file.replace(`${root}`, root === srcRoot ? '' : 'e2e/')}:${i + 1}: ${line.trim()}`,
            );
          }
        });
      }
    }
    expect(offenders, `Vietnamese text found in:\n${offenders.join('\n')}`).toEqual([]);
  });
});
