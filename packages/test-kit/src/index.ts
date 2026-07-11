import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { ExecaProcessRunner, FakeClock, SequenceIdGenerator } from '@omnibranch/platform';

export { FakeClock, SequenceIdGenerator };

export async function withTemporaryDirectory<T>(
  prefix: string,
  operation: (directory: string) => Promise<T>,
): Promise<T> {
  const directory = await mkdtemp(path.join(os.tmpdir(), prefix));
  try {
    return await operation(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export async function initializeGitRepository(directory: string, branch = 'main'): Promise<void> {
  const runner = new ExecaProcessRunner();
  const commands: readonly (readonly string[])[] = [
    ['init', '--initial-branch', branch],
    ['config', 'user.email', 'fixture@omnibranch.invalid'],
    ['config', 'user.name', 'OmniBranch Fixture'],
    ['commit', '--allow-empty', '-m', 'fixture root'],
  ];
  for (const args of commands) {
    const result = await runner.run({ executable: 'git', args, cwd: directory });
    if (result.exitCode !== 0) throw new Error(result.stderr);
  }
}
