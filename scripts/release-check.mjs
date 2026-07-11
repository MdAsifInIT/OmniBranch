/* global console */
import { access, readFile } from 'node:fs/promises';

const required = [
  'LICENSE',
  'SECURITY.md',
  'CHANGELOG.md',
  'docs/INSTALLATION.md',
  'docs/UPGRADE.md',
  'docs/ROLLBACK.md',
  'docs/EXAMPLES.md',
  'docs/COMPATIBILITY.md',
  'docs/LIMITATIONS.md',
  'docs/RELEASE.md',
  'schemas/v1alpha1/workspace-plan.schema.json',
  'skills/omnibranch/SKILL.md',
];
await Promise.all(required.map((file) => access(file)));
const manifest = JSON.parse(await readFile('package.json', 'utf8'));
if (manifest.version !== '0.1.0' || manifest.packageManager !== 'pnpm@11.11.0')
  throw new Error('Release identity or package manager drift');
const schema = JSON.parse(await readFile('schemas/v1alpha1/workspace-plan.schema.json', 'utf8'));
if (schema.$schema !== 'https://json-schema.org/draft/2020-12/schema')
  throw new Error('Workspace schema dialect drift');
console.log(JSON.stringify({ ok: true, requiredFiles: required.length }));
