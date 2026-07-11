# Phase 2: Persistence and Git Recovery - Context

**Gathered:** 2026-07-12
**Status:** Ready for execution

<domain>
## Phase Boundary

Implement authoritative append-only events, rebuildable SQLite projections, guarded native Git and
worktree mutations, repository mutation locks, and deterministic reconciliation.

</domain>

<decisions>
## Implementation Decisions

- JSONL is canonical and protected by an exclusive file mutex plus atomic replacement.
- Every append validates schema version, event uniqueness, and expected stream version.
- SQLite application is transactional and idempotent by event id; deleting it is harmless.
- Git receives argument arrays only and mutations support dry-run plans.
- Worktree removal requires cleanliness and ancestry containment; force operations remain absent.

</decisions>
