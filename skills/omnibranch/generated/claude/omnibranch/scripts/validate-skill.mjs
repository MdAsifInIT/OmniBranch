/* global process, console */
import { access, readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
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
const canonical = await evidence(root);
for (const provider of ['claude', 'codex', 'opencode', 'antigravity']) {
  const providerRoot = path.join(root, 'generated', provider, 'omnibranch');
  await access(path.join(providerRoot, 'SKILL.md'));
  const generated = await evidence(providerRoot);
  if (JSON.stringify(generated) !== JSON.stringify(canonical))
    throw new Error(`Generated ${provider} skill payload differs from the canonical content.`);
}
console.log(JSON.stringify({ ok: true, lines, root, files: canonical.length, providers: 4 }));

async function evidence(directory) {
  const result = [];
  async function visit(current) {
    const entries = await readdir(current, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (entry.name === 'generated') continue;
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile()) {
        const relative = path.relative(directory, absolute).replaceAll('\\', '/');
        const contents = await readFile(absolute);
        result.push([relative, createHash('sha256').update(contents).digest('hex')]);
      } else throw new Error(`Unsupported skill entry: ${absolute}`);
    }
  }
  await visit(directory);
  return result;
}
