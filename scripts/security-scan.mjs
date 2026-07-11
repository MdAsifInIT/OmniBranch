/* global console */
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const roots = ['apps', 'packages', 'scripts', 'skills'];
const secret = /\b(?:ghp|github_pat|sk|xox[baprs])_[A-Za-z0-9_-]{12,}\b/g;
const destructive = /(?:reset\s+--hard|clean\s+-[a-z]*f|push[^\n]{0,40}--force)/i;
const failures = [];
async function visit(candidate) {
  const information = await stat(candidate);
  if (information.isDirectory()) {
    for (const entry of await readdir(candidate)) {
      if (!['dist', 'generated', 'node_modules'].includes(entry))
        await visit(path.join(candidate, entry));
    }
    return;
  }
  if (
    candidate.endsWith('security-scan.mjs') ||
    !/\.(?:ts|mjs|json|yaml)$/.test(candidate) ||
    /(?:test|fixture)\./.test(candidate)
  )
    return;
  const content = await readFile(candidate, 'utf8');
  if (secret.test(content)) failures.push(`${candidate}: credential-shaped literal`);
  secret.lastIndex = 0;
  if (destructive.test(content)) failures.push(`${candidate}: destructive Git command literal`);
}
for (const root of roots) await visit(root);
if (failures.length > 0) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ ok: true, scannedRoots: roots }));
