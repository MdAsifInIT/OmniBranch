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
  'docs/assets/brand/omnibranch-icon.svg',
  'docs/assets/brand/omnibranch-logo-light.svg',
  'docs/assets/brand/omnibranch-logo-dark.svg',
  'docs/assets/brand/omnibranch-logo-512.png',
  'docs/assets/brand/omnibranch-logo-1024.png',
  'schemas/v1alpha1/workspace-plan.schema.json',
  'schemas/v1/skill-install.schema.json',
  'skills/omnibranch/SKILL.md',
  'apps/cli/package.json',
  '.claude-plugin/marketplace.json',
  'distribution/claude-plugin/.claude-plugin/plugin.json',
];
await Promise.all(required.map((file) => access(file)));
const manifest = JSON.parse(await readFile('package.json', 'utf8'));
const packageManifest = JSON.parse(await readFile('apps/cli/package.json', 'utf8'));
if (
  manifest.version !== '0.2.0' ||
  manifest.packageManager !== 'pnpm@11.11.0' ||
  packageManifest.name !== 'omnibranch' ||
  packageManifest.version !== '0.2.0' ||
  !packageManifest.files.includes('docs/assets/brand/') ||
  JSON.stringify(packageManifest.dependencies) !== JSON.stringify({ 'better-sqlite3': '12.11.1' })
)
  throw new Error('Release identity or package manager drift');
const schema = JSON.parse(await readFile('schemas/v1alpha1/workspace-plan.schema.json', 'utf8'));
if (schema.$schema !== 'https://json-schema.org/draft/2020-12/schema')
  throw new Error('Workspace schema dialect drift');
console.log(JSON.stringify({ ok: true, requiredFiles: required.length }));
