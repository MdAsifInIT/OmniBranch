#!/usr/bin/env node
/* global console, process */
import { spawnSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { readFile, readdir, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const markdownFiles = [
  'README.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
  ...(await markdownUnder(path.join(root, 'docs'))),
  ...(await markdownUnder(path.join(root, 'packages'))),
].map((file) => path.resolve(file));

const required = [
  'README.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
  'docs/README.md',
  'docs/GETTING-STARTED.md',
  'docs/ARCHITECTURE.md',
  'docs/CONFIGURATION.md',
  'docs/DEVELOPMENT.md',
  'docs/TESTING.md',
  'docs/assets/brand/omnibranch-logo-light.svg',
  'docs/assets/brand/omnibranch-logo-dark.svg',
  'docs/assets/brand/omnibranch-icon.svg',
  'docs/assets/brand/omnibranch-logo-512.png',
  'docs/assets/brand/omnibranch-logo-1024.png',
];
for (const relative of required) await requirePath(path.resolve(root, relative), relative);

for (const file of [...new Set(markdownFiles)]) {
  const source = await readFile(file, 'utf8');
  checkDuplicateHeadings(file, source);
  await checkMarkdownLinks(file, source);
  checkDocumentedCommands(file, source);
}

for (const relative of [
  'docs/assets/brand/omnibranch-logo-light.svg',
  'docs/assets/brand/omnibranch-logo-dark.svg',
  'docs/assets/brand/omnibranch-icon.svg',
]) {
  checkSvg(relative, await readFile(path.join(root, relative), 'utf8'));
}
await checkPng('docs/assets/brand/omnibranch-logo-512.png', 512);
await checkPng('docs/assets/brand/omnibranch-logo-1024.png', 1024);

const readme = await readFile(path.join(root, 'README.md'), 'utf8');
for (const heading of [
  '## Why OmniBranch?',
  '## Install',
  '## Five-minute skill setup',
  '## Supported skill targets',
  '## Safety model',
  '## Documentation',
  '## Contributing',
]) {
  if (!readme.includes(heading)) failures.push(`README.md: missing required section ${heading}`);
}

checkCliHelp();
checkDryRun();

if (failures.length > 0) {
  for (const failure of failures) console.error(`docs:check: ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    JSON.stringify({
      ok: true,
      markdownFiles: new Set(markdownFiles).size,
      requiredFiles: required.length,
      svgFiles: 3,
      pngFiles: 2,
      cliChecks: 6,
    }),
  );
}

async function markdownUnder(directory) {
  const results = [];
  async function visit(current) {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile() && entry.name.endsWith('.md')) results.push(absolute);
    }
  }
  await visit(directory);
  return results;
}

async function requirePath(absolute, label) {
  try {
    await stat(absolute);
  } catch {
    failures.push(`missing required path: ${label}`);
  }
}

function checkDuplicateHeadings(file, source) {
  const anchors = new Map();
  let fenced = false;
  for (const [index, line] of source.split(/\r?\n/).entries()) {
    if (/^```/.test(line.trim())) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    const match = /^(#{1,6})\s+(.+)$/.exec(line);
    if (match === null) continue;
    const anchor = match[2]
      .toLowerCase()
      .replace(/<[^>]+>/g, '')
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      .trim()
      .replace(/\s+/g, '-');
    const previous = anchors.get(anchor);
    if (previous !== undefined)
      failures.push(
        `${relative(file)}:${index + 1}: duplicate heading anchor "${anchor}" (first at ${previous})`,
      );
    else anchors.set(anchor, index + 1);
  }
}

async function checkMarkdownLinks(file, source) {
  const targets = [];
  for (const match of source.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) targets.push(match[1]);
  for (const match of source.matchAll(/<(?:img|source)\b[^>]*(?:src|srcset)="([^"]+)"/g))
    targets.push(match[1]);
  for (const raw of targets) {
    const target = raw.trim().split(/\s+/)[0];
    if (
      target === undefined ||
      target.startsWith('#') ||
      /^(?:https?:|mailto:|data:)/i.test(target)
    )
      continue;
    const pathname = decodeURIComponent(target.split('#')[0].split('?')[0]);
    if (pathname.length === 0) continue;
    const absolute = path.resolve(path.dirname(file), pathname);
    if (!isInside(root, absolute)) {
      failures.push(`${relative(file)}: link escapes repository: ${target}`);
      continue;
    }
    await requirePath(absolute, `${relative(file)} -> ${target}`);
  }
}

function checkDocumentedCommands(file, source) {
  const topLevel = new Set([
    'init',
    'doctor',
    'config',
    'skill',
    'campaign',
    'plan',
    'run',
    'status',
    'resume',
    'validate',
    'review',
    'promote',
    'reconcile',
    'cleanup',
    'report',
  ]);
  const skillCommands = new Set([
    'targets',
    'plan',
    'install',
    'status',
    'update',
    'doctor',
    'rollback',
    'uninstall',
  ]);
  for (const match of source.matchAll(/(?:^|[ \t])omnibranch(?:@0\.2\.0)?[ \t]+([a-z][a-z-]*)/gm)) {
    if (!topLevel.has(match[1]))
      failures.push(`${relative(file)}: undocumented top-level CLI command: ${match[1]}`);
  }
  for (const match of source.matchAll(/omnibranch(?:@0\.2\.0)?[ \t]+skill[ \t]+([a-z][a-z-]*)/g)) {
    if (!skillCommands.has(match[1]))
      failures.push(`${relative(file)}: undocumented skill CLI command: ${match[1]}`);
  }
}

function checkSvg(relativePath, source) {
  if (!/<svg\b/.test(source) || !/viewBox="[^"]+"/.test(source))
    failures.push(`${relativePath}: SVG requires an svg root and viewBox`);
  for (const forbidden of [
    /<script\b/i,
    /<foreignObject\b/i,
    /<!DOCTYPE/i,
    /<!ENTITY/i,
    /\son[a-z]+\s*=/i,
    /(?:href|src)="https?:/i,
  ]) {
    if (forbidden.test(source)) failures.push(`${relativePath}: unsafe SVG construct ${forbidden}`);
  }
  if (!/<title\b/.test(source) || !/<desc\b/.test(source))
    failures.push(`${relativePath}: SVG requires accessible title and description`);
}

async function checkPng(relativePath, expectedWidth) {
  const contents = await readFile(path.join(root, relativePath));
  const signature = contents.subarray(0, 8).toString('hex');
  if (signature !== '89504e470d0a1a0a') failures.push(`${relativePath}: invalid PNG signature`);
  if (contents.readUInt32BE(16) !== expectedWidth)
    failures.push(
      `${relativePath}: expected width ${expectedWidth}, got ${contents.readUInt32BE(16)}`,
    );
  if (contents[25] !== 6) failures.push(`${relativePath}: expected RGBA transparent PNG`);
}

function checkCliHelp() {
  for (const arguments_ of [
    ['--help'],
    ['skill', '--help'],
    ['skill', 'install', '--help'],
    ['campaign', '--help'],
    ['config', '--help'],
  ]) {
    const result = runCli(arguments_);
    if (result.status !== 0)
      failures.push(
        `CLI help failed for "${arguments_.join(' ')}": ${result.stderr || result.stdout}`,
      );
  }
}

function checkDryRun() {
  const home = path.join(os.tmpdir(), `omnibranch-docs-${process.pid}`);
  const result = runCli(
    ['skill', 'install', '--target', 'agents', '--scope', 'user', '--dry-run', '--json'],
    {
      ...process.env,
      HOME: home,
      USERPROFILE: home,
      CODEX_HOME: path.join(home, '.codex'),
      XDG_CONFIG_HOME: path.join(home, '.config'),
    },
  );
  if (result.status !== 0) {
    failures.push(`CLI dry-run failed: ${result.stderr || result.stdout}`);
    return;
  }
  try {
    const envelope = JSON.parse(result.stdout);
    if (envelope.ok !== true || envelope.dryRun !== true || envelope.command !== 'skill install')
      failures.push('CLI dry-run returned an unexpected stable envelope');
  } catch {
    failures.push(`CLI dry-run returned invalid JSON: ${result.stdout}`);
  }
}

function runCli(arguments_, environment = process.env) {
  const built = path.join(root, 'apps', 'cli', 'dist', 'main.cjs');
  const source = path.join(root, 'apps', 'cli', 'src', 'main.ts');
  const tsx = path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const target = existsSync(built) ? [built, ...arguments_] : [tsx, source, ...arguments_];
  return spawnSync(process.execPath, target, {
    cwd: root,
    env: environment,
    encoding: 'utf8',
    windowsHide: true,
  });
}

function existsSync(candidate) {
  try {
    return statSync(candidate).isFile();
  } catch {
    return false;
  }
}

function isInside(parent, candidate) {
  const value = path.relative(path.resolve(parent), path.resolve(candidate));
  return (
    value === '' ||
    (!value.startsWith(`..${path.sep}`) && value !== '..' && !path.isAbsolute(value))
  );
}

function relative(file) {
  return path.relative(root, file).replaceAll('\\', '/');
}
