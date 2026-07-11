# Rollback

1. Stop workers; do not rewrite branches or delete worktrees.
2. Preserve events, reports, artifacts, and the current binary/source revision.
3. Restore the prior signed source revision and its lockfile.
4. Restore configuration compatible with that revision.
5. Rebuild SQLite from the preserved authoritative JSONL.
6. Run doctor, configuration validation, and reconciliation in dry-run mode.

If the older runtime rejects a newer event schema, remain stopped and use an explicit forward migration. Never truncate the event log to force rollback.
