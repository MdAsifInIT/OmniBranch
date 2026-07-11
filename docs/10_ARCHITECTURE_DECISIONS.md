# Initial Architecture Decisions

These records establish implementation defaults. Convert each accepted item into an individual ADR under `docs/adr/` when development begins.

## ADR-001: Standalone Repository

Status: Accepted.

OmniBranch will be developed as a standalone repository. Managed repositories are external targets and must not host OmniBranch's control-plane implementation.

Reason: repository-neutral abstractions cannot be validated while coupled to one product layout, operating system, branch topology, or domain-specific safety vocabulary.

## ADR-002: Deterministic Core

Status: Accepted.

Git mutations, state transitions, scheduling, validation evaluation, policy decisions, and cleanup will be implemented in deterministic code. AI workers may propose plans and modify assigned worktrees but do not define repository truth.

## ADR-003: TypeScript And Node.js

Status: Proposed for acceptance.

Use strict TypeScript and Node.js 22 LTS as the first implementation platform.

Reason: cross-platform process control, npm distribution, schema tooling, GitHub integration, and broad contributor accessibility.

Revisit when: a single-binary distribution becomes more valuable than implementation velocity, or process isolation requirements justify a Rust or Go control plane.

## ADR-004: Event Log Plus SQLite Projection

Status: Proposed for acceptance.

Store canonical append-only events as JSON Lines under the common Git directory and use SQLite for indexed projections. Projections must be rebuildable.

Reason: auditability and recovery need an inspectable source of truth; status queries need indexed local performance.

## ADR-005: Native Git CLI Backend

Status: Proposed for acceptance.

Invoke the installed Git executable through a typed argument-array wrapper. Do not construct shell command strings.

Reason: native Git provides complete worktree and credential behavior across supported platforms. The wrapper can enforce preconditions, redaction, timeouts, and structured results.

## ADR-006: Capability-Driven AI Adapters

Status: Accepted.

Adapters publish runtime capabilities such as non-interactive execution, structured output, streaming, resume, cancellation, tool permissions, skills, and isolated workers. The core selects behavior from capabilities and falls back to guided mode.

Reason: provider interfaces differ and evolve independently.

## ADR-007: Repository-Local Configuration, Git-Local Runtime State

Status: Accepted.

Commit `.omnibranch/*.yaml` policy and configuration. Store mutable campaign state under the common Git directory by default. Export reports explicitly when they should be reviewed or archived.

## ADR-008: GitHub-First SCM, Provider-Neutral Contract

Status: Accepted for version 0.1.

Implement GitHub first, behind an SCM provider interface. Add GitLab, Bitbucket, and Azure DevOps only after the contract has survived real GitHub use.

## ADR-009: No Background Daemon In Version 0.1

Status: Accepted.

The CLI is re-entrant and resumable but does not require a long-lived service. Continuous operation is achieved through repeated `run` or `resume` invocations and explicit CI scheduling.

Reason: a daemon adds lifecycle, authentication, security, and observability complexity before the state model is proven.

## ADR-010: Skill Uses Progressive Disclosure

Status: Accepted.

The canonical skill contains one concise `SKILL.md`, optional deterministic scripts, and one-level `references/`. User-facing project documentation remains outside the skill package.

Reason: the skill must not consume context with architecture and contributor material that is irrelevant during normal execution.

## Deferred Decisions

- Exact YAML, JSON Schema, SQLite, glob, logging, and process libraries.
- Plugin loading in-process versus isolated subprocesses.
- Signed third-party adapter manifests.
- Package signing mechanism and release provenance provider.
- Optional remote state and team coordination service.
- GitLab, Bitbucket, and Azure DevOps authentication implementations.
- Web dashboard and long-running scheduler.
