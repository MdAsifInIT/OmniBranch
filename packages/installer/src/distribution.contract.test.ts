import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const repositoryRoot = process.cwd();
const canonicalRoot = path.join(repositoryRoot, 'skills', 'omnibranch');

describe('provider distribution contracts', () => {
  it('keeps complete provider and package payloads identical to the canonical skill', async () => {
    const expected = await evidence(canonicalRoot);
    const copies = [
      ...['codex', 'claude', 'opencode', 'antigravity'].map((provider) =>
        path.join(canonicalRoot, 'generated', provider, 'omnibranch'),
      ),
      path.join(repositoryRoot, 'apps', 'cli', 'skill', 'omnibranch'),
      path.join(repositoryRoot, 'distribution', 'claude-plugin', 'skills', 'omnibranch'),
    ];
    for (const copy of copies) expect(await evidence(copy)).toEqual(expected);
  });

  it('publishes Codex UI metadata and a versioned Claude marketplace entry', async () => {
    const openAi = await readFile(path.join(canonicalRoot, 'agents', 'openai.yaml'), 'utf8');
    expect(openAi).toContain('display_name:');
    expect(openAi).toContain('short_description:');
    expect(openAi).toContain('default_prompt:');
    expect(openAi).not.toMatch(/^name:|^description:|^instructions:/m);

    const plugin = JSON.parse(
      await readFile(
        path.join(repositoryRoot, 'distribution', 'claude-plugin', '.claude-plugin', 'plugin.json'),
        'utf8',
      ),
    ) as Record<string, unknown>;
    const marketplace = JSON.parse(
      await readFile(path.join(repositoryRoot, '.claude-plugin', 'marketplace.json'), 'utf8'),
    ) as { name: string; plugins: readonly { source: string; version: string }[] };
    expect(plugin).toMatchObject({ name: 'omnibranch', version: '0.2.0' });
    expect(marketplace).toMatchObject({
      name: 'omnibranch-tools',
      plugins: [{ source: './distribution/claude-plugin', version: '0.2.0' }],
    });
    for (const script of ['generate-layouts.mjs', 'validate-skill.mjs']) {
      expect(await readFile(path.join(canonicalRoot, 'scripts', script), 'utf8')).toMatch(
        /^#!\/usr\/bin\/env node\r?\n/,
      );
    }
  });
});

async function evidence(root: string): Promise<readonly (readonly [string, string])[]> {
  const result: [string, string][] = [];
  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (entry.name === 'generated') continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile()) {
        result.push([
          path.relative(root, absolute).replaceAll('\\', '/'),
          createHash('sha256')
            .update(await readFile(absolute))
            .digest('hex'),
        ]);
      }
    }
  }
  await visit(root);
  return result;
}
