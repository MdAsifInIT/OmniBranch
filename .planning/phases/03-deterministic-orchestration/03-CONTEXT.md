# Phase 3: Deterministic Orchestration - Context

**Gathered:** 2026-07-12
**Status:** Ready for execution

<domain>
## Phase Boundary

Implement the canonical work-item state machine, validated DAG, deterministic capacity scheduler,
ownership conflicts, leases, retry timing, validation graph, approvals, and deny-first policy.

</domain>

<decisions>
## Implementation Decisions

- Unlisted state transitions throw invariant violations.
- Queue ordering is lane priority, item priority, topological depth, item id, then attempt.
- Ambiguous exclusive ownership patterns conflict conservatively.
- Lease authority is checked on every heartbeat/write decision and expired actors cannot recover it.
- Unknown action classes deny; destructive, secret, external, and untrusted-plugin actions fail closed.
- Only explicit validation `pass` satisfies a required gate.

</decisions>
