/* global process, console */
import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(process.argv[2] ?? 'skills/omnibranch');
const repositoryRoot = path.resolve(root, '..', '..');
const payloadEntries = ['SKILL.md', 'metadata.json', 'agents', 'references', 'scripts'];
const generatedRoot = path.join(root, 'generated');
await rm(generatedRoot, { recursive: true, force: true });
for (const provider of ['claude', 'codex', 'opencode', 'antigravity']) {
  await copyPayload(path.join(generatedRoot, provider, 'omnibranch'));
}
await copyPayload(path.join(repositoryRoot, 'apps', 'cli', 'skill', 'omnibranch'));
await copyPayload(
  path.join(repositoryRoot, 'distribution', 'claude-plugin', 'skills', 'omnibranch'),
);
console.log(JSON.stringify({ ok: true, providers: 4, packagePayload: true, claudePlugin: true }));

async function copyPayload(destination) {
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  for (const entry of payloadEntries) {
    await cp(path.join(root, entry), path.join(destination, entry), {
      recursive: true,
      force: false,
      errorOnExist: true,
    });
  }
}
