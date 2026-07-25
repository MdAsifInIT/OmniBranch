import crypto from 'node:crypto';
import { mkdir, open, stat, copyFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import Database from 'better-sqlite3';

import type {
  AppendEventsRequest,
  BranchMutation,
  Diagnostic,
  EventEnvelope,
  EventStore,
  GitBackend,
  MutationResult,
  ProjectionStore,
  RepositoryFacts,
  RepositoryStatus,
  RunId,
  TokenUsage,
  WorkItem,
  WorkItemProjection,
  WorkItemStatus,
  WorktreeMutation,
  WorktreeRemoval,
} from '@omnibranch/contracts';
import {
  canonicalPathInside,
  FileMutex,
  isPathInside,
  type ProcessRunner,
} from '@omnibranch/platform';

import type { SemanticCacheEntry } from './semantic-cache.js';
import { RepositoryDiscovery } from './repository.js';

export class JsonlEventStore implements EventStore {
  private readonly mutex: FileMutex;
  private readonly cachedEvents: EventEnvelope[] = [];
  private byteOffset = 0;

  public constructor(private readonly filePath: string) {
    this.mutex = new FileMutex(`${filePath}.lock`, 120_000);
  }

  async append(request: AppendEventsRequest): Promise<readonly EventEnvelope[]> {
    await this.mutex.acquire(`event-store:${process.pid}`);
    try {
      const existing = await this.load();
      const ids = new Set(existing.map((event) => event.eventId));
      const stream = existing.filter((event) => event.streamId === request.streamId);
      const currentVersion = stream.at(-1)?.streamVersion ?? 0;
      if (currentVersion !== request.expectedStreamVersion) {
        throw new EventStoreError(
          'OPTIMISTIC_CONCURRENCY',
          `Expected stream version ${request.expectedStreamVersion}, found ${currentVersion}.`,
        );
      }
      for (const event of request.events) {
        if (event.schemaVersion !== 1) {
          throw new EventStoreError(
            'UNSUPPORTED_EVENT_SCHEMA',
            'Only event schema version 1 is supported.',
          );
        }
        if (event.streamId !== request.streamId) {
          throw new EventStoreError(
            'STREAM_MISMATCH',
            'Every event must target the append stream.',
          );
        }
        if (ids.has(event.eventId)) {
          throw new EventStoreError('DUPLICATE_EVENT', `Event ${event.eventId} already exists.`);
        }
        ids.add(event.eventId);
      }
      let globalSequence = existing.at(-1)?.globalSequence ?? 0;
      let streamVersion = currentVersion;
      const secret = process.env.OMNIBRANCH_AUDIT_SECRET;
      let lastHmac = existing.at(-1)?.hmac ?? '';
      const appended: EventEnvelope[] = request.events.map((event) => {
        const nextGlobal = ++globalSequence;
        const nextStreamVersion = ++streamVersion;
        const envelopeWithoutHmac = {
          ...event,
          globalSequence: nextGlobal,
          streamVersion: nextStreamVersion,
        };
        let hmac: string | undefined = undefined;
        if (secret) {
          hmac = crypto
            .createHmac('sha256', secret)
            .update(lastHmac + ':' + JSON.stringify(envelopeWithoutHmac))
            .digest('hex');
          lastHmac = hmac;
        }
        return {
          ...envelopeWithoutHmac,
          ...(hmac ? { hmac } : {}),
        };
      });
      await mkdir(path.dirname(this.filePath), { recursive: true });
      const handle = await open(this.filePath, 'a', 0o600);
      try {
        await handle.writeFile(`${appended.map((event) => JSON.stringify(event)).join('\n')}\n`);
        await handle.sync();
      } finally {
        await handle.close();
      }
      return appended;
    } finally {
      await this.mutex.release();
    }
  }

  async *readAll(afterGlobalSequence = 0): AsyncIterable<EventEnvelope> {
    for (const event of await this.load()) {
      if (event.globalSequence > afterGlobalSequence) yield event;
    }
  }

  async *readStream(streamId: string, afterVersion = 0): AsyncIterable<EventEnvelope> {
    for (const event of await this.load()) {
      if (event.streamId === streamId && event.streamVersion > afterVersion) yield event;
    }
  }

  async verifyHmacChain(
    providedSecret?: string,
  ): Promise<{ readonly valid: boolean; readonly errors: readonly string[] }> {
    const secret = providedSecret ?? process.env.OMNIBRANCH_AUDIT_SECRET;
    if (!secret) return { valid: true, errors: [] };
    const events = await this.load();
    const errors: string[] = [];
    let prevHmac = '';
    for (const [index, event] of events.entries()) {
      if (!event.hmac) {
        errors.push('Event at index ' + index + ' (id: ' + event.eventId + ') is missing HMAC.');
        continue;
      }
      const { hmac, ...rest } = event;
      const expectedHmac = crypto
        .createHmac('sha256', secret)
        .update(prevHmac + ':' + JSON.stringify(rest))
        .digest('hex');
      if (event.hmac !== expectedHmac) {
        errors.push(
          'HMAC mismatch at global sequence ' +
            event.globalSequence +
            ' (event ID ' +
            event.eventId +
            ').',
        );
      }
      prevHmac = event.hmac;
    }
    return { valid: errors.length === 0, errors };
  }

  async verify(): Promise<{
    readonly valid: boolean;
    readonly diagnostics: readonly Diagnostic[];
  }> {
    let events: readonly EventEnvelope[];
    try {
      events = await this.load();
    } catch (error) {
      return {
        valid: false,
        diagnostics: [
          ledgerDiagnostic(
            this.filePath,
            'jsonl-parse',
            error instanceof Error ? error.message : String(error),
          ),
        ],
      };
    }
    const diagnostics: Diagnostic[] = [];
    const ids = new Set<string>();
    const versions = new Map<string, number>();
    for (const [index, event] of events.entries()) {
      const expectedGlobal = index + 1;
      if (event.globalSequence !== expectedGlobal) {
        diagnostics.push(
          ledgerDiagnostic(
            this.filePath,
            'global-sequence',
            `Expected ${expectedGlobal}, found ${event.globalSequence}.`,
          ),
        );
      }
      const expectedStream = (versions.get(event.streamId) ?? 0) + 1;
      if (event.streamVersion !== expectedStream) {
        diagnostics.push(
          ledgerDiagnostic(
            this.filePath,
            'stream-sequence',
            `Expected ${event.streamId} version ${expectedStream}, found ${event.streamVersion}.`,
          ),
        );
      }
      versions.set(event.streamId, event.streamVersion);
      if (ids.has(event.eventId)) {
        diagnostics.push(
          ledgerDiagnostic(this.filePath, 'duplicate-event', `Duplicate event ${event.eventId}.`),
        );
      }
      ids.add(event.eventId);
    }
    return { valid: diagnostics.length === 0, diagnostics };
  }

  private async load(): Promise<readonly EventEnvelope[]> {
    const fileStat = await stat(this.filePath).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });

    if (!fileStat) return [];

    if (fileStat.size === this.byteOffset) {
      return this.cachedEvents;
    }

    let startOffset = 0;
    if (fileStat.size > this.byteOffset && this.byteOffset > 0) {
      startOffset = this.byteOffset;
    } else {
      this.cachedEvents.length = 0; // Reset cache if file shrank or offset is 0
    }

    const buffer = Buffer.alloc(fileStat.size - startOffset);
    const handle = await open(this.filePath, 'r');
    try {
      await handle.read(buffer, 0, buffer.length, startOffset);
    } finally {
      await handle.close();
    }

    const source = buffer.toString('utf8');
    const lines = source.split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]?.trim();
      if (!line) continue;

      try {
        const parsed = JSON.parse(line);
        if (!isEventEnvelope(parsed)) {
          throw new EventStoreError(
            'INVALID_EVENT_ENVELOPE',
            `Invalid event envelope at line ${i + 1}.`,
          );
        }
        this.cachedEvents.push(parsed as EventEnvelope);
      } catch (error) {
        if (error instanceof EventStoreError) throw error;

        const isLastNonEmpty = lines.slice(i + 1).every((l) => l.trim().length === 0);
        if (isLastNonEmpty) {
          const backupPath = this.filePath + `.corrupt.${Date.now()}`;
          await copyFile(this.filePath, backupPath);
          await writeFile(
            this.filePath,
            this.cachedEvents.map((e) => JSON.stringify(e)).join('\n') + '\n',
          );
          console.warn(
            `[EventStore] Recovered from truncated line. Original file backed up to ${backupPath}`,
          );
          break; // Stop parsing as we have recovered
        } else {
          throw new EventStoreError('CORRUPT_EVENT_LINE', `Invalid JSON at line ${i + 1}.`, error);
        }
      }
    }

    // Update offset to the new file size (or the size after recovery)
    const newStat = await stat(this.filePath);
    this.byteOffset = newStat.size;

    return this.cachedEvents;
  }
}

export class EventStoreError extends Error {
  public constructor(
    readonly code: string,
    message: string,
    cause?: unknown,
  ) {
    super(message, cause === undefined ? undefined : { cause });
  }
}

export interface SchemaMigration {
  readonly version: number;
  readonly description: string;
  readonly sql: string;
}

export const PROJECTION_SCHEMA_MIGRATIONS: readonly SchemaMigration[] = [
  {
    version: 1,
    description: 'Initial schema',
    sql: `
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
      CREATE INDEX IF NOT EXISTS work_items_run_id ON work_items(run_id);
    `,
  },
  {
    version: 2,
    description: 'Add token_usage and cost_usd',
    sql: `
      ALTER TABLE work_items ADD COLUMN token_usage TEXT;
      ALTER TABLE work_items ADD COLUMN cost_usd REAL DEFAULT 0;
    `,
  },
  {
    version: 3,
    description: 'Add semantic_cache table',
    sql: `
      CREATE TABLE IF NOT EXISTS semantic_cache (
        cache_key TEXT PRIMARY KEY,
        work_item_id TEXT NOT NULL,
        adapter_id TEXT NOT NULL,
        status TEXT NOT NULL,
        summary TEXT NOT NULL,
        artifacts_json TEXT NOT NULL,
        change_claims_json TEXT NOT NULL,
        diff_patch TEXT NOT NULL,
        created_at TEXT NOT NULL,
        ttl_seconds INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_semantic_cache_created ON semantic_cache(created_at);
    `,
  },
];

export class SqliteProjectionStore implements ProjectionStore {
  private database: Database.Database | undefined;

  public constructor(private readonly databasePath: string) {}

  async open(): Promise<void> {
    await mkdir(path.dirname(this.databasePath), { recursive: true });
    this.database = new Database(this.databasePath);
    this.database.pragma('journal_mode = WAL');
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT,
        description TEXT
      );
    `);

    const appliedRows = this.database.prepare('SELECT version FROM schema_migrations').all() as {
      version: number;
    }[];
    const appliedVersions = new Set(appliedRows.map((row) => row.version));

    const unapplied = PROJECTION_SCHEMA_MIGRATIONS.filter(
      (migration) => !appliedVersions.has(migration.version),
    ).sort((a, b) => a.version - b.version);

    if (unapplied.length > 0) {
      const recordMigration = this.database.prepare(
        'INSERT INTO schema_migrations (version, applied_at, description) VALUES (?, ?, ?)',
      );
      this.database.transaction(() => {
        for (const migration of unapplied) {
          this.database!.exec(migration.sql);
          recordMigration.run(migration.version, new Date().toISOString(), migration.description);
        }
      })();
    }
  }

  async getAppliedMigrations(): Promise<
    readonly { version: number; appliedAt: string; description: string }[]
  > {
    const rows = this.requireDatabase()
      .prepare(
        'SELECT version, applied_at, description FROM schema_migrations ORDER BY version ASC',
      )
      .all() as { version: number; applied_at: string; description: string }[];
    return rows.map((row) => ({
      version: row.version,
      appliedAt: row.applied_at,
      description: row.description,
    }));
  }

  async close(): Promise<void> {
    this.database?.close();
    this.database = undefined;
  }

  async reset(): Promise<void> {
    this.requireDatabase().exec(
      'DELETE FROM work_items; DELETE FROM applied_events; DELETE FROM projection_meta;',
    );
  }

  async apply(events: readonly EventEnvelope[]): Promise<void> {
    const database = this.requireDatabase();
    const insertEvent = database.prepare(
      'INSERT OR IGNORE INTO applied_events(event_id, global_sequence, type, payload) VALUES (?, ?, ?, ?)',
    );
    const upsert = database.prepare(`
      INSERT INTO work_items(work_item_id, run_id, item_json, status, attempt, next_eligible_at, lease_id, failure_json, token_usage, cost_usd)
      VALUES (@workItemId, @runId, @itemJson, @status, @attempt, @nextEligibleAt, @leaseId, @failureJson, @tokenUsage, @costUsd)
      ON CONFLICT(work_item_id) DO UPDATE SET
        item_json=excluded.item_json, status=excluded.status, attempt=excluded.attempt,
        next_eligible_at=excluded.next_eligible_at, lease_id=excluded.lease_id,
        failure_json=excluded.failure_json, token_usage=excluded.token_usage, cost_usd=excluded.cost_usd
    `);
    const checkpoint = database.prepare(
      `INSERT INTO projection_meta(key, value) VALUES ('checkpoint', ?)
       ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
    );
    database.transaction((batch: readonly EventEnvelope[]) => {
      let latest = 0;
      for (const event of batch) {
        const result = insertEvent.run(
          event.eventId,
          event.globalSequence,
          event.type,
          JSON.stringify(event.payload),
        );
        if (result.changes === 0) continue;
        if (event.type === 'work_item.projected' && isWorkItemProjection(event.payload)) {
          upsert.run({
            workItemId: event.payload.item.workItemId,
            runId: event.payload.item.runId,
            itemJson: JSON.stringify(event.payload.item),
            status: event.payload.status,
            attempt: event.payload.attempt,
            nextEligibleAt: event.payload.nextEligibleAt ?? null,
            leaseId: event.payload.leaseId ?? null,
            failureJson:
              event.payload.failure === undefined ? null : JSON.stringify(event.payload.failure),
            tokenUsage: event.payload.tokenUsage ? JSON.stringify(event.payload.tokenUsage) : null,
            costUsd: event.payload.tokenUsage?.estimatedCostUsd ?? 0,
          });
        }
        latest = Math.max(latest, event.globalSequence);
      }
      if (latest > 0) checkpoint.run(String(latest));
    })(events);
  }

  async checkpoint(): Promise<number> {
    const row = this.requireDatabase()
      .prepare("SELECT value FROM projection_meta WHERE key='checkpoint'")
      .get() as { value: string } | undefined;
    return row === undefined ? 0 : Number(row.value);
  }

  async getSemanticCacheEntry(cacheKey: string): Promise<SemanticCacheEntry | null> {
    const row = this.requireDatabase()
      .prepare('SELECT * FROM semantic_cache WHERE cache_key = ?')
      .get(cacheKey) as any;
    if (!row) return null;
    return {
      cacheKey: row.cache_key,
      workItemId: row.work_item_id,
      adapterId: row.adapter_id,
      status: row.status,
      summary: row.summary,
      artifacts: JSON.parse(row.artifacts_json),
      changeClaims: JSON.parse(row.change_claims_json),
      diffPatch: row.diff_patch,
      createdAt: row.created_at,
      ttlSeconds: row.ttl_seconds,
    };
  }

  async saveSemanticCacheEntry(entry: SemanticCacheEntry): Promise<void> {
    this.requireDatabase()
      .prepare(
        'INSERT INTO semantic_cache (cache_key, work_item_id, adapter_id, status, summary, artifacts_json, change_claims_json, diff_patch, created_at, ttl_seconds) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(cache_key) DO UPDATE SET work_item_id=excluded.work_item_id, adapter_id=excluded.adapter_id, status=excluded.status, summary=excluded.summary, artifacts_json=excluded.artifacts_json, change_claims_json=excluded.change_claims_json, diff_patch=excluded.diff_patch, created_at=excluded.created_at, ttl_seconds=excluded.ttl_seconds',
      )
      .run(
        entry.cacheKey,
        entry.workItemId,
        entry.adapterId,
        entry.status,
        entry.summary,
        JSON.stringify(entry.artifacts),
        JSON.stringify(entry.changeClaims),
        entry.diffPatch,
        entry.createdAt,
        entry.ttlSeconds,
      );
  }

  async deleteSemanticCacheEntry(cacheKey: string): Promise<void> {
    this.requireDatabase().prepare('DELETE FROM semantic_cache WHERE cache_key = ?').run(cacheKey);
  }

  async getWorkItems(runId: RunId): Promise<readonly WorkItemProjection[]> {
    const rows = this.requireDatabase()
      .prepare(
        'SELECT item_json, status, attempt, next_eligible_at, lease_id, failure_json, token_usage FROM work_items WHERE run_id=? ORDER BY work_item_id',
      )
      .all(runId) as {
      item_json: string;
      status: WorkItemStatus;
      attempt: number;
      next_eligible_at: string | null;
      lease_id: string | null;
      failure_json: string | null;
      token_usage: string | null;
    }[];
    return rows.map((row) => ({
      item: JSON.parse(row.item_json) as WorkItem,
      status: row.status,
      attempt: row.attempt,
      ...(row.next_eligible_at === null ? {} : { nextEligibleAt: row.next_eligible_at }),
      ...(row.lease_id === null
        ? {}
        : { leaseId: row.lease_id as NonNullable<WorkItemProjection['leaseId']> }),
      ...(row.failure_json === null
        ? {}
        : { failure: JSON.parse(row.failure_json) as NonNullable<WorkItemProjection['failure']> }),
      ...(row.token_usage === null || row.token_usage === undefined
        ? {}
        : {
            tokenUsage: JSON.parse(row.token_usage) as NonNullable<
              WorkItemProjection['tokenUsage']
            >,
          }),
    }));
  }

  async getCosts(runId?: RunId): Promise<{
    readonly totalInputTokens: number;
    readonly totalOutputTokens: number;
    readonly totalCostUsd: number;
    readonly items: readonly {
      readonly workItemId: string;
      readonly runId: string;
      readonly inputTokens: number;
      readonly outputTokens: number;
      readonly estimatedCostUsd: number;
    }[];
  }> {
    const db = this.requireDatabase();
    const rows = runId
      ? (db
          .prepare(
            'SELECT work_item_id, run_id, token_usage, cost_usd FROM work_items WHERE run_id=?',
          )
          .all(runId) as {
          work_item_id: string;
          run_id: string;
          token_usage: string | null;
          cost_usd: number;
        }[])
      : (db.prepare('SELECT work_item_id, run_id, token_usage, cost_usd FROM work_items').all() as {
          work_item_id: string;
          run_id: string;
          token_usage: string | null;
          cost_usd: number;
        }[]);

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCostUsd = 0;
    const items = rows.map((row) => {
      let inputTokens = 0;
      let outputTokens = 0;
      let estimatedCostUsd = row.cost_usd ?? 0;
      if (row.token_usage) {
        try {
          const parsed = JSON.parse(row.token_usage) as TokenUsage;
          inputTokens = parsed.inputTokens ?? 0;
          outputTokens = parsed.outputTokens ?? 0;
          if (parsed.estimatedCostUsd !== undefined) {
            estimatedCostUsd = parsed.estimatedCostUsd;
          }
        } catch {
          // ignore
        }
      }
      totalInputTokens += inputTokens;
      totalOutputTokens += outputTokens;
      totalCostUsd += estimatedCostUsd;
      return {
        workItemId: row.work_item_id,
        runId: row.run_id,
        inputTokens,
        outputTokens,
        estimatedCostUsd,
      };
    });

    return {
      totalInputTokens,
      totalOutputTokens,
      totalCostUsd,
      items,
    };
  }

  async rebuild(events: AsyncIterable<EventEnvelope>): Promise<void> {
    await this.reset();
    let batch: EventEnvelope[] = [];
    let count = 0;
    for await (const event of events) {
      batch.push(event);
      if (batch.length >= 1000) {
        await this.apply(batch);
        batch = [];
      }
      if (++count % 10000 === 0) {
        this.compactAppliedEvents();
      }
    }
    if (batch.length > 0) {
      await this.apply(batch);
    }
    this.compactAppliedEvents();
  }

  private compactAppliedEvents(): void {
    this.requireDatabase()
      .prepare(
        `DELETE FROM applied_events
         WHERE event_id NOT IN (
           SELECT event_id FROM applied_events
           ORDER BY rowid DESC
           LIMIT 10000
         )`,
      )
      .run();
  }

  private requireDatabase(): Database.Database {
    if (this.database === undefined) throw new Error('Projection database is not open.');
    return this.database;
  }
}

export class NativeGitBackend implements GitBackend {
  private readonly discovery: RepositoryDiscovery;

  public constructor(private readonly runner: ProcessRunner) {
    this.discovery = new RepositoryDiscovery(runner);
  }

  discover(startPath: string): Promise<RepositoryFacts> {
    return this.discovery.discover(startPath);
  }

  async status(repositoryRoot: string): Promise<RepositoryStatus> {
    const output = await this.git(repositoryRoot, ['status', '--porcelain=v1', '-z']);
    const staged: string[] = [];
    const modified: string[] = [];
    const untracked: string[] = [];
    let conflicted = false;
    for (const entry of output.split('\0').filter(Boolean)) {
      const code = entry.slice(0, 2);
      const file = entry.slice(3);
      if (code === '??') untracked.push(file);
      else {
        if (code[0] !== ' ') staged.push(file);
        if (code[1] !== ' ') modified.push(file);
        if (['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU'].includes(code)) conflicted = true;
      }
    }
    return {
      clean: staged.length === 0 && modified.length === 0 && untracked.length === 0,
      conflicted,
      staged,
      modified,
      untracked,
    };
  }

  async createBranch(request: BranchMutation): Promise<MutationResult> {
    await this.validateBranch(request.repositoryRoot, request.branch);
    const actual = await this.git(request.repositoryRoot, ['rev-parse', request.startPoint]);
    if (actual !== request.expectedStartOid) {
      throw new GitPreconditionError('EXPECTED_REF_MISMATCH', request.expectedStartOid, actual);
    }
    const operation = { executable: 'git', args: ['branch', request.branch, actual] as const };
    if (request.dryRun)
      return { changed: false, dryRun: true, operations: [operation], before: actual };
    return this.withLock(request.repositoryRoot, async () => {
      const existing = await this.gitOptional(request.repositoryRoot, [
        'rev-parse',
        '--verify',
        `refs/heads/${request.branch}`,
      ]);
      if (existing !== null) {
        if (existing !== actual)
          throw new GitPreconditionError('BRANCH_COLLISION', actual, existing);
        return {
          changed: false,
          dryRun: false,
          operations: [operation],
          before: actual,
          after: existing,
        };
      }
      await this.git(request.repositoryRoot, operation.args);
      return {
        changed: true,
        dryRun: false,
        operations: [operation],
        before: actual,
        after: actual,
      };
    });
  }

  async addWorktree(request: WorktreeMutation): Promise<MutationResult> {
    const facts = await this.discover(request.repositoryRoot);
    const managedRoot = path.dirname(path.resolve(request.path));
    const canonicalRoot = await canonicalPathInside(managedRoot, managedRoot);
    const target = path.join(canonicalRoot, path.basename(request.path));
    if (!isPathInside(canonicalRoot, target))
      throw new Error('Worktree path escapes its managed root.');
    if (isPathInside(facts.root, target))
      throw new Error('Managed worktrees must be outside the primary repository.');
    const actual = await this.git(request.repositoryRoot, [
      'rev-parse',
      `refs/heads/${request.branch}`,
    ]);
    if (actual !== request.expectedBranchOid) {
      throw new GitPreconditionError('EXPECTED_REF_MISMATCH', request.expectedBranchOid, actual);
    }
    const operation = {
      executable: 'git',
      args: ['worktree', 'add', target, request.branch] as const,
    };
    const occupied = facts.worktrees.find((item) => path.resolve(item.path) === target);
    if (occupied !== undefined) {
      if (occupied.branch !== request.branch || occupied.head !== actual) {
        throw new Error('Worktree path is occupied by another branch or revision.');
      }
      return {
        changed: false,
        dryRun: request.dryRun,
        operations: [operation],
        after: occupied.head,
      };
    }
    if (request.dryRun)
      return { changed: false, dryRun: true, operations: [operation], before: actual };
    return this.withLock(request.repositoryRoot, async () => {
      await this.git(request.repositoryRoot, operation.args);
      return {
        changed: true,
        dryRun: false,
        operations: [operation],
        before: actual,
        after: actual,
      };
    });
  }

  async removeWorktree(request: WorktreeRemoval): Promise<MutationResult> {
    const facts = await this.discover(request.repositoryRoot);
    const requestedParent = path.dirname(path.resolve(request.path));
    const canonicalParent = await canonicalPathInside(requestedParent, requestedParent);
    const target = path.join(canonicalParent, path.basename(request.path));
    const worktree = facts.worktrees.find((item) => path.resolve(item.path) === target);
    const operation = { executable: 'git', args: ['worktree', 'remove', target] as const };
    if (worktree === undefined)
      return { changed: false, dryRun: request.dryRun, operations: [operation] };
    if (!(await this.status(target)).clean) throw new Error('Refusing to remove a dirty worktree.');
    if (
      !(await this.isAncestor(request.repositoryRoot, worktree.head, request.expectedContainedBy))
    ) {
      throw new Error('Refusing to remove a worktree with uncontained commits.');
    }
    if (request.dryRun)
      return { changed: false, dryRun: true, operations: [operation], before: worktree.head };
    return this.withLock(request.repositoryRoot, async () => {
      await this.git(request.repositoryRoot, operation.args);
      return { changed: true, dryRun: false, operations: [operation], before: worktree.head };
    });
  }

  async isAncestor(repositoryRoot: string, ancestor: string, descendant: string): Promise<boolean> {
    const result = await this.runner.run({
      executable: 'git',
      args: ['merge-base', '--is-ancestor', ancestor, descendant],
      cwd: repositoryRoot,
    });
    if (result.exitCode === 0) return true;
    if (result.exitCode === 1) return false;
    throw new Error(`Git ancestry check failed: ${result.stderr.trim()}`);
  }

  private async withLock<T>(root: string, operation: () => Promise<T>): Promise<T> {
    const facts = await this.discover(root);
    const mutex = new FileMutex(path.join(facts.commonGitDirectory, 'omnibranch', 'git.lock'));
    await mutex.acquire(`git:${process.pid}`);
    try {
      return await operation();
    } finally {
      await mutex.release();
    }
  }

  private async validateBranch(cwd: string, branch: string): Promise<void> {
    const result = await this.runner.run({
      executable: 'git',
      args: ['check-ref-format', '--branch', branch],
      cwd,
    });
    if (result.exitCode !== 0) throw new Error(`Invalid branch name: ${branch}`);
  }

  private async git(cwd: string, args: readonly string[]): Promise<string> {
    const result = await this.runner.run({ executable: 'git', args, cwd });
    if (result.exitCode !== 0)
      throw new Error(`git ${args[0] ?? ''} failed: ${result.stderr.trim()}`);
    return result.stdout.trim();
  }

  private async gitOptional(cwd: string, args: readonly string[]): Promise<string | null> {
    const result = await this.runner.run({ executable: 'git', args, cwd });
    return result.exitCode === 0 ? result.stdout.trim() : null;
  }
}

export class GitPreconditionError extends Error {
  public constructor(
    readonly code: string,
    readonly expected: string,
    readonly actual: string,
  ) {
    super(`${code}: expected ${expected}, found ${actual}.`);
  }
}

export class Reconciler {
  public constructor(
    private readonly events: JsonlEventStore,
    private readonly projections: SqliteProjectionStore,
    private readonly git: NativeGitBackend,
  ) {}

  async reconcile(repositoryRoot: string): Promise<{
    readonly checkpointBefore: number;
    readonly checkpointAfter: number;
    readonly repository: RepositoryFacts;
    readonly applied: number;
  }> {
    if (!(await this.events.verify()).valid) {
      throw new Error('Cannot reconcile from an invalid canonical event log.');
    }
    const checkpointBefore = await this.projections.checkpoint();
    const missing: EventEnvelope[] = [];
    for await (const event of this.events.readAll(checkpointBefore)) missing.push(event);
    await this.projections.apply(missing);
    return {
      checkpointBefore,
      checkpointAfter: await this.projections.checkpoint(),
      repository: await this.git.discover(repositoryRoot),
      applied: missing.length,
    };
  }
}

function isEventEnvelope(value: unknown): value is EventEnvelope {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const event = value as Record<string, unknown>;
  return (
    event['schemaVersion'] === 1 &&
    typeof event['eventId'] === 'string' &&
    Number.isInteger(event['globalSequence']) &&
    typeof event['streamId'] === 'string' &&
    Number.isInteger(event['streamVersion']) &&
    typeof event['type'] === 'string' &&
    typeof event['occurredAt'] === 'string' &&
    typeof event['correlationId'] === 'string' &&
    'payload' in event
  );
}

function isWorkItemProjection(value: unknown): value is WorkItemProjection {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const projection = value as Record<string, unknown>;
  return (
    typeof projection['item'] === 'object' &&
    projection['item'] !== null &&
    typeof projection['status'] === 'string' &&
    Number.isInteger(projection['attempt'])
  );
}

function ledgerDiagnostic(filePath: string, rule: string, message: string): Diagnostic {
  return {
    path: path.resolve(filePath),
    rule,
    message,
    remediation: 'Restore the canonical ledger from a verified copy; regenerate only projections.',
    severity: 'error',
  };
}
