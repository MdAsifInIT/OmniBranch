# ADR-0014: Sequential Schema Migration Versioning and Projection Re-indexing

**Status:** Accepted

## Context
As OmniBranch evolves, event envelope payloads and SQLite projection schemas change. Upgrading or rolling back runtime installations requires deterministically updating database schemas without losing historical events.

## Decision
Assign monotonic integer versioning to event envelopes and SQLite projections. Include explicit migration definitions for incremental version updates. On version mismatch or corrupted index detection, drop SQLite projections and re-index directly from canonical append-only JSONL event logs.

## Consequences
Maintains data integrity across updates and enables automatic SQLite projection repair without requiring complex manual SQL migration scripts.
