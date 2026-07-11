/* global console, process */
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const directory = path.join(root, 'artifacts');
const files = (await readdir(directory)).filter((name) => name !== 'SHA256SUMS').sort();
const lines = [];
for (const file of files) {
  const digest = createHash('sha256')
    .update(await readFile(path.join(directory, file)))
    .digest('hex');
  lines.push(`${digest}  ${file}`);
}
await writeFile(path.join(directory, 'SHA256SUMS'), `${lines.join('\n')}\n`);
console.log(JSON.stringify({ ok: true, files: files.length }));
