import { describe, expect, it } from 'vitest';

import type { ProcessRequest, ProcessResult, ProcessRunner } from '@omnibranch/platform';

import { SafeGitPushExecutor } from './github-push.js';

class FakeRunner implements ProcessRunner {
  readonly requests: ProcessRequest[] = [];
  public constructor(private readonly results: ProcessResult[]) {}
  async run(request: ProcessRequest): Promise<ProcessResult> {
    this.requests.push(request);
    const result = this.results.shift();
    if (result === undefined) throw new Error('Missing process result');
    return result;
  }
}

const result = (stdout: string, exitCode = 0): ProcessResult => ({
  executable: 'git',
  args: [],
  cwd: 'repo',
  exitCode,
  stdout,
  stderr: '',
  durationMs: 1,
  timedOut: false,
});

describe('SafeGitPushExecutor', () => {
  it('checks the remote oid and performs a non-force argument-array push', async () => {
    const oid = 'a'.repeat(40);
    const runner = new FakeRunner([result(`${oid}\trefs/heads/topic\n`), result('ok')]);
    const executor = new SafeGitPushExecutor(runner);
    await expect(
      executor.push({
        repositoryRoot: 'repo',
        remote: 'origin',
        sourceRef: 'refs/heads/topic',
        destinationRef: 'refs/heads/topic',
        expectedRemoteOid: oid,
      }),
    ).resolves.toMatchObject({ pushed: true });
    expect(runner.requests[1]?.args).toEqual([
      'push',
      '--porcelain',
      'origin',
      'refs/heads/topic:refs/heads/topic',
    ]);
    expect(runner.requests[1]?.args.join(' ')).not.toContain('--force');
  });

  it('refuses remote movement before push', async () => {
    const runner = new FakeRunner([result(`${'b'.repeat(40)}\trefs/heads/topic\n`)]);
    const executor = new SafeGitPushExecutor(runner);
    await expect(
      executor.push({
        repositoryRoot: 'repo',
        remote: 'origin',
        sourceRef: 'refs/heads/topic',
        destinationRef: 'refs/heads/topic',
        expectedRemoteOid: 'a'.repeat(40),
      }),
    ).rejects.toMatchObject({ code: 'remote_ref_moved' });
    expect(runner.requests).toHaveLength(1);
  });

  it('rejects option-like remotes and malformed refs without spawning Git', async () => {
    const runner = new FakeRunner([]);
    const executor = new SafeGitPushExecutor(runner);
    await expect(
      executor.push({
        repositoryRoot: 'repo',
        remote: '--upload-pack=evil',
        sourceRef: 'refs/heads/topic',
        destinationRef: 'refs/heads/topic',
        expectedRemoteOid: 'a'.repeat(40),
      }),
    ).rejects.toMatchObject({ code: 'invalid_input' });
    expect(runner.requests).toHaveLength(0);
  });
});
