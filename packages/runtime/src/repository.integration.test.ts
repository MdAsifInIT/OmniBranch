import { realpath } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { ExecaProcessRunner } from '@omnibranch/platform';
import { initializeGitRepository, withTemporaryDirectory } from '@omnibranch/test-kit';

import { RepositoryDiscovery } from './repository.js';

describe('RepositoryDiscovery', () => {
  it('discovers root, common directory, head, branch, and worktree', async () => {
    await withTemporaryDirectory('omnibranch-repo-', async (directory) => {
      await initializeGitRepository(directory, 'trunk');
      const facts = await new RepositoryDiscovery(new ExecaProcessRunner()).discover(directory);
      expect(facts.root).toBe(await realpath(directory));
      expect(facts.currentBranch).toBe('trunk');
      expect(facts.defaultBranch).toBe('trunk');
      expect(facts.worktrees).toHaveLength(1);
    });
  });
});
