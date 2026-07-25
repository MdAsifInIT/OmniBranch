import { describe, expect, it } from 'vitest';
import { SqliteProjectionStore } from './persistence.js';
import { SemanticCacheManager } from './semantic-cache.js';
import { ExecaProcessRunner } from '@omnibranch/platform';
import type { WorkItem } from '@omnibranch/contracts';

describe('SemanticCacheManager & Migration v3', () => {
  it('saves and retrieves semantic cache entries with migration v3', async () => {
    const store = new SqliteProjectionStore(':memory:');
    await store.open();
    const runner = new ExecaProcessRunner();
    const manager = new SemanticCacheManager(store, runner);

    const workItem: WorkItem = {
      workItemId: 'work-1' as any,
      runId: 'run-1' as any,
      kind: 'task',
      priority: 1,
      summary: 'Summary test',
      dependencies: [],
      ownership: 'isolated' as any,
      requestedCapabilities: [],
      retry: { maxAttempts: 1, backoffMs: 0, multiplier: 1 },
      timeoutMs: 60000,
      idempotencyKey: 'idem-1',
      lane: 'lane-1',
      expectedOutput: { path: 'dist/a.js', contents: 'console.log(1);' },
    };

    const cacheKey = manager.computeCacheKey(workItem, 'mock-adapter');
    expect(typeof cacheKey).toBe('string');
    expect(cacheKey.length).toBeGreaterThan(10);

    await store.saveSemanticCacheEntry({
      cacheKey,
      workItemId: workItem.workItemId,
      adapterId: 'mock-adapter',
      status: 'completed',
      summary: 'Cached result',
      artifacts: [],
      changeClaims: [],
      diffPatch: '--- a/a.ts\n+++ b/a.ts\n@@ -0,0 +1 @@\n+console.log(1);',
      createdAt: new Date().toISOString(),
      ttlSeconds: 3600,
    });

    const entry = await store.getSemanticCacheEntry(cacheKey);
    expect(entry).not.toBeNull();
    expect(entry?.workItemId).toBe('work-1');
    expect(entry?.summary).toBe('Cached result');

    await store.close();
  });
});
