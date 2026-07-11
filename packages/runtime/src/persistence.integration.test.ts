import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import type { EventEnvelope, RunId, WorkItem, WorkItemProjection } from '@omnibranch/contracts';
import { ExecaProcessRunner, ids } from '@omnibranch/platform';
import { initializeGitRepository, withTemporaryDirectory } from '@omnibranch/test-kit';

import { JsonlEventStore, NativeGitBackend, SqliteProjectionStore } from './persistence.js';

function projection(): WorkItemProjection {
  const item: WorkItem = {
    workItemId: ids.workItem('work-1'),
    runId: ids.run('run-1'),
    kind: 'fixture',
    summary: 'fixture work',
    dependencies: [],
    ownership: { include: ['src/a/**'], exclude: [], mode: 'exclusive' },
    requestedCapabilities: [],
    retry: { maxAttempts: 2, backoffMs: 100, multiplier: 2 },
    timeoutMs: 10_000,
    idempotencyKey: 'fixture',
    expectedOutput: {},
    lane: 'routine',
    priority: 1,
  };
  return { item, status: 'planned', attempt: 0 };
}

function event(
  eventId: string,
  payload: WorkItemProjection,
): Omit<EventEnvelope, 'globalSequence' | 'streamVersion'> {
  return {
    schemaVersion: 1,
    eventId: ids.event(eventId),
    streamId: 'run-1',
    type: 'work_item.projected',
    occurredAt: '2026-07-12T00:00:00.000Z',
    correlationId: 'fixture',
    payload,
  };
}

describe('canonical events and projections', () => {
  it('enforces concurrency and rebuilds a deleted SQLite projection', async () => {
    await withTemporaryDirectory('omnibranch-state-', async (directory) => {
      const eventPath = path.join(directory, 'events.jsonl');
      const databasePath = path.join(directory, 'state.db');
      const events = new JsonlEventStore(eventPath);
      const appended = await events.append({
        streamId: 'run-1',
        expectedStreamVersion: 0,
        events: [event('event-1', projection())],
      });
      expect(appended[0]?.globalSequence).toBe(1);
      expect((await events.verify()).valid).toBe(true);
      await expect(
        events.append({
          streamId: 'run-1',
          expectedStreamVersion: 0,
          events: [event('event-2', projection())],
        }),
      ).rejects.toMatchObject({ code: 'OPTIMISTIC_CONCURRENCY' });

      const first = new SqliteProjectionStore(databasePath);
      await first.open();
      await first.apply(appended);
      const expected = await first.getWorkItems(ids.run('run-1') as RunId);
      expect(expected).toHaveLength(1);
      await first.close();

      await rm(databasePath, { force: true });
      const rebuilt = new SqliteProjectionStore(databasePath);
      await rebuilt.open();
      await rebuilt.rebuild(events.readAll());
      expect(await rebuilt.getWorkItems(ids.run('run-1') as RunId)).toEqual(expected);
      expect(await rebuilt.checkpoint()).toBe(1);
      await rebuilt.close();
    });
  });

  it('detects a corrupted ledger without fabricating events', async () => {
    await withTemporaryDirectory('omnibranch-state-', async (directory) => {
      const eventPath = path.join(directory, 'events.jsonl');
      await writeFile(eventPath, '{"schemaVersion":1}\nnot-json\n');
      const verification = await new JsonlEventStore(eventPath).verify();
      expect(verification.valid).toBe(false);
      expect(verification.diagnostics[0]?.rule).toBe('jsonl-parse');
    });
  });
});

describe('native Git backend', () => {
  it('creates branches and worktrees idempotently and performs contained cleanup', async () => {
    await withTemporaryDirectory('omnibranch-git-', async (directory) => {
      const repository = path.join(directory, 'repository');
      const worktreeRoot = path.join(directory, 'worktrees');
      await mkdir(repository);
      await mkdir(worktreeRoot);
      await initializeGitRepository(repository);
      const runner = new ExecaProcessRunner();
      const backend = new NativeGitBackend(runner);
      const facts = await backend.discover(repository);
      expect(facts.head).not.toBeNull();
      const head = facts.head!;

      const dryRun = await backend.createBranch({
        repositoryRoot: repository,
        branch: 'omnibranch/work/fixture',
        startPoint: 'HEAD',
        expectedStartOid: head,
        dryRun: true,
      });
      expect(dryRun.changed).toBe(false);
      expect(dryRun.operations[0]?.args).toEqual(['branch', 'omnibranch/work/fixture', head]);

      expect(
        (
          await backend.createBranch({
            repositoryRoot: repository,
            branch: 'omnibranch/work/fixture',
            startPoint: 'HEAD',
            expectedStartOid: head,
            dryRun: false,
          })
        ).changed,
      ).toBe(true);
      expect(
        (
          await backend.createBranch({
            repositoryRoot: repository,
            branch: 'omnibranch/work/fixture',
            startPoint: 'HEAD',
            expectedStartOid: head,
            dryRun: false,
          })
        ).changed,
      ).toBe(false);

      const worktreePath = path.join(worktreeRoot, 'fixture');
      expect(
        (
          await backend.addWorktree({
            repositoryRoot: repository,
            path: worktreePath,
            branch: 'omnibranch/work/fixture',
            expectedBranchOid: head,
            dryRun: false,
          })
        ).changed,
      ).toBe(true);
      expect(
        (
          await backend.removeWorktree({
            repositoryRoot: repository,
            path: worktreePath,
            expectedContainedBy: 'main',
            dryRun: false,
          })
        ).changed,
      ).toBe(true);
    });
  });
});
