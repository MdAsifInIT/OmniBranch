# ADR-0012: CAS-Based FileMutex for Cross-Process Synchronization

**Status:** Accepted

## Context
Concurrent CLI operations and multi-worker campaigns require safe process synchronization without assuming a background daemon or centralized lock server. Race conditions during worktree creation or projection updates can corrupt local state.

## Decision
Implement a Compare-And-Swap (CAS) file-based lock mechanism (`FileMutex`) leveraging atomic filesystem primitives (`O_CREAT | O_EXCL` or platform-equivalent atomic file creation). Lock records store owner PID, campaign ID, creation timestamp, and heartbeat expiration. Stale locks exceeding timeouts are reclaimed atomically via CAS validation.

## Consequences
Guarantees multi-process mutual exclusion for Git worktree and projection state across Windows, macOS, and Linux without requiring a persistent daemon process.
