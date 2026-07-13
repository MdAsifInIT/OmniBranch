# Rollback

Restore the latest verified installer backup:

```sh
omnibranch skill rollback --target agents --scope user --json
omnibranch skill doctor --scope user --json
```

Rollback is available only when the active receipt references an intact backup. Modified managed files are refused unless `--force` is explicit. `uninstall` removes only receipt-owned files and keeps the removed version as the latest rollback backup.

For runtime rollback, stop workers, preserve events/reports/artifacts, restore a compatible signed version, rebuild SQLite from authoritative JSONL, and reconcile in dry-run mode. Never truncate the event log or rewrite Git history to force rollback.
