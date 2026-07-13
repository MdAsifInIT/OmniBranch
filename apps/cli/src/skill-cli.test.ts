import { mkdir, mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { execa } from 'execa';
import { describe, expect, it } from 'vitest';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const tsxCli = path.join(repositoryRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const cliEntry = path.join(repositoryRoot, 'apps', 'cli', 'src', 'main.ts');

describe('omnibranch skill CLI', () => {
  it('runs the isolated user lifecycle through stable JSON envelopes', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'omnibranch-skill-cli-'));
    const home = path.join(root, 'home');
    await mkdir(home);
    const environment = {
      ...process.env,
      HOME: home,
      USERPROFILE: home,
      CODEX_HOME: path.join(home, '.codex'),
      XDG_CONFIG_HOME: path.join(home, '.config'),
    };

    const targets = await run(['skill', 'targets', '--scope', 'user', '--json'], environment);
    expect(targets).toMatchObject({ ok: true, command: 'skill targets', dryRun: false });

    const preview = await run(
      ['skill', 'install', '--target', 'agents', '--scope', 'user', '--dry-run', '--json'],
      environment,
    );
    expect(preview).toMatchObject({
      ok: true,
      command: 'skill install',
      dryRun: true,
      data: { plan: { operations: [{ mode: 'create' }] }, receipts: [] },
      policyDecisions: [{ outcome: 'force_dry_run' }],
    });

    const installed = await run(
      ['skill', 'install', '--target', 'agents', '--scope', 'user', '--json'],
      environment,
    );
    expect(installed).toMatchObject({
      ok: true,
      data: { receipts: [{ action: 'install', payloadVersion: '0.2.0' }] },
    });

    const status = await run(
      ['skill', 'status', '--target', 'agents', '--scope', 'user', '--json'],
      environment,
    );
    expect(status).toMatchObject({
      ok: true,
      data: [{ installed: true, managed: true, modified: false }],
    });

    const removed = await run(
      ['skill', 'uninstall', '--target', 'agents', '--scope', 'user', '--json'],
      environment,
    );
    expect(removed).toMatchObject({ ok: true, data: { receipts: [{ action: 'uninstall' }] } });
  }, 30_000);
});

async function run(
  arguments_: readonly string[],
  environment: Readonly<Record<string, string | undefined>>,
): Promise<Record<string, unknown>> {
  const result = await execa(process.execPath, [tsxCli, cliEntry, ...arguments_], {
    cwd: repositoryRoot,
    env: environment,
  });
  return JSON.parse(result.stdout) as Record<string, unknown>;
}
