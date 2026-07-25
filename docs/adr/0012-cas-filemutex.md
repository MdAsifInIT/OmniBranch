# ADR-0012: Exclusive Steal-Lock Based FileMutex for Cross-Process Synchronization

**Status:** Accepted

## Context

Concurrent CLI operations and multi-worker campaigns require safe process synchronization without assuming a background daemon or centralized lock server. Race conditions during worktree creation or projection updates can corrupt local state. Previously, an optimistic CAS approach was considered, but it proved vulnerable to microsecond-wide Time-Of-Check to Time-Of-Use (TOCTOU) races under heavy CI contention.

## Decision

Implement a pessimistic, atomic steal-lock mechanism (`FileMutex`) leveraging atomic filesystem primitives.

- Initial acquisition uses `O_CREAT | O_EXCL` (via `fs.open('wx')`) to create the lock file atomically. Lock records store owner PID, campaign ID, creation timestamp, and a unique nonce.
- Stale locks exceeding a configurable `staleAfterMs` timeout are reclaimed via an atomic "steal" lock. The reclaiming process creates a secondary `.steal` lock file exclusively. Only the process that successfully acquires the `.steal` lock is permitted to unlink the primary stale lock, eliminating multiple-acquirer race conditions.

## Consequences

Guarantees multi-process mutual exclusion for Git worktree and projection state across Windows, macOS, and Linux without requiring a persistent daemon process. Eliminates TOCTOU races during stale lock recovery under heavy contention.
