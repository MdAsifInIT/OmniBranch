/* global process */
import { readdir, rm } from 'node:fs/promises';
import path from 'node:path';

async function clean(root) {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'dist' || entry.name === 'coverage') {
        await rm(target, { recursive: true, force: true });
      } else {
        await clean(target);
      }
    } else if (entry.name.endsWith('.tsbuildinfo')) {
      await rm(target, { force: true });
    }
  }
}

await clean(process.cwd());
