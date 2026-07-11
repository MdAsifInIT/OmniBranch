import type { ProcessRunner } from '@omnibranch/platform';

import { GitHubAdapterError } from './github.js';

export interface GitPushRequest {
  readonly repositoryRoot: string;
  readonly remote: string;
  readonly sourceRef: string;
  readonly destinationRef: string;
  readonly expectedRemoteOid: string;
}

export interface GitPushExecutor {
  push(request: GitPushRequest): Promise<Readonly<Record<string, unknown>>>;
}

export class SafeGitPushExecutor implements GitPushExecutor {
  public constructor(private readonly runner: ProcessRunner) {}

  async push(request: GitPushRequest): Promise<Readonly<Record<string, unknown>>> {
    validateRemote(request.remote);
    validateRef(request.sourceRef);
    validateRef(request.destinationRef);
    validateOid(request.expectedRemoteOid);

    const before = await this.runner.run({
      executable: 'git',
      args: ['ls-remote', '--refs', request.remote, request.destinationRef],
      cwd: request.repositoryRoot,
    });
    if (before.exitCode !== 0) throw new GitHubAdapterError('git_read_failed', before.stderr);
    const actual = before.stdout.trim().split(/\s+/, 1)[0] ?? '';
    if (actual !== request.expectedRemoteOid) {
      throw new GitHubAdapterError(
        'remote_ref_moved',
        `Remote ref precondition failed: expected ${request.expectedRemoteOid}, received ${actual || 'missing'}`,
      );
    }

    const result = await this.runner.run({
      executable: 'git',
      args: [
        'push',
        '--porcelain',
        request.remote,
        `${request.sourceRef}:${request.destinationRef}`,
      ],
      cwd: request.repositoryRoot,
    });
    if (result.exitCode !== 0) throw new GitHubAdapterError('push_rejected', result.stderr);
    return { pushed: true, before: actual, destinationRef: request.destinationRef };
  }
}

function validateRemote(value: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(value)) {
    throw new GitHubAdapterError('invalid_input', 'Invalid Git remote name');
  }
}

function validateRef(value: string): void {
  if (
    !/^refs\/(heads|tags)\/[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(value) ||
    value.includes('..') ||
    value.includes('@{') ||
    value.endsWith('.') ||
    value.endsWith('/')
  ) {
    throw new GitHubAdapterError('invalid_ref', `Invalid Git ref: ${value}`);
  }
}

function validateOid(value: string): void {
  if (!/^[a-f0-9]{40,64}$/i.test(value)) {
    throw new GitHubAdapterError('invalid_input', 'Expected remote OID must be a full object ID');
  }
}
