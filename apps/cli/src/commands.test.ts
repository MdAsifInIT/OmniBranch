import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { CliEnvelope } from '@omnibranch/contracts';
import { execa } from 'execa';
import { describe, expect, it } from 'vitest';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const tsxCli = path.join(repositoryRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const cliEntry = path.join(repositoryRoot, 'apps', 'cli', 'src', 'main.ts');

const VALID_CONFIG_YAML = `apiVersion: omnibranch.dev/v1alpha1
kind: WorkspacePlan
metadata:
  name: valid-test-workspace
runtime:
  workspaceRoot: .
  tempRoot: \${gitCommonDir}/omnibranch/tmp
  worktreeRoot: \${repoParent}/.omnibranch-worktrees/\${metadata.name}
branchTopology:
  trunk: auto
  integrationBranches:
    - name: omnibranch/integration
      protect: true
  laneBranches:
    routine:
      prefix: omnibranch/routine/
      base: omnibranch/integration
      ephemeral: false
  attemptBranches:
    prefix: omnibranch/work/
    baseFromLane: true
lanes:
  routine:
    priority: 100
    maxConcurrentRuns: 1
    maxConcurrentItems: 1
    branchClass: routine
    approvals:
      requiredFor: [scm.push]
ownership:
  defaultMode: exclusive
  sets:
    workspace:
      globs: [src/**]
      lanes: [routine]
commands:
  validate:
    - id: test
      run:
        windows: pnpm test
        posix: pnpm test
policies:
  defaultAction: require_approval
  packs:
    - name: baseline-safe-defaults
  rules: []
adapters:
  scm:
    provider: local
    mode: dry-run
  ci:
    provider: local
    mode: execute
state:
  projection:
    backend: sqlite
    path: \${gitCommonDir}/omnibranch/state.db
  eventStore:
    backend: jsonl
    path: \${gitCommonDir}/omnibranch/events.jsonl
  snapshots:
    enabled: true
    interval: 250
reporting:
  outputRoot: \${gitCommonDir}/omnibranch/reports
  formats: [markdown, json]
  includeTelemetry: false
  redact:
    secrets: true
    envValues: true
    userPaths: false
`;

const INVALID_CONFIG_YAML = `apiVersion: omnibranch.dev/v1alpha1
kind: InvalidKind
metadata:
  name: invalid-workspace
`;

interface RunResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly json?: CliEnvelope | undefined;
}

async function runCli(
  arguments_: readonly string[],
  cwd: string = repositoryRoot,
): Promise<RunResult> {
  const result = await execa(process.execPath, [tsxCli, cliEntry, ...arguments_], {
    cwd,
    reject: false,
    env: { ...process.env },
  });

  let json: CliEnvelope | undefined;
  try {
    const text = result.stdout.trim() || result.stderr.trim();
    json = JSON.parse(text) as CliEnvelope;
  } catch {
    // Not valid JSON
  }

  return {
    exitCode: result.exitCode ?? 1,
    stdout: result.stdout,
    stderr: result.stderr,
    json,
  };
}

describe('CLI command wiring and error formatting', () => {
  it('1. validate command with valid plan -> exit 0', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'omnibranch-cmd-test-'));
    const configPath = path.join(tmpDir, 'workspace.yaml');
    await writeFile(configPath, VALID_CONFIG_YAML, 'utf8');

    const result = await runCli(['validate', configPath, '--json'], tmpDir);
    expect(result.exitCode).toBe(0);
    expect(result.json).toBeDefined();
    expect(result.json?.ok).toBe(true);
    expect(result.json?.command).toBe('validate');
  }, 30_000);

  it('2. validate command with invalid plan -> exit 2, ConfigValidationError', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'omnibranch-cmd-test-'));
    const configPath = path.join(tmpDir, 'workspace.yaml');
    await writeFile(configPath, INVALID_CONFIG_YAML, 'utf8');

    const result = await runCli(['validate', configPath, '--json'], tmpDir);
    expect(result.exitCode).toBe(2);
    expect(result.json).toBeDefined();
    expect(result.json?.ok).toBe(false);
    expect(result.json?.error?.code).toBe('CONFIG_INVALID');
    expect(result.json?.error?.message).toContain('Configuration validation failed');
  }, 30_000);

  it('3. --json output is valid CliEnvelope JSON', async () => {
    const result = await runCli(['doctor', '--json']);
    expect(result.json).toBeDefined();
    expect(typeof result.json?.ok).toBe('boolean');
    expect(typeof result.json?.command).toBe('string');
    expect(Array.isArray(result.json?.warnings)).toBe(true);
    expect(Array.isArray(result.json?.policyDecisions)).toBe(true);
    expect(typeof result.json?.dryRun).toBe('boolean');
  }, 30_000);

  it('4. Error formatting maps all known error types to user-friendly messages', async () => {
    // Test ConfigValidationError mapping
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'omnibranch-cmd-test-'));
    const configPath = path.join(tmpDir, 'workspace.yaml');
    await writeFile(configPath, INVALID_CONFIG_YAML, 'utf8');
    const configErr = await runCli(['validate', configPath, '--json'], tmpDir);
    expect(configErr.json?.error).toMatchObject({
      code: 'CONFIG_INVALID',
      retryability: 'non_retryable',
    });
    expect(configErr.json?.error?.message).toContain('Configuration validation failed');

    // Test InstallerError mapping
    const installerErr = await runCli(['skill', 'targets', '--target', 'unknown-target', '--json']);
    expect(installerErr.json?.error).toMatchObject({
      code: 'INTEGRITY_FAILURE',
      retryability: 'non_retryable',
    });
    expect(installerErr.json?.error?.message).toContain('Unknown provider target');
  }, 30_000);

  it('5. status command with no campaign -> clear "no active campaign" message', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'omnibranch-cmd-test-'));
    await execa('git', ['init'], { cwd: tmpDir });

    const result = await runCli(['status', '--json'], tmpDir);
    expect(result.exitCode).toBe(0);
    expect(result.json).toBeDefined();
    expect(result.json?.ok).toBe(true);
    expect(result.json?.data).toMatchObject({
      active: false,
      message: 'no active campaign',
    });
  }, 30_000);
});
