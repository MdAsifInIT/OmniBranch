import path from 'node:path';

import type { RepositoryFacts } from '@omnibranch/contracts';
import type { ProcessRunner } from '@omnibranch/platform';

export class RepositoryDiscovery {
  public constructor(private readonly processRunner: ProcessRunner) {}

  async discover(startPath: string): Promise<RepositoryFacts> {
    const root = await this.git(startPath, ['rev-parse', '--show-toplevel']);
    const commonGitDirectory = await this.git(root, [
      'rev-parse',
      '--path-format=absolute',
      '--git-common-dir',
    ]);
    const headResult = await this.gitOptional(root, ['rev-parse', 'HEAD']);
    const branchResult = await this.gitOptional(root, ['symbolic-ref', '--short', 'HEAD']);
    const defaultBranch = await this.discoverDefaultBranch(root);
    const remotes = await this.readRemotes(root);
    const worktrees = await this.readWorktrees(root);
    return {
      root: path.resolve(root),
      commonGitDirectory: path.resolve(commonGitDirectory),
      head: headResult,
      currentBranch: branchResult,
      defaultBranch,
      remotes,
      worktrees,
    };
  }

  private async discoverDefaultBranch(root: string): Promise<string | null> {
    const remoteHead = await this.gitOptional(root, [
      'symbolic-ref',
      '--short',
      'refs/remotes/origin/HEAD',
    ]);
    if (remoteHead !== null) return remoteHead.replace(/^origin\//, '');
    for (const candidate of ['main', 'master', 'trunk']) {
      if (
        (await this.gitOptional(root, ['show-ref', '--verify', `refs/heads/${candidate}`])) !== null
      ) {
        return candidate;
      }
    }
    return null;
  }

  private async readRemotes(root: string): Promise<RepositoryFacts['remotes']> {
    const names = await this.gitOptional(root, ['remote']);
    if (names === null || names.length === 0) return [];
    const results: { name: string; url: string }[] = [];
    for (const name of names.split(/\r?\n/).filter(Boolean).sort()) {
      const url = await this.gitOptional(root, ['remote', 'get-url', name]);
      if (url !== null) results.push({ name, url });
    }
    return results;
  }

  private async readWorktrees(root: string): Promise<RepositoryFacts['worktrees']> {
    const output = await this.git(root, ['worktree', 'list', '--porcelain']);
    const results: { path: string; head: string; branch: string | null }[] = [];
    let current: { path?: string; head?: string; branch?: string | null } = {};
    const flush = (): void => {
      if (current.path !== undefined && current.head !== undefined) {
        results.push({ path: current.path, head: current.head, branch: current.branch ?? null });
      }
      current = {};
    };
    for (const line of output.split(/\r?\n/)) {
      if (line.length === 0) {
        flush();
      } else if (line.startsWith('worktree ')) {
        current.path = line.slice('worktree '.length);
      } else if (line.startsWith('HEAD ')) {
        current.head = line.slice('HEAD '.length);
      } else if (line.startsWith('branch refs/heads/')) {
        current.branch = line.slice('branch refs/heads/'.length);
      } else if (line === 'detached') {
        current.branch = null;
      }
    }
    flush();
    return results;
  }

  private async git(cwd: string, args: readonly string[]): Promise<string> {
    const result = await this.processRunner.run({ executable: 'git', args, cwd });
    if (result.exitCode !== 0) {
      throw new Error(`git ${args[0] ?? ''} failed: ${result.stderr.trim()}`);
    }
    return result.stdout.trim();
  }

  private async gitOptional(cwd: string, args: readonly string[]): Promise<string | null> {
    const result = await this.processRunner.run({ executable: 'git', args, cwd });
    return result.exitCode === 0 ? result.stdout.trim() : null;
  }
}
