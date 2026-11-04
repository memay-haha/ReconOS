import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Run after `pnpm build`: fails if any trace of the sample-data layer reached
 * the production output. Dependencies under standalone/node_modules are not ours. */
const TRACES = ['startMocks', 'handlersFor', 'rootadmin'];
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '.next');
// Only production output is scanned. `.next/dev` is the `next dev` build, where the
// sample-data layer is meant to be present; scanning it would fail on every machine
// that has ever run the dev server. Do not widen this back to all of `.next`.
const PRODUCTION_DIRS = ['server', 'static', 'standalone'].map((d) => join(root, d));

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (name === 'node_modules' || name === 'cache') continue;
    if (statSync(path).isDirectory()) yield* files(path);
    else if (!path.endsWith('.map')) yield path;
  }
}

const scanned = PRODUCTION_DIRS.filter((d) => existsSync(d));
if (scanned.length === 0) {
  console.error(
    'No production build in .next: run `pnpm build` first. Refusing to pass vacuously.',
  );
  process.exit(2);
}

const hits = [];
for (const dir of scanned) {
  for (const file of files(dir)) {
    const text = readFileSync(file, 'utf8');
    for (const trace of TRACES) if (text.includes(trace)) hits.push(`${file}: ${trace}`);
  }
}

if (hits.length > 0) {
  console.error(`Sample-data layer leaked into the build:\n${hits.join('\n')}`);
  process.exit(1);
}
console.log('No trace of the sample-data layer in the production build.');
