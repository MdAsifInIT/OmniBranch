# OmniBranch

## What This Is

OmniBranch is a provider-neutral orchestration CLI for running bounded AI-assisted development work across isolated Git branches and worktrees. It gives individual developers and maintainers deterministic scheduling, policy, validation, evidence, and recovery without trusting an AI engine to own repository state.

## Core Value

Repository correctness remains deterministic, auditable, and resumable while multiple workers operate concurrently.

## Requirements

### Validated

(None yet — ship to validate.)

### Active

- [ ] Initialize and validate conservative repository-local configuration.
- [ ] Execute and resume isolated DAG work with ownership, leases, policy, and evidence.
- [ ] Integrate GitHub and supported AI engines through capability-driven adapters.
- [ ] Ship a tested cross-platform CLI and concise OmniBranch skill.

### Out of Scope

- Browser dashboard — deferred to 0.4.
- Background daemon or scheduled service — deferred beyond 0.1.
- GitLab, Bitbucket, and Azure DevOps writes — deferred to 0.2.
- Production deployment and unrestricted cloud mutation — explicitly prohibited.

## Context

The repository currently contains the complete product blueprint and no implementation. The first release is local-first, GitHub-first, and built around a deterministic offline vertical slice before live provider integration.

## Constraints

- **Runtime**: Node 22 release baseline with pnpm 11.11.0 and strict TypeScript.
- **Platforms**: Windows, macOS, and Linux must pass release gates.
- **State**: JSONL events are authoritative; SQLite projections are disposable and rebuildable.
- **Security**: Repository and engine content are untrusted; secrets never enter persisted evidence.
- **Git**: No force push, hard reset, broad clean, or uncontained cleanup in 0.1.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Deterministic control plane | Probabilistic workers cannot define repository truth | — Pending |
| JSONL plus SQLite projection | Preserve inspectable audit history and fast queries | — Pending |
| Native Git through argument arrays | Preserve full Git behavior without shell injection | — Pending |
| Capability-driven adapters | Provider surfaces evolve independently | — Pending |
| GitHub-first SCM | Prove a neutral contract against one provider | — Pending |
| No daemon or dashboard in 0.1 | Keep recovery explicit while state semantics mature | — Pending |

---
*Last updated: 2026-07-12 after documentation ingest*
