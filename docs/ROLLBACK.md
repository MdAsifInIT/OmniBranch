# Rollback and recovery

## Restore the latest skill backup

```sh
omnibranch skill rollback --target agents --scope user --json
omnibranch skill doctor --scope user --json
```

Rollback requires an active receipt that points to an intact verified backup. It refuses locally modified managed files unless `--force` is explicit.

## Remove a managed installation

```sh
omnibranch skill uninstall --target agents --scope user --json
```

Uninstall removes only receipt-owned content and retains the removed version as the latest rollback backup. It does not broadly clean the surrounding provider directory.

## Recover an interrupted installer transaction

Run the next installer lifecycle command or `skill doctor`. Before changing any path, recovery validates the journal schema and confirms staging, tombstone, destination, and backup containment. Depending on the durable phase, it removes staging, restores the prior destination, or finalizes the receipt.

If recovery reports `RECOVERY_INCOMPLETE`, stop and inspect the state root. Do not manually delete paths referenced by an untrusted or malformed journal.

## Runtime rollback

1. Stop workers; do not rewrite branches or delete worktrees.
2. Preserve JSONL events, reports, artifacts, configuration, and the current binary/source revision.
3. Restore a prior compatible version through the normal reviewed process.
4. Rebuild SQLite from the authoritative JSONL event stream.
5. Run configuration validation, reconciliation, and resume in dry-run mode.
6. Continue only when leases, worktrees, refs, validation, and policy evidence agree.

If the older runtime rejects a newer event schema, remain stopped and use an explicit forward migration. Never truncate the event log or use destructive Git commands to force rollback.

## Recovery principles

- JSONL is authoritative; SQLite is disposable.
- A stale worker cannot complete work after lease expiry or supersession.
- External ref movement is reconciled, never overwritten with force.
- Cleanup is limited to proven managed paths.
- Unavailable required validation remains unsatisfied.
