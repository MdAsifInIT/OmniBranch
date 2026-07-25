import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

import type { EventEnvelope, RunId, WorkItem, WorkItemProjection } from '@omnibranch/contracts';
import { ids } from '@omnibranch/platform';
import { withTemporaryDirectory } from '@omnibranch/test-kit';

import { SqliteProjectionStore } from './persistence.js';

function createProjection(
  workItemId: string,
  runId: string,
  inputTokens = 100,
  outputTokens = 50,
  cost = 0.005,
): WorkItemProjection {
  const item: WorkItem = {
    workItemId: ids.workItem(workItemId),
    runId: ids.run(runId),
    kind: 'fixture',
    summary: 'token tracking item',
    dependencies: [],
    ownership: { include: ['src/**'], exclude: [], mode: 'exclusive' },
    requestedCapabilities: [],
    retry: { maxAttempts: 2, backoffMs: 100, multiplier: 2 },
    timeoutMs: 10_000,
    idempotencyKey: workItemId,
    expectedOutput: {},
    lane: 'routine',
    priority: 1,
  };
  return {
    item,
    status: 'succeeded',
    attempt: 1,
    tokenUsage: {
      inputTokens,
      outputTokens,
      estimatedCostUsd: cost,
    },
  };
}

function createEvent(
  eventId: string,
  payload: WorkItemProjection,
  globalSequence = 1,
): EventEnvelope {
  return {
    schemaVersion: 1,
    eventId: ids.event(eventId),
    globalSequence,
    streamId: payload.item.runId,
    streamVersion: globalSequence,
    type: 'work_item.projected',
    occurredAt: new Date().toISOString(),
    correlationId: payload.item.runId,
    payload,
  };
}

describe('Token Usage Tracking & Projection', () => {
  it('persists token usage and cost in SQLite projection store', async () => {
    await withTemporaryDirectory('omnibranch-token-test-', async (directory) => {
      const dbPath = path.join(directory, 'state.db');
      const store = new SqliteProjectionStore(dbPath);
      await store.open();
      try {
        const proj1 = createProjection('work-1', 'run-1', 1000, 500, 0.03);
        const proj2 = createProjection('work-2', 'run-1', 2000, 800, 0.05);

        await store.apply([createEvent('event-1', proj1, 1), createEvent('event-2', proj2, 2)]);

        const items = await store.getWorkItems(ids.run('run-1') as RunId);
        expect(items).toHaveLength(2);
        expect(items[0]?.tokenUsage).toEqual({
          inputTokens: 1000,
          outputTokens: 500,
          estimatedCostUsd: 0.03,
        });

        const costs = await store.getCosts(ids.run('run-1') as RunId);
        expect(costs.totalInputTokens).toBe(3000);
        expect(costs.totalOutputTokens).toBe(1300);
        expect(costs.totalCostUsd).toBeCloseTo(0.08, 4);
        expect(costs.items).toHaveLength(2);
      } finally {
        await store.close();
      }
    });
  });

  it('performs schema migration v2 on an existing v1 database', async () => {
    await withTemporaryDirectory('omnibranch-migration-test-', async (directory) => {
      const dbPath = path.join(directory, 'state.db');
      await mkdir(path.dirname(dbPath), { recursive: true });

      // Create v1 DB without token_usage or cost_usd columns
      const db = new Database(dbPath);
      db.exec(`
        CREATE TABLE IF NOT EXISTS applied_events (
          event_id TEXT PRIMARY KEY,
          global_sequence INTEGER NOT NULL UNIQUE,
          type TEXT NOT NULL,
          payload TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS projection_meta (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS work_items (
          work_item_id TEXT PRIMARY KEY,
          run_id TEXT NOT NULL,
          item_json TEXT NOT NULL,
          status TEXT NOT NULL,
          attempt INTEGER NOT NULL,
          next_eligible_at TEXT,
          lease_id TEXT,
          failure_json TEXT
        );
      `);
      db.close();

      // Open via SqliteProjectionStore which triggers migration v2
      const store = new SqliteProjectionStore(dbPath);
      await store.open();
      try {
        const proj = createProjection('work-v1', 'run-v1', 500, 200, 0.01);
        await store.apply([createEvent('event-v1', proj, 1)]);

        const costs = await store.getCosts();
        expect(costs.totalInputTokens).toBe(500);
        expect(costs.totalOutputTokens).toBe(200);
        expect(costs.totalCostUsd).toBeCloseTo(0.01, 4);
      } finally {
        await store.close();
      }
    });
  });
});
