import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type {
  SchedulerInput,
  WorkItemProjection,
  WorkItemId,
  OwnershipScope,
  WorkerId,
} from '@omnibranch/contracts';
import { ids } from '@omnibranch/platform';

import {
  DeterministicScheduler,
  deterministicBackoff,
  LeaseManager,
  validateDag,
  InvariantViolation,
} from './orchestration.js';
import type { DagNode } from './orchestration.js';

const workItemProjectionArb = fc.record({
  item: fc.record({
    workItemId: fc.string({ minLength: 1 }).map(ids.workItem),
    runId: fc.constant(ids.run('run')),
    kind: fc.constant('fixture' as const),
    summary: fc.string(),
    dependencies: fc.array(fc.string({ minLength: 1 }).map(ids.workItem)),
    ownership: fc.record({
      include: fc.array(fc.string()),
      exclude: fc.array(fc.string()),
      mode: fc.constantFrom('shared' as const, 'exclusive' as const),
    }),
    requestedCapabilities: fc.array(fc.string()),
    retry: fc.record({
      maxAttempts: fc.integer({ min: 1, max: 10 }),
      backoffMs: fc.integer({ min: 0, max: 10000 }),
      multiplier: fc.double({ min: 1, max: 5 }),
    }),
    timeoutMs: fc.integer({ min: 1000, max: 100000 }),
    idempotencyKey: fc.string(),
    expectedOutput: fc.constant({}),
    lane: fc.string(),
    priority: fc.integer(),
    adapterId: fc.option(fc.string()),
  }),
  status: fc.constantFrom(
    'planned',
    'waiting_dependencies',
    'ready',
    'awaiting_approval',
    'leasing',
    'leased',
    'running',
    'validating',
    'retry_backoff',
    'succeeded',
    'failed',
    'canceled',
  ),
  attempt: fc.integer({ min: 0, max: 10 }),
  nextEligibleAt: fc.option(fc.date({ noInvalidDate: true }).map((d) => d.toISOString())),
}) as fc.Arbitrary<WorkItemProjection>;

const schedulerInputArb = fc.record({
  now: fc.date({ noInvalidDate: true }).map((d) => d.toISOString()),
  globalCapacity: fc.integer({ min: 0, max: 100 }),
  laneCapacity: fc.dictionary(fc.string(), fc.integer({ min: 0, max: 100 })),
  adapterCapacity: fc.dictionary(fc.string(), fc.integer({ min: 0, max: 100 })),
  lanePriority: fc.dictionary(fc.string(), fc.integer()),
  activeByLane: fc.dictionary(fc.string(), fc.integer({ min: 0, max: 100 })),
  activeByAdapter: fc.dictionary(fc.string(), fc.integer({ min: 0, max: 100 })),
  items: fc.array(workItemProjectionArb),
});

describe('Property-Based Tests for Orchestration', () => {
  it('DeterministicScheduler.selectReady() is deterministic', () => {
    fc.assert(
      fc.property(schedulerInputArb, (input) => {
        const uniqueItems = new Map<WorkItemId, WorkItemProjection>();
        for (const item of input.items) {
          uniqueItems.set(item.item.workItemId, item);
        }

        const nodes = Array.from(uniqueItems.values()).map((item) => ({
          workItemId: item.item.workItemId,
          dependencies: item.item.dependencies.filter(
            (d) => uniqueItems.has(d) && d !== item.item.workItemId,
          ),
        }));

        const idToIndex = new Map<WorkItemId, number>();
        const validNodes: DagNode[] = [];
        for (let i = 0; i < nodes.length; i++) {
          idToIndex.set(nodes[i]!.workItemId, i);
        }

        for (const node of nodes) {
          const validDeps = node.dependencies.filter((dep) => {
            const depIndex = idToIndex.get(dep);
            const nodeIndex = idToIndex.get(node.workItemId);
            return depIndex !== undefined && nodeIndex !== undefined && depIndex < nodeIndex;
          });
          validNodes.push({ ...node, dependencies: validDeps });
        }

        const validItems = validNodes.map((node) => {
          const orig = uniqueItems.get(node.workItemId)!;
          return {
            ...orig,
            item: { ...orig.item, dependencies: node.dependencies },
          };
        });

        const validInput: SchedulerInput = { ...input, items: validItems };

        const scheduler = new DeterministicScheduler();
        const result1 = scheduler.selectReady(validInput);
        const result2 = scheduler.selectReady(validInput);

        expect(result1).toEqual(result2);
      }),
    );
  });

  it('deterministicBackoff with same seed and attempt -> same value', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }),
        fc.integer({ min: 0, max: 10000 }),
        fc.double({ min: 1, max: 5 }),
        fc.string(),
        (attempt, baseMs, multiplier, jitterSeed) => {
          const val1 = deterministicBackoff(attempt, baseMs, multiplier, jitterSeed);
          const val2 = deterministicBackoff(attempt, baseMs, multiplier, jitterSeed);
          expect(val1).toBe(val2);
        },
      ),
    );
  });

  const simplePathArb = fc
    .array(
      fc
        .string({ minLength: 1, maxLength: 10 })
        .map((s) => s.replace(/[^a-zA-Z0-9_-]/g, 'a') || 'a'),
      { minLength: 1, maxLength: 5 },
    )
    .map((arr) => arr.join('/'));

  it('LeaseManager.acquire() with non-overlapping paths -> always succeeds', () => {
    fc.assert(
      fc.property(simplePathArb, simplePathArb, (path1, path2) => {
        fc.pre(!path1.startsWith(path2) && !path2.startsWith(path1));

        const manager = new LeaseManager();
        const ownership1: OwnershipScope = { include: [path1], exclude: [], mode: 'exclusive' };
        const ownership2: OwnershipScope = { include: [path2], exclude: [], mode: 'exclusive' };

        manager.acquire({
          workItemId: ids.workItem('w1'),
          workerId: 'worker1' as WorkerId,
          ownership: ownership1,
          attempt: 1,
          ttlMs: 1000,
          heartbeatMs: 500,
        });

        expect(() => {
          manager.acquire({
            workItemId: ids.workItem('w2'),
            workerId: 'worker2' as WorkerId,
            ownership: ownership2,
            attempt: 1,
            ttlMs: 1000,
            heartbeatMs: 500,
          });
        }).not.toThrow();
      }),
    );
  });

  const validPathArb = fc
    .string({ minLength: 1, maxLength: 20 })
    .map((s) => s.replace(/[^a-zA-Z0-9_-]/g, 'a') || 'a');

  it('LeaseManager.acquire() with overlapping exclusive paths -> always throws InvariantViolation', () => {
    fc.assert(
      fc.property(validPathArb, (basePath) => {
        const manager = new LeaseManager();
        const ownership: OwnershipScope = { include: [basePath], exclude: [], mode: 'exclusive' };

        manager.acquire({
          workItemId: ids.workItem('w1'),
          workerId: 'worker1' as WorkerId,
          ownership,
          attempt: 1,
          ttlMs: 1000,
          heartbeatMs: 500,
        });

        expect(() => {
          manager.acquire({
            workItemId: ids.workItem('w2'),
            workerId: 'worker2' as WorkerId,
            ownership,
            attempt: 1,
            ttlMs: 1000,
            heartbeatMs: 500,
          });
        }).toThrow(InvariantViolation);
      }),
    );
  });

  it('validateDag() detects all cycles in arbitrary graphs', () => {
    const dagArb = fc.array(fc.tuple(fc.string(), fc.array(fc.string()))).map((entries) => {
      const allIds = new Set<string>();
      entries.forEach(([id, deps]) => {
        allIds.add(id);
        deps.forEach((d) => allIds.add(d));
      });
      const nodes: DagNode[] = [];
      const idMap = new Map<string, string[]>();
      entries.forEach(([id, deps]) => idMap.set(id, deps));
      for (const id of allIds) {
        nodes.push({
          workItemId: ids.workItem(id),
          dependencies: (idMap.get(id) || []).map(ids.workItem),
        });
      }
      return nodes;
    });

    fc.assert(
      fc.property(dagArb, (nodes) => {
        fc.pre(nodes.length > 0);

        let hasCycle = false;

        const byId = new Map(nodes.map((n) => [n.workItemId, n]));

        for (const n of nodes) {
          if (n.dependencies.includes(n.workItemId)) {
            hasCycle = true;
          }
        }

        if (!hasCycle) {
          const visiting = new Set<string>();
          const visited = new Set<string>();

          const visit = (id: string): boolean => {
            if (visiting.has(id)) return true;
            if (visited.has(id)) return false;

            visiting.add(id);
            const node = byId.get(id as WorkItemId)!;
            for (const dep of node.dependencies) {
              if (visit(dep)) return true;
            }
            visiting.delete(id);
            visited.add(id);
            return false;
          };

          for (const node of nodes) {
            if (visit(node.workItemId)) {
              hasCycle = true;
              break;
            }
          }
        }

        if (hasCycle) {
          expect(() => validateDag(nodes)).toThrow(InvariantViolation);
        } else {
          expect(() => validateDag(nodes)).not.toThrow();
        }
      }),
    );
  });
});
