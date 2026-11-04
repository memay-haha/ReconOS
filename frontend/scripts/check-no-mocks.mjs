import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Run after `pnpm build`: fails if any trace of the sample-data layer reached
 * the production output. Dependencies under standalone/node_modules are not ours. */
const TRACES = ['startMocks', 'handlersFor', 'rootadmin'];
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '.next');

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (name === 'node_modules' || name === 'cache') continue;
    if (statSync(path).isDirectory()) yield* files(path);
    else if (!path.endsWith('.map')) yield path;
  }
}

if (!existsSync(root)) {
  console.error('No .next directory: run `pnpm build` first. Refusing to pass vacuously.');
  process.exit(2);
}

const hits = [];
for (const file of files(root)) {
  const text = readFileSync(file, 'utf8');
  for (const trace of TRACES) if (text.includes(trace)) hits.push(`${file}: ${trace}`);
}

if (hits.length > 0) {
  console.error(`Sample-data layer leaked into the build:\n${hits.join('\n')}`);
  process.exit(1);
}
console.log('No trace of the sample-data layer in .next.');
