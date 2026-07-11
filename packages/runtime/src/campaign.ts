import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  AdapterResult,
  AiEngineAdapter,
  AssignmentEnvelope,
  CampaignId,
  EventEnvelope,
  LeaseId,
  RunId,
  WorkItem,
  WorkItemProjection,
  WorkerId,
} from '@omnibranch/contracts';
import {
  ids,
  type IdGenerator,
  type ProcessRunner,
  stableHash,
  SystemClock,
  type Clock,
  UuidGenerator,
  writeJsonFile,
  atomicWrite,
} from '@omnibranch/platform';

import { LeaseManager } from './orchestration.js';
import {
  JsonlEventStore,
  NativeGitBackend,
  Reconciler,
  SqliteProjectionStore,
} from './persistence.js';

export interface CampaignStatus {
  readonly campaignId: string;
  readonly checkpoint: number;
  readonly workItems: readonly WorkItemProjection[];
  readonly events: number;
}

export class LocalCampaignService {
  private readonly git: NativeGitBackend;
  private readonly leases: LeaseManager;

  public constructor(
    private readonly repositoryRoot: string,
    private readonly runner: ProcessRunner,
    private readonly clock: Clock = new SystemClock(),
    private readonly idGenerator: IdGenerator = new UuidGenerator(),
  ) {
    this.git = new NativeGitBackend(runner);
    this.leases = new LeaseManager(clock, idGenerator);
  }

  async create(name: string): Promise<{ readonly campaignId: CampaignId; readonly runId: RunId }> {
    const campaignId =
      `campaign-${stableHash(`${name}:${this.clock.now().toISOString()}`).slice(0, 12)}` as CampaignId;
    const runId = `run-${campaignId.slice('campaign-'.length)}` as RunId;
    const { events, projections } = await this.openState();
    try {
      const event = baseEvent(
        this.idGenerator,
        `campaign:${campaignId}`,
        'campaign.created',
        this.clock,
        { campaignId, runId, name, repositoryRoot: this.repositoryRoot },
      );
      const appended = await events.append({
        streamId: `campaign:${campaignId}`,
        expectedStreamVersion: 0,
        events: [event],
      });
      await projections.apply(appended);
      return { campaignId, runId };
    } finally {
      await projections.close();
    }
  }

  async planFixture(campaignId: string): Promise<readonly WorkItem[]> {
    const runId = runIdFor(campaignId);
    const items: readonly WorkItem[] = [
      fixtureItem(runId, 'alpha', 'fixture-output/alpha.txt', 'alpha\n'),
      fixtureItem(runId, 'beta', 'fixture-output/beta.txt', 'beta\n'),
    ];
    const { events, projections } = await this.openState();
    try {
      await projections.rebuild(events.readAll());
      const existing = await projections.getWorkItems(runId);
      if (existing.length > 0) return existing.map((projection) => projection.item);
      const streamId = `run:${runId}`;
      const expectedStreamVersion = await streamVersion(events, streamId);
      const appended = await events.append({
        streamId,
        expectedStreamVersion,
        events: items.map((item) =>
          baseEvent(this.idGenerator, streamId, 'work_item.projected', this.clock, {
            item,
            status: 'ready',
            attempt: 0,
          } satisfies WorkItemProjection),
        ),
      });
      await projections.apply(appended);
      return items;
    } finally {
      await projections.close();
    }
  }

  async runFixture(
    campaignId: string,
    adapter: AiEngineAdapter,
  ): Promise<readonly AdapterResult[]> {
    const runId = runIdFor(campaignId);
    const { events, projections } = await this.openState();
    try {
      await projections.rebuild(events.readAll());
      const workItems = await projections.getWorkItems(runId);
      if (workItems.length === 0) {
        await projections.close();
        await this.planFixture(campaignId);
        return this.runFixture(campaignId, adapter);
      }
      const pending = workItems.filter((projection) => projection.status !== 'succeeded');
      if (pending.length === 0) return [];
      const facts = await this.git.discover(this.repositoryRoot);
      if (facts.head === null) throw new Error('Campaign repository has no HEAD.');
      const worktreeRoot = path.join(path.dirname(facts.root), '.omnibranch-worktrees', campaignId);
      await mkdir(worktreeRoot, { recursive: true });

      const launchPromises: Promise<{
        readonly projection: WorkItemProjection;
        readonly worktreePath: string;
        readonly branch: string;
        readonly leaseId: LeaseId;
        readonly workerId: WorkerId;
        readonly handle: Awaited<ReturnType<AiEngineAdapter['launch']>>;
      }>[] = [];
      for (const projection of pending) {
        const suffix = projection.item.workItemId.replace(/^work-/, '');
        const branch = `omnibranch/work/${campaignId}/${suffix}`;
        const worktreePath = path.join(worktreeRoot, suffix);
        await this.git.createBranch({
          repositoryRoot: facts.root,
          branch,
          startPoint: 'HEAD',
          expectedStartOid: facts.head,
          dryRun: false,
        });
        await this.git.addWorktree({
          repositoryRoot: facts.root,
          path: worktreePath,
          branch,
          expectedBranchOid: facts.head,
          dryRun: false,
        });
        const workerId = `mock-${suffix}` as WorkerId;
        const lease = this.leases.acquire({
          workItemId: projection.item.workItemId,
          workerId,
          ownership: projection.item.ownership,
          attempt: projection.attempt + 1,
          ttlMs: 60_000,
          heartbeatMs: 30_000,
        });
        const outputPath = String(projection.item.expectedOutput['path']);
        const contents = String(projection.item.expectedOutput['contents']);
        const assignment: AssignmentEnvelope = {
          assignmentId: `assignment-${projection.item.workItemId}`,
          runId,
          workItemId: projection.item.workItemId,
          objective: projection.item.summary,
          scope: {
            allowedPaths: [outputPath],
            forbiddenPaths: ['.git/**', '.omnibranch/**'],
            repositoryRoot: worktreePath,
            writeAllowed: true,
          },
          constraints: ['Do not mutate Git metadata or files outside the assigned output.'],
          context: { mode: 'complete', outputPath, contents },
          validation: [`Output ${outputPath} must exactly match the assigned content.`],
          escalation: ['Return blocked instead of widening scope.'],
          lease,
        };
        launchPromises.push(
          (async () => {
            const preparedAssignment = await adapter.prepare(assignment);
            const handle = await adapter.launch(preparedAssignment);
            return {
              projection,
              worktreePath,
              branch,
              leaseId: lease.leaseId,
              workerId,
              handle,
            };
          })(),
        );
      }

      const prepared = await Promise.all(launchPromises);
      const results = await Promise.all(prepared.map((entry) => adapter.collect(entry.handle)));
      for (const [index, entry] of prepared.entries()) {
        const result = results[index]!;
        this.leases.assertAuthority(
          entry.projection.item.workItemId,
          entry.leaseId,
          entry.workerId,
        );
        validateAdapterCompletion(entry.projection.item, result, entry.worktreePath);
        const outputPath = String(entry.projection.item.expectedOutput['path']);
        const expected = String(entry.projection.item.expectedOutput['contents']);
        const actual = await readFile(path.join(entry.worktreePath, outputPath), 'utf8');
        if (actual !== expected) throw new Error(`Mock output mismatch for ${outputPath}.`);
        await this.gitCommand(entry.worktreePath, ['add', '--', outputPath]);
        await this.gitCommand(entry.worktreePath, [
          'commit',
          '-m',
          `omnibranch: complete ${entry.projection.item.workItemId}`,
        ]);
        const streamId = `run:${runId}`;
        const expectedVersion = await streamVersion(events, streamId);
        const appended = await events.append({
          streamId,
          expectedStreamVersion: expectedVersion,
          events: [
            baseEvent(this.idGenerator, streamId, 'adapter.completed', this.clock, result),
            baseEvent(this.idGenerator, streamId, 'work_item.projected', this.clock, {
              item: entry.projection.item,
              status: 'succeeded',
              attempt: entry.projection.attempt + 1,
            } satisfies WorkItemProjection),
          ],
        });
        await projections.apply(appended);
        this.leases.release(entry.projection.item.workItemId, entry.leaseId);
        await this.git.removeWorktree({
          repositoryRoot: this.repositoryRoot,
          path: entry.worktreePath,
          expectedContainedBy: entry.branch,
          dryRun: false,
        });
      }
      await this.writeReport(campaignId);
      return results;
    } finally {
      await projections.close().catch(() => undefined);
    }
  }

  async status(campaignId: string): Promise<CampaignStatus> {
    const { events, projections } = await this.openState();
    try {
      await projections.rebuild(events.readAll());
      let count = 0;
      for await (const event of events.readAll()) {
        if (event.globalSequence > 0) count += 1;
      }
      return {
        campaignId,
        checkpoint: await projections.checkpoint(),
        workItems: await projections.getWorkItems(runIdFor(campaignId)),
        events: count,
      };
    } finally {
      await projections.close();
    }
  }

  async reconcile(): Promise<Readonly<Record<string, unknown>>> {
    const { events, projections } = await this.openState();
    try {
      return await new Reconciler(events, projections, this.git).reconcile(this.repositoryRoot);
    } finally {
      await projections.close();
    }
  }

  async report(campaignId: string): Promise<{ readonly json: string; readonly markdown: string }> {
    return this.writeReport(campaignId);
  }

  private async openState(): Promise<{
    readonly events: JsonlEventStore;
    readonly projections: SqliteProjectionStore;
  }> {
    const facts = await this.git.discover(this.repositoryRoot);
    const stateRoot = path.join(facts.commonGitDirectory, 'omnibranch');
    const events = new JsonlEventStore(path.join(stateRoot, 'events.jsonl'));
    const projections = new SqliteProjectionStore(path.join(stateRoot, 'state.db'));
    await projections.open();
    return { events, projections };
  }

  private async writeReport(
    campaignId: string,
  ): Promise<{ readonly json: string; readonly markdown: string }> {
    const { events, projections } = await this.openState();
    try {
      await projections.rebuild(events.readAll());
      const status = {
        campaignId,
        checkpoint: await projections.checkpoint(),
        workItems: await projections.getWorkItems(runIdFor(campaignId)),
        events: [] as EventEnvelope[],
      };
      for await (const event of events.readAll()) status.events.push(event);
      const facts = await this.git.discover(this.repositoryRoot);
      const outputRoot = path.join(facts.commonGitDirectory, 'omnibranch', 'reports', campaignId);
      await mkdir(outputRoot, { recursive: true });
      const json = path.join(outputRoot, 'report.json');
      const markdown = path.join(outputRoot, 'report.md');
      await writeJsonFile(json, status);
      const lines = [
        `# OmniBranch Campaign ${campaignId}`,
        '',
        `Checkpoint: ${status.checkpoint}`,
        `Events: ${status.events.length}`,
        '',
        '## Work Items',
        ...status.workItems.map(
          (item) => `- ${item.item.workItemId}: ${item.status} (attempt ${item.attempt})`,
        ),
        '',
      ];
      await atomicWrite(markdown, lines.join('\n'));
      return { json, markdown };
    } finally {
      await projections.close();
    }
  }

  private async gitCommand(cwd: string, args: readonly string[]): Promise<void> {
    const result = await this.runner.run({ executable: 'git', args, cwd });
    if (result.exitCode !== 0) throw new Error(`git ${args[0] ?? ''} failed: ${result.stderr}`);
  }
}

function fixtureItem(runId: RunId, name: string, outputPath: string, contents: string): WorkItem {
  return {
    workItemId: ids.workItem(`work-${name}`),
    runId,
    kind: 'mock.edit',
    summary: `Write deterministic ${name} fixture output.`,
    dependencies: [],
    ownership: { include: [outputPath], exclude: [], mode: 'exclusive' },
    requestedCapabilities: ['workspace_write', 'structured_result'],
    retry: { maxAttempts: 2, backoffMs: 100, multiplier: 2, jitterSeed: name },
    timeoutMs: 30_000,
    idempotencyKey: stableHash(`${runId}:${name}:${outputPath}:${contents}`),
    expectedOutput: { path: outputPath, contents },
    lane: 'routine',
    priority: 100,
  };
}

function runIdFor(campaignId: string): RunId {
  return `run-${campaignId.replace(/^campaign-/, '')}` as RunId;
}

function baseEvent(
  idGenerator: IdGenerator,
  streamId: string,
  type: string,
  clock: Clock,
  payload: unknown,
): Omit<EventEnvelope, 'globalSequence' | 'streamVersion'> {
  return {
    schemaVersion: 1,
    eventId: ids.event(idGenerator.next()),
    streamId,
    type,
    occurredAt: clock.now().toISOString(),
    correlationId: streamId,
    payload,
  };
}

async function streamVersion(events: JsonlEventStore, streamId: string): Promise<number> {
  let version = 0;
  for await (const event of events.readStream(streamId)) version = event.streamVersion;
  return version;
}

function validateAdapterCompletion(
  item: WorkItem,
  result: AdapterResult,
  worktreePath: string,
): void {
  if (result.status !== 'completed') {
    throw new Error(`Adapter did not complete ${item.workItemId}: ${result.status}.`);
  }
  if (result.assignmentEcho.workItemId !== item.workItemId) {
    throw new Error('Adapter result assignment identity does not match the leased work item.');
  }
  if (result.artifacts.length === 0 || result.changeClaims.length === 0) {
    throw new Error(
      'Adapter completion lacks independently verifiable artifacts and change claims.',
    );
  }
  if (!path.isAbsolute(worktreePath)) throw new Error('Worktree path must be absolute.');
}
