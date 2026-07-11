import { describe, expect, it } from 'vitest';

import { DeterministicPolicyEngine, normalizeOwnership } from './orchestration.js';

describe('orchestration security boundaries', () => {
  it('rejects traversal in ownership paths', () => {
    expect(() =>
      normalizeOwnership({ include: ['../secrets/**'], exclude: [], mode: 'exclusive' }),
    ).toThrow(/Unsafe repository-relative path/);
  });

  it('denies repository writes outside the canonical scope', () => {
    const decision = new DeterministicPolicyEngine().evaluate(
      {
        actionClass: 'write_repo',
        actorId: 'worker',
        repositoryPath: 'C:/repository-escape/file.ts',
      },
      {
        now: new Date().toISOString(),
        repositoryRoot: 'C:/repository',
        approvals: [],
        explicitAllowances: ['write_repo'],
        deniedActions: [],
        externalAllowlist: [],
      },
    );
    expect(decision.outcome).toBe('deny');
    expect(decision.reasonCode).toBe('path-outside-repository');
  });
});
