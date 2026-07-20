#!/usr/bin/env node
/* global console, process */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const newVersion = process.argv[2];
if (!newVersion || !/^\d+\.\d+\.\d+$/.test(newVersion)) {
  console.error('Usage: node bump-version.mjs <new-version> (e.g. 0.2.2)');
  process.exit(1);
}

const root = process.cwd();

// 1. Update package.json files
const packageJsons = [
  'package.json',
  'apps/cli/package.json',
  'packages/contracts/package.json',
  'packages/platform/package.json',
  'packages/adapters/package.json',
  'packages/installer/package.json',
  'packages/runtime/package.json',
];

for (const relPath of packageJsons) {
  const absPath = path.join(root, relPath);
  try {
    const content = await readFile(absPath, 'utf8');
    const json = JSON.parse(content);

    // Update version
    if (json.version) {
      json.version = newVersion;
    }

    await writeFile(absPath, JSON.stringify(json, null, 2) + '\n', 'utf8');
    console.log(`Updated ${relPath}`);
  } catch (err) {
    console.warn(`Could not update ${relPath}: ${err.message}`);
  }
}

// 2. Update skill metadata.json
const metadataPath = path.join(root, 'skills', 'omnibranch', 'metadata.json');
try {
  const metaContent = await readFile(metadataPath, 'utf8');
  const metaJson = JSON.parse(metaContent);
  metaJson.version = newVersion;
  await writeFile(metadataPath, JSON.stringify(metaJson, null, 2) + '\n', 'utf8');
  console.log(`Updated skills/omnibranch/metadata.json`);
} catch (err) {
  console.warn(`Could not update metadata.json: ${err.message}`);
}

// 3. Update distribution/claude-plugin/.claude-plugin/plugin.json
const pluginPath = path.join(
  root,
  'distribution',
  'claude-plugin',
  '.claude-plugin',
  'plugin.json',
);
try {
  const pluginContent = await readFile(pluginPath, 'utf8');
  const pluginJson = JSON.parse(pluginContent);
  pluginJson.version = newVersion;
  await writeFile(pluginPath, JSON.stringify(pluginJson, null, 2) + '\n', 'utf8');
  console.log(`Updated plugin.json`);
} catch (err) {
  console.warn(`Could not update plugin.json: ${err.message}`);
}

// 4. Update .claude-plugin/marketplace.json
const marketplacePath = path.join(root, '.claude-plugin', 'marketplace.json');
try {
  const marketContent = await readFile(marketplacePath, 'utf8');
  const marketJson = JSON.parse(marketContent);
  if (marketJson.plugins && marketJson.plugins[0]) {
    marketJson.plugins[0].version = newVersion;
  }
  await writeFile(marketplacePath, JSON.stringify(marketJson, null, 2) + '\n', 'utf8');
  console.log(`Updated marketplace.json`);
} catch (err) {
  console.warn(`Could not update marketplace.json: ${err.message}`);
}

console.log(`\nSuccessfully bumped version to ${newVersion}`);
