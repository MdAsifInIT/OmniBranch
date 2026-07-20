#!/usr/bin/env node
import { access, mkdir } from 'node:fs/promises';
import path from 'node:path';

import { Command } from 'commander';

import { MockAiAdapter } from '@omnibranch/adapters';
import type {
  CliEnvelope,
  Diagnostic,
  InstallScope,
  PolicyDecision,
  ProviderTarget,
} from '@omnibranch/contracts';
import { InstallerError, SkillInstaller } from '@omnibranch/installer';
import {
  ExecaProcessRunner,
  hostFacts,
  safeCreateFile,
  SequenceIdGenerator,
  stableHash,
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

interface SkillOptions extends Globals {
  readonly target: ProviderTarget;
  readonly scope: InstallScope;
  readonly project?: string;
  readonly replace?: boolean;
  readonly force?: boolean;
}

const cli = new Command()
  .name('omnibranch')
  .description('Deterministic branch and worktree orchestration for bounded AI development work.')
  .version(process.env.__APP_VERSION__ ?? 'unknown')
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

const skill = cli.command('skill').description('Install and manage the OmniBranch Agent Skill.');

configureSkillCommand(skill.command('targets').description('List provider destinations.')).action(
  async (options: SkillOptions) => {
    options = effectiveSkillOptions(options);
    await execute(
      'skill targets',
      async () => {
        const context = await skillContext(options);
        return { data: await context.installer.targets(options.scope, context.projectRoot) };
      },
      options,
    );
  },
);

configureSkillCommand(skill.command('plan').description('Plan skill installation.')).action(
  async (options: SkillOptions) => {
    options = effectiveSkillOptions(options);
    await execute(
      'skill plan',
      async () => {
        const context = await skillContext(options);
        return {
          data: await context.installer.plan({
            action: 'install',
            target: options.target,
            scope: options.scope,
            dryRun: true,
            ...(context.projectRoot === undefined ? {} : { projectRoot: context.projectRoot }),
            ...(options.replace === undefined ? {} : { replace: options.replace }),
            ...(options.force === undefined ? {} : { force: options.force }),
          }),
        };
      },
      options,
    );
  },
);

for (const action of ['install', 'update', 'rollback', 'uninstall'] as const) {
  configureSkillCommand(
    skill.command(action).description(`${titleCase(action)} managed skill files.`),
  ).action(async (options: SkillOptions) => {
    options = effectiveSkillOptions(options);
    await execute(
      `skill ${action}`,
      async () => {
        const context = await skillContext(options);
        const decision = installerPolicyDecision(action, options.dryRun ?? false);
        const request = {
          target: options.target,
          scope: options.scope,
          dryRun: options.dryRun ?? false,
          ...(context.projectRoot === undefined ? {} : { projectRoot: context.projectRoot }),
          ...(options.replace === undefined ? {} : { replace: options.replace }),
          ...(options.force === undefined ? {} : { force: options.force }),
        };
        const plan = await context.installer.plan({ ...request, action });
        const receipts = await context.installer[action](request);
        return { data: { plan, receipts }, warnings: plan.warnings, policyDecisions: [decision] };
      },
      options,
    );
  });
}

configureSkillCommand(skill.command('status').description('Inspect managed installations.')).action(
  async (options: SkillOptions) => {
    options = effectiveSkillOptions(options);
    await execute(
      'skill status',
      async () => {
        const context = await skillContext(options);
        return {
          data: await context.installer.status(options.target, options.scope, context.projectRoot),
        };
      },
      options,
    );
  },
);

configureSkillCommand(
  skill.command('doctor').description('Verify payload and installation health.'),
).action(async (options: SkillOptions) => {
  options = effectiveSkillOptions(options);
  await execute(
    'skill doctor',
    async () => {
      const context = await skillContext(options);
      return { data: await context.installer.doctor(options.scope, context.projectRoot) };
    },
    options,
  );
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
  .description('Clean up branches and worktrees from completed campaigns.')
  .option('--campaign <id>', 'specific campaign to clean')
  .option('--stale', 'clean stale branches with expired leases', false)
  .option('--confirm', 'actually perform the cleanup (default is dry-run)', false)
  .action(async (options: { campaign?: string; stale?: boolean; confirm?: boolean }) => {
    await execute('cleanup', async (globals) => {
      const svc = await service();
      if (options.campaign) {
        return {
          data: await svc.cleanupCampaign(
            options.campaign,
            (options.confirm ?? false) && !(globals.dryRun ?? false),
          ),
        };
      }
      if (options.stale) {
        return {
          data: await svc.cleanupStale((options.confirm ?? false) && !(globals.dryRun ?? false)),
        };
      }
      // Default: report state without mutation
      const facts = await discover();
      const managed = facts.worktrees.filter((wt) => wt.branch?.startsWith('omnibranch/work/'));
      return {
        data: {
          dryRun: true,
          managedWorktrees: managed,
          hint: 'Use --campaign <id> --confirm or --stale --confirm to clean.',
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

const docs = cli.command('docs').description('Project documentation operations.');
docs
  .command('generate')
  .description('Generate .omnibranch/project_context.md from repository analysis.')
  .action(async () => {
    await execute('docs generate', async (globals) => {
      if (globals.dryRun === true)
        return { data: { planned: true, output: '.omnibranch/project_context.md' } };
      return { data: await (await service()).generateDocs() };
    });
  });

docs
  .command('update')
  .requiredOption('--campaign <id>', 'campaign id')
  .description('Incrementally update project_context.md after a campaign.')
  .action(async (options: { readonly campaign: string }) => {
    await execute('docs update', async (globals) => {
      if (globals.dryRun === true) return { data: { planned: true, campaignId: options.campaign } };
      return { data: await (await service()).updateDocs(options.campaign) };
    });
  });

const history = cli.command('history').description('Task history operations.');
history
  .command('show')
  .description('List all past campaign summaries from task_history.md.')
  .action(async () => {
    await execute('history show', async () => ({
      data: await (await service()).showHistory(),
    }));
  });

history
  .command('append')
  .requiredOption('--campaign <id>', 'campaign id')
  .description('Manually record a campaign to task history.')
  .action(async (options: { readonly campaign: string }) => {
    await execute('history append', async () => ({
      data: { path: await (await service()).appendHistory(options.campaign) },
    }));
  });

history
  .command('search')
  .argument('<query>', 'search query')
  .description('Search past campaigns by keyword.')
  .action(async (query: string) => {
    await execute('history search', async () => ({
      data: await (await service()).searchHistory(query),
    }));
  });

const mergeGuide = cli.command('merge-guide').description('Merge guide operations.');
mergeGuide
  .command('generate')
  .requiredOption('--campaign <id>', 'campaign id')
  .description('Generate a step-by-step merge guide for a campaign.')
  .action(async (options: { readonly campaign: string }) => {
    await execute('merge-guide generate', async (globals) => {
      if (globals.dryRun === true) return { data: { planned: true, campaignId: options.campaign } };
      return { data: await (await service()).generateMergeGuide(options.campaign) };
    });
  });

mergeGuide
  .command('validate')
  .requiredOption('--campaign <id>', 'campaign id')
  .description('Check if branches are ready to merge.')
  .action(async (options: { readonly campaign: string }) => {
    await execute('merge-guide validate', async () => ({
      data: await (await service()).validateMergeReadiness(options.campaign),
    }));
  });

cli
  .command('preflight')
  .description('Verify repository readiness before starting a campaign.')
  .action(async () => {
    await execute('preflight', async () => ({
      data: await (await service()).preflight(),
    }));
  });

cli
  .command('diff')
  .requiredOption('--campaign <id>', 'campaign id')
  .description('Generate a unified diff summary across all campaign branches.')
  .action(async (options: { readonly campaign: string }) => {
    await execute('diff', async () => ({
      data: await (await service()).diffSummary(options.campaign),
    }));
  });

cli
  .command('snapshot')
  .requiredOption('--campaign <id>', 'campaign id')
  .description('Capture a context snapshot for AI handoff.')
  .action(async (options: { readonly campaign: string }) => {
    await execute('snapshot', async () => ({
      data: await (await service()).snapshot(options.campaign),
    }));
  });

class ConfigValidationError extends Error {
  public constructor(readonly diagnostics: readonly Diagnostic[]) {
    super('Configuration validation failed.');
  }
}

function configureSkillCommand(command: Command): Command {
  return command
    .option('--target <target>', 'auto|all|codex|claude|opencode|antigravity|agents', 'auto')
    .option('--scope <scope>', 'user|project', 'user')
    .option('--project <path>', 'project root')
    .option('--dry-run', 'plan mutations without executing them', false)
    .option('--json', 'emit a stable machine-readable envelope', false)
    .option('--replace', 'adopt and replace an unmanaged destination', false)
    .option('--force', 'replace or remove modified managed files', false);
}

function effectiveSkillOptions(options: SkillOptions): SkillOptions {
  const root = cli.opts<Globals>();
  return {
    ...options,
    json: options.json === true || root.json === true,
    dryRun: options.dryRun === true || root.dryRun === true,
  };
}

async function skillContext(options: SkillOptions): Promise<{
  readonly installer: SkillInstaller;
  readonly projectRoot?: string;
}> {
  if (
    !['auto', 'all', 'codex', 'claude', 'opencode', 'antigravity', 'agents'].includes(
      options.target,
    )
  )
    throw new InstallerError('INTEGRITY_FAILURE', `Unknown provider target: ${options.target}`);
  if (!['user', 'project'].includes(options.scope))
    throw new InstallerError('INTEGRITY_FAILURE', `Unknown installation scope: ${options.scope}`);
  const projectRoot =
    options.scope === 'project'
      ? path.resolve(options.project ?? (await discover()).root)
      : undefined;
  return {
    installer: new SkillInstaller(await locateSkillPayload()),
    ...(projectRoot === undefined ? {} : { projectRoot }),
  };
}

async function locateSkillPayload(): Promise<string> {
  const moduleDirectory = path.dirname(path.resolve(process.argv[1] ?? process.cwd()));
  const candidates = [
    path.resolve(moduleDirectory, '..', 'skill', 'omnibranch'),
    path.resolve(moduleDirectory, '..', '..', '..', 'skills', 'omnibranch'),
    path.resolve(process.cwd(), 'skills', 'omnibranch'),
  ];
  for (const candidate of candidates) {
    try {
      await access(path.join(candidate, 'SKILL.md'));
      return candidate;
    } catch {
      // Continue through package and source layouts.
    }
  }
  throw new InstallerError('INTEGRITY_FAILURE', 'Bundled OmniBranch skill payload is missing.', {
    candidates,
  });
}

function installerPolicyDecision(action: string, dryRun: boolean): PolicyDecision {
  const evaluatedAt = new Date().toISOString();
  return {
    decisionId:
      `policy_${stableHash(`skill:${action}:${dryRun}`).slice(0, 24)}` as PolicyDecision['decisionId'],
    outcome: dryRun ? 'force_dry_run' : 'allow',
    reasonCode: dryRun ? 'explicit-dry-run' : 'explicit-local-installer-invocation',
    reasons: [
      dryRun
        ? 'The requested mutation is being planned without activation.'
        : 'The operator explicitly invoked a contained, receipt-backed local installation.',
    ],
    actionClass: 'execute_local_mutating',
    evaluatedAt,
  };
}

function titleCase(value: string): string {
  return `${value[0]?.toUpperCase() ?? ''}${value.slice(1)}`;
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
  override: Globals = {},
): Promise<void> {
  const rootGlobals = cli.opts<Globals>();
  const globals = {
    ...rootGlobals,
    ...override,
    json: rootGlobals.json === true || override.json === true,
    dryRun: rootGlobals.dryRun === true || override.dryRun === true,
  };
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
            : error instanceof InstallerError
              ? {
                  code: error.code,
                  message: error.message,
                  retryability:
                    error.code === 'PARTIAL_INSTALLATION' || error.code === 'RECOVERY_INCOMPLETE'
                      ? ('retryable' as const)
                      : ('non_retryable' as const),
                  details: error.details,
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

void cli.parseAsync(process.argv).catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});

export { cli };
