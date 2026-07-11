/* global process, console */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(process.argv[2] ?? 'skills/omnibranch');
const skill = await readFile(path.join(root, 'SKILL.md'), 'utf8');
const header = '<!-- generated from skills/omnibranch/SKILL.md; do not edit -->\n';
for (const provider of ['claude', 'codex', 'opencode', 'antigravity']) {
  const directory = path.join(root, 'generated', provider);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, 'OMNIBRANCH.md'), `${header}${skill}`, 'utf8');
}
console.log(JSON.stringify({ ok: true, providers: 4 }));
