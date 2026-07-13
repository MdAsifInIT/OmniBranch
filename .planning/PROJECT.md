# OmniBranch

## What This Is

OmniBranch is a provider-neutral orchestration CLI for running bounded AI-assisted development work across isolated Git branches and worktrees. It gives individual developers and maintainers deterministic scheduling, policy, validation, evidence, and recovery without trusting an AI engine to own repository state.

## Core Value

Repository correctness remains deterministic, auditable, and resumable while multiple workers operate concurrently.

## Requirements

### Validated

- [x] OmniBranch 0.1.0 deterministic orchestration, state, Git safety, adapters, CLI, skill, and offline release gate.

### Active

- [ ] Publish-ready single `omnibranch@0.2.0` Node 22 package without publishing it during implementation.
- [ ] Install one canonical skill safely across Codex, Claude, OpenCode, Antigravity, and generic Agent Skills locations.
- [ ] Support deterministic install, update, status, doctor, rollback, uninstall, recovery, and package verification.

### Out of Scope

- Browser dashboard — deferred to 0.4.
- Background daemon or scheduled service — deferred beyond 0.1.
- GitLab, Bitbucket, and Azure DevOps writes — deferred beyond the universal-installer milestone.
- Native standalone binaries — deferred beyond 0.2.
- Broader provider certification beyond the generic Agent Skills target — deferred.
- Production deployment and unrestricted cloud mutation — explicitly prohibited.

## Context

The repository contains the complete offline-verified 0.1.0 implementation. The 0.2.0 milestone packages that product and its canonical skill for safe multi-provider installation.

## Constraints

- **Runtime**: Node 22 release baseline with pnpm 11.11.0 and strict TypeScript.
- **Platforms**: Windows, macOS, and Linux must pass release gates.
- **State**: JSONL events are authoritative; SQLite projections are disposable and rebuildable.
- **Security**: Repository and engine content are untrusted; secrets never enter persisted evidence.
- **Git**: No force push, hard reset, broad clean, or uncontained cleanup in 0.1.

## Key Decisions

| Decision                           | Rationale                                            | Outcome   |
| ---------------------------------- | ---------------------------------------------------- | --------- |
| Deterministic control plane        | Probabilistic workers cannot define repository truth | — Pending |
| JSONL plus SQLite projection       | Preserve inspectable audit history and fast queries  | — Pending |
| Native Git through argument arrays | Preserve full Git behavior without shell injection   | — Pending |
| Capability-driven adapters         | Provider surfaces evolve independently               | — Pending |
| GitHub-first SCM                   | Prove a neutral contract against one provider        | — Pending |
| No daemon or dashboard in 0.1      | Keep recovery explicit while state semantics mature  | Accepted  |
| Single public npm package in 0.2   | Simplify CLI and skill distribution                  | Accepted  |
| Canonical skill plus thin layouts  | Prevent provider-specific instruction drift          | Accepted  |
| Node 22 installer runtime          | Avoid fragile native executable bundling             | Accepted  |

---

_Last updated: 2026-07-13 for the 0.2.0 universal installer milestone_
