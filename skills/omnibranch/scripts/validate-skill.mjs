/* global process, console */
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(process.argv[2] ?? 'skills/omnibranch');
const skill = await readFile(path.join(root, 'SKILL.md'), 'utf8');
const lines = skill.split(/\r?\n/).length;
if (lines >= 500) throw new Error(`SKILL.md exceeds line budget: ${lines}`);
for (const required of ['name: omnibranch', 'description:', '# OmniBranch']) {
  if (!skill.includes(required)) throw new Error(`Missing required skill field: ${required}`);
}
for (const match of skill.matchAll(/\]\(([^)]+)\)/g)) {
  const target = match[1];
  if (target.startsWith('references/')) await access(path.join(root, target));
}
for (const forbidden of [
  'force push is allowed',
  'hard reset is allowed',
  'unavailable checks pass',
]) {
  if (skill.toLowerCase().includes(forbidden))
    throw new Error(`Forbidden safety claim: ${forbidden}`);
}
console.log(JSON.stringify({ ok: true, lines, root }));
