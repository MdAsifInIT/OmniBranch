<!-- generated-by: gsd-doc-writer -->

# Architecture

OmniBranch is an event-driven, local-first Node.js control plane for coordinating bounded development work. A strict YAML WorkspacePlan and operator commands enter through the CLI; deterministic services schedule work, enforce policy and ownership, manage Git worktrees, validate results, and write evidence. AI and remote providers are replaceable adapters rather than sources of truth.

## Component map

```mermaid
flowchart TD
  CLI[apps/cli] --> Runtime[packages/runtime]
  CLI --> Installer[packages/installer]
  CLI --> Adapters[packages/adapters]
  Installer --> Contracts[packages/contracts]
  Runtime --> Contracts
  Adapters --> Contracts
  Runtime --> Platform[packages/platform]
  Installer --> Platform
  Adapters --> Platform
  Runtime --> TestKit[packages/test-kit]
  Runtime --> Git[(Git + worktrees)]
  Runtime --> JSONL[(Canonical JSONL)]
  Runtime --> SQLite[(SQLite projections)]
  Adapters --> Providers[AI / GitHub / CI]
```

## Package responsibilities

| Package              | Responsibility                                                                                                                                                                               |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/cli`           | Operator commands, stable JSON envelope, composition, and public npm bundle                                                                                                                  |
| `packages/contracts` | Branded identifiers, lifecycle/status types, ports, evidence records, and installer contracts                                                                                                |
| `packages/platform`  | Clock/ID abstractions, process execution, logging, atomic files, locks, CAS filemutex, paths, and redaction                                                                                  |
| `packages/runtime`   | Configuration, cycle detection, events, projections, schema migrations, semantic caching, Git backend, scheduling, ownership, policy, validation, token tracking, and local campaign service |
| `packages/adapters`  | Mock, GitHub, Codex, Claude Code, OpenCode, and Antigravity adapter implementations                                                                                                          |
| `packages/installer` | Provider detection, plans, receipts, backups, recovery journals, and contained skill activation                                                                                              |
| `packages/test-kit`  | Deterministic fixtures and shared test helpers                                                                                                                                               |

The private packages are bundled into the public `omnibranch` package. Only `better-sqlite3@12.11.1` remains a runtime dependency of the published manifest.

## Campaign data flow

1. `RepositoryDiscovery` resolves the repository root, common Git directory, branch, remotes, and worktrees.
2. `loadWorkspacePlan` parses YAML, applies defaults, validates JSON Schema, performs topological graph cycle detection, performs semantic checks, expands safe templates, and produces a redacted snapshot.
3. `LocalCampaignService` appends versioned events to the canonical JSONL store.
4. Runtime projections materialize campaigns, work items, attempts, leases, locks, approvals, validation, artifacts, token metrics, cost reports, and health states in SQLite.
5. The deterministic scheduler selects ready work from the DAG under global, lane, adapter, and budget cost limits.
6. Ownership and lease services (backed by CAS `FileMutex`) reject overlapping or stale authority before an adapter is launched.
7. An adapter returns normalized evidence, checking the `SemanticCache` for prompt hits; validation and policy services decide whether the work may advance.
8. Reports and cost dashboards are derived from persisted state. Reconciliation can rebuild projections and recover interrupted work.

## Skill installation data flow

1. The CLI locates the canonical bundled skill and resolves `auto`, `all`, or an explicit provider target.
2. `SkillInstaller.plan` validates frontmatter, references, files, hashes, scope support, and path containment without mutating the destination.
3. A mutating command acquires an installer mutex, recovers any prior journal, and recalculates the plan.
4. Files are copied to a sibling staging path, verified again, and atomically renamed into place.
5. Existing managed content is retained under the scope-specific installer state root as a rollback backup.
6. A receipt records every owned file and hash. Update, rollback, and uninstall operate only from verified receipts.

## Schema migrations and versioning

1. `MigrationRunner` evaluates schema versions for canonical JSONL event streams and SQLite projection stores on initialization.
2. Event envelopes include explicit schema versions (`schemaVersion`). Forward and backward migrations follow deterministic conversion functions without modifying raw event audit logs.
3. SQLite projections compare local schema migration status against target versions. On schema mismatch or index corruption, projections are dropped and rebuilt directly from canonical JSONL events.

## Event store indexing and projections

1. `EventStore` maintains strict sequence numbers (global sequence and per-stream sequence) across append-only JSONL event logs.
2. SQLite projection stores maintain compound indices on `(stream_id, sequence_number)`, `(campaign_id, work_item_id)`, and `(lease_id, status)` for fast query lookups and optimistic-concurrency matching.
3. Projection indexing runs synchronously during campaign state events, guaranteeing read-after-write consistency for status queries, cost reports, and lease locks.

## Semantic caching

1. `SemanticCache` computes deterministic hash signatures combining system prompts, task inputs, intent specifications, and configuration contexts.
2. Dynamic or non-deterministic intents (e.g. ambient environment reads, live clock queries, unseeded random choices) are identified during prompt parsing and bypass cache lookup.
3. Exact and similarity cache hits return verified normalized response envelopes directly, skipping external AI engine execution and logging hit telemetry.

## Key abstractions

| Abstraction            | Role                                               | Location                           |
| ---------------------- | -------------------------------------------------- | ---------------------------------- |
| `EventStore`           | Ordered append/read contract for canonical events  | `packages/contracts/src/index.ts`  |
| `ProjectionStore`      | Rebuildable query state contract                   | `packages/contracts/src/index.ts`  |
| `GitBackend`           | Typed, containment-aware Git/worktree operations   | `packages/contracts/src/index.ts`  |
| `Scheduler`            | Deterministic ready-work selection                 | `packages/contracts/src/index.ts`  |
| `PolicyEngine`         | Deny-first action evaluation and approval evidence | `packages/contracts/src/index.ts`  |
| `ValidationRunner`     | Typed validation evidence production               | `packages/contracts/src/index.ts`  |
| `AiEngineAdapter`      | Shared engine lifecycle and normalized results     | `packages/contracts/src/index.ts`  |
| `SkillInstaller`       | Receipt-backed universal skill lifecycle           | `packages/installer/src/index.ts`  |
| `LocalCampaignService` | Offline campaign vertical slice                    | `packages/runtime/src/campaign.ts` |
| `FileMutex`            | CAS-based file lock for cross-process isolation    | `packages/platform/src/index.ts`   |
| `SemanticCache`        | Prompt similarity hashing and hit/miss caching     | `packages/runtime/src/index.ts`    |

## Deterministic invariants

- Only documented work-item transitions are accepted.
- Ready ordering, retry backoff, and cycle detection are reproducible for equivalent inputs.
- JSONL is authoritative; SQLite may be deleted and rebuilt.
- Global and stream event sequences reject duplicates and optimistic-concurrency conflicts.
- Required validation is satisfied only by `pass` unless policy explicitly says otherwise.
- Stale or superseded leases cannot report completion.
- External and destructive actions never gain authority from model output.

## Failure and recovery boundaries

| Failure                                          | Recovery behavior                                                                             |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Process termination during event/projection work | Replay canonical events and rebuild projections                                               |
| Schema version mismatch or index corruption      | Execute sequential schema migration or re-index projections from JSONL                        |
| Torn installer activation                        | Inspect the recovery journal, validate contained paths, restore or finalize deterministically |
| Stale lease or worker                            | Expire or supersede only with persisted evidence; reject stale results                        |
| Concurrent process contention                    | CAS `FileMutex` reclaims stale locks and enforces mutual exclusion                            |
| Orphaned worktree or lock                        | Reconcile Git/filesystem state before cleanup                                                 |
| External ref movement                            | Fail the expected-ref guard and require reconciliation                                        |
| Missing/unknown engine controls                  | Downgrade to guided mode                                                                      |
| Unavailable required validation                  | Keep the gate unsatisfied                                                                     |

## Repository layout

```text
apps/                 Public CLI composition
packages/             Private deterministic and adapter packages
schemas/              Versioned WorkspacePlan and installer JSON Schemas
skills/omnibranch/    Canonical Agent Skill and generated provider layouts
distribution/         Claude plugin distribution
fixtures/             Git, adapter, and hostile-repository fixtures
scripts/              Build, security, docs, package, and release tooling
docs/                 User guides, contributor guides, references, ADRs, and observability
artifacts/            Verified package, archives, SBOM, and checksums
```

For normative design details, continue to the [architecture reference](01_ARCHITECTURE.md), [Skill Loop specification](02_SKILL_LOOP_SPEC.md), [Observability](OBSERVABILITY.md), and [ADRs](adr/README.md).
