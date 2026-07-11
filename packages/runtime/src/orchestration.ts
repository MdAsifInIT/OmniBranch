import picomatch from 'picomatch';

import type {
  ActionClass,
  ActionRequest,
  Approval,
  Lease,
  LeaseId,
  OwnershipScope,
  PolicyContext,
  PolicyDecision,
  PolicyEngine,
  Scheduler,
  SchedulerInput,
  ValidationEvidence,
  WorkItemId,
  WorkItemProjection,
  WorkItemStatus,
  WorkerId,
} from '@omnibranch/contracts';
import {
  ids,
  isPathInside,
  normalizeRepositoryPath,
  redact,
  type Clock,
  type IdGenerator,
  type ProcessRunner,
  SystemClock,
  UuidGenerator,
} from '@omnibranch/platform';

const TERMINAL = new Set<WorkItemStatus>(['succeeded', 'failed', 'canceled']);

const TRANSITIONS: Readonly<Record<WorkItemStatus, readonly WorkItemStatus[]>> = {
  planned: ['waiting_dependencies', 'canceled'],
  waiting_dependencies: ['ready', 'canceled'],
  ready: ['awaiting_approval', 'leasing', 'canceled'],
  awaiting_approval: ['ready', 'canceled'],
  leasing: ['leased', 'canceled'],
  leased: ['running', 'canceled'],
  running: ['validating', 'retry_backoff', 'failed', 'canceled'],
  validating: ['succeeded', 'retry_backoff', 'failed', 'canceled'],
  retry_backoff: ['ready', 'canceled'],
  succeeded: [],
  failed: [],
  canceled: [],
};

export class InvariantViolation extends Error {
  public constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function transitionWorkItem(
  projection: WorkItemProjection,
  target: WorkItemStatus,
): WorkItemProjection {
  if (!TRANSITIONS[projection.status].includes(target)) {
    throw new InvariantViolation(
      'INVALID_TRANSITION',
      `Work item ${projection.item.workItemId} cannot transition from ${projection.status} to ${target}.`,
    );
  }
  if (TERMINAL.has(projection.status)) {
    throw new InvariantViolation('TERMINAL_TRANSITION', 'Terminal work items cannot transition.');
  }
  return { ...projection, status: target };
}

export interface DagNode {
  readonly workItemId: WorkItemId;
  readonly dependencies: readonly WorkItemId[];
}

export function validateDag(nodes: readonly DagNode[]): {
  readonly topologicalOrder: readonly WorkItemId[];
  readonly depth: ReadonlyMap<WorkItemId, number>;
} {
  const byId = new Map(nodes.map((node) => [node.workItemId, node]));
  if (byId.size !== nodes.length) {
    throw new InvariantViolation('DUPLICATE_WORK_ITEM', 'Work item ids must be unique.');
  }
  for (const node of nodes) {
    for (const dependency of node.dependencies) {
      if (!byId.has(dependency)) {
        throw new InvariantViolation(
          'MISSING_DEPENDENCY',
          `${node.workItemId} references missing dependency ${dependency}.`,
        );
      }
      if (dependency === node.workItemId) {
        throw new InvariantViolation('DAG_CYCLE', 'A work item cannot depend on itself.');
      }
    }
  }
  const visiting = new Set<WorkItemId>();
  const visited = new Set<WorkItemId>();
  const order: WorkItemId[] = [];
  const depth = new Map<WorkItemId, number>();
  const visit = (id: WorkItemId): number => {
    if (visiting.has(id)) throw new InvariantViolation('DAG_CYCLE', `Cycle includes ${id}.`);
    if (visited.has(id)) return depth.get(id) ?? 0;
    visiting.add(id);
    const node = byId.get(id)!;
    const nodeDepth =
      node.dependencies.length === 0
        ? 0
        : Math.max(...node.dependencies.map((dependency) => visit(dependency))) + 1;
    visiting.delete(id);
    visited.add(id);
    depth.set(id, nodeDepth);
    order.push(id);
    return nodeDepth;
  };
  for (const id of [...byId.keys()].sort()) visit(id);
  return { topologicalOrder: order, depth };
}

export class DeterministicScheduler implements Scheduler {
  selectReady(input: SchedulerInput): readonly WorkItemProjection[] {
    if (input.globalCapacity <= 0) return [];
    const byId = new Map(input.items.map((projection) => [projection.item.workItemId, projection]));
    const { depth } = validateDag(
      input.items.map((projection) => ({
        workItemId: projection.item.workItemId,
        dependencies: projection.item.dependencies,
      })),
    );
    const selected: WorkItemProjection[] = [];
    const laneUsage = { ...input.activeByLane };
    const adapterUsage = { ...input.activeByAdapter };
    const candidates = input.items
      .filter((projection) => {
        if (projection.status !== 'ready') return false;
        if (
          projection.nextEligibleAt !== undefined &&
          new Date(projection.nextEligibleAt).getTime() > new Date(input.now).getTime()
        ) {
          return false;
        }
        return projection.item.dependencies.every(
          (dependency) => byId.get(dependency)?.status === 'succeeded',
        );
      })
      .sort((left, right) => {
        const lanePriority =
          (input.lanePriority[right.item.lane] ?? 0) - (input.lanePriority[left.item.lane] ?? 0);
        if (lanePriority !== 0) return lanePriority;
        const itemPriority = right.item.priority - left.item.priority;
        if (itemPriority !== 0) return itemPriority;
        const depthOrder =
          (depth.get(left.item.workItemId) ?? 0) - (depth.get(right.item.workItemId) ?? 0);
        if (depthOrder !== 0) return depthOrder;
        const identity = left.item.workItemId.localeCompare(right.item.workItemId);
        return identity !== 0 ? identity : left.attempt - right.attempt;
      });

    for (const candidate of candidates) {
      if (selected.length >= input.globalCapacity) break;
      const lane = candidate.item.lane;
      const adapter = candidate.item.adapterId;
      const laneLimit = input.laneCapacity[lane] ?? 0;
      if ((laneUsage[lane] ?? 0) >= laneLimit) continue;
      if (adapter !== undefined) {
        const adapterLimit = input.adapterCapacity[adapter] ?? 0;
        if ((adapterUsage[adapter] ?? 0) >= adapterLimit) continue;
        adapterUsage[adapter] = (adapterUsage[adapter] ?? 0) + 1;
      }
      laneUsage[lane] = (laneUsage[lane] ?? 0) + 1;
      selected.push(candidate);
    }
    return selected;
  }
}

export function normalizeOwnership(scope: OwnershipScope): OwnershipScope {
  return {
    include: [...new Set(scope.include.map(normalizeRepositoryPath))].sort(),
    exclude: [...new Set(scope.exclude.map(normalizeRepositoryPath))].sort(),
    mode: scope.mode,
  };
}

export function ownershipConflicts(leftInput: OwnershipScope, rightInput: OwnershipScope): boolean {
  const left = normalizeOwnership(leftInput);
  const right = normalizeOwnership(rightInput);
  if (left.mode === 'shared' && right.mode === 'shared') return false;
  for (const leftPattern of left.include) {
    for (const rightPattern of right.include) {
      if (!patternsMayOverlap(leftPattern, rightPattern)) continue;
      const samples = [literalPrefix(leftPattern), literalPrefix(rightPattern)].filter(Boolean);
      const excluded = samples.every(
        (sample) =>
          left.exclude.some((pattern) => picomatch.isMatch(sample, pattern)) ||
          right.exclude.some((pattern) => picomatch.isMatch(sample, pattern)),
      );
      if (!excluded) return true;
    }
  }
  return false;
}

function patternsMayOverlap(left: string, right: string): boolean {
  const leftPrefix = literalPrefix(left);
  const rightPrefix = literalPrefix(right);
  if (leftPrefix.startsWith(rightPrefix) || rightPrefix.startsWith(leftPrefix)) return true;
  return picomatch.isMatch(leftPrefix, right) || picomatch.isMatch(rightPrefix, left);
}

function literalPrefix(pattern: string): string {
  const firstMagic = pattern.search(/[*?{[(]/);
  return (firstMagic === -1 ? pattern : pattern.slice(0, firstMagic)).replace(/\/$/, '');
}

export class LeaseManager {
  private readonly leases = new Map<WorkItemId, Lease>();
  private readonly ownership = new Map<WorkItemId, OwnershipScope>();

  public constructor(
    private readonly clock: Clock = new SystemClock(),
    private readonly idsGenerator: IdGenerator = new UuidGenerator(),
  ) {}

  acquire(input: {
    readonly workItemId: WorkItemId;
    readonly workerId: WorkerId;
    readonly ownership: OwnershipScope;
    readonly attempt: number;
    readonly ttlMs: number;
    readonly heartbeatMs: number;
  }): Lease {
    this.expire();
    if (this.leases.has(input.workItemId)) {
      throw new InvariantViolation(
        'LEASE_EXISTS',
        `${input.workItemId} already has an active lease.`,
      );
    }
    for (const [workItemId, existing] of this.ownership) {
      if (ownershipConflicts(existing, input.ownership)) {
        throw new InvariantViolation(
          'OWNERSHIP_CONFLICT',
          `Ownership conflicts with ${workItemId}.`,
        );
      }
    }
    const issued = this.clock.now();
    const lease: Lease = {
      leaseId: this.idsGenerator.next() as LeaseId,
      workItemId: input.workItemId,
      workerId: input.workerId,
      issuedAt: issued.toISOString(),
      expiresAt: new Date(issued.getTime() + input.ttlMs).toISOString(),
      heartbeatDeadline: new Date(issued.getTime() + input.heartbeatMs).toISOString(),
      attempt: input.attempt,
      lockReferences: normalizeOwnership(input.ownership).include,
    };
    this.leases.set(input.workItemId, lease);
    this.ownership.set(input.workItemId, normalizeOwnership(input.ownership));
    return lease;
  }

  heartbeat(
    workItemId: WorkItemId,
    leaseId: LeaseId,
    workerId: WorkerId,
    heartbeatMs: number,
  ): Lease {
    this.expire();
    const lease = this.leases.get(workItemId);
    if (lease === undefined || lease.leaseId !== leaseId || lease.workerId !== workerId) {
      throw new InvariantViolation(
        'STALE_LEASE',
        'Lease authority is missing, expired, or superseded.',
      );
    }
    const refreshed: Lease = {
      ...lease,
      heartbeatDeadline: new Date(this.clock.now().getTime() + heartbeatMs).toISOString(),
    };
    this.leases.set(workItemId, refreshed);
    return refreshed;
  }

  assertAuthority(workItemId: WorkItemId, leaseId: LeaseId, workerId: WorkerId): void {
    this.expire();
    const lease = this.leases.get(workItemId);
    if (lease === undefined || lease.leaseId !== leaseId || lease.workerId !== workerId) {
      throw new InvariantViolation('STALE_LEASE', 'Write denied because lease authority is stale.');
    }
  }

  release(workItemId: WorkItemId, leaseId: LeaseId): void {
    const lease = this.leases.get(workItemId);
    if (lease === undefined || lease.leaseId !== leaseId) {
      throw new InvariantViolation('STALE_LEASE', 'Cannot release a missing or superseded lease.');
    }
    this.leases.delete(workItemId);
    this.ownership.delete(workItemId);
  }

  expire(): readonly Lease[] {
    const now = this.clock.now().getTime();
    const expired: Lease[] = [];
    for (const [workItemId, lease] of this.leases) {
      if (
        new Date(lease.expiresAt).getTime() <= now ||
        new Date(lease.heartbeatDeadline).getTime() <= now
      ) {
        expired.push(lease);
        this.leases.delete(workItemId);
        this.ownership.delete(workItemId);
      }
    }
    return expired;
  }
}

const KNOWN_ACTIONS = new Set<ActionClass>([
  'read_repo',
  'write_repo',
  'execute_local_safe',
  'execute_local_mutating',
  'git_read',
  'git_write_safe',
  'git_write_destructive',
  'network_read',
  'network_write',
  'secret_read',
  'plugin_load',
  'scm_mutation',
  'cloud_mutation',
]);

export class DeterministicPolicyEngine implements PolicyEngine {
  public constructor(
    private readonly clock: Clock = new SystemClock(),
    private readonly idGenerator: IdGenerator = new UuidGenerator(),
  ) {}

  evaluate(request: ActionRequest, context: PolicyContext): PolicyDecision {
    const action = KNOWN_ACTIONS.has(request.actionClass as ActionClass)
      ? (request.actionClass as ActionClass)
      : 'unknown';
    const reasons: string[] = [];
    let outcome: PolicyDecision['outcome'] = 'allow';
    let reasonCode = 'explicitly-allowed-low-risk';

    if (action === 'unknown') {
      outcome = 'deny';
      reasonCode = 'unknown-action';
    } else if (context.deniedActions.includes(action)) {
      outcome = 'deny';
      reasonCode = 'explicit-deny';
    } else if (
      request.repositoryPath !== undefined &&
      !isPathInside(context.repositoryRoot, request.repositoryPath)
    ) {
      outcome = 'deny';
      reasonCode = 'path-outside-repository';
    } else if (
      action === 'write_repo' &&
      (context.lease === undefined || new Date(context.lease.expiresAt) <= new Date(context.now))
    ) {
      outcome = 'deny';
      reasonCode = 'missing-or-stale-lease';
    } else if (
      request.destructive === true ||
      action === 'git_write_destructive' ||
      action === 'cloud_mutation'
    ) {
      outcome = 'deny';
      reasonCode = 'destructive-default-deny';
    } else if (request.pluginTrust === 'denied' || request.pluginTrust === 'unverified') {
      outcome = 'deny';
      reasonCode = 'untrusted-plugin';
    } else if (
      request.usesSecret === true ||
      action === 'secret_read' ||
      action === 'network_write' ||
      action === 'scm_mutation' ||
      action === 'git_write_safe' ||
      action === 'execute_local_mutating' ||
      request.pluginTrust === 'restricted'
    ) {
      const approval = findApproval(request, context.approvals, context.now);
      if (approval === undefined) {
        outcome = 'approval_required';
        reasonCode = 'elevated-action';
      } else if (approval.decidedBy === request.actorId) {
        outcome = 'deny';
        reasonCode = 'self-approval';
      } else {
        reasonCode = 'approved-elevated-action';
      }
    } else if (!context.explicitAllowances.includes(action)) {
      outcome = 'approval_required';
      reasonCode = 'not-explicitly-allowed';
    }
    reasons.push(reasonCode);
    return {
      decisionId: ids.policyDecision(this.idGenerator.next()),
      outcome,
      reasonCode,
      reasons,
      actionClass: action,
      evaluatedAt: this.clock.now().toISOString(),
    };
  }
}

function findApproval(
  request: ActionRequest,
  approvals: readonly Approval[],
  now: string,
): Approval | undefined {
  return approvals.find(
    (approval) =>
      approval.action === request.actionClass &&
      (request.target === undefined || approval.targetId === request.target) &&
      approval.decision === 'granted' &&
      (approval.expiresAt === undefined || new Date(approval.expiresAt) > new Date(now)),
  );
}

export interface ValidationNode {
  readonly id: string;
  readonly required: boolean;
  readonly dependencies: readonly string[];
}

export class ValidationGraph {
  public constructor(private readonly nodes: readonly ValidationNode[]) {
    validateDag(
      nodes.map((node) => ({
        workItemId: node.id as WorkItemId,
        dependencies: node.dependencies.map((dependency) => dependency as WorkItemId),
      })),
    );
  }

  aggregate(evidence: readonly ValidationEvidence[]): {
    readonly passed: boolean;
    readonly missing: readonly string[];
    readonly failed: readonly string[];
  } {
    const byId = new Map(evidence.map((item) => [item.validatorId, item]));
    const missing = this.nodes
      .filter((node) => node.required && !byId.has(node.id))
      .map((node) => node.id);
    const failed = this.nodes
      .filter((node) => node.required && byId.get(node.id)?.status !== 'pass')
      .map((node) => node.id);
    return { passed: missing.length === 0 && failed.length === 0, missing, failed };
  }
}

export class CommandValidator {
  public constructor(
    private readonly runner: ProcessRunner,
    private readonly clock: Clock = new SystemClock(),
    private readonly idGenerator: IdGenerator = new UuidGenerator(),
  ) {}

  async run(input: {
    readonly validatorId: string;
    readonly repositoryRoot: string;
    readonly revision: string;
    readonly command: string;
    readonly timeoutMs: number;
    readonly signal?: AbortSignal;
  }): Promise<ValidationEvidence> {
    const started = this.clock.now();
    const shell =
      process.platform === 'win32'
        ? {
            executable: 'powershell',
            args: ['-NoProfile', '-NonInteractive', '-Command', input.command],
          }
        : { executable: 'bash', args: ['-lc', input.command] };
    try {
      const result = await this.runner.run({
        ...shell,
        cwd: input.repositoryRoot,
        timeoutMs: input.timeoutMs,
        ...(input.signal === undefined ? {} : { signal: input.signal }),
      });
      const ended = this.clock.now();
      return {
        validatorId: input.validatorId,
        status: result.exitCode === 0 ? 'pass' : 'fail',
        inputRevision: input.revision,
        startedAt: started.toISOString(),
        endedAt: ended.toISOString(),
        durationMs: Math.max(0, ended.getTime() - started.getTime()),
        exitCode: result.exitCode,
        commandSummary: input.validatorId,
        artifacts: [
          {
            artifactId: ids.artifact(this.idGenerator.next()),
            kind: 'validation-log',
            path: `inline:${redact(`${result.stdout}\n${result.stderr}`).slice(0, 4096)}`,
            source: 'runtime',
          },
        ],
      };
    } catch (error) {
      const ended = this.clock.now();
      return {
        validatorId: input.validatorId,
        status: 'error',
        inputRevision: input.revision,
        startedAt: started.toISOString(),
        endedAt: ended.toISOString(),
        durationMs: Math.max(0, ended.getTime() - started.getTime()),
        artifacts: [],
        message: redact(error instanceof Error ? error.message : String(error)),
      };
    }
  }
}

export function deterministicBackoff(
  attempt: number,
  baseMs: number,
  multiplier: number,
  jitterSeed?: string,
): number {
  if (!Number.isInteger(attempt) || attempt < 1)
    throw new Error('Attempt must be a positive integer.');
  const base = baseMs * multiplier ** (attempt - 1);
  if (jitterSeed === undefined) return Math.round(base);
  let hash = 2166136261;
  for (const character of `${jitterSeed}:${attempt}`) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  const jitter = ((hash >>> 0) % 2001) / 10_000 - 0.1;
  return Math.max(0, Math.round(base * (1 + jitter)));
}
