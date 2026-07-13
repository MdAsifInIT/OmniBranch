import { mkdir, mkdtemp, readFile, readdir, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { FakeClock, SequenceIdGenerator } from '@omnibranch/platform';

import { SkillInstaller } from './index.js';

async function fixture(
  detectedTargets: readonly ('codex' | 'claude' | 'opencode' | 'antigravity' | 'agents')[] = [],
) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'omnibranch-installer-'));
  const home = path.join(root, 'home');
  const project = path.join(root, 'project');
  const payload = path.join(root, 'payload');
  await mkdir(path.join(payload, 'references'), { recursive: true });
  await mkdir(path.join(payload, 'scripts'), { recursive: true });
  await mkdir(home, { recursive: true });
  await mkdir(project, { recursive: true });
  await writeFile(
    path.join(payload, 'SKILL.md'),
    `---\nname: omnibranch\ndescription: Deterministic repository orchestration.\n---\n\n# OmniBranch\n\nSee [policy](references/policy.md).\n`,
  );
  await writeFile(
    path.join(payload, 'metadata.json'),
    JSON.stringify({ name: 'omnibranch', version: '0.2.0' }),
  );
  await writeFile(path.join(payload, 'references', 'policy.md'), '# Policy\n');
  await writeFile(path.join(payload, 'scripts', 'validate.mjs'), 'console.log("ok");\n');
  const installer = new SkillInstaller(
    payload,
    {
      homeDirectory: home,
      detectedTargets,
      env: {
        HOME: home,
        USERPROFILE: home,
        CODEX_HOME: path.join(home, '.codex'),
        XDG_CONFIG_HOME: path.join(home, '.config'),
      },
    },
    new FakeClock(new Date('2026-07-13T00:00:00Z')),
    new SequenceIdGenerator('install'),
  );
  return { root, home, project, payload, installer };
}

describe('SkillInstaller target resolution', () => {
  it('maps every user target to its canonical destination', async () => {
    const { home, installer } = await fixture();
    const targets = await installer.targets('user');
    expect(targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target: 'codex',
          destination: path.join(home, '.codex', 'skills', 'omnibranch'),
        }),
        expect.objectContaining({
          target: 'claude',
          destination: path.join(home, '.claude', 'skills', 'omnibranch'),
        }),
        expect.objectContaining({
          target: 'opencode',
          destination: path.join(home, '.config', 'opencode', 'skills', 'omnibranch'),
        }),
        expect.objectContaining({
          target: 'antigravity',
          destination: path.join(home, '.gemini', 'config', 'skills', 'omnibranch'),
        }),
        expect.objectContaining({
          target: 'agents',
          destination: path.join(home, '.agents', 'skills', 'omnibranch'),
        }),
      ]),
    );
  });

  it('deduplicates shared project destinations and skips unverified Codex scope', async () => {
    const { project, installer } = await fixture();
    const plan = await installer.plan({
      action: 'install',
      target: 'all',
      scope: 'project',
      projectRoot: project,
      dryRun: true,
    });
    expect(plan.operations).toHaveLength(3);
    expect(
      plan.operations.find((operation) => operation.destination.includes('.agents'))?.targets,
    ).toEqual(['antigravity', 'agents']);
    expect(plan.warnings.join(' ')).toContain('Codex project scope was skipped');
  });

  it('rejects an explicit project-scoped Codex install', async () => {
    const { project, installer } = await fixture();
    await expect(
      installer.plan({
        action: 'install',
        target: 'codex',
        scope: 'project',
        projectRoot: project,
        dryRun: true,
      }),
    ).rejects.toMatchObject({ code: 'TARGET_SCOPE_UNSUPPORTED' });
  });

  it('falls back from auto detection to the generic Agent Skills target', async () => {
    const { installer } = await fixture([]);
    const plan = await installer.plan({
      action: 'install',
      target: 'auto',
      scope: 'user',
      dryRun: true,
    });
    expect(plan.operations).toHaveLength(1);
    expect(plan.operations[0]?.targets).toEqual(['agents']);
    expect(plan.warnings).toHaveLength(1);
  });
});

describe('SkillInstaller lifecycle', () => {
  it('runs the managed lifecycle across every user provider in one transaction set', async () => {
    const { payload, installer } = await fixture();
    const request = { target: 'all' as const, scope: 'user' as const, dryRun: false };
    await expect(installer.install(request)).resolves.toHaveLength(5);
    expect(await installer.status('all', 'user')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ target: ['codex'], managed: true }),
        expect.objectContaining({ target: ['claude'], managed: true }),
        expect.objectContaining({ target: ['opencode'], managed: true }),
        expect.objectContaining({ target: ['antigravity'], managed: true }),
        expect.objectContaining({ target: ['agents'], managed: true }),
      ]),
    );
    await writeFile(path.join(payload, 'references', 'policy.md'), '# Provider update\n');
    await expect(installer.update(request)).resolves.toHaveLength(5);
    await expect(installer.uninstall(request)).resolves.toHaveLength(5);
    await expect(installer.rollback(request)).resolves.toHaveLength(5);
  }, 20_000);

  it('installs, reports, updates, uninstalls, and rolls back managed evidence', async () => {
    const { home, payload, installer } = await fixture(['agents']);
    const request = { target: 'agents' as const, scope: 'user' as const, dryRun: false };
    const installed = await installer.install(request);
    const destination = path.join(home, '.agents', 'skills', 'omnibranch');
    expect(installed[0]).toMatchObject({
      action: 'install',
      payloadVersion: '0.2.0',
      active: true,
    });
    expect(await readFile(path.join(destination, 'SKILL.md'), 'utf8')).toContain('OmniBranch');
    expect(await installer.status('agents', 'user')).toEqual([
      expect.objectContaining({ installed: true, managed: true, modified: false }),
    ]);

    await writeFile(path.join(payload, 'references', 'policy.md'), '# Updated policy\n');
    const updated = await installer.update(request);
    expect(updated[0]).toMatchObject({
      action: 'update',
      previousReceiptId: installed[0]?.receiptId,
    });

    const removed = await installer.uninstall(request);
    expect(removed[0]).toMatchObject({
      action: 'uninstall',
      previousReceiptId: updated[0]?.receiptId,
    });
    expect(await installer.status('agents', 'user')).toEqual([
      expect.objectContaining({ installed: false, managed: false }),
    ]);

    const restored = await installer.rollback(request);
    expect(restored[0]).toMatchObject({ action: 'rollback', payloadVersion: '0.2.0' });
    expect(await readFile(path.join(destination, 'references', 'policy.md'), 'utf8')).toBe(
      '# Updated policy\n',
    );
  });

  it('refuses unmanaged and modified destinations without explicit authority', async () => {
    const { home, installer } = await fixture(['agents']);
    const destination = path.join(home, '.agents', 'skills', 'omnibranch');
    await mkdir(destination, { recursive: true });
    await writeFile(path.join(destination, 'SKILL.md'), 'unmanaged');
    await expect(
      installer.install({ target: 'agents', scope: 'user', dryRun: false }),
    ).rejects.toMatchObject({ code: 'UNMANAGED_CONFLICT' });
    await installer.install({ target: 'agents', scope: 'user', dryRun: false, replace: true });
    await writeFile(path.join(destination, 'SKILL.md'), 'locally modified');
    await expect(
      installer.update({ target: 'agents', scope: 'user', dryRun: false }),
    ).rejects.toMatchObject({ code: 'MODIFIED_INSTALLATION' });
    await expect(
      installer.update({ target: 'agents', scope: 'user', dryRun: false, force: true }),
    ).resolves.toHaveLength(1);
  });

  it('leaves dry-run plans side-effect free', async () => {
    const { home, installer } = await fixture(['claude']);
    const plan = await installer.plan({
      action: 'install',
      target: 'claude',
      scope: 'user',
      dryRun: true,
    });
    expect(plan.operations[0]?.mode).toBe('create');
    await expect(
      readFile(path.join(home, '.omnibranch', 'installer', 'installations.json')),
    ).rejects.toThrow();
    await expect(accessPath(path.join(home, '.claude'))).resolves.toBe(false);
  });

  it('treats repeated installation and update of identical content as no-ops', async () => {
    const { installer } = await fixture(['agents']);
    const request = { target: 'agents' as const, scope: 'user' as const, dryRun: false };
    await expect(installer.install(request)).resolves.toHaveLength(1);
    await expect(installer.install(request)).resolves.toEqual([]);
    await expect(installer.update(request)).resolves.toEqual([]);
    await expect(
      installer.plan({ ...request, action: 'install', dryRun: true }),
    ).resolves.toMatchObject({ operations: [expect.objectContaining({ mode: 'noop' })] });
  });

  it('recovers a prepared transaction by removing only its staging path', async () => {
    const { home, installer } = await fixture();
    const stateRoot = path.join(home, '.omnibranch', 'installer');
    const destination = path.join(home, '.agents', 'skills', 'omnibranch');
    const stagingPath = `${destination}.omnibranch-stage-recovery`;
    await mkdir(stagingPath, { recursive: true });
    await mkdir(stateRoot, { recursive: true });
    await writeFile(
      path.join(stateRoot, 'journal.json'),
      JSON.stringify({
        schemaVersion: 'omnibranch.dev/skill-install/v1',
        transactionId: 'recovery',
        action: 'install',
        phase: 'prepared',
        destination,
        stagingPath,
        updatedAt: '2026-07-13T00:00:00Z',
      }),
    );
    await expect(installer.recover('user')).resolves.toEqual([
      'removed_staging',
      'cleared_journal',
    ]);
    await expect(accessPath(stagingPath)).resolves.toBe(false);
  });
});

describe('SkillInstaller security', () => {
  it('rejects a symlink in the canonical payload', async () => {
    const { root, payload, installer } = await fixture();
    const outside = path.join(root, 'outside');
    await mkdir(outside);
    await symlink(
      outside,
      path.join(payload, 'references', 'escape'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    await expect(
      installer.plan({ action: 'install', target: 'agents', scope: 'user', dryRun: true }),
    ).rejects.toMatchObject({ code: 'INTEGRITY_FAILURE' });
  });

  it('rejects a project destination that escapes through a junction', async () => {
    const { root, project, installer } = await fixture();
    const outside = path.join(root, 'outside');
    await mkdir(outside);
    await mkdir(path.join(project, '.agents'));
    await symlink(
      outside,
      path.join(project, '.agents', 'skills'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    await expect(
      installer.plan({
        action: 'install',
        target: 'agents',
        scope: 'project',
        projectRoot: project,
        dryRun: true,
      }),
    ).rejects.toMatchObject({ code: 'CONTAINMENT_FAILURE' });
  });

  it('refuses a hostile recovery journal before touching its staging path', async () => {
    const { root, home, installer } = await fixture();
    const stateRoot = path.join(home, '.omnibranch', 'installer');
    const outside = path.join(root, 'outside');
    await mkdir(outside);
    await mkdir(stateRoot, { recursive: true });
    await writeFile(path.join(outside, 'evidence.txt'), 'preserve');
    await writeFile(
      path.join(stateRoot, 'journal.json'),
      JSON.stringify({
        schemaVersion: 'omnibranch.dev/skill-install/v1',
        transactionId: 'hostile',
        action: 'install',
        phase: 'prepared',
        destination: path.join(home, '.agents', 'skills', 'omnibranch'),
        stagingPath: outside,
        updatedAt: '2026-07-13T00:00:00Z',
      }),
    );
    await expect(installer.recover('user')).rejects.toMatchObject({
      code: 'RECOVERY_INCOMPLETE',
    });
    await expect(readFile(path.join(outside, 'evidence.txt'), 'utf8')).resolves.toBe('preserve');
  });

  it('serializes competing installers with a repository lock', async () => {
    const { installer } = await fixture(['agents']);
    const request = { target: 'agents' as const, scope: 'user' as const, dryRun: false };
    const results = await Promise.allSettled([
      installer.install(request),
      installer.install(request),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
  });
});

async function accessPath(candidate: string): Promise<boolean> {
  try {
    await readFile(candidate);
    return true;
  } catch {
    try {
      await readdir(candidate);
      return true;
    } catch {
      return false;
    }
  }
}
