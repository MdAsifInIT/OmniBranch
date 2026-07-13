/* global console */
import { copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageRoot = path.join(repositoryRoot, 'apps', 'cli');
await Promise.all([
  copyFile(path.join(repositoryRoot, 'LICENSE'), path.join(packageRoot, 'LICENSE')),
  copyFile(path.join(repositoryRoot, 'README.md'), path.join(packageRoot, 'README.md')),
]);
console.log(JSON.stringify({ ok: true, packageRoot, copied: ['LICENSE', 'README.md'] }));
