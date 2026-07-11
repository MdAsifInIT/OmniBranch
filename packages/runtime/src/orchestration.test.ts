import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type {
  ActionRequest,
  Approval,
  PolicyContext,
  SchedulerInput,
  WorkItem,
  WorkItemProjection,
} from '@omnibranch/contracts';
import { FakeClock, ids, SequenceIdGenerator } from '@omnibranch/platform';

import {
  deterministicBackoff,
  DeterministicPolicyEngine,
  DeterministicScheduler,
  InvariantViolation,
  LeaseManager,
  ownershipConflicts,
  transitionWorkItem,
  validateDag,
  ValidationGraph,
} from './orchestration.js';

function item(id: string, dependencies: readonly string[] = [], priority = 0): WorkItemProjection {
  const workItem: WorkItem = {
    workItemId: ids.workItem(id),
    runId: ids.run('run'),
    kind: 'fixture',
    summary: id,
    dependencies: dependencies.map(ids.workItem),
    ownership: { include: [`src/${id}/**`], exclude: [], mode: 'exclusive' },
    requestedCapabilities: [],
    retry: { maxAttempts: 2, backoffMs: 100, multiplier: 2 },
    timeoutMs: 1_000,
    idempotencyKey: id,
    expectedOutput: {},
    lane: 'routine',
    priority,
  };
  return { item: workItem, status: 'ready', attempt: 0 };
}

describe('work item lifecycle and DAG', () => {
  it('accepts documented transitions and rejects all other transitions', () => {
    expect(
      transitionWorkItem({ ...item('a'), status: 'planned' }, 'waiting_dependencies').status,
    ).toBe('waiting_dependencies');
    expect(() => transitionWorkItem({ ...item('a'), status: 'planned' }, 'running')).toThrow(
      InvariantViolation,
    );
    expect(() => transitionWorkItem({ ...item('a'), status: 'succeeded' }, 'ready')).toThrow(
      InvariantViolation,
    );
  });

  it('rejects cycles and missing dependencies', () => {
    expect(() =>
      validateDag([
        { workItemId: ids.workItem('a'), dependencies: [ids.workItem('b')] },
        { workItemId: ids.workItem('b'), dependencies: [ids.workItem('a')] },
      ]),
    ).toThrow(/Cycle/);
    expect(() =>
      validateDag([{ workItemId: ids.workItem('a'), dependencies: [ids.workItem('missing')] }]),
    ).toThrow(/missing dependency/);
  });
});

describe('deterministic scheduler', () => {
  it('is stable for arbitrary input permutations', () => {
    fc.assert(
      fc.property(
        fc.shuffledSubarray(['a', 'b', 'c', 'd'], { minLength: 4, maxLength: 4 }),
        (order) => {
          const projections = order.map((id, index) => item(id, [], index % 2));
          const input: SchedulerInput = {
            items: projections,
            now: '2026-07-12T00:00:00.000Z',
            globalCapacity: 4,
            lanePriority: { routine: 100 },
            laneCapacity: { routine: 4 },
            adapterCapacity: {},
            activeByLane: {},
            activeByAdapter: {},
          };
          const scheduler = new DeterministicScheduler();
          const first = scheduler.selectReady(input).map((entry) => entry.item.workItemId);
          const second = scheduler
            .selectReady({ ...input, items: [...projections].reverse() })
            .map((entry) => entry.item.workItemId);
          expect(second).toEqual(first);
        },
      ),
    );
  });

  it('requires succeeded dependencies and respects capacity', () => {
    const dependency = { ...item('a'), status: 'succeeded' as const };
    const dependent = item('b', ['a'], 10);
    const scheduler = new DeterministicScheduler();
    expect(
      scheduler.selectReady({
        items: [dependent, dependency],
        now: '2026-07-12T00:00:00.000Z',
        globalCapacity: 1,
        lanePriority: { routine: 100 },
        laneCapacity: { routine: 1 },
        adapterCapacity: {},
        activeByLane: {},
        activeByAdapter: {},
      }),
    ).toEqual([dependent]);
  });
});

describe('ownership and leases', () => {
  it('conservatively detects exclusive overlap', () => {
    expect(
      ownershipConflicts(
        { include: ['src/**'], exclude: [], mode: 'exclusive' },
        { include: ['src/core/**'], exclude: [], mode: 'exclusive' },
      ),
    ).toBe(true);
    expect(
      ownershipConflicts(
        { include: ['docs/**'], exclude: [], mode: 'exclusive' },
        { include: ['src/**'], exclude: [], mode: 'exclusive' },
      ),
    ).toBe(false);
  });

  it('expires stale authority and releases ownership', () => {
    const clock = new FakeClock(new Date('2026-07-12T00:00:00.000Z'));
    const manager = new LeaseManager(clock, new SequenceIdGenerator('lease'));
    const lease = manager.acquire({
      workItemId: ids.workItem('a'),
      workerId: 'worker-a' as never,
      ownership: { include: ['src/**'], exclude: [], mode: 'exclusive' },
      attempt: 1,
      ttlMs: 1_000,
      heartbeatMs: 100,
    });
    expect(() =>
      manager.acquire({
        workItemId: ids.workItem('b'),
        workerId: 'worker-b' as never,
        ownership: { include: ['src/core/**'], exclude: [], mode: 'exclusive' },
        attempt: 1,
        ttlMs: 1_000,
        heartbeatMs: 100,
      }),
    ).toThrow(/Ownership conflicts/);
    clock.advance(101);
    expect(() => manager.assertAuthority(ids.workItem('a'), lease.leaseId, lease.workerId)).toThrow(
      /stale/,
    );
    expect(manager.expire()).toEqual([]);
  });
});

describe('policy, validation, and retry behavior', () => {
  const now = '2026-07-12T00:00:00.000Z';
  const baseContext: PolicyContext = {
    now,
    repositoryRoot: 'C:/repo',
    approvals: [],
    explicitAllowances: ['read_repo', 'git_read'],
    deniedActions: [],
    externalAllowlist: [],
  };

  it('denies unknown and destructive actions and gates elevated actions', () => {
    const policy = new DeterministicPolicyEngine(
      new FakeClock(new Date(now)),
      new SequenceIdGenerator('decision'),
    );
    expect(
      policy.evaluate({ actionClass: 'unknown', actorId: 'worker' }, baseContext).outcome,
    ).toBe('deny');
    expect(
      policy.evaluate({ actionClass: 'git_write_destructive', actorId: 'worker' }, baseContext)
        .outcome,
    ).toBe('deny');
    expect(
      policy.evaluate({ actionClass: 'scm_mutation', actorId: 'worker' }, baseContext).outcome,
    ).toBe('approval_required');
  });

  it('prevents worker self-approval', () => {
    const policy = new DeterministicPolicyEngine(
      new FakeClock(new Date(now)),
      new SequenceIdGenerator('decision'),
    );
    const request: ActionRequest = { actionClass: 'scm_mutation', actorId: 'worker' };
    const approval: Approval = {
      approvalId: 'approval' as never,
      targetId: 'target',
      action: 'scm_mutation',
      requester: 'worker',
      approverClass: 'operator',
      createdAt: now,
      decision: 'granted',
      decidedBy: 'worker',
    };
    expect(policy.evaluate(request, { ...baseContext, approvals: [approval] }).reasonCode).toBe(
      'self-approval',
    );
  });

  it('requires explicit pass for every required validation', () => {
    const graph = new ValidationGraph([
      { id: 'lint', required: true, dependencies: [] },
      { id: 'test', required: true, dependencies: ['lint'] },
    ]);
    const evidence = (status: 'pass' | 'unavailable') => ({
      validatorId: 'lint',
      status,
      inputRevision: 'abc',
      startedAt: now,
      endedAt: now,
      durationMs: 0,
      artifacts: [],
    });
    expect(graph.aggregate([evidence('pass')]).passed).toBe(false);
    expect(graph.aggregate([evidence('unavailable')]).passed).toBe(false);
  });

  it('computes reproducible bounded retry delays', () => {
    expect(deterministicBackoff(3, 100, 2, 'seed')).toBe(deterministicBackoff(3, 100, 2, 'seed'));
    expect(deterministicBackoff(2, 100, 2)).toBe(200);
  });
});
