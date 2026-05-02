/**
 * Runs husky only when devDependencies are installed (e.g. skips Docker `npm ci --omit=dev`).
 * Invokes husky via Node so it works without relying on PATH (e.g. Windows outside npm scripts).
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

if (process.env.HUSKY === '0') {
  process.exit(0);
}

const huskyBin = join(process.cwd(), 'node_modules', 'husky', 'bin.js');
if (!existsSync(huskyBin)) {
  process.exit(0);
}

const result = spawnSync(process.execPath, [huskyBin], {
  stdio: 'inherit',
  env: process.env,
});
process.exit(result.status === null ? 1 : result.status);
