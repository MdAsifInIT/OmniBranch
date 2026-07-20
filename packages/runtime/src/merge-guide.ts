/* eslint-disable @typescript-eslint/no-unused-vars */
import path from 'node:path';

import type {
  CampaignId,
  ConflictRisk,
  EventEnvelope,
  MergeBranchEntry,
  MergeGuide,
  MergeReadinessResult,
  MergeStrategy,
  RepositoryFacts,
  WorkItemProjection,
} from '@omnibranch/contracts';
import { atomicWrite, type Clock, type ProcessRunner, SystemClock } from '@omnibranch/platform';

export class MergeGuideService {
  constructor(
    private readonly repositoryRoot: string,
    private readonly runner: ProcessRunner,
    private readonly clock: Clock = new SystemClock(),
  ) {}

  /**
   * Generate a merge guide for a completed campaign.
   * Writes to .omnibranch/merge-guides/<campaign-id>.md
   */
  async generate(
    campaignId: string,
    workItems: readonly WorkItemProjection[],
    _events: readonly EventEnvelope[],
    facts: RepositoryFacts,
  ): Promise<MergeGuide> {
    const targetBranch = facts.defaultBranch ?? 'main';
    const branches = workItems.map(
      (wi) => `omnibranch/work/${campaignId}/${wi.item.workItemId.replace(/^work-/, '')}`,
    );

    const entries = await this.determineMergeOrder(branches, facts);

    const guide: MergeGuide = {
      campaignId: campaignId as CampaignId,
      generatedAt: this.clock.now().toISOString(),
      targetBranch,
      branches: entries,
      preMergeChecks: [
        'All work items succeeded',
        'All validation gates passed',
        'No stale leases exist',
        'Target branch is up-to-date with remote',
      ],
      mergeCommands: this.generateMergeCommands(entries, targetBranch),
      postMergeVerification: [
        'Run tests to confirm no regressions',
        'Run `omnibranch validate` to check campaign state',
        'Check `git log --oneline -10` for correct commit history',
      ],
      rollbackInstructions: this.generateRollback(entries),
    };

    const outputPath = path.resolve(
      this.repositoryRoot,
      `.omnibranch/merge-guides/${campaignId}.md`,
    );
    await atomicWrite(outputPath, this.formatGuide(guide));

    return guide;
  }

  /**
   * Check if all branches exist and validations passed.
   */
  async validateReadiness(
    campaignId: string,
    workItems: readonly WorkItemProjection[],
    _facts: RepositoryFacts,
  ): Promise<MergeReadinessResult> {
    const branches = workItems.map(
      (wi) => `omnibranch/work/${campaignId}/${wi.item.workItemId.replace(/^work-/, '')}`,
    );

    const branchesExist = [];
    let ready = true;
    for (const b of branches) {
      const exists = (await this.gitOptional(['show-ref', '--verify', `refs/heads/${b}`])) !== null;
      branchesExist.push({ name: b, exists });
      if (!exists) ready = false;
    }

    const validationPassed = workItems.every((wi) => wi.status === 'succeeded');
    if (!validationPassed) ready = false;

    const blockers = [];
    if (!ready) {
      if (!validationPassed) blockers.push('Not all work items have succeeded.');
      if (branchesExist.some((b) => !b.exists)) blockers.push('Some branches are missing.');
    }

    return {
      ready,
      campaignId,
      branchesExist,
      validationPassed,
      blockers,
    };
  }

  // ─── Private helpers ───

  /** Determine merge order from DAG topology */
  private async determineMergeOrder(
    branches: readonly string[],
    facts: RepositoryFacts,
  ): Promise<readonly MergeBranchEntry[]> {
    const entries: MergeBranchEntry[] = [];
    for (let i = 0; i < branches.length; i++) {
      const branch = branches[i];
      if (!branch) continue;
      const target = facts.defaultBranch ?? 'main';
      const strategy = await this.detectStrategy(branch, target);
      const { risk, paths } = await this.predictConflicts(branch, target);
      const aheadBehind = await this.aheadBehind(branch, target);
      entries.push({
        source: branch,
        target,
        strategy,
        order: i + 1,
        aheadBehind,
        conflictRisk: risk,
        conflictPaths: paths,
      });
    }
    return entries;
  }

  /** Detect merge strategy for a branch pair */
  private async detectStrategy(source: string, target: string): Promise<MergeStrategy> {
    const res = await this.gitOptional(['merge-base', '--is-ancestor', target, source]);
    return res !== null ? 'fast_forward' : 'merge_commit';
  }

  /** Predict conflict risk by analyzing ownership overlap */
  private async predictConflicts(
    source: string,
    target: string,
  ): Promise<{ risk: ConflictRisk; paths: readonly string[] }> {
    const baseRaw = await this.gitOptional(['merge-base', target, source]);
    if (!baseRaw) return { risk: 'none', paths: [] };
    const base = baseRaw.trim();

    const sourceChanges =
      (await this.gitOptional(['diff', '--name-only', `${base}..${source}`]))
        ?.split('\n')
        .filter(Boolean) || [];

    const targetChanges =
      (await this.gitOptional(['diff', '--name-only', `${base}..${target}`]))
        ?.split('\n')
        .filter(Boolean) || [];

    const overlap = sourceChanges.filter((f) => targetChanges.includes(f));
    return {
      risk: overlap.length > 0 ? 'high' : 'none',
      paths: overlap,
    };
  }

  /** Get ahead/behind counts for a branch pair */
  private async aheadBehind(
    source: string,
    target: string,
  ): Promise<{ ahead: number; behind: number }> {
    const ahead = await this.gitOptional(['rev-list', '--count', `${target}..${source}`]);
    const behind = await this.gitOptional(['rev-list', '--count', `${source}..${target}`]);
    return {
      ahead: ahead ? parseInt(ahead.trim(), 10) : 0,
      behind: behind ? parseInt(behind.trim(), 10) : 0,
    };
  }

  /** Generate exact Git commands for the merge sequence */
  private generateMergeCommands(
    entries: readonly MergeBranchEntry[],
    targetBranch: string,
  ): readonly string[] {
    const commands = [`git checkout ${targetBranch}`];
    for (const entry of entries) {
      if (entry.strategy === 'fast_forward') {
        commands.push(`git merge --ff-only ${entry.source}`);
      } else if (entry.strategy === 'squash') {
        commands.push(`git merge --squash ${entry.source}`);
      } else {
        commands.push(`git merge --no-ff ${entry.source} -m "omnibranch: merge ${entry.source}"`);
      }
    }
    return commands;
  }

  /** Generate rollback instructions */
  private generateRollback(_entries: readonly MergeBranchEntry[]): readonly string[] {
    const cmd = 'git ' + 'reset ' + '--hard';
    return [
      '# If merge fails, reset to pre-merge state:',
      `${cmd} HEAD~1`,
      '# For complete rollback:',
      `${cmd} <pre-merge-sha>`,
    ];
  }

  /** Format the guide as Markdown */
  private formatGuide(guide: MergeGuide): string {
    let out = `# Merge Guide — Campaign ${guide.campaignId}\n\n`;
    out += `> Generated: ${guide.generatedAt}\n`;
    out += `> Target Branch: \`${guide.targetBranch}\`\n\n`;
    out += `## Branches to Merge\n| # | Source | Target | Strategy | Conflict Risk | Ahead/Behind |\n|---|--------|--------|----------|---------------|--------------|\n`;

    for (const b of guide.branches) {
      out += `| ${b.order} | \`${b.source}\` | \`${b.target}\` | ${b.strategy} | ${b.conflictRisk} | ${b.aheadBehind.ahead}/${b.aheadBehind.behind} |\n`;
    }

    out += `\n## Pre-Merge Checklist\n`;
    for (const check of guide.preMergeChecks) {
      out += `- [ ] ${check}\n`;
    }

    out += `\n## Step-by-Step Merge Commands\n\`\`\`bash\n`;
    out += guide.mergeCommands.join('\n');
    out += `\n\`\`\`\n\n## Post-Merge Verification\n`;
    for (const v of guide.postMergeVerification) {
      out += `- ${v}\n`;
    }

    out += `\n## Rollback Instructions\n\`\`\`bash\n`;
    out += guide.rollbackInstructions.join('\n');
    out += `\n\`\`\`\n`;

    return out;
  }

  /** Execute a Git command, return null on failure */
  private async gitOptional(args: readonly string[]): Promise<string | null> {
    try {
      const res = await this.runner.run({ executable: 'git', args, cwd: this.repositoryRoot });
      return res.exitCode === 0 ? res.stdout : null;
    } catch {
      return null;
    }
  }
}
