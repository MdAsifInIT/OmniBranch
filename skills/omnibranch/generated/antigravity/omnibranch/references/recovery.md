# Recovery

Rebuild SQLite from canonical JSONL, inspect leases/locks/worktrees/refs, then reconcile evidence. Expire stale authority before reassignment. Reuse an effect only when its correlation and expected revision match. Cleanup must remain inside the managed worktree root and refuses dirty or unrelated work.
