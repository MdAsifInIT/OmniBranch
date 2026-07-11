# Roadmap: OmniBranch

## Overview

Deliver the complete local-first 0.1 implementation in dependency order, prove the deterministic mock vertical slice before provider integrations, and finish with hostile-input, cross-platform, and release-readiness gates.

## Phases

- [x] **Phase 1: Foundation and Configuration** - Monorepo, contracts, host abstractions, schemas, config, and initial CLI.
- [x] **Phase 2: Persistence and Git Recovery** - Canonical events, projections, safe Git/worktree operations, and reconciliation.
- [x] **Phase 3: Deterministic Orchestration** - State machine, ownership, leases, scheduler, validation, and policy.
- [x] **Phase 4: Mock Vertical Slice and CLI** - Complete offline campaign lifecycle with every documented command.
- [x] **Phase 5: GitHub SCM Integration** - Provider-neutral GitHub reads and policy-gated idempotent mutations.
- [x] **Phase 6: Engine Adapters and Skill** - Codex, Claude, OpenCode, Antigravity, and canonical skill packaging.
- [x] **Phase 7: Hardening and Release Readiness** - Hostile fixtures, dogfood profile, OS CI, audit, and release artifacts.

## Phase Details

### Phase 1: Foundation and Configuration

**Goal**: Establish the strict cross-platform workspace, stable contracts, safe host services, configuration system, repository discovery, and initial CLI.
**Depends on**: Nothing
**Requirements**: [BASE-01, CONF-01, CONF-02, CONF-03]
**Success Criteria** (what must be TRUE):

1. A clean checkout installs and passes the baseline quality command.
2. `init` is idempotent and `config validate` reports actionable source paths.
3. Repository discovery handles clones, worktrees, detached HEAD, and non-main trunks.
   **Plans**: 1 plan

Plans:

- [x] 01-01: Implement foundation, contracts, platform, configuration, discovery, and initial CLI.

### Phase 2: Persistence and Git Recovery

**Goal**: Persist authoritative events, rebuild projections, and execute preconditioned Git/worktree mutations safely across crashes.
**Depends on**: Phase 1
**Requirements**: [STATE-01, STATE-02, GIT-01, GIT-02]
**Success Criteria** (what must be TRUE):

1. Event corruption and optimistic concurrency violations are rejected without damaging prior events.
2. SQLite can be deleted and rebuilt to identical state.
3. Git mutations resume safely and cleanup refuses uncontained work.
   **Plans**: 1 plan

Plans:

- [x] 02-01: Implement event store, projections, Git backend, locking, and reconciliation.

### Phase 3: Deterministic Orchestration

**Goal**: Schedule bounded work deterministically with exclusive ownership, live leases, validation evidence, and deny-first policy.
**Depends on**: Phase 2
**Requirements**: [ORCH-01, ORCH-02, ORCH-03, SAFE-01, VAL-01]
**Success Criteria** (what must be TRUE):

1. The same snapshot always yields the same runnable work order.
2. Conflicting ownership and stale leases cannot authorize writes.
3. Missing evidence, unknown actions, and unsafe mutations cannot pass gates.
   **Plans**: 1 plan

Plans:

- [x] 03-01: Implement state machine, scheduler, ownership, leases, validation graph, and policy engine.

### Phase 4: Mock Vertical Slice and CLI

**Goal**: Complete the full offline campaign lifecycle through two concurrent mock workers and all documented CLI commands.
**Depends on**: Phase 3
**Requirements**: [CLI-01, MOCK-01]
**Success Criteria** (what must be TRUE):

1. Two disjoint workers complete in isolated worktrees with validation and reports.
2. Forced interruption at every mutation boundary resumes without duplicate effects.
3. Every command supports stable JSON and mutating commands support dry-run.
   **Plans**: 1 plan

Plans:

- [x] 04-01: Implement mock adapters, campaign service, remaining CLI, reports, and crash matrix.

### Phase 5: GitHub SCM Integration

**Goal**: Add GitHub reads and policy-approved, dry-run-default, idempotent sandbox mutations.
**Depends on**: Phase 4
**Requirements**: [SCM-01]
**Success Criteria** (what must be TRUE):

1. Provider operations normalize authentication, permission, checks, and mergeability states.
2. Repeated draft-PR creation resolves to the existing correlated PR.
3. Credentials never appear in state, logs, reports, or fixtures.
   **Plans**: 1 plan

Plans:

- [x] 05-01: Implement GitHub adapter, fakes, review, promote, and optional sandbox gates.

### Phase 6: Engine Adapters and Skill

**Goal**: Implement capability-driven execution and guided fallback across documented engines and ship the canonical skill.
**Depends on**: Phase 5
**Requirements**: [AI-01, AI-02, SKILL-01]
**Success Criteria** (what must be TRUE):

1. Every engine returns normalized completion, partial, blocked, failed, and cancelled results.
2. Unknown or missing safety capabilities downgrade without changing core behavior.
3. The skill validates and drives an independent safe fixture campaign.
   **Plans**: 1 plan

Plans:

- [x] 06-01: Implement engine adapters, compatibility reporting, skill, scripts, and contract tests.

### Phase 7: Hardening and Release Readiness

**Goal**: Prove security, recovery, cross-platform, dogfood, and release artifact requirements without publishing.
**Depends on**: Phase 6
**Requirements**: [QUAL-01, QUAL-02, REL-01]
**Success Criteria** (what must be TRUE):

1. All offline release gates pass from a clean checkout.
2. Hostile repositories cannot escape scope, inject commands, expose secrets, or bypass policy.
3. CI and release workflows produce documented artifacts without external publication.
   **Plans**: 1 plan

Plans:

- [x] 07-01: Add hostile fixtures, OS/release workflows, dogfood profile, documentation, and final audit.

## Progress

| Phase                              | Plans Complete | Status      | Completed  |
| ---------------------------------- | -------------- | ----------- | ---------- |
| 1. Foundation and Configuration    | 1/1            | Complete    | 2026-07-12 |
| 2. Persistence and Git Recovery    | 1/1            | Complete    | 2026-07-12 |
| 3. Deterministic Orchestration     | 1/1            | Complete    | 2026-07-12 |
| 4. Mock Vertical Slice and CLI     | 1/1            | Complete    | 2026-07-12 |
| 5. GitHub SCM Integration          | 1/1            | Complete    | 2026-07-12 |
| 6. Engine Adapters and Skill       | 0/1            | Not started | -          |
| 7. Hardening and Release Readiness | 0/1            | Not started | -          |
