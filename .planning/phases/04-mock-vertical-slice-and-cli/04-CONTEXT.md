# Phase 4: Mock Vertical Slice and CLI - Context

**Gathered:** 2026-07-12
**Status:** Ready for execution

<domain>
## Phase Boundary

Connect the deterministic packages into an offline campaign lifecycle, execute two independent mock
workers concurrently in isolated worktrees, persist evidence, resume/reconcile, report, and expose
every documented local CLI command.

</domain>

<decisions>
## Implementation Decisions

- The mock adapter implements the exact production adapter lifecycle and can deterministically
  complete, fail, block, cancel, or return partial evidence.
- Fixture planning creates two disjoint work items and stable idempotency keys.
- Campaign writes live under the common Git directory and generated reports derive from events.
- Local review and promotion remain dry-run/policy surfaces until the GitHub phase.
- JSON envelopes stay stable for every command.

</decisions>
