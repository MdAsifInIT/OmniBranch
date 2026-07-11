#!/usr/bin/env node
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Command } from 'commander';

import type { CliEnvelope, Diagnostic, PolicyDecision } from '@omnibranch/contracts';
import { ExecaProcessRunner, hostFacts, safeCreateFile } from '@omnibranch/platform';
import { loadWorkspacePlan, RepositoryDiscovery } from '@omnibranch/runtime';

const VERSION = '0.1.0';
const DEFAULT_CONFIG = `apiVersion: omnibranch.dev/v1alpha1
kind: WorkspacePlan
metadata:
  name: local-workspace
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
      requiredFor: [scm.push, scm.pull_request]
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

interface GlobalOptions {
  readonly json?: boolean;
  readonly dryRun?: boolean;
  readonly config?: string;
}

const program = new Command()
  .name('omnibranch')
  .description('Deterministic branch and worktree orchestration for bounded AI development work.')
  .version(VERSION)
  .option('--json', 'emit a stable machine-readable envelope')
  .option('--dry-run', 'plan mutations without executing them', false)
  .option('--config <path>', 'WorkspacePlan path', '.omnibranch/workspace.yaml');

program
  .command('init')
  .description('Initialize conservative repository-local OmniBranch configuration.')
  .option('--name <name>', 'workspace name')
  .action(async (options: { readonly name?: string }) => {
    await execute('init', async (globals) => {
      const discovery = new RepositoryDiscovery(new ExecaProcessRunner());
      const facts = await discovery.discover(process.cwd());
      const configPath = path.resolve(facts.root, globals.config ?? '.omnibranch/workspace.yaml');
      await mkdir(path.dirname(configPath), { recursive: true });
      const name =
        options.name ??
        path
          .basename(facts.root)
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, '-');
      const created = await safeCreateFile(
        configPath,
        DEFAULT_CONFIG.replace('name: local-workspace', `name: ${name}`),
      );

      return { created, configPath, repository: facts.root };
    });
  });

program
  .command('doctor')
  .description('Inspect host and repository prerequisites without mutation.')
  .action(async () => {
    await execute('doctor', async () => {
      const runner = new ExecaProcessRunner();
      const discovery = new RepositoryDiscovery(runner);
      const repository = await discovery.discover(process.cwd());
      const git = await runner.run({
        executable: 'git',
        args: ['--version'],
        cwd: repository.root,
      });
      const pnpm = await runner.run({
        executable: 'pnpm',
        args: ['--version'],
        cwd: repository.root,
      });
      return {
        healthy:
          git.exitCode === 0 &&
          pnpm.exitCode === 0 &&
          Number(process.versions.node.split('.')[0]) >= 22,
        host: hostFacts(),
        tools: { git: git.stdout.trim(), pnpm: pnpm.stdout.trim() },
        repository,
      };
    });
  });

const configCommand = program.command('config').description('WorkspacePlan operations.');
configCommand
  .command('validate')
  .description('Validate and normalize a WorkspacePlan.')
  .argument('[path]', 'configuration path')
  .action(async (configPath?: string) => {
    await execute('config validate', async (globals) => {
      const resolved = path.resolve(configPath ?? globals.config ?? '.omnibranch/workspace.yaml');
      const result = await loadWorkspacePlan(resolved);
      if (!result.valid) throw new ConfigValidationError(result.diagnostics);
      return {
        path: resolved,
        valid: true,
        apiVersion: result.plan?.apiVersion,
        name: result.plan?.metadata.name,
        normalized: result.redactedSnapshot,
      };
    });
  });

for (const name of [
  'campaign create',
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
]) {
  const [commandName, subcommand] = name.split(' ');
  if (subcommand === undefined) {
    program
      .command(commandName!)
      .description(`${name} is implemented by the campaign runtime.`)
      .action(async () => {
        await execute(name, async () => ({ status: 'not_initialized', command: name }));
      });
  } else {
    const parent =
      program.commands.find((command) => command.name() === commandName) ??
      program.command(commandName!).description(`${commandName} operations.`);
    parent
      .command(subcommand)
      .description(`${name} is implemented by the campaign runtime.`)
      .action(async () => {
        await execute(name, async () => ({ status: 'not_initialized', command: name }));
      });
  }
}

class ConfigValidationError extends Error {
  public constructor(readonly diagnostics: readonly Diagnostic[]) {
    super('Configuration validation failed.');
  }
}

async function execute<T>(
  command: string,
  operation: (globals: GlobalOptions) => Promise<T>,
): Promise<void> {
  const globals = program.opts<GlobalOptions>();
  try {
    const data = await operation(globals);
    emit(
      {
        ok: true,
        command,
        data,
        warnings: [],
        policyDecisions: [],
        dryRun: globals.dryRun ?? false,
      },
      globals.json ?? false,
    );
  } catch (error) {
    const envelope: CliEnvelope = {
      ok: false,
      command,
      warnings: [],
      policyDecisions: [] as PolicyDecision[],
      dryRun: globals.dryRun ?? false,
      error:
        error instanceof ConfigValidationError
          ? {
              code: 'CONFIG_INVALID',
              message: error.message,
              retryability: 'non_retryable',
              details: { diagnostics: error.diagnostics },
            }
          : {
              code: 'UNEXPECTED',
              message: error instanceof Error ? error.message : String(error),
              retryability: 'non_retryable',
            },
    };
    emit(envelope, globals.json ?? false);
    process.exitCode = 1;
  }
}

function emit(envelope: CliEnvelope, json: boolean): void {
  if (json) {
    process.stdout.write(`${JSON.stringify(envelope)}\n`);
    return;
  }
  if (envelope.ok) {
    process.stdout.write(`${envelope.command}: ok\n`);
    if (envelope.data !== undefined)
      process.stdout.write(`${JSON.stringify(envelope.data, null, 2)}\n`);
  } else {
    process.stderr.write(`${envelope.command}: ${envelope.error?.message ?? 'failed'}\n`);
    const diagnostics = envelope.error?.details?.['diagnostics'];
    if (Array.isArray(diagnostics)) {
      for (const item of diagnostics) process.stderr.write(`- ${JSON.stringify(item)}\n`);
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await program.parseAsync(process.argv);
}

export { DEFAULT_CONFIG, program };
