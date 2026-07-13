/* global console */
import { copyFile, cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageRoot = path.join(repositoryRoot, 'apps', 'cli');
const packageBrandRoot = path.join(packageRoot, 'docs', 'assets', 'brand');
await rm(packageBrandRoot, { recursive: true, force: true });
await mkdir(path.dirname(packageBrandRoot), { recursive: true });
await Promise.all([
  copyFile(path.join(repositoryRoot, 'LICENSE'), path.join(packageRoot, 'LICENSE')),
  copyFile(path.join(repositoryRoot, 'README.md'), path.join(packageRoot, 'README.md')),
  cp(path.join(repositoryRoot, 'docs', 'assets', 'brand'), packageBrandRoot, { recursive: true }),
]);
console.log(
  JSON.stringify({ ok: true, packageRoot, copied: ['LICENSE', 'README.md', 'docs/assets/brand'] }),
);
