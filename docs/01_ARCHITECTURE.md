# OmniBranch Architecture

> **Reference status:** This is the original normative architecture model. The implemented 0.2 package map and data flow are documented in [Architecture](ARCHITECTURE.md); illustrative package names below are bounded contexts, not claims that each directory exists.

## 1. Purpose

OmniBranch is a cross-platform TypeScript/Node 22 monorepo for deterministic orchestration of parallel development work across branches, worktrees, validation pipelines, and optional AI-assisted planning surfaces.

The architecture separates:

- deterministic core behavior, which MUST be replayable from persisted state and configuration
- optional AI adapters, which MAY propose plans, summaries, or classifications but MUST NOT become the source of truth for runtime state transitions
- side-effecting adapters, which MUST execute behind explicit policy and approval checks

## 2. Architectural Principles

### 2.1 Deterministic core

The core runtime MUST make the same scheduling, locking, state-transition, and reconciliation decisions when given the same configuration, state snapshot, event stream, and adapter results. AI output MAY influence candidate plans, but accepted plans MUST be normalized into deterministic runtime records before execution.

### 2.2 Explicit boundaries

Each bounded context MUST expose a stable interface. Packages MAY depend inward on shared contracts and utilities, but core packages MUST NOT depend on concrete AI, SCM, or CI implementations.

### 2.3 Event-first state

Operational history MUST be recorded as append-only events. Materialized views MAY be rebuilt from the event stream plus checkpoints.

### 2.4 Safe side effects

Git mutation, CI dispatch, approval prompts, and external reporting MUST flow through policy-gated adapters. Dry-run behavior SHOULD be available for every side-effecting adapter.

### 2.5 Cross-platform runtime

The monorepo MUST run on Windows, macOS, and Linux under Node 22. Filesystem, process, and shell integration SHOULD be abstracted behind platform-aware services.

## 3. Monorepo Shape

An illustrative package layout is shown below. The exact folder names MAY vary, but the dependency direction MUST remain equivalent.

```text
apps/
  cli/                     -> operator entrypoint
  daemon/                  -> scheduler and reconciliation host
  inspector/               -> optional local status UI or API

packages/
  contracts/               -> shared types, event envelopes, config schema types
  config/                  -> YAML loading, normalization, schema validation
  core/                    -> run model, state machine, orchestration services
  event-store/             -> append-only event log and checkpoint interfaces
  projections/             -> materialized views for runs, leases, reports
  scheduler/               -> DAG planning, fairness, lease orchestration
  work-ownership/          -> path globs, lane ownership, lock evaluation
  git-backend/             -> repository, branch, merge-base, worktree services
  policy-engine/           -> rule evaluation, approval gates, action decisions
  validation-graph/        -> validators, dependencies, result aggregation
  reporting/               -> summaries, artifacts, exports
  adapter-ai/              -> AI provider implementations
  adapter-scm/             -> GitHub, GitLab, Azure Repos, local-only SCM adapters
  adapter-ci/              -> CI providers and local validation runners
  adapter-secrets/         -> env/file/keychain secret resolution
  platform/                -> filesystem, clock, process, signal abstractions
  test-kit/                -> fixtures, fakes, deterministic test harnesses
```

## 4. Dependency Direction

The permitted dependency flow is:

```text
apps/* -> packages/{config,core,scheduler,policy-engine,validation-graph,reporting,platform}

packages/config -> packages/{contracts,platform}
packages/core -> packages/{contracts,event-store,projections,platform,work-ownership}
packages/scheduler -> packages/{contracts,core,event-store,projections,platform,work-ownership}
packages/git-backend -> packages/{contracts,platform}
packages/policy-engine -> packages/{contracts,platform}
packages/validation-graph -> packages/{contracts,platform}
packages/reporting -> packages/{contracts,projections,platform}

packages/adapter-* -> packages/{contracts,platform} plus the interface-owning package they implement
packages/projections -> packages/{contracts,event-store,platform}
packages/event-store -> packages/{contracts,platform}

packages/contracts -> no workspace dependencies
packages/platform -> no adapter dependencies
```

The following rules are normative:

- `contracts` MUST remain dependency-light and free of adapter-specific behavior.
- `core` MUST NOT import `adapter-ai`, `adapter-scm`, or `adapter-ci` directly.
- `adapter-*` packages MUST implement interfaces defined by deterministic packages.
- `apps/*` SHOULD compose capabilities but SHOULD NOT embed business rules that belong in `core`, `scheduler`, or `policy-engine`.

## 5. Bounded Contexts

### 5.1 Contracts

`contracts` defines the canonical shapes for:

- configuration documents after normalization
- run, lane, branch, worktree, and lease identifiers
- event envelopes and event payloads
- approval records
- validation nodes and aggregated results
- report projections and artifact references

These contracts MUST be stable enough to support replay and migration.

### 5.2 Configuration

The configuration context loads YAML, applies defaults, validates against JSON Schema, and emits a normalized runtime document. Configuration parsing MUST fail closed on schema violations, unknown top-level keys, or ambiguous ownership rules unless explicitly configured otherwise.

### 5.3 Core Orchestration

The core context owns:

- run lifecycle transitions
- work item identity and idempotency keys
- attempt accounting
- ownership lock acquisition and release
- approval waits
- cancellation semantics
- event emission

Core services MUST be pure with respect to decision logic. External effects MUST be requested through interfaces and recorded as events.

### 5.4 Event Store and Projections

The event store is the source of truth for runtime history. It MUST provide:

- append with optimistic concurrency
- ordered reads by stream and global sequence
- checkpoints for incremental projection rebuilds
- durable storage for crash recovery

Projection packages build query-optimized views such as:

- active runs by lane
- lease status by work item
- branch/worktree occupancy
- validation summary by run
- approval backlog
- reporting snapshots

### 5.5 Git and Worktree Backend

The Git backend abstracts repository mutation and inspection. It MUST support:

- repository root discovery
- branch creation and checkout
- worktree add/remove/prune
- status inspection
- merge-base and ancestry checks
- conflict-aware branch topology validation

The backend SHOULD preserve a deterministic worktree naming convention derived from lane, run, and work item identifiers. It MUST expose a dry-run mode that returns planned operations without mutating the repository.

### 5.6 Scheduler

The scheduler converts normalized plans into executable work respecting:

- DAG dependencies
- lane concurrency ceilings
- ownership locks
- branch topology constraints
- retry budgets and backoff windows
- approval gates
- validator prerequisites

The scheduler MUST remain deterministic for a given state snapshot and ready queue ordering policy.

### 5.7 Policy Engine

The policy engine evaluates whether an action is:

- allowed automatically
- allowed only after approval
- denied
- downgraded to dry-run

Policy decisions MAY inspect configuration, run metadata, lane, ownership scope, adapter class, retry count, validation outcomes, and actor identity. Policies MUST produce structured reasons suitable for audit logs and reporting.

### 5.8 Validation Graph

The validation graph models preconditions and postconditions as typed nodes with explicit dependencies. Examples include:

- branch hygiene checks
- worktree cleanliness
- config validation
- unit test suites
- lint commands
- report completeness
- approval presence

Validators MUST be individually addressable, replayable, and attributable to specific inputs and outputs.

### 5.9 SCM and CI Adapters

SCM adapters integrate with provider APIs or local repository metadata for pull requests, statuses, comments, merge queues, and branch metadata. CI adapters integrate with external runners or local command execution for validation jobs.

Adapters MUST:

- implement core interfaces
- declare capability flags
- normalize provider-specific data into contracts
- support dry-run or no-op simulation where feasible
- emit structured error classes so the core can decide retryability

### 5.10 Reporting

Reporting projects state into operator-facing outputs:

- terminal summaries
- machine-readable JSON artifacts
- Markdown handoff reports
- audit trails
- optional dashboards

Reporting MUST consume projections rather than raw adapter output whenever possible.

### 5.11 AI Adapters

AI adapters are optional helper surfaces for:

- task decomposition proposals
- ownership suggestions
- risk summaries
- report drafting
- anomaly classification

AI adapters MUST NOT:

- mutate runtime state directly
- bypass policy evaluation
- acquire leases or locks
- emit terminal success/failure without deterministic confirmation

Every AI-derived suggestion that affects execution MUST be persisted as a normalized proposal or decision event before use.

## 6. Runtime Flow

The standard runtime flow is:

1. load and normalize configuration
2. rebuild or refresh projections from the event store
3. reconcile live leases, locks, and worktrees
4. compute ready work from the scheduler
5. evaluate policies for candidate actions
6. acquire ownership locks and work leases
7. dispatch execution through adapters
8. record results and validation events
9. publish reports and next-ready work

Every phase MUST be restart-safe.

## 7. State and Event Model

### 7.1 Event categories

The event stream SHOULD include at least these categories:

- configuration: loaded, normalized, rejected, migrated
- run: created, started, paused, canceled, completed, failed
- work item: enqueued, leased, started, heartbeat, blocked, retried, succeeded, failed
- ownership: lock-requested, lock-acquired, lock-denied, lock-released
- git/worktree: branch-created, worktree-added, worktree-removed, backend-reconciled
- validation: scheduled, started, passed, failed, skipped
- approval: requested, granted, rejected, expired
- reporting: snapshot-written, artifact-published
- reconciliation: orphan-found, lease-recovered, lock-cleaned, projection-rebuilt

### 7.2 Streams

The system SHOULD support multiple stream shapes:

- global stream for ordering and audit
- per-run stream for lifecycle reconstruction
- per-work-item stream for attempt history
- per-resource stream for ownership and lock auditing

### 7.3 Snapshots and checkpoints

Snapshots MAY be used for performance, but replay from events MUST remain authoritative. A checkpoint MUST record:

- the global event sequence covered
- schema/projection version
- projection integrity metadata

## 8. Worktree and Branch Topology

Branch topology is a first-class scheduling input rather than an incidental Git detail. OmniBranch SHOULD model:

- base branches
- integration branches
- lane branches
- ephemeral attempt branches
- worktree roots and retention rules

The scheduler MUST reject plans that violate configured ancestry, lane isolation, or ownership rules. Worktrees SHOULD be disposable and reconstructible from persisted state.

## 9. Failure Domains and Recovery

The architecture isolates failures by context:

- adapter failures SHOULD be normalized and retried or surfaced without corrupting core state
- projection failures MUST NOT invalidate the underlying event stream
- worktree cleanup failures SHOULD be recoverable by reconciliation
- AI adapter unavailability MUST degrade optional advisory features only

Crash recovery MUST start from the event store and filesystem/Git reconciliation, not from in-memory assumptions.

## 10. Security and Secrets

Secrets MUST be resolved at runtime through explicit secret providers such as environment variables, file indirection, or OS-native stores. Secrets MUST NOT be embedded in normalized state, events, projections, or reports. Adapters SHOULD receive only the scoped credentials they require.

## 11. Testing Strategy

The monorepo SHOULD maintain:

- pure unit tests for core state transitions and policy evaluation
- property tests for scheduler and DAG invariants
- contract tests for adapter capability normalization
- replay tests for crash recovery and projection rebuilds
- cross-platform integration tests for Git/worktree behavior

Deterministic packages SHOULD be testable without network access.

## 12. Example Policy Pack Placement

An example policy pack MAY encode conservative rules such as:

- local dry-run by default for side-effecting SCM and CI adapters
- approval required for cross-lane branch mutation
- stricter ownership enforcement on high-conflict globs

Such a policy pack is an implementation example only. The architecture itself remains product-agnostic.
