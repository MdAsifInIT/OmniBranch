import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { JsonlEventStore, SqliteProjectionStore } from './persistence.js';
import { FileMutex, FakeClock, ExecaProcessRunner, ids } from '@omnibranch/platform';
import { LocalCampaignService } from './campaign.js';
import type { EventEnvelope, AiEngineAdapter } from '@omnibranch/contracts';

describe('Concurrency Integration Tests', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(path.join(os.tmpdir(), 'concurrency-test-'));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('handles concurrent JsonlEventStore.append() without data corruption', async () => {
    const filePath = path.join(testDir, 'events.jsonl');
    const store1 = new JsonlEventStore(filePath);
    const store2 = new JsonlEventStore(filePath);

    const event1: EventEnvelope = {
      schemaVersion: 1,
      eventId: ids.event('evt-1'),
      streamId: 'stream-1',
      streamVersion: 1,
      type: 'test',
      occurredAt: new Date().toISOString(),
      correlationId: 'c1',
      payload: {},
      globalSequence: 0,
    };

    const event2: EventEnvelope = {
      schemaVersion: 1,
      eventId: ids.event('evt-2'),
      streamId: 'stream-2',
      streamVersion: 1,
      type: 'test',
      occurredAt: new Date().toISOString(),
      correlationId: 'c2',
      payload: {},
      globalSequence: 0,
    };

    const results = await Promise.allSettled([
      store1.append({ streamId: 'stream-1', expectedStreamVersion: 0, events: [event1] }),
      store2.append({ streamId: 'stream-2', expectedStreamVersion: 0, events: [event2] }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);

    const result = await store1.verify();
    expect(result.valid).toBe(true);

    const allEvents: EventEnvelope[] = [];
    for await (const event of store1.readAll()) {
      allEvents.push(event);
    }
    expect(allEvents.length).toBe(fulfilled.length);
  });

  it('handles concurrent SqliteProjectionStore.applyEvents() with idempotency', async () => {
    const dbPath = path.join(testDir, 'projections.db');
    const store1 = new SqliteProjectionStore(dbPath);
    const store2 = new SqliteProjectionStore(dbPath);
    await store1.open();
    await store2.open();

    const event: EventEnvelope = {
      schemaVersion: 1,
      eventId: ids.event('evt-1'),
      streamId: 'stream-1',
      streamVersion: 1,
      type: 'test',
      occurredAt: new Date().toISOString(),
      correlationId: 'c1',
      payload: {},
      globalSequence: 1,
    };

    await Promise.all([store1.apply([event]), store2.apply([event])]);

    const checkpoint1 = await store1.checkpoint();
    const checkpoint2 = await store2.checkpoint();
    expect(checkpoint1).toBe(1);
    expect(checkpoint2).toBe(1);

    await store1.close();
    await store2.close();
  });

  it('handles concurrent FileMutex.acquire() with stale lock to exactly one winner', async () => {
    const lockPath = path.join(testDir, 'test.lock');
    const clock = new FakeClock(new Date());

    const mutex1 = new FileMutex(lockPath, 100, clock);
    await mutex1.acquire('winner1');

    clock.advance(200); // make it stale

    const mutex2 = new FileMutex(lockPath, 100, clock);
    const mutex3 = new FileMutex(lockPath, 100, clock);

    const results = await Promise.allSettled([
      mutex2.acquire('winner2'),
      mutex3.acquire('winner3'),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason.message).toMatch(
      /Resource is locked|ENOENT/,
    );

    // cleanup
    await mutex1.release();
    if (fulfilled.length > 0) {
      if (results[0].status === 'fulfilled') await mutex2.release();
      else await mutex3.release();
    }
  });

  it('campaign lock prevents concurrent campaign execution', async () => {
    const runner = new ExecaProcessRunner();
    await runner.run({ executable: 'git', args: ['init', testDir], cwd: testDir });
    await runner.run({ executable: 'git', args: ['config', 'user.name', 'test'], cwd: testDir });
    await runner.run({
      executable: 'git',
      args: ['config', 'user.email', 'test@test.com'],
      cwd: testDir,
    });
    await runner.run({
      executable: 'git',
      args: ['commit', '--allow-empty', '-m', 'init'],
      cwd: testDir,
    });

    const svc1 = new LocalCampaignService(testDir, runner);
    const svc2 = new LocalCampaignService(testDir, runner);

    const { campaignId } = await svc1.create('test-campaign');

    const mockAdapter = {
      prepare: async (assignment: any) => {
        const root = assignment.scope.repositoryRoot;
        await mkdir(root, { recursive: true });
        const outputPath = String(assignment.context['outputPath']);
        const contents = String(assignment.context['contents']);
        const file = path.join(root, outputPath);
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file, contents);
        return {
          assignment,
          resolvedContext: {},
          model: 'test',
          systemPrompt: 'test',
          adapterId: 'mock',
          workingDirectory: root,
          prompt: 'test',
          guided: false,
        };
      },
      launch: async (prepared: any) => {
        return {
          workItemId: prepared.assignment.workItemId,
          runId: prepared.assignment.runId,
          adapterId: 'mock',
          externalRunId: 'ext-1',
          startedAt: new Date().toISOString(),
          resumeLevel: 'none',
        };
      },
      collect: async (handle: any) => {
        return {
          runId: handle.runId,
          adapterId: 'mock',
          engineFamily: 'mock',
          engineSurface: 'mock',
          status: 'completed',
          assignmentEcho: { workItemId: handle.workItemId },
          artifacts: [
            {
              artifactId: 'art-1',
              kind: 'file-diff',
              path: 'test',
              source: 'test',
            },
          ],
          changeClaims: [{ path: 'test' }],
          metrics: { durationMs: 1, costUsd: 0 },
        };
      },
    } as unknown as AiEngineAdapter;

    const results = await Promise.allSettled([
      svc1.runFixture(campaignId, mockAdapter),
      svc2.runFixture(campaignId, mockAdapter),
    ]);

    const rejected = results.filter((r) => r.status === 'rejected');
    expect(rejected.length).toBeGreaterThanOrEqual(1);
    expect((rejected[0] as PromiseRejectedResult).reason.message).toMatch(
      /Resource is locked|locked|ENOENT/i,
    );
  }, 30000); // Increased timeout to 30s
});
