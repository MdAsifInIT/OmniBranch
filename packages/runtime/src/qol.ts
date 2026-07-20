/* eslint-disable @typescript-eslint/no-unused-vars */
import path from 'node:path';

import type {
  CampaignDiffSummary,
  CampaignSnapshot,
  CampaignTemplate,
  CleanupResult,
  DiffSummaryEntry,
  EventEnvelope,
  PreflightCheck,
  PreflightResult,
  RepositoryFacts,
  TaskHistoryEntry,
  WorkItemProjection,
} from '@omnibranch/contracts';
import { type Clock, type ProcessRunner, SystemClock } from '@omnibranch/platform';
import { loadWorkspacePlan } from './config.js';
import { readdir } from 'node:fs/promises';

export class PreflightService {
  constructor(
    private readonly repositoryRoot: string,
    private readonly runner: ProcessRunner,
    private readonly clock: Clock = new SystemClock(),
  ) {}

  /**
   * Run all preflight checks before starting a campaign.
   */
  async check(facts: RepositoryFacts): Promise<PreflightResult> {
    const checks: PreflightCheck[] = [];

    checks.push(await this.checkGitClean());
    checks.push(this.checkStaleWorktrees(facts));
    checks.push(await this.checkConfig());
    checks.push(this.checkDefaultBranch(facts));
    checks.push(this.checkNodeVersion());
    checks.push(await this.checkNoStaleLocks());

    return {
      ready: checks.every((c) => c.passed || c.severity !== 'error'),
      checks,
      timestamp: this.clock.now().toISOString(),
    };
  }

  private async checkGitClean(): Promise<PreflightCheck> {
    const res = await this.runner.run({
      executable: 'git',
      args: ['status', '--porcelain'],
      cwd: this.repositoryRoot,
    });
    const passed = res.stdout.trim() === '';
    return {
      name: 'git-status-clean',
      passed,
      message: passed ? 'Git working tree is clean.' : 'Git working tree has uncommitted changes.',
      severity: 'error',
    };
  }

  private checkStaleWorktrees(facts: RepositoryFacts): PreflightCheck {
    const managed = facts.worktrees.filter((wt) => wt.branch?.startsWith('omnibranch/work/'));
    return {
      name: 'stale-worktrees',
      passed: managed.length === 0,
      message:
        managed.length === 0
          ? 'No stale worktrees found.'
          : `Found ${managed.length} managed worktrees.`,
      severity: 'warning',
    };
  }

  private async checkConfig(): Promise<PreflightCheck> {
    const planPath = path.resolve(this.repositoryRoot, '.omnibranch/workspace.yaml');
    try {
      const result = await loadWorkspacePlan(planPath);
      return {
        name: 'workspace-config',
        passed: result.valid,
        message: result.valid
          ? 'Workspace config is valid.'
          : 'Workspace config has validation errors.',
        severity: 'error',
      };
    } catch {
      return {
        name: 'workspace-config',
        passed: false,
        message: 'Failed to load workspace config.',
        severity: 'error',
      };
    }
  }

  private checkDefaultBranch(facts: RepositoryFacts): PreflightCheck {
    return {
      name: 'default-branch-known',
      passed: facts.defaultBranch !== null,
      message:
        facts.defaultBranch !== null
          ? `Default branch is ${facts.defaultBranch}.`
          : 'Could not determine default branch.',
      severity: 'warning',
    };
  }

  private checkNodeVersion(): PreflightCheck {
    const version = Number(process.versions.node.split('.')[0]);
    return {
      name: 'node-version',
      passed: version >= 22,
      message:
        version >= 22
          ? `Node version ${version} is supported.`
          : `Node version ${version} is below required 22.`,
      severity: 'error',
    };
  }

  private async checkNoStaleLocks(): Promise<PreflightCheck> {
    try {
      const files = await readdir(path.resolve(this.repositoryRoot, '.omnibranch'));
      const locks = files.filter((f) => f.endsWith('.lock'));
      return {
        name: 'no-stale-locks',
        passed: locks.length === 0,
        message:
          locks.length === 0 ? 'No stale lock files found.' : `Found ${locks.length} lock files.`,
        severity: 'warning',
      };
    } catch {
      return {
        name: 'no-stale-locks',
        passed: true,
        message: 'No .omnibranch directory found.',
        severity: 'info',
      };
    }
  }
}

export class DiffSummaryService {
  constructor(
    private readonly _repositoryRoot: string,
    private readonly _runner: ProcessRunner,
  ) {}

  /** Execute a Git command, return null on failure */
  private async gitOptional(args: readonly string[]): Promise<string | null> {
    try {
      const res = await this._runner.run({ executable: 'git', args, cwd: this._repositoryRoot });
      return res.exitCode === 0 ? res.stdout.trim() : null;
    } catch {
      return null;
    }
  }

  async generate(
    campaignId: string,
    workItems: readonly WorkItemProjection[],
    _events: readonly EventEnvelope[],
  ): Promise<CampaignDiffSummary> {
    const entries: DiffSummaryEntry[] = [];
    let totalFilesChanged = 0;
    let totalInsertions = 0;
    let totalDeletions = 0;

    for (const wi of workItems) {
      const branch = `omnibranch/work/${campaignId}/${wi.item.workItemId.replace(/^work-/, '')}`;
      let insertions = 0;
      let deletions = 0;
      const files: { path: string; insertions: number; deletions: number }[] = [];

      const numstatRaw = await this.gitOptional(['diff', '--numstat', `main...${branch}`]);
      if (numstatRaw) {
        for (const line of numstatRaw.split('\n')) {
          if (!line.trim()) continue;
          const parts = line.split('\t');
          if (parts.length >= 3) {
            const insRaw = parts[0] || '';
            const delRaw = parts[1] || '';
            const file = parts.slice(2).join('\t');

            const i = insRaw === '-' || !insRaw ? 0 : parseInt(insRaw, 10);
            const d = delRaw === '-' || !delRaw ? 0 : parseInt(delRaw, 10);
            insertions += i;
            deletions += d;
            files.push({ path: file, insertions: i, deletions: d });
          }
        }
      }

      entries.push({
        workItemId: wi.item.workItemId,
        branch,
        filesChanged: files.length,
        insertions,
        deletions,
        files,
      });
      totalFilesChanged += files.length;
      totalInsertions += insertions;
      totalDeletions += deletions;
    }

    return {
      campaignId,
      totalFilesChanged,
      totalInsertions,
      totalDeletions,
      entries,
    };
  }
}

export class CampaignSnapshotService {
  constructor(
    _repositoryRoot: string,
    private readonly clock: Clock = new SystemClock(),
  ) {}

  async capture(
    campaignId: string,
    workItems: readonly WorkItemProjection[],
    events: readonly EventEnvelope[],
    facts: RepositoryFacts,
    historyEntries: readonly TaskHistoryEntry[],
  ): Promise<CampaignSnapshot> {
    const activeBranches = facts.worktrees
      .map((wt) => wt.branch)
      .filter((b): b is string => b !== null && b.includes(campaignId));

    const isComplete = workItems.length > 0 && workItems.every((wi) => wi.status === 'succeeded');
    const isFailed = workItems.some((wi) => wi.status === 'failed');

    return {
      campaignId,
      generatedAt: this.clock.now().toISOString(),
      status: isComplete ? 'completed' : isFailed ? 'failed' : 'active',
      activeLeases: [], // Would populate from LeaseManager
      pendingWorkItems: workItems.filter(
        (wi) => wi.status !== 'succeeded' && wi.status !== 'failed' && wi.status !== 'canceled',
      ),
      completedWorkItems: workItems.filter((wi) => wi.status === 'succeeded'),
      activeBranches,
      recentEvents: events.slice(-20),
      historyExcerpt: historyEntries.slice(-5), // Last 5 campaigns
    };
  }
}

export class CampaignCleanupService {
  constructor(
    private readonly repositoryRoot: string,
    private readonly runner: ProcessRunner,
  ) {}

  async cleanup(
    campaignId: string,
    facts: RepositoryFacts,
    confirm: boolean,
  ): Promise<CleanupResult> {
    const managedWorktrees = facts.worktrees.filter((wt) => wt.branch?.includes(`/${campaignId}/`));

    if (confirm) {
      // If confirmed, we would run `git worktree remove` and `git branch -D`
      for (const wt of managedWorktrees) {
        await this.runner.run({
          executable: 'git',
          args: ['worktree', 'remove', wt.path, '--force'],
          cwd: this.repositoryRoot,
        });
        if (wt.branch) {
          await this.runner.run({
            executable: 'git',
            args: ['branch', '-D', wt.branch.replace('refs/heads/', '')],
            cwd: this.repositoryRoot,
          });
        }
      }
    }

    return {
      campaignId,
      dryRun: !confirm,
      branchesRemoved: confirm ? managedWorktrees.map((wt) => wt.branch!).filter(Boolean) : [],
      worktreesRemoved: confirm ? managedWorktrees.map((wt) => wt.path) : [],
      branchesSkipped: [],
    };
  }

  async cleanStale(_facts: RepositoryFacts, confirm: boolean): Promise<CleanupResult> {
    return {
      campaignId: 'stale-cleanup',
      dryRun: !confirm,
      branchesRemoved: [],
      worktreesRemoved: [],
      branchesSkipped: [],
    };
  }
}

export class CampaignTemplateService {
  constructor(_repositoryRoot: string) {}

  async list(): Promise<readonly CampaignTemplate[]> {
    return [];
  }

  async load(name: string): Promise<CampaignTemplate> {
    throw new Error(`Template ${name} not found`);
  }
}
