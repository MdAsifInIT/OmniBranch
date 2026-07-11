#!/usr/bin/env node
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { Command } from 'commander';

import { MockAiAdapter } from '@omnibranch/adapters';
import type { CliEnvelope, Diagnostic, PolicyDecision } from '@omnibranch/contracts';
import {
  ExecaProcessRunner,
  hostFacts,
  safeCreateFile,
  SequenceIdGenerator,
  SystemClock,
} from '@omnibranch/platform';
import {
  DeterministicPolicyEngine,
  loadWorkspacePlan,
  LocalCampaignService,
  RepositoryDiscovery,
} from '@omnibranch/runtime';

import { DEFAULT_CONFIG } from './index.js';

interface Globals {
  readonly json?: boolean;
  readonly dryRun?: boolean;
  readonly config?: string;
}

interface CommandResult {
  readonly data: unknown;
  readonly warnings?: readonly string[];
  readonly policyDecisions?: readonly PolicyDecision[];
}

const cli = new Command()
  .name('omnibranch')
  .description('Deterministic branch and worktree orchestration for bounded AI development work.')
  .version('0.1.0')
  .option('--json', 'emit a stable machine-readable envelope')
  .option('--dry-run', 'plan mutations without executing them', false)
  .option('--config <path>', 'WorkspacePlan path', '.omnibranch/workspace.yaml');

cli
  .command('init')
  .description('Initialize conservative repository-local configuration.')
  .option('--name <name>', 'workspace name')
  .action(async (options: { readonly name?: string }) => {
    await execute('init', async (globals) => {
      const facts = await discover();
      const configPath = path.resolve(facts.root, globals.config ?? '.omnibranch/workspace.yaml');
      const name =
        options.name ??
        path
          .basename(facts.root)
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, '-');
      if (globals.dryRun === true)
        return { data: { created: false, planned: true, configPath, name } };
      await mkdir(path.dirname(configPath), { recursive: true });
      const created = await safeCreateFile(
        configPath,
        DEFAULT_CONFIG.replace('name: local-workspace', `name: ${name}`),
      );
      return { data: { created, configPath, repository: facts.root } };
    });
  });

cli
  .command('doctor')
  .description('Inspect host and repository prerequisites without mutation.')
  .action(async () => {
    await execute('doctor', async () => {
      const runner = new ExecaProcessRunner();
      const facts = await discover(runner);
      const [git, pnpm] = await Promise.all([
        runner.run({ executable: 'git', args: ['--version'], cwd: facts.root }),
        runner.run({ executable: 'pnpm', args: ['--version'], cwd: facts.root }),
      ]);
      return {
        data: {
          healthy:
            git.exitCode === 0 &&
            pnpm.exitCode === 0 &&
            Number(process.versions.node.split('.')[0]) >= 22,
          host: hostFacts(),
          tools: { git: git.stdout.trim(), pnpm: pnpm.stdout.trim() },
          repository: facts,
        },
      };
    });
  });

const config = cli.command('config').description('WorkspacePlan operations.');
config
  .command('validate')
  .argument('[path]', 'configuration path')
  .action(async (configPath?: string) => {
    await execute('config validate', async (globals) => {
      const resolved = path.resolve(configPath ?? globals.config ?? '.omnibranch/workspace.yaml');
      const result = await loadWorkspacePlan(resolved);
      if (!result.valid) throw new ConfigValidationError(result.diagnostics);
      return {
        data: {
          path: resolved,
          valid: true,
          apiVersion: result.plan?.apiVersion,
          name: result.plan?.metadata.name,
          normalized: result.redactedSnapshot,
        },
      };
    });
  });

const campaign = cli.command('campaign').description('Campaign operations.');
campaign
  .command('create')
  .requiredOption('--name <name>', 'campaign name')
  .action(async (options: { readonly name: string }) => {
    await execute('campaign create', async (globals) => {
      if (globals.dryRun === true) return { data: { planned: true, name: options.name } };
      return { data: await (await service()).create(options.name) };
    });
  });

cli
  .command('plan')
  .requiredOption('--campaign <id>', 'campaign id')
  .action(async (options: { readonly campaign: string }) => {
    await execute('plan', async (globals) => {
      if (globals.dryRun === true) {
        return { data: { planned: true, campaignId: options.campaign, fixtureItems: 2 } };
      }
      return { data: await (await service()).planFixture(options.campaign) };
    });
  });

cli
  .command('run')
  .requiredOption('--campaign <id>', 'campaign id')
  .action(async (options: { readonly campaign: string }) => {
    await execute('run', async (globals) => {
      if (globals.dryRun === true) {
        return { data: { planned: true, campaignId: options.campaign, workers: 2 } };
      }
      const adapter = new MockAiAdapter(new SystemClock(), new SequenceIdGenerator('mock'));
      return { data: await (await service()).runFixture(options.campaign, adapter) };
    });
  });

cli
  .command('status')
  .requiredOption('--campaign <id>', 'campaign id')
  .action(async (options: { readonly campaign: string }) => {
    await execute('status', async () => ({
      data: await (await service()).status(options.campaign),
    }));
  });

cli
  .command('resume')
  .requiredOption('--campaign <id>', 'campaign id')
  .action(async (options: { readonly campaign: string }) => {
    await execute('resume', async (globals) => {
      const campaignService = await service();
      const before = await campaignService.reconcile();
      if (globals.dryRun === true) return { data: { planned: true, reconciliation: before } };
      const adapter = new MockAiAdapter(new SystemClock(), new SequenceIdGenerator('resume'));
      const results = await campaignService.runFixture(options.campaign, adapter);
      return { data: { reconciliation: before, results } };
    });
  });

cli
  .command('validate')
  .description('Validate the active WorkspacePlan and campaign state.')
  .action(async () => {
    await execute('validate', async (globals) => {
      const configPath = path.resolve(globals.config ?? '.omnibranch/workspace.yaml');
      const result = await loadWorkspacePlan(configPath);
      if (!result.valid) throw new ConfigValidationError(result.diagnostics);
      return { data: { config: true, diagnostics: result.diagnostics } };
    });
  });

cli
  .command('review')
  .requiredOption('--campaign <id>', 'campaign id')
  .action(async (options: { readonly campaign: string }) => {
    await execute('review', async () => {
      const campaignService = await service();
      return {
        data: {
          status: await campaignService.status(options.campaign),
          reports: await campaignService.report(options.campaign),
        },
      };
    });
  });

cli
  .command('promote')
  .requiredOption('--campaign <id>', 'campaign id')
  .action(async (options: { readonly campaign: string }) => {
    await execute('promote', async (globals) => {
      const policy = new DeterministicPolicyEngine();
      const decision = policy.evaluate(
        {
          actionClass: 'git_write_safe',
          actorId: 'cli-operator',
          target: options.campaign,
          dryRun: globals.dryRun ?? false,
        },
        {
          now: new Date().toISOString(),
          repositoryRoot: (await discover()).root,
          approvals: [],
          explicitAllowances: [],
          deniedActions: [],
          externalAllowlist: [],
        },
      );
      return {
        data: { promoted: false, campaignId: options.campaign, reason: decision.reasonCode },
        policyDecisions: [decision],
      };
    });
  });

cli
  .command('reconcile')
  .requiredOption('--campaign <id>', 'campaign id')
  .action(async () => {
    await execute('reconcile', async () => ({
      data: await (await service()).reconcile(),
    }));
  });

cli
  .command('cleanup')
  .description('Inspect managed worktrees and report safe cleanup state.')
  .action(async () => {
    await execute('cleanup', async (globals) => {
      const facts = await discover();
      const managed = facts.worktrees.filter((worktree) =>
        worktree.branch?.startsWith('omnibranch/work/'),
      );
      return {
        data: {
          dryRun: globals.dryRun ?? false,
          managedWorktrees: managed,
          removed: 0,
          note: 'Completed fixture runs clean their contained worktrees automatically.',
        },
      };
    });
  });

cli
  .command('report')
  .requiredOption('--campaign <id>', 'campaign id')
  .action(async (options: { readonly campaign: string }) => {
    await execute('report', async () => ({
      data: await (await service()).report(options.campaign),
    }));
  });

class ConfigValidationError extends Error {
  public constructor(readonly diagnostics: readonly Diagnostic[]) {
    super('Configuration validation failed.');
  }
}

async function discover(runner = new ExecaProcessRunner()) {
  return new RepositoryDiscovery(runner).discover(process.cwd());
}

async function service(): Promise<LocalCampaignService> {
  const runner = new ExecaProcessRunner();
  const facts = await discover(runner);
  return new LocalCampaignService(facts.root, runner);
}

async function execute(
  command: string,
  operation: (globals: Globals) => Promise<CommandResult>,
): Promise<void> {
  const globals = cli.opts<Globals>();
  try {
    const result = await operation(globals);
    emit(
      {
        ok: true,
        command,
        data: result.data,
        warnings: result.warnings ?? [],
        policyDecisions: result.policyDecisions ?? [],
        dryRun: globals.dryRun ?? false,
      },
      globals.json ?? false,
    );
  } catch (error) {
    emit(
      {
        ok: false,
        command,
        warnings: [],
        policyDecisions: [],
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
                code: 'COMMAND_FAILED',
                message: error instanceof Error ? error.message : String(error),
                retryability: 'non_retryable',
              },
      },
      globals.json ?? false,
    );
    process.exitCode = 1;
  }
}

function emit(envelope: CliEnvelope, json: boolean): void {
  const output = `${JSON.stringify(envelope, null, json ? 0 : 2)}\n`;
  if (envelope.ok) process.stdout.write(output);
  else process.stderr.write(output);
}

await cli.parseAsync(process.argv);

export { cli };
