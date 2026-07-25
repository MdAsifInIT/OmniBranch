import type {
  AdapterResult,
  ArtifactReference,
  WorkItem,
} from '@omnibranch/contracts';
import { stableHash, type ProcessRunner } from '@omnibranch/platform';
import type { SqliteProjectionStore } from './persistence.js';

export interface SemanticCacheEntry {
  readonly cacheKey: string;
  readonly workItemId: string;
  readonly adapterId: string;
  readonly status: AdapterResult['status'];
  readonly summary: string;
  readonly artifacts: readonly ArtifactReference[];
  readonly changeClaims: readonly {
    readonly path: string;
    readonly source: 'engine_claim' | 'adapter_observation';
  }[];
  readonly diffPatch: string;
  readonly createdAt: string;
  readonly ttlSeconds: number;
}

export class SemanticCacheManager {
  public constructor(
    private readonly projectionStore: SqliteProjectionStore,
    private readonly runner: ProcessRunner,
    private readonly defaultTtlSeconds: number = 86400,
  ) {}

  public computeCacheKey(item: WorkItem, engineFamily: string): string {
    const inputPayload = JSON.stringify({
      kind: item.kind,
      summary: item.summary,
      ownership: item.ownership,
      expectedOutput: item.expectedOutput,
      engineFamily,
    });
    return stableHash(inputPayload);
  }

  public async get(
    cacheKey: string,
    ttlSeconds = this.defaultTtlSeconds,
  ): Promise<SemanticCacheEntry | null> {
    const entry = await this.projectionStore.getSemanticCacheEntry(cacheKey);
    if (!entry) return null;

    const ageMs = Date.now() - new Date(entry.createdAt).getTime();
    if (ageMs > (entry.ttlSeconds ?? ttlSeconds) * 1000) {
      await this.projectionStore.deleteSemanticCacheEntry(cacheKey);
      return null;
    }

    return entry;
  }

  public async set(entry: Omit<SemanticCacheEntry, 'ttlSeconds'> & { ttlSeconds?: number }): Promise<void> {
    const record: SemanticCacheEntry = {
      ...entry,
      ttlSeconds: entry.ttlSeconds ?? this.defaultTtlSeconds,
    };
    await this.projectionStore.saveSemanticCacheEntry(record);
  }

  public async applyPatch(worktreePath: string, diffPatch: string): Promise<boolean> {
    if (!diffPatch || ! diffPatch.trim()) return true;
    const result = await this.runner.run({
      executable: 'git',
      args: ['apply', '--whitespace=nowarn', '-'],
      cwd: worktreePath,
      input: diffPatch,
    });
    return result.exitCode === 0;
  }

  public async captureDiff(worktreePath: string): Promise<string> {
    const result = await this.runner.run({
      executable: 'git',
      args: ['diff', 'HEAD'],
      cwd: worktreePath,
    });
    if (result.exitCode !== 0) return '';
    return result.stdout;
  }
}
