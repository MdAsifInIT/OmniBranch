export type Brand<T, B extends string> = T & { readonly __brand: B };

export type CampaignId = Brand<string, 'CampaignId'>;
export type RunId = Brand<string, 'RunId'>;
export type WorkItemId = Brand<string, 'WorkItemId'>;
export type AttemptId = Brand<string, 'AttemptId'>;
export type LeaseId = Brand<string, 'LeaseId'>;
export type ApprovalId = Brand<string, 'ApprovalId'>;
export type EventId = Brand<string, 'EventId'>;
export type ArtifactId = Brand<string, 'ArtifactId'>;
export type AdapterId = Brand<string, 'AdapterId'>;
export type WorkerId = Brand<string, 'WorkerId'>;
export type PolicyDecisionId = Brand<string, 'PolicyDecisionId'>;

export type WorkItemStatus =
  | 'planned'
  | 'waiting_dependencies'
  | 'ready'
  | 'awaiting_approval'
  | 'leasing'
  | 'leased'
  | 'running'
  | 'validating'
  | 'retry_backoff'
  | 'succeeded'
  | 'failed'
  | 'canceled';

export type ValidationStatus = 'pass' | 'fail' | 'error' | 'unavailable' | 'skipped';
export type PolicyOutcome = 'allow' | 'approval_required' | 'deny' | 'force_dry_run';
export type CapabilityState = 'native' | 'adapted' | 'unsupported' | 'unknown';
export type AdapterStatus =
  'completed' | 'partial' | 'blocked' | 'cancelled' | 'failed' | 'policy_denied';
export type ResumeLevel = 'full' | 'checkpoint' | 'handoff' | 'none';
export type CompatibilityTier = 1 | 2 | 3 | 4;

export type ActionClass =
  | 'read_repo'
  | 'write_repo'
  | 'execute_local_safe'
  | 'execute_local_mutating'
  | 'git_read'
  | 'git_write_safe'
  | 'git_write_destructive'
  | 'network_read'
  | 'network_write'
  | 'secret_read'
  | 'plugin_load'
  | 'scm_mutation'
  | 'cloud_mutation';

export interface Diagnostic {
  readonly path: string;
  readonly rule: string;
  readonly message: string;
  readonly remediation: string;
  readonly severity: 'error' | 'warning';
}

export interface MetadataConfig {
  readonly name: string;
  readonly description?: string;
  readonly owners?: readonly string[];
  readonly tags?: Readonly<Record<string, string>>;
}

export interface LeaseConfig {
  readonly ttl: string;
  readonly heartbeatInterval: string;
  readonly gracePeriod: string;
}

export interface RuntimeConfig {
  readonly nodeVersion: string;
  readonly workspaceRoot: string;
  readonly tempRoot: string;
  readonly worktreeRoot: string;
  readonly shell: { readonly windows: 'powershell'; readonly posix: 'bash' | 'zsh' };
  readonly dryRunDefault: boolean;
  readonly globalConcurrency: number;
  readonly reconciliationInterval: string;
  readonly lease: LeaseConfig;
}

export interface BranchConfig {
  readonly prefix: string;
  readonly base: string;
  readonly ephemeral: boolean;
}

export interface BranchTopologyConfig {
  readonly trunk: string;
  readonly integrationBranches: readonly { readonly name: string; readonly protect: boolean }[];
  readonly laneBranches: Readonly<Record<string, BranchConfig>>;
  readonly attemptBranches: { readonly prefix: string; readonly baseFromLane: boolean };
}

export interface LaneConfig {
  readonly priority: number;
  readonly maxConcurrentRuns: number;
  readonly maxConcurrentItems: number;
  readonly branchClass: string;
  readonly disabledByDefault: boolean;
  readonly approvals: { readonly requiredFor: readonly string[] };
}

export interface OwnershipSet {
  readonly globs: readonly string[];
  readonly lanes: readonly string[];
  readonly requiresApproval: boolean;
  readonly description?: string;
}

export interface CommandConfig {
  readonly id: string;
  readonly run: { readonly windows?: string; readonly posix?: string };
  readonly timeout?: string;
  readonly workingDirectory?: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly outputs?: { readonly format: 'text' | 'json' };
  readonly continueOnError?: boolean;
  readonly requiresApproval?: boolean;
}

export interface PolicyRule {
  readonly id: string;
  readonly when: Readonly<Record<string, unknown>>;
  readonly then: {
    readonly action: 'allow' | 'deny' | 'require_approval' | 'force_dry_run' | 'escalate' | 'skip';
    readonly reason: string;
  };
}

export interface WorkspacePlan {
  readonly apiVersion: 'omnibranch.dev/v1alpha1';
  readonly kind: 'WorkspacePlan';
  readonly metadata: MetadataConfig;
  readonly runtime: RuntimeConfig;
  readonly branchTopology: BranchTopologyConfig;
  readonly lanes: Readonly<Record<string, LaneConfig>>;
  readonly ownership: {
    readonly defaultMode: 'exclusive' | 'shared';
    readonly sets: Readonly<Record<string, OwnershipSet>>;
  };
  readonly commands: Readonly<Record<string, readonly CommandConfig[]>>;
  readonly policies: {
    readonly defaultAction: 'allow' | 'deny' | 'require_approval';
    readonly packs: readonly { readonly name: string }[];
    readonly rules: readonly PolicyRule[];
  };
  readonly adapters: Readonly<Record<string, unknown>>;
  readonly state: {
    readonly projection: { readonly backend: 'sqlite'; readonly path: string };
    readonly eventStore: { readonly backend: 'jsonl'; readonly path: string };
    readonly snapshots: { readonly enabled: boolean; readonly interval: number };
  };
  readonly reporting: {
    readonly outputRoot: string;
    readonly formats: readonly ('markdown' | 'json')[];
    readonly includeTelemetry: boolean;
    readonly redact: {
      readonly secrets: boolean;
      readonly envValues: boolean;
      readonly userPaths: boolean;
    };
  };
  readonly secrets?: {
    readonly rules: {
      readonly allowInline: boolean;
      readonly allowEnv: boolean;
      readonly allowFileRef: boolean;
      readonly allowCommandRef: boolean;
    };
    readonly named?: Readonly<Record<string, SecretReference>>;
  };
}

export type SecretReference =
  { readonly fromEnv: string } | { readonly fromFile: string } | { readonly fromKeychain: string };

export interface EventEnvelope<TType extends string = string, TPayload = unknown> {
  readonly schemaVersion: 1;
  readonly eventId: EventId;
  readonly globalSequence: number;
  readonly streamId: string;
  readonly streamVersion: number;
  readonly type: TType;
  readonly occurredAt: string;
  readonly correlationId: string;
  readonly causationId?: EventId;
  readonly payload: TPayload;
}

export interface OwnershipScope {
  readonly include: readonly string[];
  readonly exclude: readonly string[];
  readonly mode: 'exclusive' | 'shared';
}

export interface RetryPolicy {
  readonly maxAttempts: number;
  readonly backoffMs: number;
  readonly multiplier: number;
  readonly jitterSeed?: string;
}

export interface WorkItem {
  readonly workItemId: WorkItemId;
  readonly runId: RunId;
  readonly kind: string;
  readonly summary: string;
  readonly dependencies: readonly WorkItemId[];
  readonly ownership: OwnershipScope;
  readonly requestedCapabilities: readonly string[];
  readonly retry: RetryPolicy;
  readonly timeoutMs: number;
  readonly idempotencyKey: string;
  readonly expectedOutput: Readonly<Record<string, unknown>>;
  readonly lane: string;
  readonly priority: number;
  readonly adapterId?: AdapterId;
}

export interface WorkItemProjection {
  readonly item: WorkItem;
  readonly status: WorkItemStatus;
  readonly attempt: number;
  readonly nextEligibleAt?: string;
  readonly leaseId?: LeaseId;
  readonly failure?: NormalizedError;
}

export interface Lease {
  readonly leaseId: LeaseId;
  readonly workItemId: WorkItemId;
  readonly workerId: WorkerId;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly heartbeatDeadline: string;
  readonly attempt: number;
  readonly lockReferences: readonly string[];
}

export interface Approval {
  readonly approvalId: ApprovalId;
  readonly targetId: string;
  readonly action: ActionClass;
  readonly requester: string;
  readonly approverClass: string;
  readonly createdAt: string;
  readonly expiresAt?: string;
  readonly decision: 'pending' | 'granted' | 'rejected' | 'expired';
  readonly reason?: string;
  readonly decidedBy?: string;
}

export interface PolicyDecision {
  readonly decisionId: PolicyDecisionId;
  readonly outcome: PolicyOutcome;
  readonly reasonCode: string;
  readonly reasons: readonly string[];
  readonly actionClass: ActionClass | 'unknown';
  readonly evaluatedAt: string;
  readonly approvalId?: ApprovalId;
}

export interface ActionRequest {
  readonly actionClass: ActionClass | string;
  readonly actorId: string;
  readonly target?: string;
  readonly repositoryPath?: string;
  readonly externalTarget?: string;
  readonly destructive?: boolean;
  readonly usesSecret?: boolean;
  readonly pluginTrust?: 'trusted' | 'restricted' | 'unverified' | 'denied';
  readonly dryRun?: boolean;
}

export interface ValidationEvidence {
  readonly validatorId: string;
  readonly status: ValidationStatus;
  readonly inputRevision: string;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly durationMs: number;
  readonly exitCode?: number;
  readonly commandSummary?: string;
  readonly artifacts: readonly ArtifactReference[];
  readonly message?: string;
}

export interface ArtifactReference {
  readonly artifactId: ArtifactId;
  readonly kind: string;
  readonly path: string;
  readonly checksum?: string;
  readonly source: 'adapter' | 'engine' | 'runtime';
}

export interface AdapterCapabilities {
  readonly interactive_session: CapabilityState;
  readonly noninteractive_run: CapabilityState;
  readonly workspace_read: CapabilityState;
  readonly workspace_write: CapabilityState;
  readonly command_execution: CapabilityState;
  readonly structured_result: CapabilityState;
  readonly artifact_collection: CapabilityState;
  readonly session_resume: CapabilityState;
  readonly cancellation: CapabilityState;
  readonly skills: CapabilityState;
  readonly policy_controls: CapabilityState;
  readonly version_probe: CapabilityState;
  readonly guided_mode: CapabilityState;
}

export interface AdapterProbe {
  readonly adapterId: AdapterId;
  readonly engineFamily: string;
  readonly engineSurface: string;
  readonly installed: boolean;
  readonly executable?: string;
  readonly version: string;
  readonly supported: boolean;
  readonly tier: CompatibilityTier;
  readonly capabilities: AdapterCapabilities;
  readonly warnings: readonly string[];
}

export interface AssignmentEnvelope {
  readonly assignmentId: string;
  readonly runId: RunId;
  readonly workItemId: WorkItemId;
  readonly objective: string;
  readonly scope: {
    readonly allowedPaths: readonly string[];
    readonly forbiddenPaths: readonly string[];
    readonly repositoryRoot: string;
    readonly writeAllowed: boolean;
  };
  readonly constraints: readonly string[];
  readonly context: Readonly<Record<string, unknown>>;
  readonly validation: readonly string[];
  readonly escalation: readonly string[];
  readonly lease: Lease;
}

export interface AdapterResult {
  readonly runId: RunId;
  readonly adapterId: AdapterId;
  readonly engineFamily: string;
  readonly engineSurface: string;
  readonly engineVersion: string;
  readonly status: AdapterStatus;
  readonly summary: string;
  readonly assignmentEcho: {
    readonly assignmentId: string;
    readonly workItemId: WorkItemId;
  };
  readonly artifacts: readonly ArtifactReference[];
  readonly changeClaims: readonly {
    readonly path: string;
    readonly source: 'engine_claim' | 'adapter_observation';
  }[];
  readonly approvalsRequested: readonly ActionClass[];
  readonly warnings: readonly string[];
  readonly timestamps: {
    readonly startedAt: string;
    readonly lastActivityAt: string;
    readonly endedAt: string;
    readonly durationMs: number;
  };
}

export interface NormalizedError {
  readonly code: string;
  readonly message: string;
  readonly retryability: 'retryable' | 'non_retryable' | 'policy_blocked' | 'approval_blocked';
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface CliEnvelope<T = unknown> {
  readonly ok: boolean;
  readonly command: string;
  readonly data?: T;
  readonly warnings: readonly string[];
  readonly policyDecisions: readonly PolicyDecision[];
  readonly dryRun: boolean;
  readonly error?: NormalizedError;
}

export interface AppendEventsRequest {
  readonly streamId: string;
  readonly expectedStreamVersion: number;
  readonly events: readonly Omit<EventEnvelope, 'globalSequence' | 'streamVersion'>[];
}

export interface EventStore {
  append(request: AppendEventsRequest): Promise<readonly EventEnvelope[]>;
  readAll(afterGlobalSequence?: number): AsyncIterable<EventEnvelope>;
  readStream(streamId: string, afterVersion?: number): AsyncIterable<EventEnvelope>;
  verify(): Promise<{ readonly valid: boolean; readonly diagnostics: readonly Diagnostic[] }>;
}

export interface ProjectionStore {
  reset(): Promise<void>;
  apply(events: readonly EventEnvelope[]): Promise<void>;
  checkpoint(): Promise<number>;
  getWorkItems(runId: RunId): Promise<readonly WorkItemProjection[]>;
}

export interface GitBackend {
  discover(startPath: string): Promise<RepositoryFacts>;
  status(repositoryRoot: string): Promise<RepositoryStatus>;
  createBranch(request: BranchMutation): Promise<MutationResult>;
  addWorktree(request: WorktreeMutation): Promise<MutationResult>;
  removeWorktree(request: WorktreeRemoval): Promise<MutationResult>;
  isAncestor(repositoryRoot: string, ancestor: string, descendant: string): Promise<boolean>;
}

export interface RepositoryFacts {
  readonly root: string;
  readonly commonGitDirectory: string;
  readonly head: string | null;
  readonly currentBranch: string | null;
  readonly defaultBranch: string | null;
  readonly remotes: readonly { readonly name: string; readonly url: string }[];
  readonly worktrees: readonly {
    readonly path: string;
    readonly head: string;
    readonly branch: string | null;
  }[];
}

export interface RepositoryStatus {
  readonly clean: boolean;
  readonly conflicted: boolean;
  readonly staged: readonly string[];
  readonly modified: readonly string[];
  readonly untracked: readonly string[];
}

export interface BranchMutation {
  readonly repositoryRoot: string;
  readonly branch: string;
  readonly startPoint: string;
  readonly expectedStartOid: string;
  readonly dryRun: boolean;
}

export interface WorktreeMutation {
  readonly repositoryRoot: string;
  readonly path: string;
  readonly branch: string;
  readonly expectedBranchOid: string;
  readonly dryRun: boolean;
}

export interface WorktreeRemoval {
  readonly repositoryRoot: string;
  readonly path: string;
  readonly expectedContainedBy: string;
  readonly dryRun: boolean;
}

export interface MutationResult {
  readonly changed: boolean;
  readonly dryRun: boolean;
  readonly operations: readonly { readonly executable: string; readonly args: readonly string[] }[];
  readonly before?: string;
  readonly after?: string;
}

export interface Scheduler {
  selectReady(input: SchedulerInput): readonly WorkItemProjection[];
}

export interface SchedulerInput {
  readonly items: readonly WorkItemProjection[];
  readonly now: string;
  readonly globalCapacity: number;
  readonly lanePriority: Readonly<Record<string, number>>;
  readonly laneCapacity: Readonly<Record<string, number>>;
  readonly adapterCapacity: Readonly<Record<string, number>>;
  readonly activeByLane: Readonly<Record<string, number>>;
  readonly activeByAdapter: Readonly<Record<string, number>>;
}

export interface PolicyEngine {
  evaluate(request: ActionRequest, context: PolicyContext): PolicyDecision;
}

export interface PolicyContext {
  readonly now: string;
  readonly repositoryRoot: string;
  readonly lease?: Lease;
  readonly approvals: readonly Approval[];
  readonly explicitAllowances: readonly ActionClass[];
  readonly deniedActions: readonly ActionClass[];
  readonly externalAllowlist: readonly string[];
}

export interface ValidationRunner {
  run(validatorId: string, context: ValidationContext): Promise<ValidationEvidence>;
}

export interface ValidationContext {
  readonly repositoryRoot: string;
  readonly inputRevision: string;
  readonly command: CommandConfig;
  readonly signal?: AbortSignal;
}

export interface AiEngineAdapter {
  probe(): Promise<AdapterProbe>;
  prepare(assignment: AssignmentEnvelope): Promise<PreparedAssignment>;
  launch(prepared: PreparedAssignment, signal?: AbortSignal): Promise<AdapterRunHandle>;
  collect(handle: AdapterRunHandle): Promise<AdapterResult>;
  cancel(handle: AdapterRunHandle): Promise<AdapterResult>;
  resume(handle: AdapterRunHandle): Promise<AdapterRunHandle>;
}

export interface PreparedAssignment {
  readonly adapterId: AdapterId;
  readonly workingDirectory: string;
  readonly prompt: string;
  readonly assignment: AssignmentEnvelope;
  readonly guided: boolean;
}

export interface AdapterRunHandle {
  readonly runId: RunId;
  readonly adapterId: AdapterId;
  readonly externalRunId: string;
  readonly startedAt: string;
  readonly resumeLevel: ResumeLevel;
}

export interface ScmAdapter {
  probe(): Promise<{ readonly authenticated: boolean; readonly repository: string }>;
  plan(action: string, input: Readonly<Record<string, unknown>>): Promise<MutationResult>;
  execute(
    action: string,
    input: Readonly<Record<string, unknown>>,
    approval: Approval,
  ): Promise<Readonly<Record<string, unknown>>>;
}

export interface CiAdapter {
  validate(context: ValidationContext): Promise<ValidationEvidence>;
}

export interface SecretProvider {
  resolve(reference: SecretReference): Promise<string>;
}

export type ProviderTarget =
  'auto' | 'all' | 'codex' | 'claude' | 'opencode' | 'antigravity' | 'agents';

export type ConcreteProviderTarget = Exclude<ProviderTarget, 'auto' | 'all'>;
export type InstallScope = 'user' | 'project';
export type InstallAction = 'install' | 'update' | 'rollback' | 'uninstall';
export type InstallOperationMode = 'create' | 'replace' | 'update' | 'restore' | 'remove' | 'noop';

export interface InstalledFileEvidence {
  readonly path: string;
  readonly sha256: string;
  readonly size: number;
  readonly executable: boolean;
}

export interface InstallOperation {
  readonly targets: readonly ConcreteProviderTarget[];
  readonly destination: string;
  readonly mode: InstallOperationMode;
  readonly managed: boolean;
  readonly modified: boolean;
  readonly reason: string;
}

export interface InstallPlan {
  readonly schemaVersion: 'omnibranch.dev/skill-install/v1';
  readonly action: InstallAction;
  readonly requestedTarget: ProviderTarget;
  readonly scope: InstallScope;
  readonly projectRoot?: string;
  readonly stateRoot: string;
  readonly payloadVersion: string;
  readonly payloadSha256: string;
  readonly operations: readonly InstallOperation[];
  readonly warnings: readonly string[];
  readonly dryRun: boolean;
}

export interface InstallReceipt {
  readonly schemaVersion: 'omnibranch.dev/skill-install/v1';
  readonly receiptId: string;
  readonly action: InstallAction;
  readonly targets: readonly ConcreteProviderTarget[];
  readonly scope: InstallScope;
  readonly destination: string;
  readonly stateRoot: string;
  readonly payloadVersion: string;
  readonly payloadSha256: string;
  readonly installedAt: string;
  readonly files: readonly InstalledFileEvidence[];
  readonly active: boolean;
  readonly backupPath?: string;
  readonly previousReceiptId?: string;
}

export interface InstallerRecoveryJournal {
  readonly schemaVersion: 'omnibranch.dev/skill-install/v1';
  readonly transactionId: string;
  readonly action: InstallAction;
  readonly phase: 'prepared' | 'backup_created' | 'activated' | 'state_written';
  readonly destination: string;
  readonly stagingPath: string;
  readonly previousPath?: string;
  readonly backupPath?: string;
  readonly receipt?: InstallReceipt;
  readonly updatedAt: string;
}

export interface InstallerRequest {
  readonly action: InstallAction;
  readonly target: ProviderTarget;
  readonly scope: InstallScope;
  readonly projectRoot?: string;
  readonly dryRun: boolean;
  readonly replace?: boolean;
  readonly force?: boolean;
}
